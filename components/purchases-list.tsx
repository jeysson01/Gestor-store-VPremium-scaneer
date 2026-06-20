'use client';

import { useState, useEffect } from 'react';
import {
  getPurchases,
  getPurchaseById,
  deletePurchase,
} from '@/lib/actions/purchases';
import { getProducts } from '@/lib/actions/products';
import { BulkPurchaseDialog } from '@/components/bulk-purchase-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2Icon, PencilIcon, SmartphoneIcon, BanknoteIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PURCHASES_REFRESH_EVENT_NAME } from '@/components/yape-notifier';
import { toast } from 'sonner';
import { formatPurchaseDate, formatSoles } from '@/lib/utils';

const dateCellClass =
  'h-12 align-middle text-base leading-none py-0 [&>span]:flex [&>span]:items-center [&>span]:min-h-[2.75rem]';

export function PurchasesList() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const visiblePurchases = purchases.filter((p) => p.status !== 'pendiente_aprobacion');

  const loadData = async () => {
    try {
      setLoading(true);
      const [purchasesResult, productsResult] = await Promise.all([
        getPurchases(),
        getProducts(),
      ]);
      if (purchasesResult.success) setPurchases(purchasesResult.data);
      if (productsResult.success) setProducts(productsResult.data);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const onRefresh = () => loadData();
    window.addEventListener(PURCHASES_REFRESH_EVENT_NAME, onRefresh);
    return () => window.removeEventListener(PURCHASES_REFRESH_EVENT_NAME, onRefresh);
  }, []);

  const handleSelectPurchase = async (purchaseId: number) => {
    try {
      const result = await getPurchaseById(purchaseId);
      if (result.success) {
        setSelectedPurchase(result.data);
      }
    } catch {
      toast.error('Error al cargar compra');
    }
  };

  const handleEditPurchase = async (purchaseId: number) => {
    try {
      const result = await getPurchaseById(purchaseId);
      if (result.success) {
        setEditingPurchase(result.data);
        setEditDialogOpen(true);
      }
    } catch {
      toast.error('Error al cargar compra para editar');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deletePurchase(deleteTarget.id);
      if (result.success) {
        toast.success('Compra eliminada');
        if (selectedPurchase?.id === deleteTarget.id) {
          setSelectedPurchase(null);
        }
        setDeleteTarget(null);
        loadData();
      } else {
        toast.error(result.error || 'No se pudo eliminar la compra');
      }
    } catch {
      toast.error('Error al eliminar la compra');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <CardTitle>Gestión de Compras</CardTitle>
            <CardDescription>
              Órdenes de compra por mayor con varios productos y totales automáticos
            </CardDescription>
          </div>
          <BulkPurchaseDialog products={products} onSuccess={loadData} />
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2Icon className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Acciones</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead className="w-[120px]">Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Yape</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 sm:h-8 gap-1 px-1.5 sm:px-2 text-xs"
                          onClick={() => handleEditPurchase(purchase.id)}
                          aria-label="Editar compra"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 sm:h-8 gap-1 px-1.5 sm:px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(purchase)}
                          aria-label="Eliminar compra"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Eliminar</span>
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{purchase.purchaseNumber}</TableCell>
                    <TableCell className={dateCellClass}>
                      <span>{formatPurchaseDate(purchase.purchaseDate)}</span>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {purchase.notes || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatSoles(purchase.totalAmount || 0)}
                    </TableCell>
                    <TableCell>
                      {purchase.yapeReceivedAt ? (
                        <Badge
                          className={
                            purchase.paymentMethod === 'efectivo'
                              ? 'bg-emerald-600 hover:bg-emerald-600 gap-1'
                              : 'bg-[#742384] hover:bg-[#742384] gap-1'
                          }
                        >
                          {purchase.paymentMethod === 'efectivo' ? (
                            <BanknoteIcon className="h-3 w-3" />
                          ) : (
                            <SmartphoneIcon className="h-3 w-3" />
                          )}
                          {purchase.paymentMethod === 'efectivo' ? 'Efectivo' : 'Yape'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendiente</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectPurchase(purchase.id)}
                      >
                        Ver detalles
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {visiblePurchases.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No hay compras registradas. Usa &quot;Compra por mayor&quot; para crear la
                primera.
              </div>
            )}
          </div>
        )}

        {selectedPurchase && (
          <div className="mt-8 p-4 border rounded-lg bg-muted/30">
            <h3 className="font-bold mb-4">
              Detalles de compra: {selectedPurchase.purchaseNumber}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Fecha</p>
                <p className="font-medium text-base">
                  {formatPurchaseDate(selectedPurchase.purchaseDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proveedor</p>
                <p className="font-medium text-base">
                  {selectedPurchase.notes || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Productos</p>
                <p className="font-medium text-base">
                  {selectedPurchase.details?.length ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unidades</p>
                <p className="font-medium text-base">
                  {selectedPurchase.details?.reduce(
                    (sum: number, d: any) => sum + (d.quantity || 0),
                    0
                  ) ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-bold text-lg">
                  {formatSoles(selectedPurchase.totalAmount || 0)}
                </p>
              </div>
            </div>

            {selectedPurchase.details && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Precio unitario</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPurchase.details.map((detail: any) => (
                      <TableRow key={detail.id}>
                        <TableCell>{detail.product?.name}</TableCell>
                        <TableCell className="text-right">{detail.quantity}</TableCell>
                        <TableCell>{selectedPurchase.notes || '—'}</TableCell>
                        <TableCell className="text-right">
                          {formatSoles(detail.unitPrice || 0)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatSoles(detail.totalPrice || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <BulkPurchaseDialog
        products={products}
        onSuccess={() => {
          setEditDialogOpen(false);
          setEditingPurchase(null);
          loadData();
        }}
        purchaseToEdit={editingPurchase}
        dialogOpen={editDialogOpen}
        onDialogOpenChange={(next) => {
          setEditDialogOpen(next);
          if (!next) setEditingPurchase(null);
        }}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la compra {deleteTarget?.purchaseNumber} y todos sus
              productos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
