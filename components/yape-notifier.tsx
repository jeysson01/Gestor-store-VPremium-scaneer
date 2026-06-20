'use client';

import { useCallback, useEffect, useState } from 'react';
import { BanknoteIcon, Loader2Icon, SmartphoneIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { formatSoles } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  confirmCashForPurchase,
  confirmYapeForPurchase,
} from '@/lib/actions/yape-notifications';
import { deletePurchase } from '@/lib/actions/purchases';

type PendingPurchase = {
  id: number;
  purchaseNumber: string;
  totalAmount: string;
  notes: string | null;
  status?: string;
};

const POLL_MS = 4000;
const REFRESH_EVENT = 'yape-pending-refresh';
const PURCHASES_REFRESH_EVENT = 'purchases-refresh';

function PendingRow({
  item,
  busyId,
  action,
  onYape,
  onCash,
  onCancel,
  showNumber,
}: {
  item: PendingPurchase;
  busyId: number | null;
  action: 'yape' | 'efectivo' | 'cancel' | null;
  onYape: (id: number) => void;
  onCash: (id: number) => void;
  onCancel: (id: number) => void;
  showNumber: boolean;
}) {
  const busy = busyId === item.id;

  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <p className="text-base font-bold text-[#742384] leading-tight">
        {formatSoles(item.totalAmount)}
      </p>
      {showNumber && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {item.purchaseNumber}
        </p>
      )}
      <div className="grid grid-cols-3 gap-1 mt-1.5">
        <Button
          className="h-8 px-1 text-[10px] bg-[#742384] hover:bg-[#5c1c6a] text-white flex-col gap-0 leading-tight"
          onClick={() => onYape(item.id)}
          disabled={busyId !== null}
        >
          {busy && action === 'yape' ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <SmartphoneIcon className="h-3 w-3 mb-0.5" />
              Yape
            </>
          )}
        </Button>
        <Button
          variant="outline"
          className="h-8 px-1 text-[10px] flex-col gap-0 leading-tight border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
          onClick={() => onCash(item.id)}
          disabled={busyId !== null}
        >
          {busy && action === 'efectivo' ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <BanknoteIcon className="h-3 w-3 mb-0.5" />
              Efectivo
            </>
          )}
        </Button>
        <Button
          variant="outline"
          className="h-8 px-1 text-[10px] flex-col gap-0 leading-tight text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => onCancel(item.id)}
          disabled={busyId !== null}
        >
          {busy && action === 'cancel' ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            'Cancelar'
          )}
        </Button>
      </div>
    </div>
  );
}

export function YapeNotifier() {
  const [pendingList, setPendingList] = useState<PendingPurchase[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [action, setAction] = useState<'yape' | 'efectivo' | 'cancel' | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch('/api/yape/pending');
      if (!res.ok) return;
      const data = await res.json();
      setPendingList(data.pendingList ?? (data.pending ? [data.pending] : []));
    } catch {
      // silencioso
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadPending();
    window.dispatchEvent(new CustomEvent(PURCHASES_REFRESH_EVENT));
  }, [loadPending]);

  useEffect(() => {
    loadPending();
    const timer = setInterval(loadPending, POLL_MS);
    const onRefresh = () => loadPending();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [loadPending]);

  const handleYape = async (id: number) => {
    setBusyId(id);
    setAction('yape');
    try {
      const result = await confirmYapeForPurchase(id);
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo confirmar');
        return;
      }
      toast.success(result.data?.notification?.message ?? 'Yape confirmado');
      refreshAll();
    } catch {
      toast.error('Error al confirmar yape');
    } finally {
      setBusyId(null);
      setAction(null);
    }
  };

  const handleCash = async (id: number) => {
    setBusyId(id);
    setAction('efectivo');
    try {
      const result = await confirmCashForPurchase(id);
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo confirmar');
        return;
      }
      toast.success(result.data?.notification?.message ?? 'Efectivo confirmado');
      refreshAll();
    } catch {
      toast.error('Error al confirmar efectivo');
    } finally {
      setBusyId(null);
      setAction(null);
    }
  };

  const handleCancel = async (id: number) => {
    setBusyId(id);
    setAction('cancel');
    try {
      const result = await deletePurchase(id);
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo cancelar');
        return;
      }
      toast.success('Compra cancelada');
      refreshAll();
    } catch {
      toast.error('Error al cancelar compra');
    } finally {
      setBusyId(null);
      setAction(null);
    }
  };

  const count = pendingList.length;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed top-[4.5rem] right-3 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-[#742384] text-white shadow-md hover:bg-[#5c1c6a]"
        aria-label="Abrir aprobaciones pendientes"
      >
        <SmartphoneIcon className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-black ring-2 ring-background">
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed top-[4.5rem] right-3 z-40 w-[min(calc(100vw-1.5rem),272px)] rounded-lg border bg-background/95 backdrop-blur-sm shadow-md">
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-[#742384]/10">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#742384]">
          <SmartphoneIcon className="h-3.5 w-3.5" />
          {count > 0 ? `${count} pendiente${count > 1 ? 's' : ''}` : '914713706'}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setCollapsed(true)}
          aria-label="Minimizar"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {count > 0 ? (
        <div className="p-2 max-h-[min(50vh,320px)] overflow-y-auto">
          {count > 1 && (
            <p className="text-[10px] text-muted-foreground mb-1">Historial de pendientes</p>
          )}
          {pendingList.map((item) => (
            <PendingRow
              key={item.id}
              item={item}
              busyId={busyId}
              action={action}
              onYape={handleYape}
              onCash={handleCash}
              onCancel={handleCancel}
              showNumber={count > 1}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 py-2 text-[10px] text-muted-foreground text-center">
          Sin compras pendientes
        </p>
      )}
    </div>
  );
}

export function notifyYapePendingRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }
}

export const PURCHASES_REFRESH_EVENT_NAME = PURCHASES_REFRESH_EVENT;
