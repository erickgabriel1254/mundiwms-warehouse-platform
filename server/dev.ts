import { createServer } from 'node:http';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import { handleApi } from './http.js';

const port = Number(process.env.PORT || 5173);

if (!process.env.DATABASE_URL) {
  console.warn(
    [
      'DATABASE_URL no esta configurada.',
      'Crea un archivo .env en la raiz usando .env.example y coloca la URL PostgreSQL de Supabase, Neon o Vercel Postgres.',
      'Luego ejecuta: npm run db:migrate && npm run db:seed && npm run dev',
    ].join('\n'),
  );
}

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa',
});

createServer(async (req, res) => {
  if (req.url?.startsWith('/api')) {
    await handleApi(req, res);
    return;
  }
  vite.middlewares(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
}).listen(port, () => {
  console.log(`MundiWMS local: http://localhost:${port}`);
});
