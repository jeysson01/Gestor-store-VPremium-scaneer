/**
 * IDs numéricos generados en el cliente para poder crear registros sin internet.
 * (ms desde 2024-01-01) * 4096 + 12 bits aleatorios → cabe en Number.MAX_SAFE_INTEGER
 * durante ~69 años y nunca choca con los IDs serial ya existentes (valores pequeños).
 */
const EPOCH = Date.UTC(2024, 0, 1);
let lastMs = 0;
let counter = 0;

function random12(): number {
  const buf = new Uint16Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] & 0x0fff;
}

export function newId(): number {
  const ms = Date.now() - EPOCH;
  if (ms === lastMs) {
    counter = (counter + 1) & 0x0fff;
  } else {
    lastMs = ms;
    counter = random12();
  }
  return ms * 4096 + counter;
}

export function nowIso(): string {
  return new Date().toISOString();
}
