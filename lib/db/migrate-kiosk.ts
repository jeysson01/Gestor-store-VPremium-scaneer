import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada en .env.local');
  }

  const pool = new Pool({ connectionString });
  const sql = readFileSync(
    resolve(process.cwd(), 'lib/db/migrations/0003_kiosk_auth.sql'),
    'utf8'
  );

  await pool.query(sql);
  console.log('Tabla kiosk_codes creada correctamente.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error en migración kiosko:', err.message);
  process.exit(1);
});
