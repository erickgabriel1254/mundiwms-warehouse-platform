# MundiWMS

Sistema WMS funcional para maquinaria, repuestos, accesorios e insumos de confeccion. Usa React + Vite + TypeScript, Metronic React como base visual, React Router, React Hook Form + Zod, TanStack Table, Prisma y PostgreSQL.

## Instalacion local

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` levanta Vite y la API local en el mismo servidor: `http://localhost:5173`.

## PostgreSQL local con Docker

Docker se usa solo para levantar PostgreSQL local. La app sigue corriendo con Node/Vite.

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

El archivo `.env` local puede usar:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mundiwms?schema=public"
```

## Variables de entorno

Configura `DATABASE_URL` con una base PostgreSQL de Supabase, Neon o Vercel Marketplace.

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
SESSION_SECRET="replace-with-a-long-random-value"
```

En Vercel, agrega las mismas variables en Project Settings > Environment Variables y vuelve a desplegar.

## Base de datos

El modelo esta en `prisma/schema.prisma` e incluye:

- users, roles
- products
- warehouses, locations
- inventory_units, inventory_balances
- clients, suppliers
- inbound_orders, inbound_order_items
- outbound_orders, outbound_order_items
- kardex_movements
- inventory_adjustments

Comandos:

```bash
npm run db:migrate
npm run db:seed
npm run db:reset
```

Para cambiar de proveedor PostgreSQL:

```bash
pg_dump "$DATABASE_URL" > mundiwms.sql
psql "$NEW_DATABASE_URL" < mundiwms.sql
```

Luego actualiza `DATABASE_URL` local y en Vercel.

## Usuarios iniciales

- Administrador: `admin@mundiwms.local` / `Admin123!`
- Operador de bodega: `bodega@mundiwms.local` / `Bodega123!`
- Supervisor: `supervisor@mundiwms.local` / `Supervisor123!`

## Flujo principal

1. Iniciar sesion.
2. Crear o editar un SKU.
3. Crear una recepcion con uno o varios productos.
4. Registrar series cuando el SKU maneja serie.
5. Confirmar recepcion para crear unidades, stock disponible y Kardex.
6. Crear una salida.
7. Seleccionar series disponibles o cantidad para productos sin serie.
8. Reservar stock.
9. Confirmar despacho para marcar unidades como despachadas y registrar Kardex.
10. Consultar inventario, Kardex y reportes.

## Reglas de negocio

- SKU unico.
- Serie unica por SKU.
- Las series pertenecen a `inventory_units`, no a `products`.
- No se confirma recepcion serializada si faltan series.
- No se reserva o despacha stock bloqueado, reservado o despachado.
- No se despacha mas stock del disponible.
- Todo ajuste requiere motivo.
- Recepciones, reservas, despachos y ajustes generan Kardex.
- Inventario, clientes, proveedores, pedidos y Kardex persisten en PostgreSQL.

## Despliegue en Vercel

1. Crea una base PostgreSQL en Supabase, Neon o Vercel Marketplace.
2. Configura `DATABASE_URL` y `SESSION_SECRET` en Vercel.
3. Ejecuta localmente `npm run db:migrate` y `npm run db:seed` apuntando a esa base, o ejecuta los mismos comandos desde tu pipeline.
4. Despliega el proyecto en Vercel.

`vercel.json` incluye rewrite a `index.html` para que React Router funcione al refrescar rutas internas.

Ver tambien [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md).
