'use client';

import { useState, useEffect } from 'react';
import { getProducts, createProduct, updateProduct, deleteProduct } from '@/lib/actions/products';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateProductSchema, UpdateProductSchema } from '@/lib/validations';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2Icon, TrashIcon, PlusIcon, PencilIcon } from 'lucide-react';
import { BarcodeScanButton } from '@/components/barcode-scanner-dialog';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatSoles } from '@/lib/utils';

const ProductFormSchema = CreateProductSchema;
type ProductFormValues = z.infer<typeof ProductFormSchema>;

const defaultFormValues: ProductFormValues = {
  code: '',
  name: '',
  description: '',
  unitPrice: 0,
  currentStock: 0,
  minimumStock: 0,
  maximumStock: 999999,
  unit: 'unidad',
};

function ProductFormFields({ form }: { form: ReturnType<typeof useForm<ProductFormValues>> }) {
  return (
    <>
      <FormField
        control={form.control}
        name="code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Código-QR</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input placeholder="P-001 o escanea QR" {...field} className="flex-1" />
              </FormControl>
              <BarcodeScanButton
                onScan={(code) => form.setValue('code', code, { shouldValidate: true })}
                label="Cámara"
                className="h-10 px-3 shrink-0"
              />
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre</FormLabel>
            <FormControl>
              <Input placeholder="Nombre del producto" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Categoría de compras</FormLabel>
            <FormControl>
              <Input placeholder="Ej: Bebidas, Snacks, Limpieza..." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="unitPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Precio unitario</FormLabel>
            <FormControl>
              <Input
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={field.value}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

    </>
  );
}

export function ProductsList() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const createForm = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: defaultFormValues,
  });

  const editForm = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: defaultFormValues,
  });

  const loadProducts = async () => {
    try {
      setLoading(true);
      const result = await getProducts(search);
      if (result.success) {
        setProducts(result.data);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const onCreate = async (data: ProductFormValues) => {
    try {
      const result = await createProduct(data);
      if (result.success) {
        toast.success('Producto creado exitosamente');
        setCreateOpen(false);
        createForm.reset(defaultFormValues);
        loadProducts();
      } else {
        toast.error(result.error || 'Error al crear producto');
      }
    } catch {
      toast.error('Error al crear producto');
    }
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    editForm.reset({
      code: product.code,
      name: product.name,
      description: product.description || '',
      unitPrice: parseFloat(product.unitPrice || 0),
      currentStock: product.currentStock ?? 0,
      minimumStock: product.minimumStock ?? 0,
      maximumStock: product.maximumStock ?? 999999,
      unit: product.unit || 'unidad',
    });
    setEditOpen(true);
  };

  const onEdit = async (data: ProductFormValues) => {
    if (!editingProduct) return;
    try {
      const validated = UpdateProductSchema.parse(data);
      const result = await updateProduct(editingProduct.id, validated);
      if (result.success) {
        toast.success('Producto actualizado');
        setEditOpen(false);
        setEditingProduct(null);
        loadProducts();
      } else {
        toast.error(result.error || 'Error al actualizar producto');
      }
    } catch {
      toast.error('Error al actualizar producto');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;
    try {
      const result = await deleteProduct(id);
      if (result.success) {
        toast.success('Producto eliminado');
        loadProducts();
      } else {
        toast.error('Error al eliminar producto');
      }
    } catch {
      toast.error('Error al eliminar producto');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Gestión de Productos</CardTitle>
            <CardDescription>Listado completo de productos en inventario</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <PlusIcon className="w-4 h-4" />
                Nuevo Producto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Producto</DialogTitle>
                <DialogDescription>Ingresa los detalles del nuevo producto</DialogDescription>
              </DialogHeader>

              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                  <ProductFormFields form={createForm} />
                  <Button type="submit" className="w-full">
                    Crear Producto
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Buscar por código o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2Icon className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código-QR</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio unitario</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.code}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatSoles(product.unitPrice || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(product)}
                          title="Editar producto"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                          title="Eliminar producto"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {products.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No hay productos registrados
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
            <DialogDescription>Modifica los datos del producto</DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <ProductFormFields form={editForm} />
              <Button type="submit" className="w-full">
                Guardar cambios
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
