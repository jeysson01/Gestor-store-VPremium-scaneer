import type { Connectivity } from './connectivity';
import type { LocalDb } from './db';
import {
  AuthRequiredError,
  PermanentError,
  TransientError,
  type RemoteApi,
} from './remote';
import { SYNC_TABLES, type OutboxEntry } from './types';

export type SyncStatus = {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  realtime: boolean;
};

const BATCH = 50;
const PULL_PAGE = 1000;
const MAX_PERMANENT_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;

/**
 * Motor de sincronización en segundo plano.
 * push (outbox FIFO, por lotes) → pull (por server_updated_at) → realtime.
 * Corre fuera del flujo de la UI: las pantallas leen siempre de la base local.
 */
export class SyncEngine {
  private status: SyncStatus = {
    online: false,
    syncing: false,
    pending: 0,
    lastSyncAt: null,
    lastError: null,
    realtime: false,
  };
  private listeners = new Set<(s: SyncStatus) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private unsubRealtime: (() => void) | null = null;
  private unsubConn: (() => void) | null = null;

  constructor(
    private readonly db: LocalDb,
    private readonly remote: RemoteApi | null,
    private readonly connectivity: Connectivity,
    private readonly getKioskToken: () => string | null = () => null
  ) {}

  getStatus() {
    return this.status;
  }

  subscribe(fn: (s: SyncStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  start() {
    this.db.setMutationHook(() => {
      this.update({ pending: this.db.pendingCount() });
      this.kick();
    });
    this.update({ online: this.connectivity.isOnline, pending: this.db.pendingCount() });
    this.unsubConn = this.connectivity.subscribe((online) => {
      this.update({ online });
      if (online) {
        this.failures = 0;
        this.kick();
        this.startRealtime();
      } else {
        this.stopRealtime();
      }
    });
    this.connectivity.start();
    void this.db.ready.then(() => {
      this.update({ pending: this.db.pendingCount() });
      if (this.connectivity.isOnline) this.startRealtime();
      this.kick();
    });
  }

  stop() {
    this.unsubConn?.();
    this.stopRealtime();
    this.connectivity.stop();
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  /** Solicita una sincronización; si ya hay una en curso, se encadena otra al terminar. */
  kick(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.syncOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async syncOnce() {
    if (!this.remote || !this.connectivity.isOnline) return;
    await this.db.ready;
    this.update({ syncing: true });
    try {
      await this.push();
      await this.pull();
      this.failures = 0;
      this.update({ lastSyncAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.update({ lastError: message });
      if (e instanceof TransientError) {
        this.failures++;
        void this.connectivity.check();
        this.scheduleRetry();
      }
    } finally {
      this.update({ syncing: false, pending: this.db.pendingCount() });
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.failures, 6));
    this.retryTimer = setTimeout(() => void this.kick(), delay);
  }

  private async push() {
    const remote = this.remote!;
    const store = this.db.store;
    const authed = await remote.canWrite();
    for (;;) {
      const entries = await store.peekOutbox(BATCH);
      if (!entries.length) return;
      const batch = takeBatch(entries);
      const token = batch[0].kioskToken;
      if (!token && !authed) {
        // Sin sesión de admin: se queda en cola hasta el login. Lo demás (pull) sigue.
        this.update({ lastError: 'Inicia sesión para subir cambios pendientes' });
        return;
      }
      try {
        if (token) {
          await remote.kioskUpsert(
            token,
            batch.map((e) => ({ table: e.table, row: e.row }))
          );
        } else {
          await remote.upsert(batch[0].table, dedupeRows(batch));
        }
        await store.removeOutbox(batch.map((e) => e.seq!));
        this.db.confirmPushed(batch);
        this.update({ pending: this.db.pendingCount() });
      } catch (e) {
        if (e instanceof AuthRequiredError) return;
        if (!(e instanceof PermanentError)) throw e;
        await this.handlePermanent(batch, e);
      }
    }
  }

  private async handlePermanent(batch: OutboxEntry[], error: PermanentError) {
    const store = this.db.store;
    const first = { ...batch[0], attempts: batch[0].attempts + 1, lastError: error.message };
    if (first.attempts < MAX_PERMANENT_ATTEMPTS) {
      await store.updateOutbox(first);
      throw new TransientError(error.message);
    }
    // Dead-letter: se guarda para auditoría y se libera la cola para no bloquear al resto.
    const raw = (await store.getMeta('dead_letter')) ?? '[]';
    const dead = JSON.parse(raw) as OutboxEntry[];
    dead.push(first);
    await store.setMeta('dead_letter', JSON.stringify(dead.slice(-200)));
    await store.removeOutbox([first.seq!]);
    this.db.confirmPushed([first]);
  }

  private async pull() {
    const remote = this.remote!;
    const store = this.db.store;
    if (!(await remote.canWrite())) {
      // Dispositivo en modo kiosko: solo descarga el catálogo vía RPC.
      const token = this.getKioskToken();
      if (token) await this.db.applyRemote('products', await remote.fetchKioskCatalog(token));
      return;
    }
    for (const table of SYNC_TABLES) {
      let cursor = await store.getMeta(`cursor:${table}`);
      for (;;) {
        const rows = await remote.fetchSince(table, cursor, PULL_PAGE);
        if (!rows.length) break;
        const nextCursor = rows[rows.length - 1].server_updated_at;
        await this.db.applyRemote(table, rows);
        cursor = nextCursor;
        await store.setMeta(`cursor:${table}`, cursor);
        if (rows.length < PULL_PAGE) break;
      }
    }
  }

  private startRealtime() {
    if (!this.remote || this.unsubRealtime) return;
    // Realtime respeta RLS: sin sesión de admin no llegaría nada.
    void this.remote.canWrite().then((ok) => {
      if (ok && !this.unsubRealtime && this.connectivity.isOnline) this.subscribeRealtime();
    });
  }

  /** Llamar tras login/logout para reabrir el canal realtime con la nueva sesión. */
  restartRealtime() {
    this.stopRealtime();
    if (this.connectivity.isOnline) this.startRealtime();
  }

  private subscribeRealtime() {
    if (!this.remote) return;
    this.unsubRealtime = this.remote.subscribe((table, row) => {
      void this.db.applyRemote(table, [row]);
    });
    this.update({ realtime: true });
  }

  private stopRealtime() {
    this.unsubRealtime?.();
    this.unsubRealtime = null;
    this.update({ realtime: false });
  }

  private update(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }
}

/** Agrupa entradas consecutivas de la misma tabla y mismo origen (admin/kiosko). */
function takeBatch(entries: OutboxEntry[]): OutboxEntry[] {
  const first = entries[0];
  const batch = [first];
  for (const e of entries.slice(1)) {
    if (first.kioskToken) {
      if (e.kioskToken !== first.kioskToken) break;
    } else if (e.kioskToken || e.table !== first.table) {
      break;
    }
    batch.push(e);
  }
  return batch;
}

/** Si la misma fila se editó varias veces offline, solo se sube la última versión. */
function dedupeRows(batch: OutboxEntry[]) {
  const map = new Map<number, OutboxEntry['row']>();
  for (const e of batch) map.set(e.rowId, e.row);
  return [...map.values()];
}
