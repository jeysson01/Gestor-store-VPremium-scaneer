'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ScanBarcodeIcon, ShoppingCartIcon, Trash2Icon, LogOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductCombobox } from '@/components/product-combobox';
import { BarcodeScanButton } from '@/components/barcode-scanner-dialog';
import {
  scanProductByCode,
  getKioskProductById,
  getKioskProducts,
  registerKioskPurchase,
} from '@/lib/actions/kiosk';
import { logout } from '@/lib/actions/auth';
import { notifyYapePendingRefresh } from '@/components/yape-notifier';
import { formatSoles } from '@/lib/utils';
import { toast } from 'sonner';

type CartItem = {
  productId: number;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

type ProductOption = {
  id: number;
  name: string;
  code: string;
  unitPrice: number;
};

export function KioskShopping() {
  const [scanInput, setScanInput] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [catalog, setCatalog] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  useEffect(() => {
    getKioskProducts().then((result) => {
      if (result.success && result.data) {
        setCatalog(result.data);
      }
    });
  }, []);

  const addToCart = useCallback((product: {
    id: number;
    code: string;
    name: string;
    unitPrice: number;
  }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          code: product.code,
          name: product.name,
          quantity: 1,
          unitPrice: product.unitPrice,
        },
      ];
    });
    toast.success(`${product.name} agregado`);
  }, []);

  const handleScan = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setScanning(true);
    try {
      const result = await scanProductByCode(trimmed);
      if (result.success && result.data) {
        addToCart(result.data);
      } else {
        toast.error(result.error || 'Producto no encontrado');
      }
    } catch {
      toast.error('Error al escanear');
    } finally {
      setScanning(false);
      setScanInput('');
      inputRef.current?.focus();
    }
  }, [addToCart]);

  const handleSelectByName = async (productId: number) => {
    if (!productId) return;
    setScanning(true);
    try {
      const result = await getKioskProductById(productId);
      if (result.success && result.data) {
        addToCart(result.data);
        setSelectedProductId(0);
      } else {
        toast.error(result.error || 'Producto no encontrado');
      }
    } catch {
      toast.error('Error al agregar producto');
    } finally {
      setScanning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scanInput);
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleCheckout = async () => {
    if (!cart.length) {
      toast.error('Agrega productos al carrito');
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerKioskPurchase(
        cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        }))
      );
      if (result.success) {
        setCart([]);
        notifyYapePendingRefresh();
        toast.success('Compra enviada. El administrador la aprobará pronto.');
        await logout();
      } else {
        toast.error(result.error || 'Error al registrar compra');
      }
    } catch {
      toast.error('Error al registrar compra');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">Kiosko Cliente</h1>
            <p className="text-xs text-muted-foreground">Modo controlado</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => logout()}>
            <LogOutIcon className="w-4 h-4" />
            Salir
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanBarcodeIcon className="w-5 h-5" />
                  Agregar producto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="scan" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="scan">Código / QR</TabsTrigger>
                    <TabsTrigger value="name">Buscar por nombre</TabsTrigger>
                  </TabsList>

                  <TabsContent value="scan" className="space-y-3 mt-0">
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        placeholder="Escanea o escribe el código..."
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={scanning}
                        className="h-12 text-base flex-1"
                        autoFocus
                      />
                      <BarcodeScanButton
                        onScan={handleScan}
                        label="Cámara"
                        className="h-12 px-4 shrink-0"
                      />
                    </div>
                    <Button
                      className="w-full h-11"
                      onClick={() => handleScan(scanInput)}
                      disabled={scanning || !scanInput.trim()}
                    >
                      {scanning ? 'Buscando...' : 'Agregar por código'}
                    </Button>
                  </TabsContent>

                  <TabsContent value="name" className="space-y-3 mt-0">
                    <ProductCombobox
                      products={catalog}
                      value={selectedProductId}
                      onSelect={(id) => {
                        setSelectedProductId(id);
                        handleSelectByName(id);
                      }}
                      placeholder="Buscar producto por nombre..."
                      className="h-12 text-base"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Selecciona un producto de la lista para agregarlo al carrito
                    </p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCartIcon className="w-5 h-5" />
                  Carrito ({cart.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    Escanea o busca productos para agregarlos al carrito
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.productId}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.code}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(item.productId, -1)}
                          >
                            −
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(item.productId, 1)}
                          >
                            +
                          </Button>
                          <span className="w-20 text-right font-medium text-sm">
                            {formatSoles(item.quantity * item.unitPrice)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeItem(item.productId)}
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="font-bold text-lg">Total</span>
                      <span className="font-bold text-xl">{formatSoles(total)}</span>
                    </div>

                    <Button
                      className="w-full h-12 text-base"
                      onClick={handleCheckout}
                      disabled={submitting}
                    >
                      {submitting ? 'Registrando...' : 'Registrar compra'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
      </main>
    </div>
  );
}
