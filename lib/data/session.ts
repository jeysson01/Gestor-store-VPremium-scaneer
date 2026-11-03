'use client';

/** Sesión local (admin / kiosko). Reemplaza las cookies HMAC del servidor. */
export type AppSession =
  | { role: 'admin'; email: string; expiresAt: number; offline: boolean }
  | { role: 'kiosk'; token: string; deviceId: string; expiresAt: number };

const KEY = 'gs-session';
export const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;
export const KIOSK_TTL_MS = 2 * 60 * 60 * 1000;

const listeners = new Set<() => void>();

export function getSession(): AppSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AppSession;
    if (s.expiresAt < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setSession(session: AppSession | null) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
  for (const fn of listeners) fn();
}

export function onSessionChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getKioskSession() {
  const s = getSession();
  return s?.role === 'kiosk' ? s : null;
}

export function getAdminSession() {
  const s = getSession();
  return s?.role === 'admin' ? s : null;
}
