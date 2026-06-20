'use server';

import { headers } from 'next/headers';
import {
  setAdminSession,
  setKioskSession,
  clearAllSessions,
  verifyAdminCredentials,
  getAdminSession,
  getKioskSession,
} from '@/lib/auth/session';
import { validateKioskCode, ensureActiveKioskCodes } from '@/lib/auth/kiosk-codes';
import { redirect } from 'next/navigation';

async function getClientMeta() {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown';
  return { ip };
}

export async function loginAdmin(email: string, password: string) {
  if (!verifyAdminCredentials(email, password)) {
    return { success: false, error: 'Credenciales incorrectas' };
  }
  await clearAllSessions();
  await setAdminSession();
  return { success: true };
}

export async function loginWithKioskCode(
  code: string,
  deviceId: string
): Promise<{ success: boolean; error?: string }> {
  const { ip } = await getClientMeta();
  const result = await validateKioskCode({ code }, ip, deviceId);
  if (!result.success) return result;

  await clearAllSessions();
  await setKioskSession(ip, deviceId);
  return { success: true };
}

export async function loginWithKioskQr(
  qrToken: string,
  deviceId: string
): Promise<{ success: boolean; error?: string }> {
  const token = qrToken.startsWith('kiosk:') ? qrToken.slice(6) : qrToken;
  const { ip } = await getClientMeta();
  const result = await validateKioskCode({ qrToken: token }, ip, deviceId);
  if (!result.success) return result;

  await clearAllSessions();
  await setKioskSession(ip, deviceId);
  return { success: true };
}

export async function logout() {
  await clearAllSessions();
  redirect('/login');
}

export async function getKioskCodesForAdmin() {
  const session = await getAdminSession();
  if (!session) return { success: false, error: 'No autorizado' };
  const codes = await ensureActiveKioskCodes();
  return { success: true, data: codes };
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireKiosk() {
  const session = await getKioskSession();
  if (!session) redirect('/kiosk/ingreso');
  return session;
}

export async function getSessionInfo() {
  const admin = await getAdminSession();
  if (admin) return { role: 'admin' as const };
  const kiosk = await getKioskSession();
  if (kiosk) return { role: 'kiosk' as const };
  return { role: null };
}
