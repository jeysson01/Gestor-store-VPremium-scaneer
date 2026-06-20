'use server';

import { db } from '@/lib/db';
import { products, categories, stockMovements } from '@/lib/db/schema';
import { eq, ilike, and, or, asc } from 'drizzle-orm';
import { CreateProductSchema, UpdateProductSchema } from '@/lib/validations';
import { revalidateTag } from 'next/cache';

export async function createProduct(data: any) {
  try {
    const validated = CreateProductSchema.parse(data);

    const result = await db
      .insert(products)
      .values({
        ...validated,
        currentStock: validated.currentStock ?? 0,
        minimumStock: validated.minimumStock ?? 0,
      })
      .returning();

    revalidateTag('products');
    return { success: true, data: result[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateProduct(id: number, data: any) {
  try {
    const validated = UpdateProductSchema.parse(data);

    const result = await db
      .update(products)
      .set(validated)
      .where(eq(products.id, id))
      .returning();

    revalidateTag('products');
    return { success: true, data: result[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Misma fuente que la tabla de gestión: solo productos activos (no eliminados). */
export async function getAllActiveProducts() {
  try {
    const results = await db
      .select()
      .from(products)
      .where(eq(products.active, 1))
      .orderBy(asc(products.code));

    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function upsertProductFromImport(data: {
  code: string;
  name: string;
  description?: string;
  unitPrice: number;
}) {
  try {
    const validated = CreateProductSchema.parse({
      ...data,
      currentStock: 0,
      minimumStock: 0,
      maximumStock: 999999,
      unit: 'unidad',
    });

    const existing = await db
      .select()
      .from(products)
      .where(eq(products.code, validated.code))
      .limit(1);

    if (existing.length) {
      const result = await db
        .update(products)
        .set({
          name: validated.name,
          description: validated.description,
          unitPrice: validated.unitPrice.toString(),
          active: 1,
          updatedAt: new Date(),
        })
        .where(eq(products.id, existing[0].id))
        .returning();

      revalidateTag('products');
      return { success: true, data: result[0], updated: true };
    }

    const created = await createProduct(validated);
    return { ...created, updated: false };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getProducts(search?: string) {
  try {
    let query = db.query.products.findMany({
      with: {
        category: true,
      },
    });

    // Si hay búsqueda, filtrar por código o nombre
    if (search) {
      const term = `%${search}%`;
      const results = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.active, 1),
            or(ilike(products.name, term), ilike(products.code, term))
          )
        )
        .limit(50);
      return { success: true, data: results };
    }

    const results = await db
      .select()
      .from(products)
      .where(eq(products.active, 1))
      .limit(100);

    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getProductById(id: number) {
  try {
    const result = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return { success: true, data: result[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteProduct(id: number) {
  try {
    await db
      .update(products)
      .set({ active: 0 })
      .where(eq(products.id, id));

    revalidateTag('products');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function adjustStock(
  productId: number,
  quantity: number,
  type: 'entrada' | 'salida' | 'ajuste' | 'devolucion',
  notes?: string
) {
  try {
    // Obtener producto actual
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product.length) {
      return { success: false, error: 'Producto no encontrado' };
    }

    const currentStock = product[0].currentStock || 0;
    const newStock = type === 'salida' ? currentStock - quantity : currentStock + quantity;

    // Actualizar stock
    await db
      .update(products)
      .set({ currentStock: newStock })
      .where(eq(products.id, productId));

    // Registrar movimiento
    await db.insert(stockMovements).values({
      productId,
      type,
      quantity,
      notes,
    });

    revalidateTag('products');
    return { success: true, data: { newStock } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCategories() {
  try {
    const results = await db.select().from(categories);
    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createCategory(name: string, description?: string) {
  try {
    const result = await db
      .insert(categories)
      .values({ name, description })
      .returning();

    return { success: true, data: result[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getStockAlerts() {
  try {
    // Productos con stock bajo (menor al mínimo)
    const lowStock = await db.query.products.findMany({
      where: (products, { lte, gt }) =>
        and(lte(products.currentStock, products.minimumStock), gt(products.minimumStock, 0)),
    });

    // Productos sin stock
    const outOfStock = await db.query.products.findMany({
      where: (products, { eq }) => eq(products.currentStock, 0),
    });

    return {
      success: true,
      data: {
        lowStock: lowStock.slice(0, 10),
        outOfStock: outOfStock.slice(0, 10),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
