'use server';

import { db } from '@/lib/db';
import { purchases, purchaseDetails, products, stockMovements } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { CreatePurchaseSchema, UpdatePurchaseSchema } from '@/lib/validations';
import { revalidateTag } from 'next/cache';

export async function createPurchase(data: any) {
  try {
    const validated = CreatePurchaseSchema.parse(data);
    const { items, ...purchaseData } = validated;

    // Calcular total
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    // Crear compra
    const purchaseResult = await db
      .insert(purchases)
      .values({
        ...purchaseData,
        totalAmount: totalAmount.toString(),
        status: purchaseData.status ?? 'pendiente',
      })
      .returning();

    const purchaseId = purchaseResult[0].id;

    // Crear detalles de compra
    for (const item of items) {
      const itemTotal = item.quantity * item.unitPrice;
      await db.insert(purchaseDetails).values({
        purchaseId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        totalPrice: itemTotal.toString(),
      });
    }

    revalidateTag('purchases');
    return { success: true, data: purchaseResult[0] };
  } catch (error: any) {
    console.error('Error creating purchase:', error);
    return { success: false, error: error.message };
  }
}

export async function getPurchases() {
  try {
    const results = await db
      .select()
      .from(purchases)
      .orderBy(desc(purchases.createdAt))
      .limit(100);

    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getPurchaseById(id: number) {
  try {
    const purchaseData = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, id))
      .limit(1);

    if (!purchaseData.length) {
      return { success: false, error: 'Compra no encontrada' };
    }

    const details = await db
      .select()
      .from(purchaseDetails)
      .where(eq(purchaseDetails.purchaseId, id));

    // Obtener información de productos
    const detailsWithProducts = await Promise.all(
      details.map(async (detail) => {
        const product = await db
          .select()
          .from(products)
          .where(eq(products.id, detail.productId))
          .limit(1);
        return { ...detail, product: product[0] };
      })
    );

    return {
      success: true,
      data: {
        ...purchaseData[0],
        details: detailsWithProducts,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePurchaseStatus(id: number, data: any) {
  try {
    const validated = UpdatePurchaseSchema.parse(data);

    const result = await db
      .update(purchases)
      .set(validated)
      .where(eq(purchases.id, id))
      .returning();

    revalidateTag('purchases');
    return { success: true, data: result[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function receivePurchaseItems(
  purchaseId: number,
  items: Array<{ detailId: number; receivedQuantity: number }>
) {
  try {
    // Obtener detalles de la compra
    const purchaseDetails_ = await db
      .select()
      .from(purchaseDetails)
      .where(eq(purchaseDetails.purchaseId, purchaseId));

    let partialReceived = false;
    let allReceived = true;

    // Procesar cada item recibido
    for (const item of items) {
      const detail = purchaseDetails_.find((d) => d.id === item.detailId);
      if (!detail) continue;

      // Actualizar cantidad recibida
      await db
        .update(purchaseDetails)
        .set({ receivedQuantity: item.receivedQuantity })
        .where(eq(purchaseDetails.id, item.detailId));

      // Actualizar stock del producto
      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, detail.productId))
        .limit(1);

      if (product.length) {
        const newStock = (product[0].currentStock || 0) + item.receivedQuantity;
        await db
          .update(products)
          .set({ currentStock: newStock })
          .where(eq(products.id, detail.productId));

        // Registrar movimiento de stock
        await db.insert(stockMovements).values({
          productId: detail.productId,
          type: 'entrada',
          quantity: item.receivedQuantity,
          reference: 'compra',
          referenceId: purchaseId,
        });
      }

      // Verificar si es recepción parcial
      if (item.receivedQuantity < detail.quantity) {
        partialReceived = true;
      }
      if (item.receivedQuantity < detail.quantity) {
        allReceived = false;
      }
    }

    // Actualizar estado de la compra
    const newStatus = allReceived ? 'recibida' : partialReceived ? 'parcial' : 'pendiente';
    await db
      .update(purchases)
      .set({ status: newStatus, actualDeliveryDate: new Date() })
      .where(eq(purchases.id, purchaseId));

    revalidateTag('purchases');
    return { success: true, data: { status: newStatus } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePurchase(id: number, data: any) {
  try {
    const validated = CreatePurchaseSchema.parse(data);
    const { items, ...purchaseData } = validated;

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    const result = await db
      .update(purchases)
      .set({
        ...purchaseData,
        totalAmount: totalAmount.toString(),
        status: purchaseData.status ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, id))
      .returning();

    if (!result.length) {
      return { success: false, error: 'Compra no encontrada' };
    }

    await db.delete(purchaseDetails).where(eq(purchaseDetails.purchaseId, id));

    for (const item of items) {
      const itemTotal = item.quantity * item.unitPrice;
      await db.insert(purchaseDetails).values({
        purchaseId: id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        totalPrice: itemTotal.toString(),
      });
    }

    revalidateTag('purchases');
    return { success: true, data: result[0] };
  } catch (error: any) {
    console.error('Error updating purchase:', error);
    return { success: false, error: error.message };
  }
}

export async function approveKioskPurchase(id: number) {
  try {
    const existing = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, id))
      .limit(1);

    if (!existing.length) {
      return { success: false, error: 'Compra no encontrada' };
    }

    if (existing[0].status !== 'pendiente_aprobacion') {
      return { success: false, error: 'Esta compra no requiere aprobación' };
    }

    const result = await db
      .update(purchases)
      .set({ status: 'pendiente', updatedAt: new Date() })
      .where(eq(purchases.id, id))
      .returning();

    revalidateTag('purchases');
    return { success: true, data: result[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deletePurchase(id: number) {
  try {
    const existing = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, id))
      .limit(1);

    if (!existing.length) {
      return { success: false, error: 'Compra no encontrada' };
    }

    await db.delete(purchases).where(eq(purchases.id, id));

    revalidateTag('purchases');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting purchase:', error);
    return { success: false, error: error.message };
  }
}

const NO_SUPPLIER_LABEL = 'Sin proveedor';

export async function getTopSuppliers(limit = 3) {
  try {
    const allPurchases = await db.select().from(purchases);
    const totalsBySupplier = new Map<string, { purchases: number; totalSpent: number }>();

    for (const purchase of allPurchases) {
      const name = (purchase.notes?.trim() || NO_SUPPLIER_LABEL) as string;
      const amount =
        typeof purchase.totalAmount === 'string'
          ? parseFloat(purchase.totalAmount)
          : Number(purchase.totalAmount) || 0;

      const current = totalsBySupplier.get(name) ?? { purchases: 0, totalSpent: 0 };
      totalsBySupplier.set(name, {
        purchases: current.purchases + 1,
        totalSpent: current.totalSpent + amount,
      });
    }

    const sorted = [...totalsBySupplier.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    const withoutSupplier =
      sorted.find((s) => s.name === NO_SUPPLIER_LABEL) ?? null;
    const topSuppliers = sorted
      .filter((s) => s.name !== NO_SUPPLIER_LABEL)
      .slice(0, limit);

    return { success: true, data: { topSuppliers, withoutSupplier } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildPurchasesByDay(allPurchases: { purchaseDate: Date | string | null }[], days = 7) {
  const today = startOfLocalDay(new Date());
  const result: { date: string; label: string; count: number }[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);

    const count = allPurchases.filter((p) => {
      if (!p.purchaseDate) return false;
      return startOfLocalDay(new Date(p.purchaseDate)).getTime() === day.getTime();
    }).length;

    const label =
      offset === 0
        ? 'Hoy'
        : day.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

    result.push({
      date: day.toISOString().split('T')[0],
      label,
      count,
    });
  }

  return result;
}

export async function getPurchaseStats() {
  try {
    const allPurchases = await db.select().from(purchases);

    const totalAmount = allPurchases.reduce((sum, p) => {
      const amount = typeof p.totalAmount === 'string' ? parseFloat(p.totalAmount) : p.totalAmount;
      return sum + amount;
    }, 0);

    const byStatus = {
      pendiente: allPurchases.filter((p) => p.status === 'pendiente').length,
      pendiente_aprobacion: allPurchases.filter((p) => p.status === 'pendiente_aprobacion').length,
      recibida: allPurchases.filter((p) => p.status === 'recibida').length,
      parcial: allPurchases.filter((p) => p.status === 'parcial').length,
      cancelada: allPurchases.filter((p) => p.status === 'cancelada').length,
    };

    return {
      success: true,
      data: {
        totalPurchases: allPurchases.length,
        totalAmount,
        byStatus,
        purchasesByDay: buildPurchasesByDay(allPurchases),
        recentPurchases: allPurchases.slice(0, 10),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
