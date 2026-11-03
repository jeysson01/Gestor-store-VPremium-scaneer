/** Filas tal como viven en Supabase (snake_case). La base local guarda exactamente la misma forma. */
export type TableName =
  | 'products'
  | 'purchases'
  | 'purchase_details'
  | 'yape_notifications'
  | 'kiosk_codes';

export const SYNC_TABLES: TableName[] = [
  'products',
  'purchases',
  'purchase_details',
  'yape_notifications',
  'kiosk_codes',
];

export type BaseRow = {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProductRow = BaseRow & {
  code: string;
  name: string;
  description: string | null;
  unit_price: number;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number;
  unit: string;
  supplier: string | null;
  active: number;
};

export type PurchaseStatus =
  | 'pendiente'
  | 'pendiente_aprobacion'
  | 'recibida'
  | 'parcial'
  | 'cancelada';

export type PurchaseRow = BaseRow & {
  purchase_number: string;
  purchase_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: PurchaseStatus;
  total_amount: number;
  yape_received_at: string | null;
  payment_method: 'yape' | 'efectivo' | null;
  notes: string | null;
};

export type PurchaseDetailRow = BaseRow & {
  purchase_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  received_quantity: number;
};

export type YapeNotificationRow = BaseRow & {
  amount: number;
  purchase_id: number | null;
  purchase_number: string | null;
  yape_phone: string;
  message: string;
  source: string;
};

export type KioskCodeRow = BaseRow & {
  code: string;
  qr_token: string;
  batch_id: string;
  expires_at: string;
  used_at: string | null;
  used_device: string | null;
};

export type RowByTable = {
  products: ProductRow;
  purchases: PurchaseRow;
  purchase_details: PurchaseDetailRow;
  yape_notifications: YapeNotificationRow;
  kiosk_codes: KioskCodeRow;
};

export type AnyRow = RowByTable[TableName];

/** Cambio pendiente de subir a Supabase (patrón outbox). */
export type OutboxEntry = {
  seq?: number;
  table: TableName;
  rowId: number;
  row: AnyRow;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  /** Compras creadas desde un kiosko sin sesión de admin: se suben vía RPC con su token. */
  kioskToken?: string | null;
};

export type Result<T = undefined> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: string; data?: undefined };
