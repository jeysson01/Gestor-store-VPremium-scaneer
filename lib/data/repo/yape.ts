import { formatSoles } from '@/lib/utils';
import { getDb } from '../client';
import { newId, nowIso } from '../ids';
import type { AnyRow, PurchaseRow, TableName, YapeNotificationRow } from '../types';
import { byDateDesc, errorMessage, toNotification, toPurchase } from './mappers';

const YAPE_PHONE = process.env.NEXT_PUBLIC_YAPE_PHONE ?? '914713706';
const MATCH_WINDOW_HOURS = 48;

export async function getPendingApprovalPurchases() {
  try {
    const db = await getDb();
    const data = db
      .all('purchases')
      .filter(
        (p) =>
          p.status === 'pendiente_aprobacion' || (p.status === 'pendiente' && !p.yape_received_at)
      )
      .sort(byDateDesc)
      .slice(0, 10)
      .map((p) => {
        const full = toPurchase(p);
        return {
          id: full.id,
          purchaseNumber: full.purchaseNumber,
          totalAmount: full.totalAmount,
          notes: full.notes,
          status: full.status,
          createdAt: full.createdAt,
        };
      });
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Error al cargar pendientes') };
  }
}

export async function getPendingYapePurchase() {
  const result = await getPendingApprovalPurchases();
  if (!result.success) return result;
  return { success: true as const, data: result.data[0] ?? null };
}

export async function confirmYapeForPurchase(purchaseId: number) {
  return confirmPaymentForPurchase(purchaseId, 'yape');
}

export async function confirmCashForPurchase(purchaseId: number) {
  return confirmPaymentForPurchase(purchaseId, 'efectivo');
}

function notificationRow(
  amount: number,
  purchase: PurchaseRow | undefined,
  message: string,
  source: string
): YapeNotificationRow {
  const ts = nowIso();
  return {
    id: newId(),
    amount: Math.round(amount * 100) / 100,
    purchase_id: purchase?.id ?? null,
    purchase_number: purchase?.purchase_number ?? null,
    yape_phone: YAPE_PHONE,
    message,
    source,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
}

async function confirmPaymentForPurchase(purchaseId: number, method: 'yape' | 'efectivo') {
  try {
    const db = await getDb();
    const purchase = db.get('purchases', purchaseId);
    if (!purchase) return { success: false as const, error: 'Compra no encontrada' };
    if (purchase.yape_received_at) {
      return { success: false as const, error: 'Esta compra ya está pagada' };
    }
    const amount = Number(purchase.total_amount);
    if (purchase.status !== 'pendiente_aprobacion') {
      return registerPaymentReceived(amount, method, purchaseId);
    }
    const label = method === 'yape' ? 'Yape' : 'Efectivo';
    const notification = notificationRow(
      amount,
      purchase,
      `Kiosko aprobado — ${label} ${formatSoles(amount)} — ${purchase.purchase_number}`,
      method === 'efectivo' ? 'efectivo' : 'manual'
    );
    await db.mutate([
      { table: 'yape_notifications', row: notification },
      {
        table: 'purchases',
        row: {
          ...purchase,
          status: 'pendiente',
          yape_received_at: nowIso(),
          payment_method: method,
        },
      },
    ]);
    return {
      success: true as const,
      data: {
        notification: toNotification(notification),
        matched: true,
        purchaseNumber: purchase.purchase_number,
      },
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function registerYapeReceived(
  amount: number,
  source: 'manual' | 'webhook' = 'manual',
  purchaseIdHint?: number
) {
  return registerPaymentReceived(amount, 'yape', purchaseIdHint, source);
}

export async function registerPaymentReceived(
  amount: number,
  method: 'yape' | 'efectivo',
  purchaseIdHint?: number,
  source: 'manual' | 'webhook' = 'manual'
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false as const, error: 'Monto inválido' };
  }
  try {
    const db = await getDb();
    const amount2 = Math.round(amount * 100) / 100;
    const since = new Date(Date.now() - MATCH_WINDOW_HOURS * 3600_000).toISOString();
    let purchase = purchaseIdHint ? db.get('purchases', purchaseIdHint) : undefined;
    if (purchase?.yape_received_at) purchase = undefined;
    if (!purchase) {
      purchase = db
        .all('purchases')
        .filter(
          (p) =>
            p.status === 'pendiente' &&
            !p.yape_received_at &&
            Math.abs(Number(p.total_amount) - amount2) < 0.005 &&
            p.created_at > since
        )
        .sort(byDateDesc)[0];
    }
    const soles = formatSoles(amount);
    const message = purchase
      ? method === 'yape'
        ? `Yape recibido ${soles} en ${YAPE_PHONE} — Compra ${purchase.purchase_number}`
        : `Efectivo recibido ${soles} — Compra ${purchase.purchase_number}`
      : method === 'yape'
        ? `Yape recibido ${soles} en ${YAPE_PHONE} (sin compra coincidente)`
        : `Efectivo recibido ${soles} (sin compra coincidente)`;
    const notification = notificationRow(
      amount2,
      purchase,
      message,
      method === 'efectivo' ? 'efectivo' : source
    );
    const changes: Array<{ table: TableName; row: AnyRow }> = [
      { table: 'yape_notifications', row: notification },
    ];
    if (purchase) {
      changes.push({
        table: 'purchases',
        row: { ...purchase, yape_received_at: nowIso(), payment_method: method },
      });
    }
    await db.mutate(changes);
    return {
      success: true as const,
      data: {
        notification: toNotification(notification),
        matched: Boolean(purchase),
        purchaseNumber: purchase?.purchase_number ?? null,
      },
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function getYapeNotificationsAfter(afterId: number) {
  try {
    const db = await getDb();
    const data = db
      .all('yape_notifications')
      .filter((n) => n.id > afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, 15)
      .map(toNotification);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function getRecentYapeNotifications() {
  try {
    const db = await getDb();
    const data = db.all('yape_notifications').sort(byDateDesc).slice(0, 8).map(toNotification);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
