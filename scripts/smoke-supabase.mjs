// Prueba de humo contra Supabase (local o staging): RLS, auth admin, RPCs de kiosko y Yape.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/smoke-supabase.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(anonKey && serviceKey, 'Faltan SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);
const email = `smoke-${Date.now()}@gestor.test`;
const password = 'Sm0ke-test-pass!';
const id = (n) => Date.now() * 4096 + n;
const now = new Date().toISOString();

const { data: created, error: cErr } = await service.auth.admin.createUser({ email, password, email_confirm: true });
assert.ifError(cErr);
assert.ifError((await service.from('app_admins').insert({ user_id: created.user.id, email })).error);

// 1) anon no puede leer ni escribir tablas (RLS)
const anonRead = await anon.from('products').select('id').limit(1);
assert.equal(anonRead.data?.length ?? 0, 0, 'anon no debería ver productos');
const anonWrite = await anon.from('products').insert({ id: id(1), code: 'X', name: 'X', unit_price: 1 });
assert(anonWrite.error, 'anon no debería insertar');
console.log('✓ RLS bloquea anon');

// 2) admin autenticado: upsert y lectura incremental por server_updated_at
const admin = createClient(url, anonKey, opts);
assert.ifError((await admin.auth.signInWithPassword({ email, password })).error);
assert.equal((await admin.rpc('is_admin')).data, true);
const productId = id(2);
const up = await admin.from('products').upsert({
  id: productId, code: `SMOKE-${productId}`, name: 'Producto smoke', unit_price: 3.5,
  current_stock: 10, minimum_stock: 1, maximum_stock: 100, unit: 'unidad', active: 1,
  created_at: now, updated_at: now,
});
assert.ifError(up.error);
const since = await admin.from('products').select('id,server_updated_at').gt('server_updated_at', '2000-01-01').eq('id', productId);
assert.equal(since.data?.length, 1);
console.log('✓ Admin upsert + pull incremental');

// 3) kiosko: reclamar código, catálogo y subir pedido pendiente
const qr = `qr-${productId}`;
assert.ifError((await admin.from('kiosk_codes').insert({
  id: id(3), code: '123456', qr_token: qr, batch_id: 'smoke', expires_at: new Date(Date.now() + 3600e3).toISOString(),
})).error);
const claim = await anon.rpc('claim_kiosk_code', { p_code: null, p_qr_token: qr, p_device: 'smoke' });
assert.ifError(claim.error);
assert.equal(claim.data.success, true);
const token = claim.data.token;
const reuse = await anon.rpc('claim_kiosk_code', { p_code: null, p_qr_token: qr, p_device: 'otro' });
assert.equal(reuse.data.success, false, 'un código no se reutiliza');
const catalog = await anon.rpc('kiosk_products', { p_token: token });
assert.ifError(catalog.error);
assert(catalog.data.some((p) => Number(p.id) === productId));
const purchaseId = id(4);
const sync = await anon.rpc('kiosk_sync_rows', {
  p_token: token,
  p_rows: [
    { table: 'purchases', row: { id: purchaseId, purchase_number: `KIOSK-${purchaseId}`, purchase_date: now, status: 'pendiente_aprobacion', total_amount: 7, notes: 'smoke', created_at: now, updated_at: now } },
    { table: 'purchase_details', row: { id: id(5), purchase_id: purchaseId, product_id: productId, quantity: 2, unit_price: 3.5, total_price: 7, created_at: now, updated_at: now } },
  ],
});
assert.ifError(sync.error);
const bad = await anon.rpc('kiosk_sync_rows', {
  p_token: token,
  p_rows: [{ table: 'purchases', row: { id: id(6), purchase_number: 'COMP-1', purchase_date: now, status: 'recibida', total_amount: 1, created_at: now, updated_at: now } }],
});
assert(bad.error, 'el kiosko no puede crear compras aprobadas');
const badToken = await anon.rpc('kiosk_products', { p_token: 'no-existe' });
assert(badToken.error || (badToken.data ?? []).length === 0, 'token inválido no ve catálogo');
const p = await admin.from('purchases').select('status').eq('id', purchaseId).single();
assert.equal(p.data.status, 'pendiente_aprobacion');
console.log('✓ Kiosko: claim único, catálogo, pedido pendiente, restricciones');

// 4) Yape: secreto requerido sin sesión admin
const noSecret = await anon.rpc('register_yape_received', { p_amount: 7 });
assert(noSecret.error || noSecret.data?.success === false, 'Yape sin secreto debe rechazarse');
assert.ifError((await service.from('app_settings').upsert({ key: 'yape_webhook_secret', value: 'smoke-secret' })).error);
const yape = await anon.rpc('register_yape_received', { p_amount: 7, p_secret: 'smoke-secret', p_purchase_id: purchaseId });
assert.ifError(yape.error);
console.log('✓ Yape RPC', JSON.stringify(yape.data));

await service.auth.admin.deleteUser(created.user.id);
console.log('OK');
