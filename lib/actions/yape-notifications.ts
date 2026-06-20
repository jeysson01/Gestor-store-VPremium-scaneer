'use server';

import { db } from '@/lib/db';
import { purchases, yapeNotifications } from '@/lib/db/schema';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { formatSoles } from '@/lib/utils';

const YAPE_PHONE = process.env.YAPE_PHONE ?? '914713706';
const MATCH_WINDOW_HOURS = 48;

export async function getPendingYapePurchase() {
  const result = await getPendingApprovalPurchases();
  if (!result.success) return result;
  return { success: true, data: result.data[0] ?? null };
}

export async function getPendingApprovalPurchases() {
  try {
    const rows = await db
      .select({
        id: purchases.id,
        purchaseNumber: purchases.purchaseNumber,
        totalAmount: purchases.totalAmount,
        notes: purchases.notes,
        status: purchases.status,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .where(
        or(
          eq(purchases.status, 'pendiente_aprobacion'),
          and(eq(purchases.status, 'pendiente'), isNull(purchases.yapeReceivedAt))
        )
      )
      .orderBy(desc(purchases.createdAt))
      .limit(10);

    return { success: true, data: rows };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al cargar pendientes',
    };
  }
}

export async function confirmYapeForPurchase(purchaseId: number) {
  return confirmPaymentForPurchase(purchaseId, 'yape');
}

export async function confirmCashForPurchase(purchaseId: number) {
  return confirmPaymentForPurchase(purchaseId, 'efectivo');
}

async function confirmPaymentForPurchase(
  purchaseId: number,
  method: 'yape' | 'efectivo'
) {
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .limit(1);

  if (!purchase) {
    return { success: false, error: 'Compra no encontrada' };
  }

  if (purchase.yapeReceivedAt) {
    return { success: false, error: 'Esta compra ya está pagada' };
  }

  const amount = parseFloat(String(purchase.totalAmount));

  if (purchase.status === 'pendiente_aprobacion') {
    const message =
      method === 'yape'
        ? `Kiosko aprobado — Yape ${formatSoles(amount)} — ${purchase.purchaseNumber}`
        : `Kiosko aprobado — Efectivo ${formatSoles(amount)} — ${purchase.purchaseNumber}`;

    const [notification] = await db
      .insert(yapeNotifications)
      .values({
        amount: amount.toFixed(2),
        purchaseId: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        yapePhone: YAPE_PHONE,
        message,
        source: method === 'efectivo' ? 'efectivo' : 'manual',
      })
      .returning();

    await db
      .update(purchases)
      .set({
        status: 'pendiente',
        yapeReceivedAt: new Date(),
        paymentMethod: method,
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, purchase.id));

    revalidateTag('purchases');
    revalidateTag('yape-notifications');

    return {
      success: true,
      data: {
        notification,
        matched: true,
        purchaseNumber: purchase.purchaseNumber,
      },
    };
  }

  return registerPaymentReceived(amount, method, purchaseId);
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
    return { success: false, error: 'Monto inválido' };
  }

  const amountStr = amount.toFixed(2);
  const since = new Date(Date.now() - MATCH_WINDOW_HOURS * 60 * 60 * 1000);

  let purchase = purchaseIdHint
    ? (
        await db
          .select()
          .from(purchases)
          .where(
            and(eq(purchases.id, purchaseIdHint), isNull(purchases.yapeReceivedAt))
          )
          .limit(1)
      )[0]
    : undefined;

  if (!purchase) {
    [purchase] = await db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.status, 'pendiente'),
          eq(purchases.totalAmount, amountStr),
          isNull(purchases.yapeReceivedAt),
          gt(purchases.createdAt, since)
        )
      )
      .orderBy(desc(purchases.createdAt))
      .limit(1);
  }

  const message = purchase
    ? method === 'yape'
      ? `Yape recibido ${formatSoles(amount)} en ${YAPE_PHONE} — Compra ${purchase.purchaseNumber}`
      : `Efectivo recibido ${formatSoles(amount)} — Compra ${purchase.purchaseNumber}`
    : method === 'yape'
      ? `Yape recibido ${formatSoles(amount)} en ${YAPE_PHONE} (sin compra coincidente)`
      : `Efectivo recibido ${formatSoles(amount)} (sin compra coincidente)`;

  const [notification] = await db
    .insert(yapeNotifications)
    .values({
      amount: amountStr,
      purchaseId: purchase?.id ?? null,
      purchaseNumber: purchase?.purchaseNumber ?? null,
      yapePhone: YAPE_PHONE,
      message,
      source: method === 'efectivo' ? 'efectivo' : source,
    })
    .returning();

  if (purchase) {
    await db
      .update(purchases)
      .set({
        yapeReceivedAt: new Date(),
        paymentMethod: method,
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, purchase.id));
  }

  revalidateTag('purchases');
  revalidateTag('yape-notifications');

  return {
    success: true,
    data: {
      notification,
      matched: Boolean(purchase),
      purchaseNumber: purchase?.purchaseNumber ?? null,
    },
  };
}

export async function getYapeNotificationsAfter(afterId: number) {
  try {
    const rows = await db
      .select()
      .from(yapeNotifications)
      .where(gt(yapeNotifications.id, afterId))
      .orderBy(yapeNotifications.id)
      .limit(15);

    return { success: true, data: rows };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al cargar notificaciones',
    };
  }
}

export async function getRecentYapeNotifications() {
  try {
    const rows = await db
      .select()
      .from(yapeNotifications)
      .orderBy(desc(yapeNotifications.createdAt))
      .limit(8);

    return { success: true, data: rows };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al cargar notificaciones',
    };
  }
}
