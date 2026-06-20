'use client';

import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import {
  exportProductsToExcel,
  exportPurchasesToExcel,
  importProductsFromExcel,
} from '@/lib/actions/export';
import { downloadExcelFromBase64, fileToBase64 } from '@/lib/download-excel';

export function ReportsPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloadingProducts, setDownloadingProducts] = useState(false);
  const [downloadingPurchases, setDownloadingPurchases] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExportProducts = async () => {
    setDownloadingProducts(true);
    try {
      const result = await exportProductsToExcel();
      if (result.success && result.data) {
        downloadExcelFromBase64(result.data, result.fileName ?? 'productos.xlsx');
        toast.success('Productos exportados correctamente');
      } else {
        toast.error(result.error || 'Error al exportar productos');
      }
    } catch {
      toast.error('Error al exportar productos');
    } finally {
      setDownloadingProducts(false);
    }
  };

  const handleExportPurchases = async () => {
    setDownloadingPurchases(true);
    try {
      const result = await exportPurchasesToExcel();
      if (result.success && result.data) {
        downloadExcelFromBase64(result.data, result.fileName ?? 'compras.xlsx');
        toast.success('Compras exportadas correctamente');
      } else {
        toast.error(result.error || 'Error al exportar compras');
      }
    } catch {
      toast.error('Error al exportar compras');
    } finally {
      setDownloadingPurchases(false);
    }
  };

  const handleImportProducts = async (file: File) => {
    setImporting(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await importProductsFromExcel(base64);
      if (result.success && result.data) {
        const { created, updated, skipped, errors } = result.data;
        const parts = [`${created} creados`];
        if (updated) parts.push(`${updated} actualizados`);
        if (skipped) parts.push(`${skipped} omitidos`);
        toast.success(`Importación: ${parts.join(', ')}`);
        if (errors?.length) {
          toast.message('Algunos registros no se importaron', {
            description: errors.join('; '),
          });
        }
      } else {
        toast.error(result.error || 'Error al importar productos');
      }
    } catch {
      toast.error('Error al leer el archivo Excel');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Reporte de Productos</CardTitle>
          <CardDescription>Exporta el listado completo de productos a Excel</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="gap-2 w-full"
            onClick={handleExportProducts}
            disabled={downloadingProducts}
          >
            {downloadingProducts ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Descargar Productos
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reporte de Compras</CardTitle>
          <CardDescription>
            Exporta el historial de compras y su detalle a Excel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="gap-2 w-full"
            onClick={handleExportPurchases}
            disabled={downloadingPurchases}
          >
            {downloadingPurchases ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Descargar Compras
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Importar Productos</CardTitle>
          <CardDescription>
            Carga productos desde un archivo Excel (.xlsx). Usa las columnas: Código,
            Nombre, categoria, Precio Unitario (como en la exportación).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportProducts(file);
            }}
          />
          <Button
            variant="outline"
            className="gap-2 flex-1"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Seleccionar archivo Excel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
