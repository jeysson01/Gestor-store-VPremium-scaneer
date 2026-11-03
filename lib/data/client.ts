'use client';

import { Connectivity } from './connectivity';
import { LocalDb } from './db';
import { IndexedDbStore } from './local/indexeddb';
import { MemoryStore } from './local/memory';
import { SqliteStore } from './local/sqlite';
import type { LocalStore } from './local/store';
import { isTauri } from './platform';
import { SupabaseRemote } from './remote';
import { getKioskSession } from './session';
import { getSupabase } from './supabase';
import { SyncEngine } from './sync-engine';

type DataClient = { db: LocalDb; sync: SyncEngine; connectivity: Connectivity };

let instance: DataClient | null = null;

function pickStore(): LocalStore {
  if (isTauri()) return new SqliteStore();
  if (typeof indexedDB !== 'undefined') return new IndexedDbStore();
  return new MemoryStore();
}

export function getDataClient(): DataClient {
  if (!instance) {
    const db = new LocalDb(pickStore());
    const sb = getSupabase();
    const connectivity = new Connectivity();
    const sync = new SyncEngine(
      db,
      sb ? new SupabaseRemote(sb) : null,
      connectivity,
      () => getKioskSession()?.token ?? null
    );
    if (typeof window !== 'undefined') sync.start();
    instance = { db, sync, connectivity };
  }
  return instance;
}

export async function getDb(): Promise<LocalDb> {
  const { db } = getDataClient();
  await db.ready;
  return db;
}
