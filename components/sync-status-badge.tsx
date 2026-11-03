'use client';

import { CloudIcon, CloudOffIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { getDataClient } from '@/lib/data/client';
import { useSyncStatus } from '@/lib/data/hooks';
import { isSupabaseConfigured } from '@/lib/data/supabase';
import { cn } from '@/lib/utils';

/** Indicador online/offline + cambios pendientes de subir a Supabase. */
export function SyncStatusBadge({ className }: { className?: string }) {
  const status = useSyncStatus();
  if (!status || !isSupabaseConfigured()) return null;

  const { online, syncing, pending, lastError } = status;
  const label = !online
    ? pending
      ? `Offline · ${pending} pendiente${pending === 1 ? '' : 's'}`
      : 'Offline'
    : syncing
      ? 'Sincronizando…'
      : pending
        ? `${pending} pendiente${pending === 1 ? '' : 's'}`
        : 'Sincronizado';
  const Icon = !online ? CloudOffIcon : syncing ? Loader2Icon : pending ? RefreshCwIcon : CloudIcon;

  return (
    <button
      type="button"
      title={lastError ?? label}
      onClick={() => void getDataClient().sync.kick()}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        !online
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : pending
            ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        className
      )}
      data-testid="sync-status"
    >
      <Icon className={cn('size-3.5', syncing && 'animate-spin')} />
      {label}
    </button>
  );
}
