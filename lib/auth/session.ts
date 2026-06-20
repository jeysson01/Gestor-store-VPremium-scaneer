import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export type SessionRole = 'admin' | 'kiosk';

export type SessionPayload = {
  role: SessionRole;
  exp: number;
  ip?: string;
  device?: string;
};

const COOKIE_ADMIN = 'gs_admin_session';
const COOKIE_KIOSK = 'gs_kiosk_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
const KIOSK_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

function getSecret(): string {
  return process.env.AUTH_SECRET || 'gestor-store-dev-secret-change-in-production';
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionToken(
  role: SessionRole,
  meta?: { ip?: string; device?: string },
  ttlMs = SESSION_TTL_MS
): string {
  const payload: SessionPayload = {
    role,
    exp: Date.now() + ttlMs,
    ip: meta?.ip,
    device: meta?.device,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (payload.role !== 'admin' && payload.role !== 'kiosk') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ADMIN, createSessionToken('admin'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function setKioskSession(ip?: string, device?: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_KIOSK,
    createSessionToken('kiosk', { ip, device }, KIOSK_SESSION_TTL_MS),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: KIOSK_SESSION_TTL_MS / 1000,
    }
  );
}

export async function clearAllSessions(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_ADMIN);
  cookieStore.delete(COOKIE_KIOSK);
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_ADMIN)?.value;
  const payload = verifySessionToken(token);
  return payload?.role === 'admin' ? payload : null;
}

export async function getKioskSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_KIOSK)?.value;
  const payload = verifySessionToken(token);
  return payload?.role === 'kiosk' ? payload : null;
}

export function getAdminSessionFromRequest(cookieHeader: string | null): SessionPayload | null {
  const token = parseCookie(cookieHeader, COOKIE_ADMIN);
  const payload = verifySessionToken(token);
  return payload?.role === 'admin' ? payload : null;
}

export function getKioskSessionFromRequest(cookieHeader: string | null): SessionPayload | null {
  const token = parseCookie(cookieHeader, COOKIE_KIOSK);
  const payload = verifySessionToken(token);
  return payload?.role === 'kiosk' ? payload : null;
}

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.split(';').find((c) => c.trim().startsWith(`${name}=`));
  return match?.trim().slice(name.length + 1);
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL || 'jeysson017@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Qquefue1?';

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) return false;

  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
