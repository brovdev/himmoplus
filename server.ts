import 'dotenv/config';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { SESSION_COOKIE_NAME, verifySessionToken } from './src/server/auth';
import { initializeDatabase } from './src/server/db';
import { developerRouter, recordApiRequestLog, recordSystemError } from './src/server/developerRoutes';
import { apiRouter } from './src/server/routes';
import { assertDeveloper2faSecretConfigured } from './src/server/twoFactor';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  assertDeveloper2faSecretConfigured();
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

  // Real-time API telemetry middleware (redacted, measures latency & HTTP codes)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    const requestId = crypto.randomBytes(4).toString('hex');
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const session = cookieToken ? verifySessionToken(cookieToken) : null;
    let responseSize = 0;
    const origSend = res.send.bind(res);

    res.send = ((body?: unknown) => {
      if (typeof body === 'string') responseSize = Buffer.byteLength(body);
      else if (Buffer.isBuffer(body)) responseSize = body.length;
      return origSend(body);
    }) as typeof res.send;

    res.on('finish', () => {
      // Avoid feedback noise when developer console polls its own telemetry
      if (req.path === '/health' || req.path.startsWith('/developer/logs') || req.path.startsWith('/developer/api-monitor')) {
        return;
      }
      const durationMs = performance.now() - start;
      recordApiRequestLog({
        requestId,
        method: req.method,
        path: `/api${req.path}`,
        statusCode: res.statusCode,
        durationMs,
        userRole: session?.roleType || 'public',
        ipAddress: req.ip || null,
        responseSize,
        errorSummary: res.statusCode >= 400 ? `HTTP ${res.statusCode} sur ${req.method} /api${req.path}` : null,
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-organization-id': req.headers['x-organization-id'],
          cookie: req.headers['cookie'],
          authorization: req.headers['authorization'],
        },
      });
    });

    next();
  });

  app.use('/api', developerRouter);
  app.use('/api', apiRouter);

  // Global error handler — captures stack internally and NEVER leaks technical details to end users
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const incidentCode = recordSystemError({
      source: err.message?.includes('SQLITE') ? 'backend_sqlite' : 'backend_node',
      severity: 'critique',
      module: req.path.split('/')[2] || 'api',
      message: err.message || 'Unhandled Express error',
      stackTrace: err.stack || null,
      context: {
        query: req.query,
        body: req.body,
      },
      requestMethod: req.method,
      requestPath: req.originalUrl,
    });

    if (res.headersSent) return;
    res.status(500).json({
      error: `Une erreur technique interne est survenue. Référence incident : ${incidentCode}.`,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr ? { hmr: false, ws: false } : {}),
      },
      appType: 'spa',
    });

    if (disableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }

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
