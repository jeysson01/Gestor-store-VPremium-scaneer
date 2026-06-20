# Guía: Inventario en Vercel + subdominio + base de datos

## Base de datos del proyecto

| Aspecto | Detalle |
|--------|---------|
| **Motor** | **PostgreSQL** |
| **ORM** | Drizzle ORM |
| **Migraciones** | Carpeta `lib/db/migrations/` (SQL generado por Drizzle) |
| **Producción recomendada** | [Neon](https://neon.tech) (PostgreSQL serverless, integración natural con Vercel) |
| **Local (esta guía)** | PostgreSQL en Docker (`docker-compose.yml`, puerto **5433**) |

El proyecto **no usa MySQL/XAMPP**. Aunque esté en `xampp/htdocs`, la app solo habla con PostgreSQL vía `DATABASE_URL`.

Variables de entorno:

```env
DATABASE_URL=postgresql://usuario:password@host:5432/nombre_db?sslmode=require
NEON_AUTH_COOKIE_SECRET=una_clave_secreta_de_al_menos_32_caracteres
NODE_ENV=production
```

---

## Parte 1 — Ponerlo a correr en local

### Requisitos

- Node.js 18+
- Docker Desktop (para PostgreSQL local)

### Pasos

```powershell
cd C:\xampp\htdocs\inventory-management-system

# 1. Dependencias
npm install

# 2. Base de datos
docker compose up -d

# 3. Crear tablas (importar esquema = ejecutar migraciones)
npm run db:migrate

# 4. Servidor de desarrollo
npm run dev
```

Abre **http://localhost:3002** (puerto fijo; si 3000 está ocupado por otro proyecto, este no cambia)

### ¿Qué hace `db:migrate`?

Aplica los archivos SQL de `lib/db/migrations/` sobre la base vacía. Eso es el equivalente a “importar la estructura” de la base de datos. **No incluye datos de ejemplo**; las tablas quedan listas para que agregues productos y compras desde la UI.

### Si ya tienes datos en otro PostgreSQL

1. Exporta desde el origen: `pg_dump -h HOST -U USER -d DB -F c -f backup.dump`
2. Importa en Neon o en tu Postgres local: `pg_restore -h HOST -U USER -d inventory -F c backup.dump`
3. Asegúrate de que `DATABASE_URL` apunte a esa base antes de desplegar.

---

## Parte 2 — Subir el proyecto a Vercel

### 2.1 Repositorio Git

```powershell
cd C:\xampp\htdocs\inventory-management-system
git init
git add .
git commit -m "Sistema de inventario listo para Vercel"
```

Crea un repo en GitHub y conéctalo:

```powershell
git remote add origin https://github.com/TU_USUARIO/inventory-management-system.git
git branch -M main
git push -u origin main
```

### 2.2 Importar en Vercel

1. Entra en [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Importa el repositorio de GitHub
3. Framework: **Next.js** (detección automática)
4. **No despliegues aún** sin configurar variables (paso 2.3)

### 2.3 Base de datos en Neon (antes del primer deploy útil)

**Orden recomendado:** crear la base **antes** de conectar Vercel, para tener la `DATABASE_URL` lista.

1. [console.neon.tech](https://console.neon.tech) → **New Project**
2. Nombre, región cercana a tus usuarios
3. Copia la **connection string** (modo *pooled* recomendado para Vercel)
4. En Neon → **SQL Editor** o desde local:

```powershell
# Con la URL de Neon en una variable (PowerShell)
$env:DATABASE_URL="postgresql://...@...neon.tech/neondb?sslmode=require"
npm run db:migrate
```

En este punto la base en la nube ya tiene **todas las tablas**. La app en Vercel solo necesita conectarse.

### 2.4 Variables en Vercel

En el proyecto → **Settings** → **Environment Variables**:

| Variable | Valor | Entornos |
|----------|--------|----------|
| `DATABASE_URL` | Connection string de Neon | Production, Preview, Development |
| `NEON_AUTH_COOKIE_SECRET` | `openssl rand -base64 32` o string aleatorio ≥32 chars | Production, Preview, Development |
| `NODE_ENV` | `production` | Production |

Luego **Deployments** → **Redeploy** (si ya habías desplegado sin variables).

### 2.5 Cuándo “importar” la base de datos (resumen)

| Momento | Qué hacer |
|---------|-----------|
| **Antes del 1.er deploy** | Crear proyecto Neon + `npm run db:migrate` con `DATABASE_URL` de Neon |
| **Después de cambiar el schema** | `npm run db:generate` → commit → `npm run db:migrate` contra Neon |
| **Migrar datos existentes** | `pg_dump` / `pg_restore` o import CSV según tus tablas |
| **En Vercel** | No se importa SQL en el panel; Vercel solo ejecuta la app. La BD vive en Neon |

---

## Parte 3 — Subdominio en Vercel

Ejemplos: `inventario.tudominio.com` o el subdominio gratis `inventory-management-system.vercel.app`.

### Opción A — Subdominio de tu dominio propio

1. Vercel → proyecto → **Settings** → **Domains**
2. Añade: `inventario.tudominio.com`
3. Vercel muestra un registro DNS, por ejemplo:
   - **CNAME** `inventario` → `cname.vercel-dns.com`
   - o **A** según lo que indique Vercel
4. En tu registrador (GoDaddy, Cloudflare, Namecheap, etc.) crea ese registro
5. Espera propagación (minutos a 48 h). Vercel marcará el dominio como **Valid**

### Opción B — Solo dominio `.vercel.app`

Al importar el proyecto, Vercel asigna algo como:

`https://inventory-management-system-xxx.vercel.app`

Puedes cambiar el nombre en **Settings** → **Domains** → editar el dominio de producción si está disponible.

### Opción C — Subdominio vía Cloudflare (muy usado)

1. Dominio en Cloudflare → **DNS**
2. CNAME: `inventario` → `cname.vercel-dns.com` (proxy naranja opcional)
3. En Vercel añade el mismo host `inventario.tudominio.com`

### HTTPS

Vercel emite el certificado SSL automáticamente cuando el dominio queda validado.

---

## Parte 4 — Checklist de producción

- [ ] Repo en GitHub
- [ ] Proyecto Neon creado
- [ ] `npm run db:migrate` ejecutado contra Neon
- [ ] Variables `DATABASE_URL` y `NEON_AUTH_COOKIE_SECRET` en Vercel
- [ ] Deploy exitoso (build verde)
- [ ] Dominio o subdominio configurado
- [ ] Probar: crear producto, crear compra, ver dashboard

---

## Comandos útiles

```powershell
# Ver logs en Vercel (CLI)
npx vercel login
npx vercel link
npx vercel logs

# Bajar variables de Vercel a local
npx vercel env pull .env.local

# Nueva migración tras cambiar schema
npm run db:generate
npm run db:migrate
```

---

## Solución de problemas

**`DATABASE_URL is not set`**  
Configura la variable en Vercel y redeploy.

**Error de conexión a la base**  
En Neon usa la URL con `?sslmode=require`. Revisa usuario, contraseña y que el proyecto Neon no esté suspendido.

**Tablas no existen en producción**  
Ejecuta `npm run db:migrate` apuntando a la URL de Neon (no basta con desplegar el código).

**Puerto 5432 ocupado en local**  
Este proyecto usa Docker en el puerto **5433** (`docker-compose.yml`).

---

## Documentación relacionada en el repo

- `VERCEL_DEPLOYMENT.md` — despliegue general (inglés)
- `README.md` — visión del proyecto
- `.env.example` — plantilla de variables
