-- Gestor Store · esquema Supabase para sincronización local-first
-- IDs bigint generados en el cliente (ver lib/data/ids.ts), soft-delete con deleted_at,
-- server_updated_at como cursor de sincronización y last-write-wins por updated_at.

-- ───────────── Utilidades ─────────────
create or replace function public.gs_new_id() returns bigint
language sql volatile as $$
  select ((floor(extract(epoch from clock_timestamp()) * 1000)::bigint - 1704067200000) * 4096)
         + floor(random() * 4096)::bigint
$$;

create or replace function public.gs_sync_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    -- Llegó una versión más antigua (dispositivo que estuvo offline): gana la más reciente.
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

-- ───────────── Tablas ─────────────
create table if not exists public.products (
  id bigint primary key default public.gs_new_id(),
  code text not null,
  name text not null,
  description text,
  unit_price numeric(12,2) not null default 0,
  current_stock integer not null default 0,
  minimum_stock integer not null default 0,
  maximum_stock integer not null default 999999,
  unit text not null default 'unidad',
  supplier text,
  active smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists products_code_idx on public.products (code);
create index if not exists products_sync_idx on public.products (server_updated_at);

create table if not exists public.purchases (
  id bigint primary key default public.gs_new_id(),
  purchase_number text not null,
  purchase_date timestamptz not null default now(),
  expected_delivery_date timestamptz,
  actual_delivery_date timestamptz,
  status text not null default 'pendiente'
    check (status in ('pendiente','pendiente_aprobacion','recibida','parcial','cancelada')),
  total_amount numeric(14,2) not null default 0,
  yape_received_at timestamptz,
  payment_method text check (payment_method in ('yape','efectivo')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists purchases_number_idx on public.purchases (purchase_number);
create index if not exists purchases_status_idx on public.purchases (status);
create index if not exists purchases_sync_idx on public.purchases (server_updated_at);

-- Sin claves foráneas a propósito: con escrituras offline las filas pueden llegar
-- en distinto orden desde varios dispositivos; la integridad se resuelve en el cliente.
create table if not exists public.purchase_details (
  id bigint primary key default public.gs_new_id(),
  purchase_id bigint not null,
  product_id bigint not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  total_price numeric(14,2) not null,
  received_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists purchase_details_purchase_idx on public.purchase_details (purchase_id);
create index if not exists purchase_details_sync_idx on public.purchase_details (server_updated_at);

create table if not exists public.yape_notifications (
  id bigint primary key default public.gs_new_id(),
  amount numeric(14,2) not null,
  purchase_id bigint,
  purchase_number text,
  yape_phone text not null default '914713706',
  message text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists yape_notifications_sync_idx on public.yape_notifications (server_updated_at);

create table if not exists public.kiosk_codes (
  id bigint primary key default public.gs_new_id(),
  code text not null,
  qr_token text not null unique,
  batch_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists kiosk_codes_sync_idx on public.kiosk_codes (server_updated_at);

do $$
declare t text;
begin
  foreach t in array array['products','purchases','purchase_details','yape_notifications','kiosk_codes'] loop
    execute format('drop trigger if exists %I_sync_stamp on public.%I', t, t);
    execute format(
      'create trigger %I_sync_stamp before insert or update on public.%I
       for each row execute function public.gs_sync_stamp()', t, t);
  end loop;
end $$;

-- ───────────── Administradores ─────────────
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- ───────────── RLS ─────────────
alter table public.products enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_details enable row level security;
alter table public.yape_notifications enable row level security;
alter table public.kiosk_codes enable row level security;
alter table public.app_admins enable row level security;
alter table public.app_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products','purchases','purchase_details','yape_notifications','kiosk_codes'] loop
    execute format('drop policy if exists %I_admin_all on public.%I', t, t);
    execute format(
      'create policy %I_admin_all on public.%I for all to authenticated
       using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

drop policy if exists app_admins_self on public.app_admins;
create policy app_admins_self on public.app_admins for select to authenticated
  using (user_id = auth.uid());
-- app_settings: sin políticas → solo accesible desde funciones security definer / service role.

-- ───────────── Kiosko ─────────────
-- Reclama un código de 3 dígitos o QR de forma atómica. Devuelve el qr_token como token de kiosko.
create or replace function public.claim_kiosk_code(p_code text, p_qr_token text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.kiosk_codes;
begin
  if p_qr_token is not null then
    select * into r from public.kiosk_codes where qr_token = p_qr_token and deleted_at is null for update;
  elsif p_code is not null then
    select * into r from public.kiosk_codes
     where code = p_code and expires_at > now() and used_at is null and deleted_at is null
     order by created_at desc limit 1 for update;
  else
    return jsonb_build_object('success', false, 'error', 'Ingresa un código o escanea el QR');
  end if;
  if r.id is null then
    return jsonb_build_object('success', false, 'error', 'Código inválido o expirado');
  end if;
  if r.used_at is not null then
    return jsonb_build_object('success', false, 'error', 'Este código ya fue utilizado');
  end if;
  if r.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'El código ha expirado');
  end if;
  update public.kiosk_codes
     set used_at = now(), used_device = left(p_device, 128), updated_at = now()
   where id = r.id;
  return jsonb_build_object('success', true, 'token', r.qr_token);
end $$;

-- Sube filas creadas en un kiosko (sin sesión de admin). Solo permite:
--  · compras nuevas en estado pendiente_aprobacion y sus líneas,
--  · marcar como usado el propio código del kiosko.
create or replace function public.kiosk_sync_rows(p_token text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  k public.kiosk_codes;
  item jsonb;
  t text;
  r jsonb;
begin
  select * into k from public.kiosk_codes where qr_token = p_token and deleted_at is null;
  if k.id is null or k.created_at < now() - interval '7 days' then
    raise exception 'Token de kiosko inválido' using errcode = '28000';
  end if;
  for item in select * from jsonb_array_elements(p_rows) loop
    t := item->>'table';
    r := item->'row';
    if t = 'kiosk_codes' and (r->>'id')::bigint = k.id then
      update public.kiosk_codes
         set used_at = coalesce(used_at, (r->>'used_at')::timestamptz),
             used_device = coalesce(used_device, left(r->>'used_device', 128)),
             updated_at = greatest(updated_at, (r->>'updated_at')::timestamptz)
       where id = k.id;
    elsif t = 'purchases' then
      if r->>'status' <> 'pendiente_aprobacion' or r->>'purchase_number' not like 'KIOSK-%' then
        raise exception 'Compra de kiosko no permitida' using errcode = '42501';
      end if;
      insert into public.purchases (id, purchase_number, purchase_date, status, total_amount, notes,
                                    created_at, updated_at)
      values ((r->>'id')::bigint, r->>'purchase_number', (r->>'purchase_date')::timestamptz,
              'pendiente_aprobacion', (r->>'total_amount')::numeric, r->>'notes',
              (r->>'created_at')::timestamptz, (r->>'updated_at')::timestamptz)
      on conflict (id) do nothing;
    elsif t = 'purchase_details' then
      if not exists (select 1 from public.purchases
                      where id = (r->>'purchase_id')::bigint and status = 'pendiente_aprobacion'
                        and purchase_number like 'KIOSK-%') then
        raise exception 'Detalle de compra no permitido' using errcode = '42501';
      end if;
      insert into public.purchase_details (id, purchase_id, product_id, quantity, unit_price,
                                           total_price, created_at, updated_at)
      values ((r->>'id')::bigint, (r->>'purchase_id')::bigint, (r->>'product_id')::bigint,
              (r->>'quantity')::int, (r->>'unit_price')::numeric, (r->>'total_price')::numeric,
              (r->>'created_at')::timestamptz, (r->>'updated_at')::timestamptz)
      on conflict (id) do nothing;
    else
      raise exception 'Tabla no permitida para kiosko: %', t using errcode = '42501';
    end if;
  end loop;
end $$;

-- Lectura de catálogo para el kiosko (solo productos activos, campos públicos).
create or replace function public.kiosk_products(p_token text)
returns table (id bigint, code text, name text, unit_price numeric, current_stock int, unit text,
               active smallint, created_at timestamptz, updated_at timestamptz,
               deleted_at timestamptz, server_updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.name, p.unit_price, p.current_stock, p.unit, p.active, p.created_at,
         p.updated_at, p.deleted_at, p.server_updated_at
    from public.products p
   where exists (select 1 from public.kiosk_codes k
                  where k.qr_token = p_token and k.created_at > now() - interval '7 days')
$$;

-- ───────────── Yape (reemplaza /api/yape/incoming) ─────────────
create or replace function public.register_yape_received(
  p_amount numeric, p_secret text default null, p_purchase_id bigint default null,
  p_source text default 'webhook'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
  v_phone text;
  v_amount numeric(14,2);
  p public.purchases;
  v_msg text;
  v_soles text;
  v_notification_id bigint;
begin
  select value into v_secret from public.app_settings where key = 'yape_webhook_secret';
  if not public.is_admin() and (v_secret is null or v_secret <> coalesce(p_secret, '')) then
    raise exception 'No autorizado' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Monto inválido');
  end if;
  v_amount := round(p_amount, 2);
  select coalesce((select value from public.app_settings where key = 'yape_phone'), '914713706')
    into v_phone;

  if p_purchase_id is not null then
    select * into p from public.purchases
     where id = p_purchase_id and yape_received_at is null and deleted_at is null for update;
  end if;
  if p.id is null then
    select * into p from public.purchases
     where status = 'pendiente' and total_amount = v_amount and yape_received_at is null
       and deleted_at is null and created_at > now() - interval '48 hours'
     order by created_at desc limit 1 for update;
  end if;

  v_soles := 'S/ ' || to_char(v_amount, 'FM999G999G990D00');
  v_msg := case when p.id is not null
    then format('Yape recibido %s en %s — Compra %s', v_soles, v_phone, p.purchase_number)
    else format('Yape recibido %s en %s (sin compra coincidente)', v_soles, v_phone) end;

  insert into public.yape_notifications (amount, purchase_id, purchase_number, yape_phone, message, source)
  values (v_amount, p.id, p.purchase_number, v_phone, v_msg, left(coalesce(p_source, 'webhook'), 30))
  returning id into v_notification_id;

  if p.id is not null then
    update public.purchases
       set yape_received_at = now(), payment_method = 'yape', updated_at = now()
     where id = p.id;
  end if;

  return jsonb_build_object(
    'success', true, 'matched', p.id is not null,
    'purchaseNumber', p.purchase_number, 'notificationId', v_notification_id);
end $$;

-- ───────────── Permisos de funciones ─────────────
revoke all on function public.claim_kiosk_code(text, text, text) from public;
revoke all on function public.kiosk_sync_rows(text, jsonb) from public;
revoke all on function public.kiosk_products(text) from public;
revoke all on function public.register_yape_received(numeric, text, bigint, text) from public;
grant execute on function public.claim_kiosk_code(text, text, text) to anon, authenticated;
grant execute on function public.kiosk_sync_rows(text, jsonb) to anon, authenticated;
grant execute on function public.kiosk_products(text) to anon, authenticated;
grant execute on function public.register_yape_received(numeric, text, bigint, text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ───────────── Realtime ─────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['products','purchases','purchase_details','yape_notifications','kiosk_codes'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
