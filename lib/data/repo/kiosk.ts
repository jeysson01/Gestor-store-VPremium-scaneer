import { getDb } from '../client';
import { getKioskSession } from '../session';
import { errorMessage, toProduct } from './mappers';
import { createPurchaseRows } from './purchases';
import { toPurchase } from './mappers';

type KioskResult<T> = { success: boolean; error?: string; data?: T };

const EXPIRED = { success: false as const, error: 'Sesión expirada' };

function kioskView(p: ReturnType<typeof toProduct>) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    unitPrice: p.unitPrice,
    currentStock: p.currentStock,
    unit: p.unit,
  };
}

export async function getKioskProducts() {
  if (!getKioskSession()) return EXPIRED;
  const db = await getDb();
  const data = db
    .all('products')
    .filter((p) => p.active === 1)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, code: p.code, name: p.name, unitPrice: Number(p.unit_price) }));
  return { success: true as const, data };
}

export async function getKioskProductById(
  productId: number
): Promise<KioskResult<ReturnType<typeof kioskView>>> {
  if (!getKioskSession()) return EXPIRED;
  const db = await getDb();
  const p = db.get('products', productId);
  if (!p || p.active !== 1) return { success: false as const, error: 'Producto no encontrado' };
  return { success: true as const, data: kioskView(toProduct(p)) };
}

/** Lookup local en memoria: no depende de la red, responde en < 1 ms. */
export async function scanProductByCode(
  code: string
): Promise<KioskResult<ReturnType<typeof kioskView>>> {
  if (!getKioskSession()) return EXPIRED;
  const trimmed = code.trim();
  if (!trimmed) return { success: false as const, error: 'Código vacío' };
  const db = await getDb();
  const p = db.all('products').find((r) => r.active === 1 && r.code === trimmed);
  if (!p) return { success: false as const, error: 'Producto no encontrado' };
  return { success: true as const, data: kioskView(toProduct(p)) };
}

export async function registerKioskPurchase(
  items: Array<{ productId: number; quantity: number; unitPrice: number }>
) {
  const session = getKioskSession();
  if (!session) return EXPIRED;
  if (!items.length) return { success: false as const, error: 'El carrito está vacío' };
  try {
    const saved = await createPurchaseRows(
      {
        purchaseNumber: `KIOSK-${Date.now()}`,
        purchaseDate: new Date(),
        status: 'pendiente_aprobacion',
        notes: 'Compra kiosko - cliente',
        items,
      },
      { kioskToken: session.token }
    );
    return { success: true as const, data: toPurchase(saved) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
