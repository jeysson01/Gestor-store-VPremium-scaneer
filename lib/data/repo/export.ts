import * as XLSX from 'xlsx';
import { formatPurchaseDate } from '@/lib/utils';
import { getDb } from '../client';
import { byDateDesc, errorMessage, toDetail, toProduct, toPurchase } from './mappers';
import { getAllActiveProducts, upsertProductFromImport } from './products';

/** Excel generado 100% en el dispositivo (funciona offline). */
function workbookToBase64(workbook: XLSX.WorkBook): string {
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

export async function exportProductsToExcel() {
  try {
    const result = await getAllActiveProducts();
    if (!result.success) return { success: false as const, error: result.error };
    const worksheet = XLSX.utils.json_to_sheet(
      result.data.map((p) => ({
        Código: p.code,
        Nombre: p.name,
        categoria: p.description ?? '',
        'Precio Unitario': p.unitPrice,
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
    return { success: true as const, fileName: 'productos.xlsx', data: workbookToBase64(workbook) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function exportPurchasesToExcel(statusFilter?: string | null) {
  try {
    const db = await getDb();
    let purchases = db.all('purchases').sort(byDateDesc).slice(0, 10000).map(toPurchase);
    if (statusFilter && statusFilter !== 'todos') {
      purchases = purchases.filter((p) => p.status === statusFilter);
    }
    const purchaseMap = new Map(purchases.map((p) => [p.id, p]));
    const productMap = new Map(db.all('products').map((p) => [p.id, toProduct(p)]));
    const details = db
      .all('purchase_details')
      .map(toDetail)
      .filter((d) => purchaseMap.has(d.purchaseId));
    const wsPurchases = XLSX.utils.json_to_sheet(
      purchases.map((p) => ({
        Número: p.purchaseNumber,
        Fecha: formatPurchaseDate(p.purchaseDate),
        Proveedor: p.notes?.trim() || '—',
        Total: p.totalAmount,
      }))
    );
    const wsDetails = XLSX.utils.json_to_sheet(
      details.map((d) => {
        const product = productMap.get(d.productId);
        return {
          'Número de Compra': purchaseMap.get(d.purchaseId)?.purchaseNumber ?? '',
          'Código Producto': product?.code ?? '',
          'Nombre Producto': product?.name ?? '',
          Cantidad: d.quantity,
          'Precio Unitario': d.unitPrice,
          Subtotal: d.totalPrice,
        };
      })
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, wsPurchases, 'Compras');
    XLSX.utils.book_append_sheet(workbook, wsDetails, 'Detalle compras');
    return { success: true as const, fileName: 'compras.xlsx', data: workbookToBase64(workbook) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function importProductsFromExcel(base64Data: string) {
  try {
    const workbook = XLSX.read(base64Data, { type: 'base64' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    if (!rows.length) {
      return { success: false as const, error: 'El archivo no contiene filas de productos' };
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
        if (result.updated) updated++;
        else created++;
      } else {
        errors.push(`${code}: ${result.error}`);
        skipped++;
      }
    }
    return { success: true as const, data: { created, updated, skipped, errors: errors.slice(0, 5) } };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
