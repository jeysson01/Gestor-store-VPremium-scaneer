# Base de datos híbrida: Supabase + almacenamiento local (offline-first)

```
 UI (componentes React)
   │  getProducts(), createPurchase(), …  (mismas firmas que las antiguas Server Actions)
   ▼
 lib/data/repo/*        lógica de negocio (stock, compras, kiosko, Yape, Excel)
   ▼
 LocalDb (lib/data/db.ts)   caché en memoria  ──►  LocalStore
   │   mutate(): escribe fila + entrada outbox     ├─ SQLite (app Tauri: tauri-plugin-sql, WAL)
   │   en una sola transacción local              ├─ IndexedDB (navegador)
   ▼                                               └─ Memoria (tests)
 SyncEngine (lib/data/sync-engine.ts)  ◄── Connectivity (lib/data/connectivity.ts)
   │ push outbox FIFO → Supabase (upsert / RPC kiosko)
   │ pull por cursor server_updated_at
   │ Supabase Realtime (postgres_changes) → applyRemote()
   ▼
 Supabase (Postgres + Auth + Realtime + RLS)
```

## Flujo de escritura (online u offline)

1. `mutate()` actualiza la caché en memoria (la UI se refresca al instante) y persiste fila + entrada
   en `outbox` en el almacenamiento local. **Nunca espera a la red.**
2. `SyncEngine.kick()` se dispara en segundo plano. Si no hay conexión, la entrada queda en cola.
3. Al recuperar conexión (`online` del sistema + heartbeat a `/auth/v1/health` cada 5 s offline / 30 s
   online, y al volver a primer plano) el motor sube la cola en orden (lotes de 50), con backoff
   exponencial hasta 60 s ante errores transitorios. Errores permanentes van a una *dead-letter*.
4. Luego descarga los cambios con `server_updated_at > cursor` (por tabla) y se suscribe a Realtime.

## Conflictos

- IDs generados en el cliente (`lib/data/ids.ts`: ms desde 2024 × 4096 + contador) → los registros
  creados offline en varios dispositivos no chocan; los IDs seriales antiguos se conservan.
- Filas con cambios locales pendientes no se sobrescriben con datos remotos.
- Resto: *last-write-wins* por `updated_at`. Borrado lógico con `deleted_at` (se sincroniza).

## Autenticación

- **Admin**: Supabase Auth (email/contraseña) + fila en `app_admins`. Tras el primer login online se
  guarda un hash PBKDF2-SHA256 (210 000 iteraciones, salt aleatorio) para permitir login offline;
  nunca se guarda la contraseña.
- **Kiosko**: código/QR → RPC `claim_kiosk_code` devuelve un token; el kiosko lee el catálogo con
  `kiosk_products` y sube pedidos con `kiosk_sync_rows` (solo compras `KIOSK-*` en `pendiente_aprobacion`).
- **Yape**: `register_yape_received(p_amount, p_secret, …)` reemplaza a `/api/yape/incoming`
  (el secreto se guarda en `app_settings.yape_webhook_secret`).

## Puesta en marcha de Supabase

```bash
supabase link --project-ref <ref>
supabase db push                       # aplica supabase/migrations/*
# Crear el admin: Auth → Users → Add user, luego en SQL:
insert into app_admins (user_id, email) select id, email from auth.users where email = 'admin@tienda.com';
# Migrar datos actuales de Neon:
SOURCE_DATABASE_URL=postgres://...neon... SUPABASE_DB_URL=postgres://...supabase... pnpm db:migrate-to-supabase
```

Desarrollo local: `supabase start` y usar en `.env.local` la URL `http://127.0.0.1:54321` y la anon key
que imprime el CLI.
