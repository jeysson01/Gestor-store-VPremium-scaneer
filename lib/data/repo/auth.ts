import type { KioskCodeDisplay } from '@/lib/kiosk-utils';
import { getDataClient, getDb } from '../client';
import { newId, nowIso } from '../ids';
import { rememberAdmin, verifyOfflineAdmin } from '../offline-credentials';
import {
  ADMIN_TTL_MS,
  KIOSK_TTL_MS,
  getAdminSession,
  getKioskSession,
  getSession,
  setSession,
} from '../session';
import { getSupabase } from '../supabase';
import type { KioskCodeRow } from '../types';
import { errorMessage } from './mappers';

/**
 * Login de administrador:
 * - Online: Supabase Auth (email + contraseña) y se verifica que esté en `app_admins`.
 * - Offline: se valida contra el hash PBKDF2 guardado en el último login online exitoso.
 */
export async function loginAdmin(email: string, password: string) {
  const sb = getSupabase();
  const { connectivity } = getDataClient();
  if (sb && (await connectivity.check())) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (!/fetch|network/i.test(error.message)) {
        return { success: false, error: 'Credenciales incorrectas' };
      }
    } else {
      const { data: isAdmin, error: rpcError } = await sb.rpc('is_admin');
      if (rpcError || !isAdmin) {
        await sb.auth.signOut();
        return { success: false, error: 'Este usuario no es administrador' };
      }
      await rememberAdmin(email, password);
      setSession({ role: 'admin', email, expiresAt: Date.now() + ADMIN_TTL_MS, offline: false });
      getDataClient().sync.restartRealtime();
      void getDataClient().sync.kick();
      return { success: true };
    }
  }
  if (await verifyOfflineAdmin(email, password)) {
    setSession({ role: 'admin', email, expiresAt: Date.now() + ADMIN_TTL_MS, offline: true });
    return { success: true, offline: true };
  }
  return {
    success: false,
    error: sb
      ? 'Sin conexión: inicia sesión online al menos una vez en este dispositivo'
      : 'Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY',
  };
}

export async function logout() {
  setSession(null);
  // La sesión de Supabase se conserva para que la cola offline pueda seguir subiéndose;
  // al cerrar sesión explícitamente se revoca.
  await getSupabase()?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  if (typeof window !== 'undefined') window.location.assign('/login/');
}

export async function getSessionInfo() {
  return { role: getSession()?.role ?? null };
}

// ───────────────────────────── Kiosko ─────────────────────────────

const CODE_COUNT = 4;
const CODE_TTL_MS = 3 * 60 * 1000;

function randomInt(min: number, max: number) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % (max - min));
}

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

function formatCodes(codes: KioskCodeRow[]): KioskCodeDisplay[] {
  const now = Date.now();
  return codes.map((c) => ({
    id: c.id,
    code: c.code,
    qrToken: c.qr_token,
    expiresAt: new Date(c.expires_at),
    secondsLeft: Math.max(0, Math.floor((new Date(c.expires_at).getTime() - now) / 1000)),
  }));
}

/** Genera (o reutiliza) el lote activo de 4 códigos de 3 dígitos, válidos 3 minutos. */
export async function getKioskCodesForAdmin() {
  if (!getAdminSession()) return { success: false as const, error: 'No autorizado' };
  try {
    const db = await getDb();
    const now = nowIso();
    const active = db
      .all('kiosk_codes')
      .filter((c) => c.expires_at > now && !c.used_at)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const batchId = active[0]?.batch_id;
    const sameBatch = active.filter((c) => c.batch_id === batchId);
    if (sameBatch.length >= CODE_COUNT) {
      return { success: true as const, data: formatCodes(sameBatch.slice(0, CODE_COUNT)) };
    }
    const newBatch = `${Date.now()}-${randomInt(1000, 9999)}`;
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const used = new Set<string>();
    const rows: KioskCodeRow[] = [];
    while (rows.length < CODE_COUNT) {
      const code = String(randomInt(100, 1000));
      if (used.has(code)) continue;
      used.add(code);
      rows.push({
        id: newId(),
        code,
        qr_token: randomHex(16),
        batch_id: newBatch,
        expires_at: expiresAt,
        used_at: null,
        used_device: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
    }
    await db.mutate(rows.map((row) => ({ table: 'kiosk_codes' as const, row })));
    return { success: true as const, data: formatCodes(rows) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

async function claimKiosk(
  input: { code?: string; qrToken?: string },
  deviceId: string
): Promise<{ success: boolean; error?: string }> {
  if (!input.code && !input.qrToken) {
    return { success: false, error: 'Ingresa un código o escanea el QR' };
  }
  const code = input.code?.padStart(3, '0').slice(-3);
  const sb = getSupabase();
  const { connectivity } = getDataClient();

  // 1) Online: el servidor marca el código como usado de forma atómica.
  if (sb && connectivity.isOnline) {
    const { data, error } = await sb.rpc('claim_kiosk_code', {
      p_code: code ?? null,
      p_qr_token: input.qrToken ?? null,
      p_device: deviceId,
    });
    if (!error && data?.success) {
      startKiosk(String(data.token), deviceId);
      return { success: true };
    }
    if (!error && data && !data.success) return { success: false, error: String(data.error) };
  }

  // 2) Offline (o código aún no sincronizado): validación contra la base local.
  const db = await getDb();
  const now = nowIso();
  const record = db
    .all('kiosk_codes')
    .filter((c) => (input.qrToken ? c.qr_token === input.qrToken : c.code === code))
    .filter((c) => input.qrToken || (c.expires_at > now && !c.used_at))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!record) return { success: false, error: 'Código inválido o expirado' };
  if (record.used_at) return { success: false, error: 'Este código ya fue utilizado' };
  if (record.expires_at < now) return { success: false, error: 'El código ha expirado' };
  await db.mutate(
    [{ table: 'kiosk_codes', row: { ...record, used_at: now, used_device: deviceId } }],
    { kioskToken: record.qr_token }
  );
  startKiosk(record.qr_token, deviceId);
  return { success: true };
}

function startKiosk(token: string, deviceId: string) {
  setSession({ role: 'kiosk', token, deviceId, expiresAt: Date.now() + KIOSK_TTL_MS });
}

export async function loginWithKioskCode(code: string, deviceId: string) {
  return claimKiosk({ code }, deviceId);
}

export async function loginWithKioskQr(qrToken: string, deviceId: string) {
  const token = qrToken.startsWith('kiosk:') ? qrToken.slice(6) : qrToken;
  return claimKiosk({ qrToken: token }, deviceId);
}

export function requireKioskToken() {
  return getKioskSession()?.token ?? null;
}
