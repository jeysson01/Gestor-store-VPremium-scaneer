import { nowIso } from './ids';
import type { LocalStore } from './local/store';
import { SYNC_TABLES, type AnyRow, type OutboxEntry, type RowByTable, type TableName } from './types';

type ChangeListener = (tables: Set<TableName>) => void;

/**
 * Base local con caché en memoria: las lecturas son síncronas (microsegundos) y las
 * escrituras se persisten en SQLite/IndexedDB junto con su entrada de outbox.
 */
export class LocalDb {
  private cache = new Map<TableName, Map<number, AnyRow>>();
  private pending = new Map<string, number>();
  private listeners = new Set<ChangeListener>();
  private onMutate: (() => void) | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(readonly store: LocalStore) {}

  /** Carga perezosa de la base local en la caché (se inicia en el primer acceso). */
  get ready(): Promise<void> {
    this.readyPromise ??= this.load();
    return this.readyPromise;
  }

  private async load() {
    await this.store.init();
    for (const table of SYNC_TABLES) {
      const rows = await this.store.loadAll(table);
      this.cache.set(table, new Map(rows.map((r) => [r.id, r])));
    }
    for (const entry of await this.store.peekOutbox(100_000)) {
      this.markPending(entry.table, entry.rowId, 1);
    }
  }

  setMutationHook(fn: () => void) {
    this.onMutate = fn;
  }

  subscribe(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Filas visibles (no eliminadas). */
  all<T extends TableName>(table: T): RowByTable[T][] {
    const rows: RowByTable[T][] = [];
    for (const row of this.cache.get(table)?.values() ?? []) {
      if (!row.deleted_at) rows.push(row as RowByTable[T]);
    }
    return rows;
  }

  get<T extends TableName>(table: T, id: number): RowByTable[T] | undefined {
    const row = this.cache.get(table)?.get(id);
    return row && !row.deleted_at ? (row as RowByTable[T]) : undefined;
  }

  /** Escritura local-first: cache + almacenamiento local + outbox. Nunca espera a la red. */
  async mutate(
    changes: Array<{ table: TableName; row: AnyRow }>,
    opts: { kioskToken?: string | null } = {}
  ) {
    await this.ready;
    const ts = nowIso();
    const stamped = changes.map(({ table, row }) => ({
      table,
      row: { ...row, updated_at: ts } as AnyRow,
    }));
    const outbox: OutboxEntry[] = stamped.map(({ table, row }) => ({
      table,
      rowId: row.id,
      row,
      createdAt: ts,
      attempts: 0,
      lastError: null,
      kioskToken: opts.kioskToken ?? null,
    }));
    for (const { table, row } of stamped) {
      this.cache.get(table)!.set(row.id, row);
      this.markPending(table, row.id, 1);
    }
    await this.store.write(stamped, outbox);
    this.emit(new Set(stamped.map((c) => c.table)));
    this.onMutate?.();
    return stamped.map((c) => c.row);
  }

  /**
   * Aplica filas que llegan de Supabase (pull o realtime).
   * - Si la fila tiene cambios locales sin subir, se conserva la versión local.
   * - Si no, gana la versión con `updated_at` más reciente (last-write-wins).
   */
  async applyRemote(table: TableName, rows: AnyRow[]) {
    await this.ready;
    const accepted: Array<{ table: TableName; row: AnyRow }> = [];
    const tableCache = this.cache.get(table)!;
    for (const raw of rows) {
      const row = normalizeRemoteRow(raw);
      if (this.pending.has(key(table, row.id))) continue;
      const current = tableCache.get(row.id);
      if (current && current.updated_at > row.updated_at) continue;
      tableCache.set(row.id, row);
      accepted.push({ table, row });
    }
    if (accepted.length) {
      await this.store.write(accepted);
      this.emit(new Set([table]));
    }
    return accepted.length;
  }

  /** Llamado por el sync engine cuando una entrada de outbox se confirmó en Supabase. */
  confirmPushed(entries: OutboxEntry[]) {
    for (const e of entries) this.markPending(e.table, e.rowId, -1);
  }

  pendingCount() {
    let n = 0;
    for (const v of this.pending.values()) n += v;
    return n;
  }

  private markPending(table: TableName, id: number, delta: number) {
    const k = key(table, id);
    const next = (this.pending.get(k) ?? 0) + delta;
    if (next <= 0) this.pending.delete(k);
    else this.pending.set(k, next);
  }

  private emit(tables: Set<TableName>) {
    for (const fn of this.listeners) fn(tables);
  }
}

function key(table: TableName, id: number) {
  return `${table}:${id}`;
}

const NUMERIC_FIELDS = new Set([
  'id',
  'unit_price',
  'total_price',
  'total_amount',
  'amount',
  'purchase_id',
  'product_id',
]);

/** Postgres devuelve numeric/bigint como string en algunos casos: se normaliza a number. */
export function normalizeRemoteRow(raw: AnyRow): AnyRow {
  const row: Record<string, unknown> = { ...raw };
  for (const field of NUMERIC_FIELDS) {
    if (typeof row[field] === 'string') row[field] = Number(row[field]);
  }
  delete row.server_updated_at;
  return row as AnyRow;
}
