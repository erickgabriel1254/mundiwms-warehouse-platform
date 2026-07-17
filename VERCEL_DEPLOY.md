# Despliegue en Vercel

## 1. Crear PostgreSQL en la nube

Usa Neon, Supabase o Vercel Postgres. Copia la cadena `DATABASE_URL` de produccion.

Docker solo es para pruebas locales y no se sube a Vercel.

## 2. Configurar variables en Vercel

En el proyecto de Vercel agrega:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
SESSION_SECRET="un-secreto-largo-para-produccion"
VITE_APP_NAME="MundiWMS"
```

## 3. Ejecutar migraciones y seed en la base de nube

Desde esta carpeta, temporalmente usa la URL de produccion:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
npm run db:migrate
npm run db:seed
```

## 4. Deploy

Opcion guiada desde este proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-vercel.ps1
```

El script pide `DATABASE_URL`, configura Vercel, ejecuta migraciones/seed y publica.

Opcion manual:

Instala e inicia sesion con Vercel CLI:

```powershell
npm i -g vercel
vercel login
vercel --prod
```

Durante el deploy:

- Framework: `Vite`
- Build Command: `npm run vercel-build`
- Output Directory: `dist`

## 5. Probar en telefono

Abre la URL publica que entrega Vercel, por ejemplo:

```text
https://tu-proyecto.vercel.app
```

Usa los usuarios del seed:

```text
admin@mundiwms.local / Admin123!
bodega@mundiwms.local / Bodega123!
supervisor@mundiwms.local / Supervisor123!
```
