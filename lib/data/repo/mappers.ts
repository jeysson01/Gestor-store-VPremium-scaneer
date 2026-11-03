import type {
  KioskCodeRow,
  ProductRow,
  PurchaseDetailRow,
  PurchaseRow,
  YapeNotificationRow,
} from '../types';

/** Convierte filas snake_case a la forma camelCase que usan los componentes (igual que Drizzle). */
export function toProduct(r: ProductRow) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    unitPrice: Number(r.unit_price),
    currentStock: r.current_stock,
    minimumStock: r.minimum_stock,
    maximumStock: r.maximum_stock,
    unit: r.unit,
    supplier: r.supplier,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export type Product = ReturnType<typeof toProduct>;

export function toPurchase(r: PurchaseRow) {
  return {
    id: r.id,
    purchaseNumber: r.purchase_number,
    purchaseDate: r.purchase_date,
    expectedDeliveryDate: r.expected_delivery_date,
    actualDeliveryDate: r.actual_delivery_date,
    status: r.status,
    totalAmount: Number(r.total_amount),
    yapeReceivedAt: r.yape_received_at,
    paymentMethod: r.payment_method,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export type Purchase = ReturnType<typeof toPurchase>;

export function toDetail(r: PurchaseDetailRow) {
  return {
    id: r.id,
    purchaseId: r.purchase_id,
    productId: r.product_id,
    quantity: r.quantity,
    unitPrice: Number(r.unit_price),
    totalPrice: Number(r.total_price),
    receivedQuantity: r.received_quantity,
  };
}

export function toNotification(r: YapeNotificationRow) {
  return {
    id: r.id,
    amount: Number(r.amount),
    purchaseId: r.purchase_id,
    purchaseNumber: r.purchase_number,
    yapePhone: r.yape_phone,
    message: r.message,
    source: r.source,
    createdAt: r.created_at,
  };
}

export function toKioskCode(r: KioskCodeRow) {
  return {
    id: r.id,
    code: r.code,
    qrToken: r.qr_token,
    batchId: r.batch_id,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
  };
}

export function errorMessage(error: unknown, fallback = 'Error inesperado') {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: Array<{ message: string }> }).issues;
    if (issues?.length) return issues[0].message;
  }
  return error instanceof Error ? error.message : fallback;
}

export function byDateDesc<T extends { created_at: string }>(a: T, b: T) {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}
