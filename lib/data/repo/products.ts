import { CreateProductSchema, UpdateProductSchema } from '@/lib/validations';
import { getDb } from '../client';
import { newId, nowIso } from '../ids';
import type { ProductRow } from '../types';
import { errorMessage, toProduct } from './mappers';

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function activeProducts(db: Awaited<ReturnType<typeof getDb>>) {
  return db.all('products').filter((p) => p.active === 1);
}

export async function createProduct(data: any) {
  try {
    const v = CreateProductSchema.parse(data);
    const db = await getDb();
    if (activeProducts(db).some((p) => p.code === v.code)) {
      throw new Error(`Ya existe un producto con el código ${v.code}`);
    }
    const ts = nowIso();
    const row: ProductRow = {
      id: newId(),
      code: v.code,
      name: v.name,
      description: v.description ?? null,
      unit_price: v.unitPrice,
      current_stock: v.currentStock ?? 0,
      minimum_stock: v.minimumStock ?? 0,
      maximum_stock: v.maximumStock ?? 999999,
      unit: v.unit ?? 'unidad',
      supplier: v.supplier ?? null,
      active: 1,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    };
    const [saved] = await db.mutate([{ table: 'products', row }]);
    return { success: true as const, data: toProduct(saved as ProductRow) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function updateProduct(id: number, data: any) {
  try {
    const v = UpdateProductSchema.parse(data);
    const db = await getDb();
    const current = db.get('products', id);
    if (!current) throw new Error('Producto no encontrado');
    const row: ProductRow = {
      ...current,
      ...(v.code !== undefined && { code: v.code }),
      ...(v.name !== undefined && { name: v.name }),
      ...(v.description !== undefined && { description: v.description }),
      ...(v.unitPrice !== undefined && { unit_price: v.unitPrice }),
      ...(v.currentStock !== undefined && { current_stock: v.currentStock }),
      ...(v.minimumStock !== undefined && { minimum_stock: v.minimumStock }),
      ...(v.maximumStock !== undefined && { maximum_stock: v.maximumStock }),
      ...(v.unit !== undefined && { unit: v.unit }),
      ...(v.supplier !== undefined && { supplier: v.supplier }),
    };
    const [saved] = await db.mutate([{ table: 'products', row }]);
    return { success: true as const, data: toProduct(saved as ProductRow) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

/** Misma fuente que la tabla de gestión: solo productos activos (no eliminados). */
export async function getAllActiveProducts() {
  try {
    const db = await getDb();
    const data = activeProducts(db)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(toProduct);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function upsertProductFromImport(data: {
  code: string;
  name: string;
  description?: string;
  unitPrice: number;
}) {
  try {
    const v = CreateProductSchema.parse({
      ...data,
      currentStock: 0,
      minimumStock: 0,
      maximumStock: 999999,
      unit: 'unidad',
    });
    const db = await getDb();
    const existing = db.all('products').find((p) => p.code === v.code);
    if (existing) {
      const row: ProductRow = {
        ...existing,
        name: v.name,
        description: v.description ?? null,
        unit_price: v.unitPrice,
        active: 1,
      };
      const [saved] = await db.mutate([{ table: 'products', row }]);
      return { success: true as const, data: toProduct(saved as ProductRow), updated: true };
    }
    const created = await createProduct(v);
    return { ...created, updated: false };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function getProducts(search?: string) {
  try {
    const db = await getDb();
    let rows = activeProducts(db);
    if (search) {
      const term = normalize(search);
      rows = rows
        .filter((p) => normalize(p.name).includes(term) || normalize(p.code).includes(term))
        .slice(0, 50);
    }
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { success: true as const, data: rows.map(toProduct) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

/** Búsqueda O(n) sobre la caché en memoria: típicamente < 1 ms para miles de productos. */
export async function findActiveProductByCode(code: string) {
  const db = await getDb();
  const trimmed = code.trim();
  return activeProducts(db).find((p) => p.code === trimmed);
}

export async function getProductById(id: number) {
  try {
    const db = await getDb();
    const row = db.get('products', id);
    return { success: true as const, data: row ? toProduct(row) : undefined };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function deleteProduct(id: number) {
  try {
    const db = await getDb();
    const current = db.get('products', id);
    if (!current) throw new Error('Producto no encontrado');
    await db.mutate([{ table: 'products', row: { ...current, active: 0 } }]);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function getStockAlerts() {
  try {
    const db = await getDb();
    const rows = activeProducts(db);
    return {
      success: true as const,
      data: {
        lowStock: rows
          .filter((p) => p.minimum_stock > 0 && p.current_stock <= p.minimum_stock)
          .slice(0, 10)
          .map(toProduct),
        outOfStock: rows.filter((p) => p.current_stock === 0).slice(0, 10).map(toProduct),
      },
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
