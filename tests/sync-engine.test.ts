import { describe, expect, it } from 'vitest';
import { LocalDb } from '@/lib/data/db';
import { MemoryStore } from '@/lib/data/local/memory';
import { TransientError, type RemoteApi, type RemoteRow } from '@/lib/data/remote';
import { SyncEngine } from '@/lib/data/sync-engine';
import type { Connectivity } from '@/lib/data/connectivity';
import type { AnyRow, ProductRow, TableName } from '@/lib/data/types';

class FakeConnectivity {
  isOnline = false;
  private fns = new Set<(o: boolean) => void>();
  subscribe(fn: (o: boolean) => void) {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  start() {}
  stop() {}
  async check() {
    return this.isOnline;
  }
  set(v: boolean) {
    this.isOnline = v;
    this.fns.forEach((f) => f(v));
  }
}

class FakeRemote implements RemoteApi {
  rows = new Map<string, RemoteRow>();
  failNext = 0;
  clock = 0;
  async canWrite() {
    return true;
  }
  async upsert(table: TableName, rows: AnyRow[]) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new TransientError('network down');
    }
    for (const r of rows) {
      const ts = new Date(Date.UTC(2030, 0, 1) + ++this.clock).toISOString();
      this.rows.set(`${table}:${r.id}`, { ...r, server_updated_at: ts } as RemoteRow);
    }
  }
  async kioskUpsert() {}
  async fetchSince(table: TableName, since: string | null) {
    return [...this.rows.entries()]
      .filter(([k, r]) => k.startsWith(`${table}:`) && (!since || r.server_updated_at > since))
      .map(([, r]) => r)
      .sort((a, b) => (a.server_updated_at < b.server_updated_at ? -1 : 1));
  }
  async fetchKioskCatalog() {
    return [];
  }
  subscribe() {
    return () => undefined;
  }
}

function product(id: number, name: string, updated = '2025-01-01T00:00:00.000Z'): ProductRow {
  return {
    id, code: `C${id}`, name, description: null, unit_price: 1, current_stock: 0, minimum_stock: 0,
    maximum_stock: 10, unit: 'unidad', supplier: null, active: 1,
    created_at: updated, updated_at: updated, deleted_at: null,
  };
}

function setup() {
  const db = new LocalDb(new MemoryStore());
  const remote = new FakeRemote();
  const conn = new FakeConnectivity();
  const engine = new SyncEngine(db, remote, conn as unknown as Connectivity);
  return { db, remote, conn, engine };
}

describe('SyncEngine (local-first)', () => {
  it('guarda offline al instante y sube la cola al recuperar conexión', async () => {
    const { db, remote, conn, engine } = setup();
    engine.start();
    await db.mutate([{ table: 'products', row: product(1, 'Arroz') }]);
    await db.mutate([{ table: 'products', row: product(2, 'Azúcar') }]);
    expect(db.all('products')).toHaveLength(2);
    expect(remote.rows.size).toBe(0);
    expect(await db.store.countOutbox()).toBe(2);

    conn.set(true);
    await engine.kick();
    expect(remote.rows.size).toBe(2);
    expect(await db.store.countOutbox()).toBe(0);
    expect(engine.getStatus().pending).toBe(0);
  });

  it('reintenta tras errores de red sin perder cambios', async () => {
    const { db, remote, conn, engine } = setup();
    conn.isOnline = true;
    remote.failNext = 1;
    await db.mutate([{ table: 'products', row: product(3, 'Leche') }]);
    await engine.kick();
    expect(await db.store.countOutbox()).toBe(1);
    await engine.syncOnce();
    expect(await db.store.countOutbox()).toBe(0);
    expect(remote.rows.has('products:3')).toBe(true);
    engine.stop();
  });

  it('descarga cambios remotos sin pisar ediciones locales pendientes', async () => {
    const { db, remote, conn, engine } = setup();
    await remote.upsert('products', [product(10, 'Remoto'), product(11, 'Remoto 2')]);
    await db.mutate([{ table: 'products', row: product(11, 'Editado offline') }]);
    conn.isOnline = true;
    remote.failNext = 1; // el push falla → la fila 11 sigue pendiente durante el pull
    await engine.syncOnce().catch(() => undefined);
    // push falló antes de pull; forzamos solo pull:
    await (engine as unknown as { pull: () => Promise<void> }).pull();
    expect(db.get('products', 10)?.name).toBe('Remoto');
    expect(db.get('products', 11)?.name).toBe('Editado offline');
  });

  it('last-write-wins: ignora versiones remotas más antiguas', async () => {
    const { db } = setup();
    await db.ready;
    await db.applyRemote('products', [product(20, 'Nuevo', '2025-06-01T00:00:00.000Z')]);
    await db.applyRemote('products', [product(20, 'Viejo', '2025-01-01T00:00:00.000Z')]);
    expect(db.get('products', 20)?.name).toBe('Nuevo');
  });
});
