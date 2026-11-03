/**
 * Caché de credenciales de administrador para login sin internet.
 * Solo se guarda un hash PBKDF2-SHA256 (210k iteraciones) + sal aleatoria, nunca la contraseña.
 */
const KEY = 'gs-offline-admin';
const ITERATIONS = 210_000;

type Cached = { email: string; salt: string; hash: string };

function toB64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCodePoint(b);
  return btoa(s);
}

function fromB64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.codePointAt(0)!);
}

export async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    256
  );
  return toB64(bits);
}

export async function rememberAdmin(email: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const cached: Cached = { email: email.trim().toLowerCase(), salt: toB64(salt), hash };
  localStorage.setItem(KEY, JSON.stringify(cached));
}

export async function verifyOfflineAdmin(email: string, password: string) {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  const cached = JSON.parse(raw) as Cached;
  if (cached.email !== email.trim().toLowerCase()) return false;
  const hash = await hashPassword(password, fromB64(cached.salt));
  return hash === cached.hash;
}

export function forgetAdmin() {
  localStorage.removeItem(KEY);
}
