'use server';

import { db } from '@/lib/db';
import { products, purchases, purchaseDetails } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { getAllActiveProducts, upsertProductFromImport } from '@/lib/actions/products';
import { formatPurchaseDate } from '@/lib/utils';

function workbookToBase64(workbook: XLSX.WorkBook): string {
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

export async function exportProductsToExcel() {
  try {
    const result = await getAllActiveProducts();
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'No se pudieron cargar los productos' };
    }

    const productsData = result.data;

    const worksheet = XLSX.utils.json_to_sheet(
      productsData.map((p) => ({
        Código: p.code,
        Nombre: p.name,
        categoria: p.description ?? '',
        'Precio Unitario': p.unitPrice,
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');

    return {
      success: true,
      fileName: 'productos.xlsx',
      data: workbookToBase64(workbook),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function exportPurchasesToExcel(statusFilter?: string | null) {
  try {
    let purchasesData = await db
      .select()
      .from(purchases)
      .orderBy(desc(purchases.createdAt))
      .limit(10000);

    if (statusFilter && statusFilter !== 'todos') {
      purchasesData = purchasesData.filter((p) => p.status === statusFilter);
    }

    const allDetails = await db.select().from(purchaseDetails).limit(50000);
    const activeProductsResult = await getAllActiveProducts();
    const allProducts = activeProductsResult.data ?? [];
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const worksheetPurchases = XLSX.utils.json_to_sheet(
      purchasesData.map((p) => ({
        Número: p.purchaseNumber,
        Fecha: formatPurchaseDate(p.purchaseDate),
        Proveedor: p.notes?.trim() || '—',
        Total: p.totalAmount,
      }))
    );

    const worksheetDetails = XLSX.utils.json_to_sheet(
      allDetails.map((d) => {
        const product = productMap.get(d.productId);
        const purchase = purchasesData.find((p) => p.id === d.purchaseId);
        return {
          'Número de Compra': purchase?.purchaseNumber ?? '',
          'Código Producto': product?.code ?? '',
          'Nombre Producto': product?.name ?? '',
          Cantidad: d.quantity,
          'Precio Unitario': d.unitPrice,
          Subtotal: d.totalPrice,
        };
      })
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheetPurchases, 'Compras');
    XLSX.utils.book_append_sheet(workbook, worksheetDetails, 'Detalle compras');

    return {
      success: true,
      fileName: 'compras.xlsx',
      data: workbookToBase64(workbook),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function exportDetailedPurchaseToExcel(purchaseId: number) {
  try {
    const purchase = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, purchaseId))
      .limit(1);

    if (!purchase.length) {
      return { success: false, error: 'Compra no encontrada' };
    }

    const details = await db
      .select()
      .from(purchaseDetails)
      .where(eq(purchaseDetails.purchaseId, purchaseId));

    const detailsWithProducts = await Promise.all(
      details.map(async (detail) => {
        const product = await db
          .select()
          .from(products)
          .where(eq(products.id, detail.productId))
          .limit(1);

        return {
          'Código Producto': product[0]?.code,
          'Nombre Producto': product[0]?.name,
          Cantidad: detail.quantity,
          'Precio Unitario': detail.unitPrice,
          Total: detail.totalPrice,
          'Cantidad Recibida': detail.receivedQuantity,
        };
      })
    );

    const worksheet = XLSX.utils.json_to_sheet(detailsWithProducts);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Compra ${purchase[0].purchaseNumber}`);

    return {
      success: true,
      fileName: `compra_${purchase[0].purchaseNumber}.xlsx`,
      data: workbookToBase64(workbook),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function importProductsFromExcel(base64Data: string) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (!rows.length) {
      return { success: false, error: 'El archivo no contiene filas de productos' };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const code = String(row['Código'] ?? row['Codigo'] ?? row['code'] ?? '').trim();
      const name = String(row['Nombre'] ?? row['name'] ?? '').trim();
      const unitPrice = parseFloat(
        String(row['Precio Unitario'] ?? row['unitPrice'] ?? row['Precio'] ?? '0')
      );

      if (!code || !name) {
        skipped++;
        continue;
      }

      const result = await upsertProductFromImport({
        code,
        name,
        description: String(
          row['categoria'] ??
            row['Categoría'] ??
            row['Categoria'] ??
            row['Categoría de compras'] ??
            row['Categoria de compras'] ??
            row['Descripción'] ??
            row['Descripcion'] ??
            row['description'] ??
            ''
        ),
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      });

      if (result.success) {
        if ((result as { updated?: boolean }).updated) {
          updated++;
        } else {
          created++;
        }
      } else {
        errors.push(`${code}: ${result.error}`);
        skipped++;
      }
    }

    return {
      success: true,
      data: { created, updated, skipped, errors: errors.slice(0, 5) },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
