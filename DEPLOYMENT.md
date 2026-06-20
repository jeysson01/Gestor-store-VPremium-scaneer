# Guía de Despliegue en Vercel

## Pasos para desplegar la aplicación de inventario en Vercel

### 1. Preparar el repositorio GitHub

Si aún no tienes un repositorio, crea uno:

```bash
git init
git add .
git commit -m "Initial commit: Inventory Management System"
git branch -M main
git remote add origin https://github.com/tu-usuario/tu-repo.git
git push -u origin main
```

### 2. Conectar Vercel a GitHub

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Haz clic en "New Project"
3. Selecciona "Import Git Repository"
4. Busca y selecciona tu repositorio

### 3. Configurar Variables de Entorno

En el paso de configuración de Vercel, agrega las variables:

**Environment Variables:**
- `DATABASE_URL`: Tu URL de conexión a Neon (formato: `postgresql://user:password@host/database?sslmode=require`)
- `NEON_AUTH_COOKIE_SECRET`: Genera uno con `openssl rand -base64 32`

**Build Settings:**
- Framework: `Next.js`
- Build Command: `next build`
- Output Directory: `.next`
- Install Command: `pnpm install`

### 4. Configurar Build Hooks (Opcional)

Para ejecutar migraciones automáticamente después de cada despliegue:

1. Ve a Settings → Git → Deploy Hooks
2. Crea un nuevo hook con URL desde una función serverless que execute las migraciones

O manualmente después de cada deploy:

```bash
vercel env pull
pnpm tsx lib/db/migrate.ts
```

### 5. Ejecutar Migraciones en Producción

**Opción A: Usando Vercel CLI (Manual)**

```bash
# Pull env vars
vercel env pull

# Ejecutar migraciones
pnpm tsx lib/db/migrate.ts
```

**Opción B: Función Serverless (Automático)**

Crea `api/migrate.ts` en tu proyecto:

```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import path from 'path';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Verificar token de seguridad
  const token = request.headers.get('Authorization');
  if (token !== `Bearer ${process.env.MIGRATION_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const db = drizzle(pool);

    console.log('Running migrations...');
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), 'lib/db/migrations'),
    });

    await pool.end();
    return Response.json({ success: true, message: 'Migrations completed' });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
```

Luego llamar después de deploy:

```bash
curl -H "Authorization: Bearer tu_token_secreto" https://tu-app.vercel.app/api/migrate
```

### 6. Verificar Despliegue

1. Ve a tu URL de Vercel (generalmente `https://tu-app.vercel.app`)
2. Verifica que:
   - ✅ Dashboard carga correctamente
   - ✅ Navegación funciona
   - ✅ Las consultas a BD funcionan (si hay datos)
   - ✅ No hay errores en la consola

### 7. Configurar Dominio Personalizado (Opcional)

1. En Vercel, ve a Settings → Domains
2. Agrega tu dominio personalizado
3. Sigue las instrucciones para configurar los registros DNS

## Variables de Entorno Requeridas

```env
# Base de datos Neon
DATABASE_URL=postgresql://user:password@region.neon.tech/dbname?sslmode=require

# Seguridad de sesión
NEON_AUTH_COOKIE_SECRET=base64_encoded_secret

# Migración automática (si usas la función serverless)
MIGRATION_TOKEN=tu_token_secreto_seguro
```

## Troubleshooting

### Error: "DATABASE_URL is not set"

Verifica que las variables de entorno estén correctamente configuradas en Vercel:
- Settings → Environment Variables

### Error de migración

Si las migraciones fallan:

1. Verifica que `DATABASE_URL` sea correcta
2. Comprueba que Neon esté activo
3. Revisa los logs en Vercel: `vercel logs`

### La aplicación se carga pero sin datos

Las tablas pueden no estar creadas. Ejecuta:

```bash
vercel env pull
pnpm tsx lib/db/migrate.ts
```

## Optimizaciones para Producción

- ✅ Static generation: Las rutas se prerenderizan donde es posible
- ✅ ISR: Dashboard se regenera cada minuto con `revalidateTag`
- ✅ Edge caching: Las rutas estáticas se cachean en CDN global
- ✅ Compression: Gzip automático en Vercel

## Monitoreo

Recomendaciones para monitorear tu aplicación:

1. **Vercel Analytics**: Habilitado por defecto
2. **Error Tracking**: Integra con Sentry (opcional)
3. **Database Monitoring**: Usa el dashboard de Neon
4. **Performance**: Revisa Core Web Vitals en Vercel

## Próximos Pasos

- [ ] Configurar dominio personalizado
- [ ] Habilitar autenticación de usuarios (Better Auth)
- [ ] Integrar email para notificaciones
- [ ] Agregar más roles de usuario
- [ ] Implementar backup automático de BD
- [ ] Configurar alertas automáticas

¡Listo para producción! 🚀
