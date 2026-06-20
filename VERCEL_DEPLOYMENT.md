## 🚀 DESPLIEGUE EN VERCEL - GUÍA COMPLETA

Tu sistema de gestión de inventario está 100% completo y listo para producción. Sigue estos pasos para desplegarlo en Vercel.

---

## PASO 1: Preparar tu Repositorio Local

### 1.1 Inicializar Git (si aún no lo has hecho)

```bash
cd /vercel/share/v0-project
git init
git add .
git commit -m "Initial commit: Sistema de Gestión de Inventario"
```

### 1.2 Crear un Repositorio en GitHub

1. Ve a [github.com](https://github.com)
2. Click en el **+** en la esquina superior derecha
3. Selecciona "New repository"
4. Nombre: `inventario-sistema` (o el que prefieras)
5. Descripción: "Sistema profesional de gestión de inventario y compras"
6. Selecciona "Public" o "Private" (según tus preferencias)
7. NO inicialices con README (ya lo tenemos)
8. Click en "Create repository"

### 1.3 Conectar tu Repositorio Local a GitHub

```bash
git remote add origin https://github.com/TU_USUARIO/inventario-sistema.git
git branch -M main
git push -u origin main
```

Reemplaza `TU_USUARIO` con tu usuario de GitHub.

---

## PASO 2: Conectar con Vercel

### 2.1 Ir a Vercel

1. Ve a [vercel.com](https://vercel.com)
2. Click en "Sign up" o "Log in" (con tu cuenta de GitHub)
3. Click en "New Project"

### 2.2 Importar tu Repositorio

1. Vercel mostrará tus repositorios de GitHub
2. Encuentra "inventario-sistema" (o el nombre que usaste)
3. Click en "Import"

### 2.3 Configurar Variables de Entorno

En la página de configuración de Vercel:

1. En la sección "Environment Variables", agrega:

   **Variable 1:**
   - Key: `DATABASE_URL`
   - Value: Tu URL de conexión de Neon (la tienes en tu cuenta de Neon)
   - Selecciona: Production, Preview, Development

   **Variable 2:**
   - Key: `NEON_AUTH_COOKIE_SECRET`
   - Value: El secret que generaste (el mismo que está en tu .env local)
   - Selecciona: Production, Preview, Development

2. Click en "Deploy"

Vercel comenzará a compilar y desplegar tu aplicación.

---

## PASO 3: Ejecutar Migraciones en Producción

### 3.1 Después de que Vercel Finalice el Despliegue

Una vez que Vercel termine de desplegar (verás un mensaje de éxito):

1. Ve a tu Dashboard de Vercel
2. Selecciona tu proyecto "inventario-sistema"
3. Ve a la pestaña "Deployments"
4. Click en el deployment más reciente
5. Copy el URL de tu app (ej: https://inventario-sistema.vercel.app)

### 3.2 Ejecutar las Migraciones

Hay varias formas de hacer esto:

**Opción A: Usar el Terminal en Local (Recomendado)**

```bash
# Extrae las variables de Vercel
vercel env pull

# Ejecuta las migraciones
pnpm tsx lib/db/migrate.ts
```

**Opción B: Usar Vercel CLI**

```bash
# Si no tienes Vercel CLI instalado
npm i -g vercel

# Auténticate
vercel login

# Ejecuta el comando en el contexto de Vercel
vercel shell
pnpm tsx lib/db/migrate.ts
```

---

## PASO 4: Verificar que Todo Funciona

### 4.1 Acceder a tu Aplicación

1. Ve al URL de tu app en Vercel (ej: https://inventario-sistema.vercel.app)
2. Deberías ver el Dashboard
3. Navega por las diferentes secciones:
   - Dashboard
   - Productos
   - Compras
   - Reportes

### 4.2 Probar Funcionalidades Básicas

1. **Crear un Producto:**
   - Ve a Productos
   - Click en "Agregar Producto"
   - Llena los datos
   - Click en "Guardar"

2. **Crear una Compra:**
   - Ve a Compras
   - Click en "Nueva Compra"
   - Selecciona productos
   - Click en "Crear Compra"

3. **Ver Dashboard:**
   - Ve al Dashboard
   - Verifica que las estadísticas se actualicen

---

## PASO 5: Dominio Personalizado (Opcional)

Si quieres usar un dominio personalizado (ej: inventario.tusitio.com):

### 5.1 En Vercel

1. Ve a Settings de tu proyecto
2. Click en "Domains"
3. Agrega tu dominio
4. Vercel te dará instrucciones para configurar DNS

### 5.2 En tu Proveedor de Dominio

1. Ve al panel de control de tu proveedor de dominio
2. Configura los registros DNS según las instrucciones de Vercel
3. Espera a que se propague (5-48 horas generalmente)

---

## SOLUCIÓN DE PROBLEMAS

### Problema: "DATABASE_URL is missing"

**Solución:**
1. Ve a Vercel Dashboard
2. Settings → Environment Variables
3. Verifica que DATABASE_URL esté configurada
4. Redeploy: Click en tu último deployment → Redeploy

### Problema: "Error al conectar a la base de datos"

**Solución:**
1. Verifica que tu DATABASE_URL sea correcta
2. Ve a tu dashboard de Neon
3. Copy la connection string exacta
4. Actualiza en Vercel

### Problema: "Las migraciones no se ejecutaron"

**Solución:**
```bash
# Local
vercel env pull
pnpm tsx lib/db/migrate.ts

# O manualmente
DATABASE_URL="tu_url_aqui" pnpm tsx lib/db/migrate.ts
```

### Problema: "Error 502 Bad Gateway"

**Solución:**
1. Espera 5 minutos (Vercel está optimizando)
2. Refresca la página
3. Si persiste, redeploy desde Vercel Dashboard

---

## OPTIMIZACIONES EN PRODUCCIÓN

### 1. Habilitar Analytics

En Vercel Dashboard:
- Settings → Analytics
- Habilita Web Analytics

### 2. Configurar Logs

En Vercel Dashboard:
- Deployments → Click en tu deployment
- Pestaña "Runtime Logs"

### 3. Monitorear Performance

En Vercel Dashboard:
- Analytics
- Observa Core Web Vitals

---

## MANTENER TU APLICACIÓN

### Actualizaciones

Cada vez que hagas cambios en local:

```bash
# En tu carpeta local
git add .
git commit -m "Descripción del cambio"
git push origin main

# Vercel se redesplegará automáticamente
```

### Hacer Cambios en Base de Datos

Si añades nuevas tablas o cambios al schema:

```bash
# Local
pnpm drizzle-kit generate
git add . && git commit -m "Schema update"
git push

# Luego ejecutar migraciones en producción
vercel env pull
pnpm tsx lib/db/migrate.ts
```

---

## MONITOREO Y MANTENIMIENTO

### Revisar Logs en Producción

```bash
vercel logs [project-url]
```

### Ver Deployments Anteriores

```bash
vercel deployments list
```

### Rollback a un Deployment Anterior

```bash
vercel rollback
```

---

## VARIABLES DE ENTORNO IMPORTANTES

```
DATABASE_URL=postgresql://usuario:contraseña@host:5432/nombre_db
NEON_AUTH_COOKIE_SECRET=tu_secret_aqui_minimo_32_caracteres
NODE_ENV=production
```

---

## ESCALABILIDAD

Tu aplicación en Vercel está configurada para escalar automáticamente:

- **Serverless Functions**: Se escalan según demanda
- **CDN Global**: Tus assets se sirven desde servidores cerca del usuario
- **Database Connections**: Neon maneja múltiples conexiones simultáneas
- **Auto-scaling**: Vercel añade más recursos automáticamente si es necesario

---

## SEGURIDAD EN PRODUCCIÓN

1. ✓ HTTPS automático (Vercel)
2. ✓ Variables de entorno encriptadas (Vercel)
3. ✓ Validación de inputs (Zod)
4. ✓ SQL Injection prevention (Drizzle)
5. ✓ TypeScript type safety

---

## PRÓXIMOS PASOS OPCIONALES

### 1. Agregar Autenticación de Usuarios

Tu proyecto ya tiene soporte para Better Auth. Para habilitarlo:
- Contacta a v0 para implementar login/registro

### 2. Agregar Más Reportes

- Reportes por rango de fechas
- Análisis de tendencias
- Pronósticos de demanda

### 3. API REST

- Exponer endpoints para integración con otros sistemas
- Webhooks para eventos importantes

### 4. Mobile App

- Usar React Native con el mismo backend

---

## CONTACTO Y SOPORTE

Si tienes problemas:

1. **Documentación local:** Lee README.md, DEVELOPMENT.md, CHECKLIST.md
2. **Vercel Docs:** https://vercel.com/docs
3. **Neon Docs:** https://neon.tech/docs
4. **Drizzle Docs:** https://orm.drizzle.team

---

## RESUMEN RÁPIDO

```bash
# 1. Preparar
git init && git add . && git commit -m "Initial"
git remote add origin https://github.com/TU_USUARIO/inventario-sistema
git push -u origin main

# 2. En Vercel (UI) - Importar repositorio + agregar env vars

# 3. Después de despliegue
vercel env pull
pnpm tsx lib/db/migrate.ts

# 4. ¡Listo! Tu app está en producción 🚀
```

---

**Tu sistema de gestión de inventario profesional está ahora en producción.**

¡Éxito con tu proyecto! 🎉
