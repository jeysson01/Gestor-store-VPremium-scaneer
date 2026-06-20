'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createPurchase, updatePurchase } from '@/lib/actions/purchases';
import { getProducts } from '@/lib/actions/products';
import { ProductCombobox } from '@/components/product-combobox';
import { QuantityStepper } from '@/components/quantity-stepper';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { PlusIcon, Trash2Icon, ShoppingCartIcon, ScanBarcodeIcon } from 'lucide-react';
import { BarcodeScanButton } from '@/components/barcode-scanner-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { notifyYapePendingRefresh } from '@/components/yape-notifier';
import { cn, formatSoles } from '@/lib/utils';

type PurchaseLine = {
  productId: number;
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
};

const HeaderSchema = z.object({
  purchaseNumber: z.string().min(1, 'El número de compra es requerido'),
  purchaseDate: z
    .string()
    .min(1, 'La fecha y hora son requeridas')
    .refine((val) => {
      const d = new Date(val);
      return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now();
    }, 'La fecha y hora no pueden ser futuras'),
  notes: z.string().optional(),
});

type HeaderValues = z.infer<typeof HeaderSchema>;

const dateInputClass =
  'h-8 text-xs sm:h-10 sm:text-base [&::-webkit-datetime-edit]:text-xs sm:[&::-webkit-datetime-edit]:text-base [&::-webkit-datetime-edit-fields-wrapper]:p-0 [&::-webkit-calendar-picker-indicator]:opacity-80';

const fieldBlockClass = 'w-full';
const softInputClass =
  'h-8 text-xs sm:h-9 sm:text-sm border-border/40 bg-background shadow-none focus-visible:ring-1 focus-visible:ring-border/60';
const addProductGridBorder = 'border-border/35';

const mobileDialogClass =
  '!flex !flex-col fixed inset-0 top-0 left-0 z-50 h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:inset-auto sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:p-6 sm:gap-4';

function newPurchaseNumber() {
  return `CP-${Date.now()}`;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function maxDatetimeLocal(): string {
  return toDatetimeLocalValue(new Date());
}

function parsePositiveInt(value: string): number | null {
  if (value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

type BulkPurchaseDialogProps = {
  products: any[];
  onSuccess: () => void;
  purchaseToEdit?: any | null;
  dialogOpen?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
};

export function BulkPurchaseDialog({
  products,
  onSuccess,
  purchaseToEdit = null,
  dialogOpen: controlledOpen,
  onDialogOpenChange,
}: BulkPurchaseDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onDialogOpenChange ?? setInternalOpen;

  const isEditing = Boolean(purchaseToEdit?.id);
  const [catalog, setCatalog] = useState<any[]>(products);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [draftProductId, setDraftProductId] = useState(0);
  const [draftQuantityStr, setDraftQuantityStr] = useState('1');
  const [draftUnitPrice, setDraftUnitPrice] = useState(0);
  const [scanCode, setScanCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const headerForm = useForm<HeaderValues>({
    resolver: zodResolver(HeaderSchema),
    defaultValues: {
      purchaseNumber: newPurchaseNumber(),
      purchaseDate: toDatetimeLocalValue(new Date()),
      notes: '',
    },
  });

  const totals = useMemo(() => {
    const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
    const grandTotal = lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0
    );
    return {
      lineCount: lines.length,
      totalUnits,
      grandTotal,
    };
  }, [lines]);

  const resetDialog = () => {
    setLines([]);
    setDraftProductId(0);
    setDraftQuantityStr('1');
    setDraftUnitPrice(0);
    setScanCode('');
    headerForm.reset({
      purchaseNumber: newPurchaseNumber(),
      purchaseDate: toDatetimeLocalValue(new Date()),
      notes: '',
    });
  };

  const loadPurchaseForEdit = (purchase: any) => {
    const dateStr = purchase.purchaseDate
      ? toDatetimeLocalValue(new Date(purchase.purchaseDate))
      : toDatetimeLocalValue(new Date());

    headerForm.reset({
      purchaseNumber: purchase.purchaseNumber,
      purchaseDate: dateStr,
      notes: purchase.notes ?? '',
    });

    setLines(
      (purchase.details ?? []).map((d: any) => ({
        productId: d.productId,
        productName: d.product?.name ?? '',
        productCode: d.product?.code ?? '',
        quantity: d.quantity,
        unitPrice: parseFloat(String(d.unitPrice)) || 0,
      }))
    );
    setDraftProductId(0);
    setDraftQuantityStr('1');
    setDraftUnitPrice(0);
  };

  useEffect(() => {
    setCatalog(products);
  }, [products]);

  useEffect(() => {
    if (open && purchaseToEdit) {
      loadPurchaseForEdit(purchaseToEdit);
    }
  }, [open, purchaseToEdit]);

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next) {
      const result = await getProducts();
      if (result.success) setCatalog(result.data);
      if (purchaseToEdit) {
        loadPurchaseForEdit(purchaseToEdit);
      } else {
        resetDialog();
      }
    } else if (!purchaseToEdit) {
      resetDialog();
    }
  };

  const addLineToList = () => {
    const draftQuantity = parsePositiveInt(draftQuantityStr);
    if (!draftProductId) {
      toast.error('Selecciona un producto');
      return;
    }
    if (draftQuantity === null) {
      toast.error('Ingresa una cantidad válida (mínimo 1)');
      return;
    }
    if (draftUnitPrice < 0) {
      toast.error('El precio no puede ser negativo');
      return;
    }

    const product = catalog.find((p) => p.id === draftProductId);
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }

    const existingIndex = lines.findIndex((l) => l.productId === draftProductId);
    if (existingIndex >= 0) {
      setLines((prev) =>
        prev.map((line, i) =>
          i === existingIndex
            ? {
                ...line,
                quantity: line.quantity + draftQuantity,
                unitPrice: draftUnitPrice,
              }
            : line
        )
      );
      toast.success('Cantidad sumada al producto ya en la lista');
    } else {
      setLines((prev) => [
        ...prev,
        {
          productId: draftProductId,
          productName: product.name,
          productCode: product.code,
          quantity: draftQuantity,
          unitPrice: draftUnitPrice,
        },
      ]);
      toast.success('Producto agregado a la compra');
    }

    setDraftProductId(0);
    setDraftQuantityStr('1');
    setDraftUnitPrice(0);
    setScanCode('');
  };

  const selectProductByCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const product = catalog.find(
      (p) => p.code.toLowerCase() === trimmed.toLowerCase()
    );
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }
    setDraftProductId(product.id);
    setDraftUnitPrice(parseFloat(String(product.unitPrice)) || 0);
    toast.success(`${product.name} seleccionado`);
  };

  const handleScanAndAdd = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const product = catalog.find(
      (p) => p.code.toLowerCase() === trimmed.toLowerCase()
    );
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }
    const qty = parsePositiveInt(draftQuantityStr) ?? 1;
    const price = parseFloat(String(product.unitPrice)) || 0;
    const existingIndex = lines.findIndex((l) => l.productId === product.id);
    if (existingIndex >= 0) {
      setLines((prev) =>
        prev.map((line, i) =>
          i === existingIndex ? { ...line, quantity: line.quantity + qty } : line
        )
      );
      toast.success('Cantidad sumada');
    } else {
      setLines((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          quantity: qty,
          unitPrice: price,
        },
      ]);
      toast.success(`${product.name} agregado`);
    }
    setScanCode('');
  };

  const removeLine = (productId: number) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const updateLineQuantity = (productId: number, value: string) => {
    const quantity = parsePositiveInt(value);
    if (quantity === null && value !== '') return;
    if (quantity === null) {
      setLines((prev) =>
        prev.map((l) => (l.productId === productId ? { ...l, quantity: 1 } : l))
      );
      return;
    }
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity } : l))
    );
  };

  const updateLinePrice = (productId: number, unitPrice: number) => {
    if (unitPrice < 0) return;
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, unitPrice } : l))
    );
  };

  const onSubmit = async (header: HeaderValues) => {
    if (lines.length === 0) {
      toast.error('Agrega al menos un producto a la compra por mayor');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        purchaseNumber: header.purchaseNumber,
        purchaseDate: new Date(header.purchaseDate),
        status: isEditing ? (purchaseToEdit?.status ?? 'pendiente') : 'pendiente',
        notes: header.notes?.trim() || undefined,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      };

      const result = isEditing
        ? await updatePurchase(purchaseToEdit.id, payload)
        : await createPurchase(payload);

      if (result.success) {
        toast.success(
          isEditing
            ? `Compra actualizada: ${formatSoles(totals.grandTotal)}`
            : `Compra registrada: ${lines.length} productos, total ${formatSoles(totals.grandTotal)}`
        );
        notifyYapePendingRefresh();
        setOpen(false);
        if (!isEditing) resetDialog();
        onSuccess();
      } else {
        toast.error(result.error || 'Error al guardar la compra');
      }
    } catch {
      toast.error('Error al guardar la compra');
    } finally {
      setSubmitting(false);
    }
  };

  const dialogBody = (
    <DialogContent className={mobileDialogClass}>
      <DialogHeader className="shrink-0 border-b border-border/40 px-3 py-3 pr-10 sm:border-0 sm:px-0 sm:py-0 sm:pr-0">
        <DialogTitle className="text-sm sm:text-lg leading-snug text-left">
          {isEditing ? 'Editar compra por mayor' : 'Compra por mayor'}
        </DialogTitle>
      </DialogHeader>

      <Form {...headerForm}>
        <form
          onSubmit={headerForm.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-0 sm:py-0 space-y-3 sm:space-y-5 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 sm:max-w-xl">
            <FormField
              control={headerForm.control}
              name="purchaseNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm">Número de compra</FormLabel>
                  <FormControl>
                    <Input className="h-8 text-xs sm:h-10 sm:text-sm" {...field} readOnly={isEditing} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={headerForm.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm">Fecha y hora</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className={dateInputClass}
                      max={maxDatetimeLocal()}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Card className="border-border/40 shadow-none">
            <CardContent className="pt-3 sm:pt-4 space-y-2 sm:space-y-3 p-3 sm:p-6">
              <p className="text-xs sm:text-sm font-medium">Agregar producto a la lista</p>
              <div
                className={cn(
                  'rounded-lg border overflow-hidden bg-background',
                  addProductGridBorder
                )}
              >
                <FormField
                  control={headerForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem
                      className={cn(
                        'px-3 py-2.5 border-b space-y-1.5',
                        addProductGridBorder
                      )}
                    >
                      <FormLabel className="text-xs text-muted-foreground">Proveedor</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nombre..."
                          className={softInputClass}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-[minmax(0,1fr)_72px_76px] sm:grid-cols-[minmax(0,1fr)_120px_120px] items-stretch">
                  <div
                    className={cn(
                      'flex flex-col gap-2 px-3 py-2.5 sm:border-r',
                      addProductGridBorder
                    )}
                  >
                    <Tabs defaultValue="name" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-8 mb-2">
                        <TabsTrigger value="name" className="text-[10px] sm:text-xs">
                          Por nombre
                        </TabsTrigger>
                        <TabsTrigger value="scan" className="text-[10px] sm:text-xs">
                          Código / QR
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="name" className="mt-0 space-y-2">
                        <FormLabel className="text-xs text-muted-foreground mb-1 block">
                          Producto
                        </FormLabel>
                        <ProductCombobox
                          products={catalog}
                          value={draftProductId}
                          className={cn('h-9', softInputClass)}
                          onSelect={(productId, unitPrice) => {
                            setDraftProductId(productId);
                            setDraftUnitPrice(unitPrice);
                          }}
                        />
                      </TabsContent>
                      <TabsContent value="scan" className="mt-0 space-y-2">
                        <FormLabel className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                          <ScanBarcodeIcon className="w-3 h-3" />
                          Escanear código
                        </FormLabel>
                        <div className="flex gap-1.5">
                          <Input
                            placeholder="Código QR..."
                            className={cn(softInputClass, 'flex-1')}
                            value={scanCode}
                            onChange={(e) => setScanCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleScanAndAdd(scanCode);
                              }
                            }}
                          />
                          <BarcodeScanButton
                            onScan={handleScanAndAdd}
                            label=""
                            size="icon"
                            className="h-9 w-9 shrink-0"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={() => selectProductByCode(scanCode)}
                          disabled={!scanCode.trim()}
                        >
                          Seleccionar producto
                        </Button>
                      </TabsContent>
                    </Tabs>
                    <Button
                      type="button"
                      className="gap-1 h-7 sm:h-9 w-fit px-3 text-xs sm:text-sm font-bold"
                      onClick={addLineToList}
                    >
                      <PlusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Añadir
                    </Button>
                  </div>

                  <div
                    className={cn(
                      'px-3 py-2.5 sm:border-r flex items-start',
                      addProductGridBorder
                    )}
                  >
                    <QuantityStepper
                      value={draftQuantityStr}
                      onChange={setDraftQuantityStr}
                      blockClassName={fieldBlockClass}
                      borderClassName={addProductGridBorder}
                      compact
                      labelClassName="text-[10px] sm:text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-2 px-3 py-2.5">
                    <div>
                      <FormLabel className="text-xs text-muted-foreground mb-1 block">
                        Precio unit.
                      </FormLabel>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className={softInputClass}
                        value={draftUnitPrice}
                        onChange={(e) =>
                          setDraftUnitPrice(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div>
                      <FormLabel className="text-xs text-muted-foreground mb-1 block">
                        Subtotal
                      </FormLabel>
                      <div
                        className={cn(
                          'h-9 flex items-center justify-center px-2 rounded-md border text-sm font-medium bg-muted/30',
                          addProductGridBorder
                        )}
                      >
                        {formatSoles(
                          (parsePositiveInt(draftQuantityStr) ?? 0) * draftUnitPrice
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2 gap-2">
              <p className="text-xs sm:text-sm font-medium truncate">
                Productos en esta compra ({lines.length})
              </p>
              {lines.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 text-[10px] sm:text-xs shrink-0 px-2"
                  onClick={() => setLines([])}
                >
                  Vaciar lista
                </Button>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed py-6 sm:py-10 text-center text-muted-foreground text-[11px] sm:text-sm px-2">
                Aún no hay productos. Agrega al menos uno para registrar la compra por
                mayor.
              </div>
            ) : (
              <>
              <div className="sm:hidden space-y-2 max-h-[200px] overflow-y-auto">
                {lines.map((line) => {
                  const subtotal = line.quantity * line.unitPrice;
                  return (
                    <div
                      key={line.productId}
                      className="rounded-md border border-border/40 p-2 space-y-1.5 text-[11px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{line.productName}</p>
                          <p className="text-muted-foreground font-mono">{line.productCode}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => removeLine(line.productId)}
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">Cant.</p>
                          <Input
                            type="text"
                            inputMode="numeric"
                            className="h-7 text-xs text-center px-1"
                            value={String(line.quantity)}
                            onChange={(e) =>
                              updateLineQuantity(
                                line.productId,
                                e.target.value.replace(/\D/g, '')
                              )
                            }
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">P. unit.</p>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-7 text-xs text-center px-1"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLinePrice(
                                line.productId,
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">Subtotal</p>
                          <div className="h-7 flex items-center justify-center font-semibold text-[11px]">
                            {formatSoles(subtotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden sm:block rounded-lg border overflow-x-auto max-h-[280px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right w-24">Cant.</TableHead>
                      <TableHead className="text-right w-28">P. unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const subtotal = line.quantity * line.unitPrice;
                      return (
                        <TableRow key={line.productId}>
                          <TableCell className="text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {line.productCode}
                          </TableCell>
                          <TableCell className="font-medium">{line.productName}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="h-8 text-right ml-auto w-20"
                              value={String(line.quantity)}
                              onChange={(e) =>
                                updateLineQuantity(
                                  line.productId,
                                  e.target.value.replace(/\D/g, '')
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 text-right ml-auto w-24"
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLinePrice(
                                  line.productId,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatSoles(subtotal)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeLine(line.productId)}
                            >
                              <Trash2Icon className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </div>

          <Card className="bg-muted/30 border-border/40">
            <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 p-3 sm:p-6">
              <p className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3">
                Resumen total de la compra
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-xs">Productos</p>
                  <p className="text-sm sm:text-lg font-bold">{totals.lineCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-xs">Unidades</p>
                  <p className="text-sm sm:text-lg font-bold">{totals.totalUnits}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-xs">Monto total</p>
                  <p className="text-sm sm:text-2xl font-bold text-primary">
                    {formatSoles(totals.grandTotal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-background px-3 py-2.5 sm:border-0 sm:px-0 sm:py-0 sm:pt-2">
          <Button
            type="submit"
            className="w-full h-9 text-xs sm:h-10 sm:text-sm"
            disabled={submitting || lines.length === 0}
          >
            {submitting
              ? 'Guardando...'
              : isEditing
                ? `Actualizar (${formatSoles(totals.grandTotal)})`
                : `Guardar compra (${formatSoles(totals.grandTotal)})`}
          </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );

  if (controlledOpen !== undefined) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {dialogBody}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <ShoppingCartIcon className="w-4 h-4" />
          Compra por mayor
        </Button>
      </DialogTrigger>
      {dialogBody}
    </Dialog>
  );
}
