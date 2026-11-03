import type { AnyRow, OutboxEntry, TableName } from '../types';
import type { LocalStore } from './store';

export class MemoryStore implements LocalStore {
  readonly kind = 'memory' as const;
  private tables = new Map<TableName, Map<number, AnyRow>>();
  private outbox: OutboxEntry[] = [];
  private meta = new Map<string, string>();
  private seq = 0;

  async init() {}

  async loadAll(table: TableName) {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  async write(rows: Array<{ table: TableName; row: AnyRow }>, outbox: OutboxEntry[] = []) {
    for (const { table, row } of rows) {
      if (!this.tables.has(table)) this.tables.set(table, new Map());
      this.tables.get(table)!.set(row.id, row);
    }
    for (const entry of outbox) this.outbox.push({ ...entry, seq: ++this.seq });
  }

  async peekOutbox(limit: number) {
    return this.outbox.slice(0, limit).map((e) => ({ ...e }));
  }

  async removeOutbox(seqs: number[]) {
    const set = new Set(seqs);
    this.outbox = this.outbox.filter((e) => !set.has(e.seq!));
  }

  async updateOutbox(entry: OutboxEntry) {
    this.outbox = this.outbox.map((e) => (e.seq === entry.seq ? { ...entry } : e));
  }

  async countOutbox() {
    return this.outbox.length;
  }

  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }
}
