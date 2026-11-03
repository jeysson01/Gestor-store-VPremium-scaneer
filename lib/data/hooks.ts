'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getDataClient } from './client';
import { getSession, onSessionChange, type AppSession } from './session';
import type { SyncStatus } from './sync-engine';
import type { TableName } from './types';

/** Contador que cambia cada vez que la base local cambia (escrituras locales, pull o realtime). */
export function useDataVersion(tables: TableName[]): number {
  const [version, setVersion] = useState(0);
  const key = tables.join(',');
  useEffect(() => {
    const { db } = getDataClient();
    const watched = new Set(key.split(','));
    let raf = 0;
    const unsub = db.subscribe((changed) => {
      if (![...changed].some((t) => watched.has(t))) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVersion((v) => v + 1));
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [key]);
  return version;
}

export function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    const unsub = getDataClient().sync.subscribe(setStatus);
    return () => {
      unsub();
    };
  }, []);
  return status;
}

let cachedSession: AppSession | null | undefined;
function subscribeSession(fn: () => void) {
  return onSessionChange(() => {
    cachedSession = undefined;
    fn();
  });
}
function readSession() {
  if (cachedSession === undefined) cachedSession = getSession();
  return cachedSession;
}

export function useSession(): AppSession | null | undefined {
  return useSyncExternalStore(subscribeSession, readSession, () => undefined);
}
