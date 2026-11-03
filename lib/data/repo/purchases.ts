import { CreatePurchaseSchema, UpdatePurchaseSchema } from '@/lib/validations';
import { getDb } from '../client';
import type { LocalDb } from '../db';
import { newId, nowIso } from '../ids';
import type { AnyRow, PurchaseDetailRow, PurchaseRow, TableName } from '../types';
import { byDateDesc, errorMessage, toDetail, toProduct, toPurchase } from './mappers';

type Items = Array<{ productId: number; quantity: number; unitPrice: number }>;

function detailsOf(db: LocalDb, purchaseId: number) {
  return db.all('purchase_details').filter((d) => d.purchase_id === purchaseId);
}

function buildDetails(purchaseId: number, items: Items, ts: string): PurchaseDetailRow[] {
  return items.map((item) => ({
    id: newId(),
    purchase_id: purchaseId,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: round2(item.quantity * item.unitPrice),
    received_quantity: 0,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  }));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Crea la compra y sus líneas en local (instantáneo, funciona sin internet).
 * Se exporta la versión "raw" para que el kiosko pueda adjuntar su token de sincronización.
 */
export async function createPurchaseRows(data: any, opts: { kioskToken?: string | null } = {}) {
  const v = CreatePurchaseSchema.parse(data);
  const db = await getDb();
  if (db.all('purchases').some((p) => p.purchase_number === v.purchaseNumber)) {
    throw new Error(`El número de compra ${v.purchaseNumber} ya existe`);
  }
  const ts = nowIso();
  const purchase: PurchaseRow = {
    id: newId(),
    purchase_number: v.purchaseNumber,
    purchase_date: v.purchaseDate.toISOString(),
    expected_delivery_date: v.expectedDeliveryDate?.toISOString() ?? null,
    actual_delivery_date: null,
    status: v.status ?? 'pendiente',
    total_amount: round2(v.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)),
    yape_received_at: null,
    payment_method: null,
    notes: v.notes ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  const changes: Array<{ table: TableName; row: AnyRow }> = [
    { table: 'purchases', row: purchase },
    ...buildDetails(purchase.id, v.items, ts).map((row) => ({
      table: 'purchase_details' as const,
      row,
    })),
  ];
  const [saved] = await db.mutate(changes, opts);
  return saved as PurchaseRow;
}

export async function createPurchase(data: any) {
  try {
    const saved = await createPurchaseRows(data);
    return { success: true as const, data: toPurchase(saved) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function getPurchases() {
  try {
    const db = await getDb();
    const data = db.all('purchases').sort(byDateDesc).slice(0, 100).map(toPurchase);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function getPurchaseById(id: number) {
  try {
    const db = await getDb();
    const purchase = db.get('purchases', id);
    if (!purchase) return { success: false as const, error: 'Compra no encontrada' };
    const details = detailsOf(db, id).map((d) => {
      const product = db.get('products', d.product_id);
      return { ...toDetail(d), product: product ? toProduct(product) : undefined };
    });
    return { success: true as const, data: { ...toPurchase(purchase), details } };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function updatePurchaseStatus(id: number, data: any) {
  try {
    const v = UpdatePurchaseSchema.parse(data);
    const db = await getDb();
    const current = db.get('purchases', id);
    if (!current) throw new Error('Compra no encontrada');
    const row: PurchaseRow = {
      ...current,
      status: v.status,
      ...(v.actualDeliveryDate && { actual_delivery_date: v.actualDeliveryDate.toISOString() }),
      ...(v.notes !== undefined && { notes: v.notes }),
    };
    const [saved] = await db.mutate([{ table: 'purchases', row }]);
    return { success: true as const, data: toPurchase(saved as PurchaseRow) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function receivePurchaseItems(
  purchaseId: number,
  items: Array<{ detailId: number; receivedQuantity: number }>
) {
  try {
    const db = await getDb();
    const purchase = db.get('purchases', purchaseId);
    if (!purchase) throw new Error('Compra no encontrada');
    const details = detailsOf(db, purchaseId);
    const changes: Array<{ table: TableName; row: AnyRow }> = [];
    let partial = false;
    let all = true;
    for (const item of items) {
      const detail = details.find((d) => d.id === item.detailId);
      if (!detail) continue;
      changes.push({
        table: 'purchase_details',
        row: { ...detail, received_quantity: item.receivedQuantity },
      });
      const product = db.get('products', detail.product_id);
      if (product) {
        changes.push({
          table: 'products',
          row: { ...product, current_stock: product.current_stock + item.receivedQuantity },
        });
      }
      if (item.receivedQuantity < detail.quantity) {
        partial = true;
        all = false;
      }
    }
    const status = all ? 'recibida' : partial ? 'parcial' : 'pendiente';
    changes.push({
      table: 'purchases',
      row: { ...purchase, status, actual_delivery_date: nowIso() },
    });
    await db.mutate(changes);
    return { success: true as const, data: { status } };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function updatePurchase(id: number, data: any) {
  try {
    const v = CreatePurchaseSchema.parse(data);
    const db = await getDb();
    const current = db.get('purchases', id);
    if (!current) return { success: false as const, error: 'Compra no encontrada' };
    const ts = nowIso();
    const purchase: PurchaseRow = {
      ...current,
      purchase_number: v.purchaseNumber,
      purchase_date: v.purchaseDate.toISOString(),
      expected_delivery_date: v.expectedDeliveryDate?.toISOString() ?? current.expected_delivery_date,
      status: v.status ?? current.status,
      notes: v.notes ?? null,
      total_amount: round2(v.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)),
    };
    const changes: Array<{ table: TableName; row: AnyRow }> = [
      { table: 'purchases', row: purchase },
      ...detailsOf(db, id).map((d) => ({
        table: 'purchase_details' as const,
        row: { ...d, deleted_at: ts },
      })),
      ...buildDetails(id, v.items, ts).map((row) => ({ table: 'purchase_details' as const, row })),
    ];
    const [saved] = await db.mutate(changes);
    return { success: true as const, data: toPurchase(saved as PurchaseRow) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function approveKioskPurchase(id: number) {
  try {
    const db = await getDb();
    const current = db.get('purchases', id);
    if (!current) return { success: false as const, error: 'Compra no encontrada' };
    if (current.status !== 'pendiente_aprobacion') {
      return { success: false as const, error: 'Esta compra no requiere aprobación' };
    }
    const [saved] = await db.mutate([{ table: 'purchases', row: { ...current, status: 'pendiente' } }]);
    return { success: true as const, data: toPurchase(saved as PurchaseRow) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

/** Borrado lógico (deleted_at) para que la eliminación también se sincronice. */
export async function deletePurchase(id: number) {
  try {
    const db = await getDb();
    const current = db.get('purchases', id);
    if (!current) return { success: false as const, error: 'Compra no encontrada' };
    const ts = nowIso();
    await db.mutate([
      { table: 'purchases', row: { ...current, deleted_at: ts } },
      ...detailsOf(db, id).map((d) => ({
        table: 'purchase_details' as const,
        row: { ...d, deleted_at: ts },
      })),
    ]);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

const NO_SUPPLIER_LABEL = 'Sin proveedor';

export async function getTopSuppliers(limit = 3) {
  try {
    const db = await getDb();
    const totals = new Map<string, { purchases: number; totalSpent: number }>();
    for (const p of db.all('purchases')) {
      const name = p.notes?.trim() || NO_SUPPLIER_LABEL;
      const cur = totals.get(name) ?? { purchases: 0, totalSpent: 0 };
      totals.set(name, {
        purchases: cur.purchases + 1,
        totalSpent: cur.totalSpent + (Number(p.total_amount) || 0),
      });
    }
    const sorted = [...totals.entries()]
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
    return {
      success: true as const,
      data: {
        topSuppliers: sorted.filter((s) => s.name !== NO_SUPPLIER_LABEL).slice(0, limit),
        withoutSupplier: sorted.find((s) => s.name === NO_SUPPLIER_LABEL) ?? null,
      },
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildPurchasesByDay(rows: PurchaseRow[], days = 7) {
  const today = startOfLocalDay(new Date());
  const counts = new Map<number, number>();
  for (const p of rows) {
    if (!p.purchase_date) continue;
    const t = startOfLocalDay(new Date(p.purchase_date)).getTime();
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const result: { date: string; label: string; count: number }[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    result.push({
      date: day.toISOString().split('T')[0],
      label:
        offset === 0 ? 'Hoy' : day.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
      count: counts.get(day.getTime()) ?? 0,
    });
  }
  return result;
}

export async function getPurchaseStats() {
  try {
    const db = await getDb();
    const rows = db.all('purchases').sort(byDateDesc);
    const count = (s: PurchaseRow['status']) => rows.filter((p) => p.status === s).length;
    return {
      success: true as const,
      data: {
        totalPurchases: rows.length,
        totalAmount: rows.reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
        byStatus: {
          pendiente: count('pendiente'),
          pendiente_aprobacion: count('pendiente_aprobacion'),
          recibida: count('recibida'),
          parcial: count('parcial'),
          cancelada: count('cancelada'),
        },
        purchasesByDay: buildPurchasesByDay(rows),
        recentPurchases: rows.slice(0, 10).map(toPurchase),
      },
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
