import { openDB, type IDBPDatabase } from 'idb';
import { SYNC_TABLES, type AnyRow, type OutboxEntry, type TableName } from '../types';
import type { LocalStore } from './store';

const DB_NAME = 'gestor-store';
const DB_VERSION = 1;

/** Fallback para navegador / desarrollo web. En la app nativa se usa SQLite. */
export class IndexedDbStore implements LocalStore {
  readonly kind = 'indexeddb' as const;
  private db!: IDBPDatabase;

  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const table of SYNC_TABLES) {
          if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      },
    });
  }

  async loadAll(table: TableName) {
    return (await this.db.getAll(table)) as AnyRow[];
  }

  async write(rows: Array<{ table: TableName; row: AnyRow }>, outbox: OutboxEntry[] = []) {
    const stores = [...new Set(rows.map((r) => r.table)), ...(outbox.length ? ['outbox'] : [])];
    if (!stores.length) return;
    const tx = this.db.transaction(stores, 'readwrite');
    for (const { table, row } of rows) tx.objectStore(table).put(row);
    for (const entry of outbox) {
      const { seq: _seq, ...rest } = entry;
      tx.objectStore('outbox').add(rest);
    }
    await tx.done;
  }

  async peekOutbox(limit: number) {
    return ((await this.db.getAll('outbox', null, limit)) as OutboxEntry[]) ?? [];
  }

  async removeOutbox(seqs: number[]) {
    const tx = this.db.transaction('outbox', 'readwrite');
    for (const seq of seqs) tx.store.delete(seq);
    await tx.done;
  }

  async updateOutbox(entry: OutboxEntry) {
    await this.db.put('outbox', entry);
  }

  countOutbox() {
    return this.db.count('outbox');
  }

  async getMeta(key: string) {
    return ((await this.db.get('meta', key)) as string | undefined) ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.db.put('meta', value, key);
  }
}
