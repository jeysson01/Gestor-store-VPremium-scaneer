import type { AnyRow, OutboxEntry, TableName } from '../types';
import type { LocalStore } from './store';

export class MemoryStore implements LocalStore {
  readonly kind = 'memory' as const;
  private tables = new Map<TableName, Map<number, AnyRow>>();
  private outbox: OutboxEntry[] = [];
  private meta = new Map<string, string>();
  private seq = 0;

  init() {
    return Promise.resolve();
  }

  loadAll(table: TableName) {
    return Promise.resolve([...(this.tables.get(table)?.values() ?? [])]);
  }

  write(rows: Array<{ table: TableName; row: AnyRow }>, outbox: OutboxEntry[] = []) {
    for (const { table, row } of rows) {
      if (!this.tables.has(table)) this.tables.set(table, new Map());
      this.tables.get(table)!.set(row.id, row);
    }
    for (const entry of outbox) this.outbox.push({ ...entry, seq: ++this.seq });
    return Promise.resolve();
  }

  peekOutbox(limit: number) {
    return Promise.resolve(this.outbox.slice(0, limit).map((e) => ({ ...e })));
  }

  removeOutbox(seqs: number[]) {
    const set = new Set(seqs);
    this.outbox = this.outbox.filter((e) => !set.has(e.seq!));
    return Promise.resolve();
  }

  updateOutbox(entry: OutboxEntry) {
    this.outbox = this.outbox.map((e) => (e.seq === entry.seq ? { ...entry } : e));
    return Promise.resolve();
  }

  countOutbox() {
    return Promise.resolve(this.outbox.length);
  }

  getMeta(key: string) {
    return Promise.resolve(this.meta.get(key) ?? null);
  }

  setMeta(key: string, value: string) {
    this.meta.set(key, value);
    return Promise.resolve();
  }
}
