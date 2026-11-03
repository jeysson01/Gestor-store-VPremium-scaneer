import type { AnyRow, OutboxEntry, TableName } from '../types';

export interface LocalStore {
  readonly kind: 'sqlite' | 'indexeddb' | 'memory';
  init(): Promise<void>;
  loadAll(table: TableName): Promise<AnyRow[]>;
  /** Guarda filas y (opcionalmente) entradas de outbox en la misma operación. */
  write(rows: Array<{ table: TableName; row: AnyRow }>, outbox?: OutboxEntry[]): Promise<void>;
  peekOutbox(limit: number): Promise<OutboxEntry[]>;
  removeOutbox(seqs: number[]): Promise<void>;
  updateOutbox(entry: OutboxEntry): Promise<void>;
  countOutbox(): Promise<number>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}
