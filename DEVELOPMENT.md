# Notas de Desarrollo

## Sistema de Gestión de Inventario y Compras

Documentación técnica interna para desarrolladores.

## 🏗️ Arquitectura

### Stack Tecnológico

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4.2, Shadcn/UI
- **Base de Datos**: Neon PostgreSQL + Drizzle ORM
- **Validación**: Zod
- **Formularios**: React Hook Form
- **Gráficos**: Recharts
- **Exportación**: XLSX
- **Autenticación**: Better Auth (prep)
- **Deployment**: Vercel

### Patrones de Arquitectura

1. **Server Actions**: Todas las operaciones de BD se hacen vía Server Actions (`'use server'`)
2. **Type Safety**: TypeScript strict + Zod para validación de runtime
3. **Revalidación**: Uso de `revalidateTag()` para invalidar caché después de mutaciones
4. **Componentes**: Splits en Client Components (`'use client'`) para interactividad

## 📊 Modelo de Datos

### Relaciones principales

```
Users
├── Products (1:N)
├── Purchases (1:N)
└── StockMovements (1:N)

Products
├── Category (N:1)
├── PurchaseDetails (1:N)
└── StockMovements (1:N)

Purchases
└── PurchaseDetails (1:N)
    └── Products (N:1)
```

### Campos importantes

- `products.currentStock`: Actualizado por stock movements
- `purchases.status`: pendiente, recibida, parcial, cancelada
- `purchase_details.receivedQuantity`: Para rastrear recepciones parciales
- `stock_movements.type`: entrada, salida, ajuste, devolucion

## 🔄 Flujos de Datos

### Crear Compra

1. Usuario llenar formulario → validación Zod
2. `createPurchase()` crea compra + detalles
3. `revalidateTag('purchases')` invalida caché
4. UI actualiza (lista y stats)

### Recibir Compra

1. Usuario especifica cantidades recibidas
2. `receivePurchaseItems()` actualiza:
   - `purchase_details.receivedQuantity`
   - `products.currentStock` (suma en BD)
   - Crea `stock_movements` (entrada)
   - Actualiza `purchases.status`
3. Caché invalida, UI actualiza

### Buscar Productos

1. Input debounced (300ms)
2. `getProducts(search)` filtra por nombre
3. Limit 50 resultados
4. No cachea (búsqueda dinámica)

## 🛡️ Seguridad

### Validación

```typescript
// Validación de entrada con Zod
const CreateProductSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().min(0),
  // ... más campos
});

// En server action
const validated = CreateProductSchema.parse(data);
```

### Parametrización de Queries

```typescript
// ✅ Seguro (Drizzle maneja)
where(eq(products.id, id))

// ❌ Evitar (SQL injection)
// `.where("id = " + id)`
```

### User Scoping (para futuros features)

Cuando se implemente auth con usuarios:

```typescript
// Siempre filtrar por usuario actual
.where(eq(products.userId, currentUserId))
```

## 📈 Performance

### Optimizaciones implementadas

1. **Static Generation**: Dashboard/Productos/Compras son estáticas por defecto
2. **ISR**: Revalidación cada minuto (`revalidatePath`, `revalidateTag`)
3. **Debounce**: Búsqueda con timeout 300ms
4. **Índices BD**: 
   - `products.code` (búsqueda)
   - `purchases.purchaseNumber` (búsqueda)
   - `purchases.status` (filtros)
   - `stock_movements.type` (reportes)

### Mejoras futuras

- Implementar cacheamiento con Redis (Upstash)
- Pagination en tablas grandes (1000+)
- Lazy loading de gráficos
- Compresión de imágenes
- Service Workers para offline mode

## 🧪 Testing (TO DO)

Estructura recomendada:

```
__tests__/
├── unit/
│   ├── validations.test.ts
│   └── utils.test.ts
├── integration/
│   ├── products.test.ts
│   └── purchases.test.ts
└── e2e/
    └── workflows.test.ts
```

## 📝 Convenciones de Código

### Naming

- **Archivos**: kebab-case (`product-list.tsx`)
- **Componentes**: PascalCase (`ProductList`)
- **Variables**: camelCase (`isLoading`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_UPLOAD_SIZE`)

### Server Actions

```typescript
'use server';

export async function actionName(data: InputType) {
  try {
    // Validación
    const validated = Schema.parse(data);
    
    // Lógica
    const result = await db.insert(...);
    
    // Invalidar caché
    revalidateTag('cache-key');
    
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
```

### Componentes Client

```typescript
'use client';

import { useState, useEffect } from 'react';

export function MyComponent() {
  const [state, setState] = useState<Type>();
  
  useEffect(() => {
    // Data fetching aquí si es necesario
  }, []);
  
  return <div>...</div>;
}
```

## 🐛 Debugging

### Console Logs

Usar patrón `[v0]` para debugging:

```typescript
console.log('[v0] User created:', user);
console.error('[v0] Database error:', error);
```

### Environment Debugging

```bash
# Ver environment vars
vercel env list

# Pull env local
vercel env pull

# Test DB connection
psql $DATABASE_URL -c "SELECT version();"
```

### Errores Comunes

| Problema | Solución |
|----------|----------|
| `DATABASE_URL not set` | Verificar `.env.local` o Vercel settings |
| `migration failed` | Ejecutar `pnpm tsx lib/db/migrate.ts` |
| `Type error in component` | Verificar tipos de props y Server Action |
| `Stale data` | Llamar `revalidateTag()` después de mutación |

## 🚀 Próximas Mejoras

### Corto plazo
- [ ] Autenticación con Better Auth
- [ ] Permisos de usuario (admin, viewer, editor)
- [ ] Notificaciones por email
- [ ] Undo/Redo para acciones

### Mediano plazo
- [ ] Dashboard de proveedor
- [ ] Predicción de demanda (ML)
- [ ] Integración con APIs de proveedores
- [ ] App móvil (React Native)

### Largo plazo
- [ ] Multi-tenancy (múltiples negocios)
- [ ] BI avanzado (Power BI integration)
- [ ] Blockchain para auditoría
- [ ] IoT para conteo automático

## 📚 Referencias Útiles

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Next.js 16 Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Zod Validation](https://zod.dev)
- [React Hook Form](https://react-hook-form.com)

## 💬 Preguntas Frecuentes

**Q: ¿Por qué no usas Redux?**
A: Server Actions + revalidateTag es suficiente para este caso. No hay estado complejo en cliente.

**Q: ¿Qué pasa si falla una migración?**
A: La BD queda en estado parcial. Revierte manualmente o usa backups de Neon.

**Q: ¿Puedo correr esto sin Vercel?**
A: Sí, cualquier host Node.js funciona. Solo asegúrate de configurar las env vars.

**Q: ¿Cómo escalo si crece mucho?**
A: Agreg caching (Redis), pagination, índices BD optimizados, y considera sharding.
