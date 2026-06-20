import { randomInt } from 'crypto';
import { db } from '@/lib/db';
import { kioskCodes } from '@/lib/db/schema';
import { and, eq, gt, isNull, desc } from 'drizzle-orm';
import type { KioskCodeDisplay } from '@/lib/kiosk-utils';

export type { KioskCodeDisplay };

const CODE_COUNT = 4;
const CODE_TTL_MS = 3 * 60 * 1000; // 3 minutos

function generateCode(): string {
  return String(randomInt(100, 1000));
}

function generateToken(): string {
  return Array.from({ length: 32 }, () => randomInt(0, 16).toString(16)).join('');
}

function generateBatchId(): string {
  return `${Date.now()}-${randomInt(1000, 9999)}`;
}

async function getActiveBatch(): Promise<{ batchId: string; codes: (typeof kioskCodes.$inferSelect)[] } | null> {
  const now = new Date();
  const active = await db
    .select()
    .from(kioskCodes)
    .where(and(gt(kioskCodes.expiresAt, now), isNull(kioskCodes.usedAt)))
    .orderBy(desc(kioskCodes.createdAt))
    .limit(CODE_COUNT);

  if (active.length < CODE_COUNT) return null;

  const batchId = active[0].batchId;
  const sameBatch = active.filter((c) => c.batchId === batchId);
  if (sameBatch.length < CODE_COUNT) return null;

  return { batchId, codes: sameBatch.slice(0, CODE_COUNT) };
}

function formatCodes(codes: (typeof kioskCodes.$inferSelect)[]): KioskCodeDisplay[] {
  const now = Date.now();
  return codes.map((c) => ({
    id: c.id,
    code: c.code,
    qrToken: c.qrToken,
    expiresAt: c.expiresAt!,
    secondsLeft: Math.max(0, Math.floor((c.expiresAt!.getTime() - now) / 1000)),
  }));
}

export async function ensureActiveKioskCodes(): Promise<KioskCodeDisplay[]> {
  const existing = await getActiveBatch();
  if (existing) {
    return formatCodes(existing.codes);
  }

  const batchId = generateBatchId();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const usedCodes = new Set<string>();
  const rows: (typeof kioskCodes.$inferInsert)[] = [];

  while (rows.length < CODE_COUNT) {
    const code = generateCode();
    if (usedCodes.has(code)) continue;
    usedCodes.add(code);
    rows.push({
      code,
      qrToken: generateToken(),
      batchId,
      expiresAt,
    });
  }

  const inserted = await db.insert(kioskCodes).values(rows).returning();
  return formatCodes(inserted);
}

export async function validateKioskCode(
  input: { code?: string; qrToken?: string },
  clientIp: string,
  deviceId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const now = new Date();

  let record;
  if (input.qrToken) {
    const rows = await db
      .select()
      .from(kioskCodes)
      .where(eq(kioskCodes.qrToken, input.qrToken))
      .limit(1);
    record = rows[0];
  } else if (input.code) {
    const rows = await db
      .select()
      .from(kioskCodes)
      .where(
        and(
          eq(kioskCodes.code, input.code.padStart(3, '0').slice(-3)),
          gt(kioskCodes.expiresAt, now),
          isNull(kioskCodes.usedAt)
        )
      )
      .orderBy(desc(kioskCodes.createdAt))
      .limit(1);
    record = rows[0];
  } else {
    return { success: false, error: 'Ingresa un código o escanea el QR' };
  }

  if (!record) {
    return { success: false, error: 'Código inválido o expirado' };
  }

  if (record.usedAt) {
    return { success: false, error: 'Este código ya fue utilizado' };
  }

  if (record.expiresAt && record.expiresAt < now) {
    return { success: false, error: 'El código ha expirado' };
  }

  await db
    .update(kioskCodes)
    .set({
      usedAt: now,
      usedIp: clientIp,
      usedDevice: deviceId,
    })
    .where(eq(kioskCodes.id, record.id));

  return { success: true };
}
