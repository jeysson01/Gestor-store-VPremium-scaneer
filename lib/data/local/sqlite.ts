import type Database from '@tauri-apps/plugin-sql';
import { SYNC_TABLES, type AnyRow, type OutboxEntry, type TableName } from '../types';
import type { LocalStore } from './store';

/**
 * SQLite embebido (tauri-plugin-sql) para macOS/iOS.
 * Cada tabla guarda la fila completa como JSON + columnas indexadas para búsquedas rápidas.
 */
export class SqliteStore implements LocalStore {
  readonly kind = 'sqlite' as const;
  private db!: Database;

  async init() {
    const { default: Db } = await import('@tauri-apps/plugin-sql');
    this.db = await Db.load('sqlite:gestor-store.db');
    await this.db.execute('PRAGMA journal_mode=WAL');
    for (const table of SYNC_TABLES) {
      await this.db.execute(
        `CREATE TABLE IF NOT EXISTS ${table} (
           id INTEGER PRIMARY KEY,
           updated_at TEXT NOT NULL,
           data TEXT NOT NULL
         )`
      );
      await this.db.execute(
        `CREATE INDEX IF NOT EXISTS ${table}_updated_at_idx ON ${table}(updated_at)`
      );
    }
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS outbox (
         seq INTEGER PRIMARY KEY AUTOINCREMENT,
         tbl TEXT NOT NULL,
         row_id INTEGER NOT NULL,
         data TEXT NOT NULL,
         created_at TEXT NOT NULL,
         attempts INTEGER NOT NULL DEFAULT 0,
         last_error TEXT,
         kiosk_token TEXT
       )`
    );
    await this.db.execute(
      'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    );
  }

  async loadAll(table: TableName) {
    const rows = await this.db.select<Array<{ data: string }>>(`SELECT data FROM ${table}`);
    return rows.map((r) => JSON.parse(r.data) as AnyRow);
  }

  async write(rows: Array<{ table: TableName; row: AnyRow }>, outbox: OutboxEntry[] = []) {
    for (const { table, row } of rows) {
      await this.db.execute(
        `INSERT INTO ${table} (id, updated_at, data) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
        [row.id, row.updated_at, JSON.stringify(row)]
      );
    }
    for (const entry of outbox) {
      await this.db.execute(
        `INSERT INTO outbox (tbl, row_id, data, created_at, attempts, last_error, kiosk_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.table,
          entry.rowId,
          JSON.stringify(entry.row),
          entry.createdAt,
          entry.attempts,
          entry.lastError,
          entry.kioskToken ?? null,
        ]
      );
    }
  }

  async peekOutbox(limit: number) {
    const rows = await this.db.select<
      Array<{
        seq: number;
        tbl: TableName;
        row_id: number;
        data: string;
        created_at: string;
        attempts: number;
        last_error: string | null;
        kiosk_token: string | null;
      }>
    >('SELECT * FROM outbox ORDER BY seq ASC LIMIT $1', [limit]);
    return rows.map((r) => ({
      seq: r.seq,
      table: r.tbl,
      rowId: r.row_id,
      row: JSON.parse(r.data) as AnyRow,
      createdAt: r.created_at,
      attempts: r.attempts,
      lastError: r.last_error,
      kioskToken: r.kiosk_token,
    }));
  }

  async removeOutbox(seqs: number[]) {
    if (!seqs.length) return;
    const placeholders = seqs.map((_, i) => `$${i + 1}`).join(',');
    await this.db.execute(`DELETE FROM outbox WHERE seq IN (${placeholders})`, seqs);
  }

  async updateOutbox(entry: OutboxEntry) {
    await this.db.execute('UPDATE outbox SET attempts = $1, last_error = $2 WHERE seq = $3', [
      entry.attempts,
      entry.lastError,
      entry.seq,
    ]);
  }

  async countOutbox() {
    const rows = await this.db.select<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM outbox');
    return rows[0]?.n ?? 0;
  }

  async getMeta(key: string) {
    const rows = await this.db.select<Array<{ value: string }>>(
      'SELECT value FROM meta WHERE key = $1',
      [key]
    );
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.db.execute(
      'INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  }
}
