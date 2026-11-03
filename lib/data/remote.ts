import type { SupabaseClient } from '@supabase/supabase-js';
import { SYNC_TABLES, type AnyRow, type TableName } from './types';

/** Error transitorio (sin red, timeout, 5xx): se reintenta con backoff. */
export class TransientError extends Error {}
/** El servidor rechazó la fila (validación, RLS...): se reintenta pocas veces y luego va a dead-letter. */
export class PermanentError extends Error {}
/** No hay sesión de administrador: se espera al login. */
export class AuthRequiredError extends Error {}

export type RemoteRow = AnyRow & { server_updated_at: string };

export interface RemoteApi {
  canWrite(): Promise<boolean>;
  upsert(table: TableName, rows: AnyRow[]): Promise<void>;
  kioskUpsert(kioskToken: string, rows: Array<{ table: TableName; row: AnyRow }>): Promise<void>;
  fetchSince(table: TableName, since: string | null, limit: number): Promise<RemoteRow[]>;
  fetchKioskCatalog(kioskToken: string): Promise<RemoteRow[]>;
  subscribe(onRow: (table: TableName, row: RemoteRow) => void): () => void;
}

function classify(error: { message?: string; code?: string; status?: number } | null, status?: number) {
  const msg = error?.message ?? 'Error desconocido';
  const s = status ?? error?.status ?? 0;
  if (!s || s >= 500 || s === 408 || s === 429 || /fetch|network|timeout/i.test(msg)) {
    return new TransientError(msg);
  }
  if (s === 401 || error?.code === 'PGRST301' || /JWT/i.test(msg)) return new AuthRequiredError(msg);
  return new PermanentError(msg);
}

export class SupabaseRemote implements RemoteApi {
  constructor(private readonly sb: SupabaseClient) {}

  async canWrite() {
    const { data } = await this.sb.auth.getSession();
    return Boolean(data.session);
  }

  async upsert(table: TableName, rows: AnyRow[]) {
    let res;
    try {
      res = await this.sb.from(table).upsert(rows, { onConflict: 'id' });
    } catch (e) {
      throw new TransientError(String(e));
    }
    if (res.error) throw classify(res.error, res.status);
  }

  async kioskUpsert(kioskToken: string, rows: Array<{ table: TableName; row: AnyRow }>) {
    let res;
    try {
      res = await this.sb.rpc('kiosk_sync_rows', { p_token: kioskToken, p_rows: rows });
    } catch (e) {
      throw new TransientError(String(e));
    }
    if (res.error) throw classify(res.error, res.status);
  }

  async fetchSince(table: TableName, since: string | null, limit: number) {
    let query = this.sb
      .from(table)
      .select('*')
      .order('server_updated_at', { ascending: true })
      .limit(limit);
    if (since) query = query.gt('server_updated_at', since);
    const res = await query;
    if (res.error) throw classify(res.error, res.status);
    return (res.data ?? []) as RemoteRow[];
  }

  /** Catálogo para un kiosko sin sesión de admin (RLS no permite leer `products` directamente). */
  async fetchKioskCatalog(kioskToken: string) {
    const res = await this.sb.rpc('kiosk_products', { p_token: kioskToken });
    if (res.error) throw classify(res.error, res.status);
    return ((res.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      description: null,
      minimum_stock: 0,
      maximum_stock: 999999,
      supplier: null,
      ...p,
    })) as unknown as RemoteRow[];
  }

  subscribe(onRow: (table: TableName, row: RemoteRow) => void) {
    const channel = this.sb.channel('gestor-store-sync');
    for (const table of SYNC_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if (payload.new && 'id' in payload.new) onRow(table, payload.new as RemoteRow);
      });
    }
    channel.subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }
}
