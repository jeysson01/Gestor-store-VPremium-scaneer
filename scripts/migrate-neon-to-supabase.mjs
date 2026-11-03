#!/usr/bin/env node
/**
 * Copia los datos actuales (Neon/PostgreSQL, esquema Drizzle) al nuevo esquema de Supabase.
 * Conserva los IDs existentes (serial) — los nuevos IDs generados en el cliente nunca chocan.
 *
 *   SOURCE_DATABASE_URL=postgres://...neon...  \
 *   SUPABASE_DB_URL=postgres://postgres:...@db.<ref>.supabase.co:5432/postgres \
 *   node scripts/migrate-neon-to-supabase.mjs
 */
import pg from 'pg';

const { SOURCE_DATABASE_URL, SUPABASE_DB_URL } = process.env;
if (!SOURCE_DATABASE_URL || !SUPABASE_DB_URL) {
  console.error('Faltan SOURCE_DATABASE_URL y/o SUPABASE_DB_URL');
  process.exit(1);
}

const TABLES = [
  {
    name: 'products',
    select: `select id, code, name, description, unit_price, coalesce(current_stock,0) current_stock,
             coalesce(minimum_stock,0) minimum_stock, coalesce(maximum_stock,999999) maximum_stock,
             coalesce(unit,'unidad') unit, supplier, coalesce(active,1) active,
             coalesce(created_at, now()) created_at, coalesce(updated_at, now()) updated_at,
             case when coalesce(active,1) = 0 then coalesce(updated_at, now()) end deleted_at
             from products`,
  },
  {
    name: 'purchases',
    select: `select id, purchase_number, purchase_date, expected_delivery_date, actual_delivery_date,
             coalesce(status,'pendiente') status, total_amount, yape_received_at, payment_method, notes,
             coalesce(created_at, now()) created_at, coalesce(updated_at, now()) updated_at
             from purchases`,
  },
  {
    name: 'purchase_details',
    select: `select d.id, d.purchase_id, d.product_id, d.quantity, d.unit_price, d.total_price,
             coalesce(d.received_quantity,0) received_quantity,
             coalesce(p.created_at, now()) created_at, coalesce(p.updated_at, now()) updated_at
             from purchase_details d join purchases p on p.id = d.purchase_id`,
  },
  {
    name: 'yape_notifications',
    select: `select id, amount, purchase_id, purchase_number, yape_phone, message, source,
             coalesce(created_at, now()) created_at, coalesce(created_at, now()) updated_at
             from yape_notifications`,
  },
];

const src = new pg.Client({ connectionString: SOURCE_DATABASE_URL });
const dst = new pg.Client({ connectionString: SUPABASE_DB_URL });
await src.connect();
await dst.connect();

try {
  await dst.query('begin');
  for (const table of TABLES) {
    const { rows } = await src.query(table.select);
    for (const row of rows) {
      const cols = Object.keys(row);
      const values = cols.map((c) => row[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(',');
      await dst.query(
        `insert into public.${table.name} (${cols.join(',')}) values (${placeholders})
         on conflict (id) do update set ${updates}`,
        values
      );
    }
    console.log(`✔ ${table.name}: ${rows.length} filas`);
  }
  await dst.query('commit');
} catch (error) {
  await dst.query('rollback');
  console.error('✖ Migración cancelada:', error.message);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
