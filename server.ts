import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './src/server/db';
import { apiRouter } from './src/server/routes';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  initializeDatabase();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IMMOPAY CI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start IMMOPAY CI server:', err);
  process.exit(1);
});
