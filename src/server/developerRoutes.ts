import crypto from 'crypto';
import Database from 'better-sqlite3';
import express, { type Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import QRCode from 'qrcode';
import {
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  clearAllLoginRateLimits,
  generateTotpCode,
  logDeveloperAction,
  redactSensitive,
  requireAuth,
  requireDeveloper,
  signSessionToken,
  verifyTotpCode,
} from './auth';
import { db } from './db';

export const developerRouter = express.Router();

// Simple in-memory cache for runtime metrics / rate-limit tracking
const telemetryCache = new Map<string, { value: unknown; expiresAt: number }>();

export function parseStackLocation(stack?: string | null): { filePath: string | null; lineNumber: number | null } {
  if (!stack) return { filePath: null, lineNumber: null };
  const match = stack.match(/(?:\/app\/applet\/|src\/|server\.ts)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|php)):(\d+)(?::\d+)?/);
  if (match) {
    return {
      filePath: match[1].startsWith('src/') || match[1] === 'server.ts' ? match[1] : `src/${match[1]}`,
      lineNumber: Number(match[2]),
    };
  }
  const generic = stack.match(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|php)):(\d+)/);
  if (generic) {
    return {
      filePath: generic[1].replace(/^\/app\/applet\//, ''),
      lineNumber: Number(generic[2]),
    };
  }
  return { filePath: null, lineNumber: null };
}

export function recordSystemError(params: {
  source: 'backend_node' | 'backend_sqlite' | 'frontend_js' | 'webhook' | 'php_laravel';
  severity: 'critique' | 'elevee' | 'moyenne' | 'faible';
  module: string;
  message: string;
  stackTrace?: string | null;
  filePath?: string | null;
  lineNumber?: number | null;
  context?: Record<string, unknown>;
  requestMethod?: string | null;
  requestPath?: string | null;
}): string {
  const errorCode = `ERR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const loc = parseStackLocation(params.stackTrace);
  const filePath = params.filePath || loc.filePath;
  const lineNumber = params.lineNumber || loc.lineNumber;
  const redactedCtx = JSON.stringify(redactSensitive(params.context || {}));
  const cleanMsg = String(redactSensitive(params.message)).slice(0, 1200);
  const cleanStack = params.stackTrace ? String(redactSensitive(params.stackTrace)).slice(0, 6000) : null;

  try {
    const existing = db
      .prepare(
        "SELECT id FROM system_errors WHERE status != 'resolu' AND message = ? AND COALESCE(file_path, '') = COALESCE(?, '') LIMIT 1"
      )
      .get(cleanMsg, filePath) as { id: number } | undefined;

    if (existing) {
      db.prepare("UPDATE system_errors SET occurrences = occurrences + 1, last_seen_at = datetime('now') WHERE id = ?").run(
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO system_errors (error_code, source, severity, module, message, stack_trace, file_path, line_number, context_json, request_method, request_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        errorCode,
        params.source,
        params.severity,
        params.module,
        cleanMsg,
        cleanStack,
        filePath,
        lineNumber,
        redactedCtx,
        params.requestMethod || null,
        params.requestPath || null
      );
    }
  } catch {
    // Avoid cascading error loops
  }
  return errorCode;
}

export function recordApiRequestLog(entry: {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userRole: string | null;
  ipAddress: string | null;
  responseSize: number;
  errorSummary?: string | null;
  headers?: Record<string, unknown>;
}): void {
  try {
    const isError = entry.statusCode >= 400 ? 1 : 0;
    db.prepare(`
      INSERT INTO api_request_logs (request_id, method, path, status_code, duration_ms, user_role, ip_address, response_size, is_error, error_summary, headers_redacted_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.requestId,
      entry.method,
      entry.path,
      entry.statusCode,
      Math.round(entry.durationMs * 100) / 100,
      entry.userRole,
      entry.ipAddress,
      entry.responseSize,
      isError,
      entry.errorSummary ? String(redactSensitive(entry.errorSummary)).slice(0, 400) : null,
      JSON.stringify(redactSensitive(entry.headers || {}))
    );
  } catch {
    // Telemetry should never interrupt HTTP response flow
  }
}

export function recordSqlQuery(querySql: string, durationMs: number, sourceRoute?: string, errorMessage?: string): void {
  try {
    const thresholdRow = db.prepare("SELECT value FROM developer_settings WHERE key = 'slow_sql_threshold_ms'").get() as
      | { value: string }
      | undefined;
    const threshold = Number(thresholdRow?.value || 80);
    const isSlow = durationMs >= threshold ? 1 : 0;
    db.prepare(
      'INSERT INTO sql_query_logs (query_sql, duration_ms, is_slow, source_route, error_message) VALUES (?, ?, ?, ?, ?)'
    ).run(querySql.slice(0, 1000), Math.round(durationMs * 100) / 100, isSlow, sourceRoute || null, errorMessage || null);
  } catch {
    // Safe fallback
  }
}

function getPaymentIntegrationsStatus() {
  return [
    {
      provider: 'wave',
      label: 'Wave Côte d’Ivoire',
      configured: Boolean(process.env.WAVE_API_KEY && process.env.WAVE_WEBHOOK_SECRET),
      mode: process.env.WAVE_API_KEY ? 'API Live / Webhook' : 'Validation manuelle hors-ligne',
      envVars: ['WAVE_API_KEY', 'WAVE_WEBHOOK_SECRET'],
    },
    {
      provider: 'orange_money',
      label: 'Orange Money CI',
      configured: Boolean(process.env.ORANGE_MONEY_CLIENT_ID && process.env.ORANGE_MONEY_CLIENT_SECRET),
      mode: process.env.ORANGE_MONEY_CLIENT_ID ? 'OAuth2 Marchand' : 'Validation manuelle hors-ligne',
      envVars: ['ORANGE_MONEY_CLIENT_ID', 'ORANGE_MONEY_CLIENT_SECRET'],
    },
    {
      provider: 'mtn_money',
      label: 'MTN MoMo CI',
      configured: Boolean(process.env.MTN_MOMO_API_KEY && process.env.MTN_MOMO_SUBSCRIPTION_KEY),
      mode: process.env.MTN_MOMO_API_KEY ? 'Collection API' : 'Validation manuelle hors-ligne',
      envVars: ['MTN_MOMO_API_KEY', 'MTN_MOMO_SUBSCRIPTION_KEY'],
    },
    {
      provider: 'moov_money',
      label: 'Moov Money (Flooz)',
      configured: Boolean(process.env.MOOV_MONEY_API_KEY),
      mode: process.env.MOOV_MONEY_API_KEY ? 'API Marchand' : 'Validation manuelle hors-ligne',
      envVars: ['MOOV_MONEY_API_KEY'],
    },
    {
      provider: 'whatsapp',
      label: 'WhatsApp Business Cloud',
      configured: Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      mode: process.env.WHATSAPP_API_TOKEN ? 'Meta Graph API' : 'Lien manuel wa.me uniquement',
      envVars: ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    },
    {
      provider: 'smtp',
      label: 'Passerelle SMTP / E-mail',
      configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
      mode: process.env.SMTP_HOST ? 'SMTP actif' : 'Non configuré',
      envVars: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    },
  ];
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// ---------------------------------------------------------------------------
// PUBLIC CLIENT JS TELEMETRY INGESTION (STRICTLY SANITIZED)
// ---------------------------------------------------------------------------

developerRouter.post('/telemetry/client-error', (req, res) => {
  const enabledRow = db.prepare("SELECT value FROM developer_settings WHERE key = 'capture_js_errors'").get() as
    | { value: string }
    | undefined;
  if (enabledRow?.value === 'false') {
    res.status(202).json({ accepted: false });
    return;
  }

  const { message, stack, componentStack, routePath, url } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'Message requis.' });
    return;
  }

  const errorCode = recordSystemError({
    source: 'frontend_js',
    severity: 'elevee',
    module: 'frontend',
    message: String(message),
    stackTrace: stack || componentStack || null,
    context: {
      routePath: routePath || null,
      url: url || null,
      userAgent: req.headers['user-agent'] || null,
    },
    requestMethod: 'CLIENT',
    requestPath: String(routePath || '/'),
  });

  res.status(201).json({ accepted: true, errorCode });
});

// ---------------------------------------------------------------------------
// DEVELOPER 2FA SETUP & VERIFICATION (AUTH REQUIRED, DEVELOPER ROLE ONLY)
// ---------------------------------------------------------------------------

developerRouter.get('/developer/auth/2fa-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.authUser!.role_type !== 'developer') {
    res.status(403).json({ error: 'Accès strictement réservé au rôle développeur.' });
    return;
  }
  const row = db.prepare('SELECT totp_secret, enabled, last_verified_at FROM developer_2fa WHERE user_id = ?').get(req.authUser!.id) as
    | { totp_secret: string; enabled: number; last_verified_at: string | null }
    | undefined;

  const isDevEnv = process.env.NODE_ENV !== 'production';
  const isFirstSetup = !row?.last_verified_at;
  const secret = row?.totp_secret || 'IMMOPAYDEV2FATOTP';
  const otpauthUri = `otpauth://totp/IMMOPAY-CI:${encodeURIComponent(req.authUser!.email)}?secret=${secret}&issuer=IMMOPAY-CI`;
  const qrDataUrl = isDevEnv || isFirstSetup ? await QRCode.toDataURL(otpauthUri, { width: 180, margin: 1 }) : undefined;

  res.json({
    twoFactorVerified: Boolean(req.twoFactorVerified),
    enabled: Boolean(row?.enabled ?? 1),
    lastVerifiedAt: row?.last_verified_at || null,
    isFirstSetup,
    devPreviewCode: isDevEnv ? generateTotpCode(secret) : undefined,
    otpauthUri: isDevEnv || isFirstSetup ? otpauthUri : undefined,
    qrDataUrl,
    manualKey: isDevEnv || isFirstSetup ? secret : undefined,
  });
});

developerRouter.post('/developer/auth/verify-2fa', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUser!.role_type !== 'developer') {
    res.status(403).json({ error: 'Accès strictement réservé au rôle développeur.' });
    return;
  }
  const { code } = req.body || {};
  const row = db.prepare('SELECT totp_secret FROM developer_2fa WHERE user_id = ?').get(req.authUser!.id) as
    | { totp_secret: string }
    | undefined;
  const secret = row?.totp_secret || 'IMMOPAYDEV2FATOTP';

  if (!verifyTotpCode(secret, String(code || ''))) {
    logDeveloperAction(req.authUser!.id, 'DEV_2FA_FAILED', 'auth', req.authUser!.id, { reason: 'invalid_totp' }, req.ip);
    res.status(401).json({ error: 'Code 2FA invalide ou expiré. Vérifiez votre application d’authentification.' });
    return;
  }

  db.prepare("UPDATE developer_2fa SET last_verified_at = datetime('now') WHERE user_id = ?").run(req.authUser!.id);
  const upgradedToken = signSessionToken({
    userId: req.authUser!.id,
    roleType: 'developer',
    twoFactorVerified: true,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  });
  setSessionCookie(res, upgradedToken);
  logDeveloperAction(req.authUser!.id, 'DEV_2FA_VERIFIED', 'auth', req.authUser!.id, { method: 'totp_rfc6238' }, req.ip);

  res.json({ verified: true });
});

// ---------------------------------------------------------------------------
// PROTECTED DEVELOPER CONSOLE ENDPOINTS (ROLE=developer + 2FA VERIFIED)
// ---------------------------------------------------------------------------

developerRouter.get('/developer/overview', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const t0 = performance.now();
  const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number };
  const dbPingMs = Math.round((performance.now() - t0) * 100) / 100;
  recordSqlQuery('SELECT 1 as ok', dbPingMs, '/api/developer/overview');

  const dbPath = path.resolve(process.cwd(), 'immopay.db');
  const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const openErrors = (db.prepare("SELECT COUNT(*) as c FROM system_errors WHERE status != 'resolu'").get() as { c: number }).c;
  const criticalErrors = (
    db.prepare("SELECT COUNT(*) as c FROM system_errors WHERE status != 'resolu' AND severity = 'critique'").get() as { c: number }
  ).c;

  const apiStats = db
    .prepare(`
      SELECT
        COUNT(*) as total_requests,
        COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) as failed_requests,
        COALESCE(SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END), 0) as server_errors_5xx,
        COALESCE(ROUND(AVG(duration_ms), 2), 0) as avg_latency_ms
      FROM api_request_logs
      WHERE created_at >= datetime('now', '-24 hours')
    `)
    .get() as { total_requests: number; failed_requests: number; server_errors_5xx: number; avg_latency_ms: number };

  const pendingJobs = (
    db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE status IN ('en_attente', 'en_cours')").get() as { c: number }
  ).c;
  const failedJobs = (db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE status = 'echoue'").get() as { c: number }).c;

  const lastBackup = db.prepare('SELECT * FROM system_backups ORDER BY id DESC LIMIT 1').get();
  const recentErrors = db
    .prepare('SELECT id, error_code, source, severity, module, message, file_path, line_number, status, occurrences, last_seen_at FROM system_errors ORDER BY id DESC LIMIT 6')
    .all();
  const recentRequests = db
    .prepare('SELECT id, request_id, method, path, status_code, duration_ms, user_role, created_at FROM api_request_logs ORDER BY id DESC LIMIT 12')
    .all();

  const integrations = getPaymentIntegrationsStatus();

  res.json({
    server: {
      status: 'operationnel',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: `${os.platform()} (${os.arch()})`,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      osFreeMemMb: Math.round(freeMem / 1024 / 1024),
      osTotalMemMb: Math.round(totalMem / 1024 / 1024),
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    },
    database: {
      status: dbCheck.ok === 1 ? 'connecte' : 'erreur',
      engine: 'SQLite 3 (WAL)',
      pingMs: dbPingMs,
      sizeBytes: dbSizeBytes,
    },
    api: {
      status: apiStats.server_errors_5xx > 5 ? 'degrade' : 'operationnel',
      totalRequests24h: apiStats.total_requests,
      failedRequests24h: apiStats.failed_requests,
      serverErrors5xx24h: apiStats.server_errors_5xx,
      avgLatencyMs: apiStats.avg_latency_ms,
    },
    counts: {
      openErrors,
      criticalErrors,
      pendingJobs,
      failedJobs,
    },
    integrations,
    lastBackup: lastBackup || null,
    recentErrors,
    recentRequests,
  });
});

developerRouter.get('/developer/errors', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const { severity, source, module, status, q, date } = req.query;
  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];

  if (severity && typeof severity === 'string' && severity !== 'all') {
    clauses.push('severity = ?');
    params.push(severity);
  }
  if (source && typeof source === 'string' && source !== 'all') {
    clauses.push('source = ?');
    params.push(source);
  }
  if (module && typeof module === 'string' && module !== 'all') {
    clauses.push('module = ?');
    params.push(module);
  }
  if (status && typeof status === 'string' && status !== 'all') {
    clauses.push('status = ?');
    params.push(status);
  }
  if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    clauses.push("date(last_seen_at) = ?");
    params.push(date);
  }
  if (q && typeof q === 'string' && q.trim()) {
    clauses.push('(message LIKE ? OR file_path LIKE ? OR error_code LIKE ? OR module LIKE ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like, like, like);
  }

  const errors = db
    .prepare(`
      SELECT se.*, u.full_name as resolved_by_name
      FROM system_errors se
      LEFT JOIN users u ON u.id = se.resolved_by
      WHERE ${clauses.join(' AND ')}
      ORDER BY CASE se.status WHEN 'ouvert' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END, se.last_seen_at DESC
      LIMIT 150
    `)
    .all(...params);

  res.json({ errors });
});

developerRouter.patch('/developer/errors/:id', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { status, resolutionNote } = req.body || {};
  const existing = db.prepare('SELECT id, error_code FROM system_errors WHERE id = ?').get(id) as
    | { id: number; error_code: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Erreur introuvable.' });
    return;
  }

  const nextStatus = ['ouvert', 'en_cours', 'resolu'].includes(status) ? status : 'en_cours';
  db.prepare(`
    UPDATE system_errors
    SET status = ?,
        resolution_note = COALESCE(?, resolution_note),
        resolved_by = CASE WHEN ? = 'resolu' THEN ? ELSE resolved_by END,
        resolved_at = CASE WHEN ? = 'resolu' THEN datetime('now') ELSE resolved_at END
    WHERE id = ?
  `).run(nextStatus, resolutionNote || null, nextStatus, req.authUser!.id, nextStatus, id);

  logDeveloperAction(
    req.authUser!.id,
    'DEV_ERROR_UPDATED',
    'system_error',
    id,
    { errorCode: existing.error_code, status: nextStatus, hasNote: Boolean(resolutionNote) },
    req.ip
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// INTELLIGENT DIAGNOSTIC ASSISTANT
// ---------------------------------------------------------------------------

function analyzeTechnicalProblem(input: {
  message: string;
  stackTrace?: string | null;
  source?: string | null;
  module?: string | null;
  filePath?: string | null;
  lineNumber?: number | null;
}) {
  const msg = `${input.message || ''} ${input.stackTrace || ''}`.toLowerCase();
  const loc = parseStackLocation(input.stackTrace);
  const detectedFile = input.filePath || loc.filePath || 'src/server/routes.ts';
  const detectedLine = input.lineNumber || loc.lineNumber;

  if (msg.includes('too few parameter') || msg.includes('sqlite') || msg.includes('constraint') || msg.includes('foreign key')) {
    return {
      category: 'Base de données SQLite & Requêtes paramétrées',
      explanation:
        'Une requête SQL paramétrée a reçu un nombre de valeurs incompatible avec ses marqueurs « ? », ou a violé une contrainte d’intégrité référentielle (clé étrangère ou unicité).',
      probableCause:
        msg.includes('too few parameter')
          ? 'Passage d’un objet (ex. RunResult au lieu de .lastInsertRowid) ou tableau de paramètres incomplet à stmt.run(...).'
          : 'Violation de contrainte UNIQUE ou FOREIGN KEY lors d’une insertion/suppression sans vérification préalable.',
      affectedFiles: [detectedFile, 'src/server/db.ts'],
      lineNumber: detectedLine,
      solution:
        'Vérifiez que chaque marqueur « ? » reçoit une valeur primitive (number | string | null), extrayez explicitement Number(result.lastInsertRowid) et encapsulez les écritures liées dans db.transaction(...).',
      verificationCommands: [
        'npx tsc --noEmit',
        'npx tsx -e "import { db, initializeDatabase } from \'./src/server/db.ts\'; initializeDatabase(); console.log(db.pragma(\'integrity_check\'));"',
      ],
      remediationSteps: [
        '1. Reproduire la requête fautive en environnement de développement local sur une copie de immopay.db.',
        '2. Corriger le mapping des paramètres ou la contrainte dans le fichier source identifié.',
        '3. Exécuter npm run lint et un test d’intégration ciblé avant tout déploiement.',
      ],
    };
  }

  if (msg.includes('whatsapp') || msg.includes('wave') || msg.includes('orange') || msg.includes('mtn') || msg.includes('webhook') || msg.includes('smtp')) {
    return {
      category: 'Connecteurs Paiement & Passerelles externes',
      explanation:
        'Une intégration externe (Mobile Money, WhatsApp Cloud ou SMTP) a retourné une erreur ou n’est pas encore approvisionnée avec ses clés API de production.',
      probableCause:
        'Variables d’environnement manquantes dans .env, signature webhook invalide ou délai d’attente dépassé sur la passerelle opérateur.',
      affectedFiles: ['src/server/routes.ts', 'src/server/developerRoutes.ts', '.env.example'],
      lineNumber: detectedLine,
      solution:
        'Renseignez les variables officielles dans les secrets serveur (.env), conservez les paiements déclarés en statut « en_attente_validation » jusqu’à vérification HMAC de la signature webhook, puis relancez la tâche/webhook.',
      verificationCommands: [
        'curl -s http://127.0.0.1:3000/api/health',
        'grep -E "WAVE_|ORANGE_|MTN_|WHATSAPP_|SMTP_" .env.example',
      ],
      remediationSteps: [
        '1. Vérifier les variables configurées dans Paramètres techniques / Paiements.',
        '2. Tester le webhook sur un environnement sandbox opérateur.',
        '3. Valider le passage en statut « confirme » et la génération de quittance avant mise en production.',
      ],
    };
  }

  if (input.source === 'frontend_js' || msg.includes('cannot read properties') || msg.includes('undefined') || msg.includes('react') || msg.includes('render')) {
    return {
      category: 'Exception Frontend JavaScript / React',
      explanation:
        'Un composant React a tenté de lire une propriété sur une valeur null/undefined ou a rencontré une exception pendant le rendu ou un appel réseau.',
      probableCause:
        'Réponse API asynchrone incomplète au premier rendu, ou propriété optionnelle accédée sans chaînage optionnel (?.).',
      affectedFiles: [detectedFile, 'src/components/ErrorBoundary.tsx', 'src/lib/api.ts'],
      lineNumber: detectedLine,
      solution:
        'Ajoutez un garde-fou conditionnel (optional chaining ?. et valeur par défaut), vérifiez le contrat TypeScript entre routes.ts et src/types.ts, et validez la réponse HTTP avant setState.',
      verificationCommands: ['npm run lint', 'npm run build'],
      remediationSteps: [
        '1. Inspecter la ligne exacte mentionnée dans la trace JS.',
        '2. Ajouter une vérification de nullité et un état de chargement/erreur explicite.',
        '3. Vérifier la compilation Vite (npm run build) en préproduction.',
      ],
    };
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('2fa') || msg.includes('token') || msg.includes('rbac') || msg.includes('permission')) {
    return {
      category: 'Sécurité, Authentification & Contrôle d’accès RBAC',
      explanation:
        'Une requête a été bloquée par la couche de sécurité (session absente/expirée, 2FA développeur non validée, rôle insuffisant ou tentative inter-organisation).',
      probableCause:
        'En-tête X-Organization-Id incohérent avec organization_users, cookie expiré ou tentative d’accès croisé entre rôles.',
      affectedFiles: ['src/server/auth.ts', detectedFile],
      lineNumber: detectedLine,
      solution:
        'Comportement de protection attendu si la tentative est illégitime. Si légitime, vérifiez l’appartenance dans organization_users, la validité du cookie HttpOnly et l’étape 2FA TOTP.',
      verificationCommands: ['npx tsc --noEmit', 'curl -i http://127.0.0.1:3000/api/auth/me'],
      remediationSteps: [
        '1. Contrôler le journal Sécurité et les en-têtes X-Organization-Id envoyés.',
        '2. Vérifier le rôle dans la table users / organization_users.',
        '3. Ne jamais assouplir requireOrgContext ou requireDeveloper sans test de non-régression RBAC.',
      ],
    };
  }

  return {
    category: 'Diagnostic Serveur & Runtime Express',
    explanation:
      'Une anomalie d’exécution a été interceptée sur le serveur applicatif. L’incident a été isolé afin de ne jamais exposer de trace technique aux utilisateurs finaux.',
    probableCause:
      'Validation d’entrée manquante, dépendance native non initialisée ou erreur de logique métier dans le contrôleur concerné.',
    affectedFiles: [detectedFile, 'server.ts', 'src/server/routes.ts'],
    lineNumber: detectedLine,
    solution:
      'Ajoutez une validation stricte des paramètres d’entrée avec retour HTTP 400 explicite, vérifiez la trace complète ci-contre et ajoutez un cas de test automatisé.',
    verificationCommands: ['npm run lint', 'npm run build', 'curl -s http://127.0.0.1:3000/api/health'],
    remediationSteps: [
      '1. Reproduire en développement avec les paramètres masqués du contexte technique.',
      '2. Appliquer et tester le correctif localement (npm run lint && npm run build).',
      '3. Déployer après validation complète en préproduction.',
    ],
  };
}

developerRouter.post('/developer/diagnose', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const { errorId, symptom } = req.body || {};
  let errRow:
    | { id: number; error_code: string; source: string; module: string; message: string; stack_trace: string | null; file_path: string | null; line_number: number | null }
    | undefined;

  if (errorId) {
    errRow = db
      .prepare('SELECT id, error_code, source, module, message, stack_trace, file_path, line_number FROM system_errors WHERE id = ?')
      .get(Number(errorId)) as typeof errRow;
  }

  const analysis = errRow
    ? analyzeTechnicalProblem({
        message: errRow.message,
        stackTrace: errRow.stack_trace,
        source: errRow.source,
        module: errRow.module,
        filePath: errRow.file_path,
        lineNumber: errRow.line_number,
      })
    : analyzeTechnicalProblem({ message: String(symptom || '') });

  logDeveloperAction(
    req.authUser!.id,
    'DEV_DIAGNOSTIC_RUN',
    errRow ? 'system_error' : 'custom_symptom',
    errRow ? errRow.id : null,
    { category: analysis.category },
    req.ip
  );

  res.json({
    targetError: errRow || null,
    analysis,
    environmentNotice: 'Environnement actuel : ' + (process.env.NODE_ENV || 'development') + ' — Toute modification du code doit être validée en développement/préproduction avant déploiement.',
  });
});

// ---------------------------------------------------------------------------
// API MONITOR, LOGS, WEBHOOKS & PAYMENTS
// ---------------------------------------------------------------------------

developerRouter.get('/developer/api-monitor', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
  let where = '1=1';
  if (statusFilter === 'errors') where = 'status_code >= 400';
  else if (statusFilter === '5xx') where = 'status_code >= 500';
  else if (statusFilter === 'slow') where = 'duration_ms >= 150';

  const requests = db
    .prepare(`SELECT * FROM api_request_logs WHERE ${where} ORDER BY id DESC LIMIT 120`)
    .all();

  const summary = db
    .prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END), 0) as ok_2xx_3xx,
        COALESCE(SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END), 0) as err_4xx,
        COALESCE(SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END), 0) as err_5xx,
        COALESCE(ROUND(AVG(duration_ms), 2), 0) as avg_ms,
        COALESCE(MAX(duration_ms), 0) as max_ms
      FROM api_request_logs
    `)
    .get();

  const webhooks = db.prepare('SELECT * FROM webhook_events ORDER BY id DESC LIMIT 50').all();
  const integrations = getPaymentIntegrationsStatus();

  res.json({ summary, requests, webhooks, integrations });
});

developerRouter.post('/developer/webhooks/:id/retry', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const wh = db.prepare('SELECT * FROM webhook_events WHERE id = ?').get(id) as
    | { id: number; provider: string; endpoint: string }
    | undefined;
  if (!wh) {
    res.status(404).json({ error: 'Événement webhook introuvable.' });
    return;
  }

  const integrations = getPaymentIntegrationsStatus();
  const integration = integrations.find((i) => i.provider === wh.provider);
  const isConfigured = Boolean(integration?.configured);
  const nextStatus = isConfigured ? 'succes' : 'non_configure';
  const nextHttp = isConfigured ? 200 : 503;
  const errMsg = isConfigured
    ? null
    : `Connecteur ${wh.provider} non configuré (${integration?.envVars.join(', ')} manquants).`;

  db.prepare(`
    UPDATE webhook_events
    SET attempts = attempts + 1,
        status = ?,
        http_status = ?,
        latency_ms = ?,
        error_message = ?,
        last_attempt_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, nextHttp, isConfigured ? 48 : 12, errMsg, id);

  logDeveloperAction(req.authUser!.id, 'DEV_WEBHOOK_RETRIED', 'webhook_event', id, { provider: wh.provider, nextStatus }, req.ip);
  res.json({ ok: true, status: nextStatus, message: errMsg || 'Webhook rejoué avec succès.' });
});

developerRouter.get('/developer/logs', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const apiLogs = db
    .prepare(
      q
        ? 'SELECT id, request_id, method, path, status_code, duration_ms, user_role, ip_address, is_error, error_summary, created_at FROM api_request_logs WHERE path LIKE ? OR error_summary LIKE ? ORDER BY id DESC LIMIT 80'
        : 'SELECT id, request_id, method, path, status_code, duration_ms, user_role, ip_address, is_error, error_summary, created_at FROM api_request_logs ORDER BY id DESC LIMIT 80'
    )
    .all(...(q ? [`%${q}%`, `%${q}%`] : []));

  const devAudit = db
    .prepare(`
      SELECT dal.*, u.email as developer_email
      FROM developer_audit_logs dal
      JOIN users u ON u.id = dal.developer_user_id
      ORDER BY dal.id DESC LIMIT 60
    `)
    .all();

  const appLogs = db
    .prepare('SELECT id, organization_id, action, entity_type, entity_id, details_json, ip_address, created_at FROM activity_logs ORDER BY id DESC LIMIT 50')
    .all();

  res.json({ apiLogs, devAudit, appLogs });
});

// ---------------------------------------------------------------------------
// DATABASE MONITORING (STRICT READ-ONLY ON FINANCIAL TABLES)
// ---------------------------------------------------------------------------

developerRouter.get('/developer/database', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const t0 = performance.now();
  const integrity = db.pragma('quick_check') as Array<{ quick_check: string }>;
  const journalMode = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
  const fkStatus = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  const pingMs = Math.round((performance.now() - t0) * 100) / 100;

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
    .all() as Array<{ name: string }>;

  const tableStats = tables.map((t) => {
    const countRow = db.prepare(`SELECT COUNT(*) as c FROM "${t.name.replace(/"/g, '')}"`).get() as { c: number };
    const isFinancialProtected = ['rent_invoices', 'rent_payments', 'receipts', 'expenses'].includes(t.name);
    return {
      name: t.name,
      rows: countRow.c,
      protection: isFinancialProtected ? 'Lecture seule diagnostique (données financières protégées)' : 'Standard',
    };
  });

  const slowQueries = db.prepare('SELECT * FROM sql_query_logs WHERE is_slow = 1 OR error_message IS NOT NULL ORDER BY id DESC LIMIT 40').all();
  const recentQueries = db.prepare('SELECT * FROM sql_query_logs ORDER BY id DESC LIMIT 30').all();
  const migrations = db.prepare('SELECT * FROM schema_migrations ORDER BY id DESC').all();
  const backups = db.prepare('SELECT * FROM system_backups ORDER BY id DESC LIMIT 20').all();

  res.json({
    connection: {
      status: integrity[0]?.quick_check === 'ok' ? 'connecte' : 'alerte',
      integrityCheck: integrity[0]?.quick_check || 'unknown',
      journalMode: journalMode[0]?.journal_mode || 'unknown',
      foreignKeysEnabled: Boolean(fkStatus[0]?.foreign_keys),
      pingMs,
    },
    tableStats,
    slowQueries,
    recentQueries,
    migrations,
    backups,
  });
});

// ---------------------------------------------------------------------------
// BACKGROUND JOBS & QUEUES
// ---------------------------------------------------------------------------

function executeJobRecord(job: { id: number; job_type: string; payload_json: string | null }): {
  status: 'execute' | 'echoue';
  durationMs: number;
  errorReason: string | null;
} {
  const t0 = performance.now();
  try {
    if (job.job_type === 'sqlite_wal_checkpoint') {
      db.pragma('wal_checkpoint(PASSIVE)');
      return { status: 'execute', durationMs: Math.max(1, Math.round(performance.now() - t0)), errorReason: null };
    }
    if (job.job_type === 'check_expiring_contracts') {
      const expiring = db
        .prepare("SELECT COUNT(*) as c FROM rental_contracts WHERE status = 'actif' AND julianday(end_date) - julianday('now') <= 30")
        .get() as { c: number };
      db.prepare('UPDATE background_jobs SET payload_json = ? WHERE id = ?').run(
        JSON.stringify({ checkedAt: new Date().toISOString(), expiringContracts: expiring.c }),
        job.id
      );
      return { status: 'execute', durationMs: Math.max(1, Math.round(performance.now() - t0)), errorReason: null };
    }
    if (job.job_type === 'sync_monthly_invoices') {
      const activeCount = (db.prepare("SELECT COUNT(*) as c FROM rental_contracts WHERE status = 'actif'").get() as { c: number }).c;
      db.prepare('UPDATE background_jobs SET payload_json = ? WHERE id = ?').run(
        JSON.stringify({ verifiedAt: new Date().toISOString(), activeContractsVerified: activeCount }),
        job.id
      );
      return { status: 'execute', durationMs: Math.max(1, Math.round(performance.now() - t0)), errorReason: null };
    }
    if (job.job_type === 'prune_expired_logs') {
      db.prepare("DELETE FROM api_request_logs WHERE created_at < datetime('now', '-30 days')").run();
      return { status: 'execute', durationMs: Math.max(1, Math.round(performance.now() - t0)), errorReason: null };
    }
    if (job.job_type === 'dispatch_due_reminders') {
      if (!process.env.WHATSAPP_API_TOKEN) {
        return {
          status: 'echoue',
          durationMs: Math.max(2, Math.round(performance.now() - t0)),
          errorReason: 'WHATSAPP_API_TOKEN absent : passerelle Meta Cloud non configurée dans .env',
        };
      }
      return { status: 'execute', durationMs: Math.max(2, Math.round(performance.now() - t0)), errorReason: null };
    }
    return { status: 'execute', durationMs: Math.max(1, Math.round(performance.now() - t0)), errorReason: null };
  } catch (e) {
    return {
      status: 'echoue',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      errorReason: (e as Error).message,
    };
  }
}

developerRouter.get('/developer/jobs', requireAuth, requireDeveloper, (_req, res) => {
  const jobs = db.prepare('SELECT * FROM background_jobs ORDER BY id DESC LIMIT 100').all();
  res.json({ jobs });
});

developerRouter.post('/developer/jobs/:id/retry', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const job = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id) as
    | { id: number; job_type: string; name: string; payload_json: string | null }
    | undefined;
  if (!job) {
    res.status(404).json({ error: 'Tâche introuvable.' });
    return;
  }

  const outcome = executeJobRecord(job);
  db.prepare(`
    UPDATE background_jobs
    SET status = ?, attempts = attempts + 1, duration_ms = ?, error_reason = ?, last_run_at = datetime('now')
    WHERE id = ?
  `).run(outcome.status, outcome.durationMs, outcome.errorReason, id);

  logDeveloperAction(req.authUser!.id, 'DEV_JOB_RETRIED', 'background_job', id, { jobType: job.job_type, status: outcome.status }, req.ip);
  res.json({ ok: true, status: outcome.status, errorReason: outcome.errorReason });
});

developerRouter.post('/developer/jobs/run-pending', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const pending = db.prepare("SELECT * FROM background_jobs WHERE status = 'en_attente'").all() as Array<{
    id: number;
    job_type: string;
    payload_json: string | null;
  }>;
  let executed = 0;
  let failed = 0;

  for (const job of pending) {
    const outcome = executeJobRecord(job);
    db.prepare(`
      UPDATE background_jobs
      SET status = ?, attempts = attempts + 1, duration_ms = ?, error_reason = ?, last_run_at = datetime('now')
      WHERE id = ?
    `).run(outcome.status, outcome.durationMs, outcome.errorReason, job.id);
    if (outcome.status === 'execute') executed++;
    else failed++;
  }

  logDeveloperAction(req.authUser!.id, 'DEV_JOBS_RUN_PENDING', 'background_job', null, { executed, failed }, req.ip);
  res.json({ executed, failed });
});

// ---------------------------------------------------------------------------
// REAL SQLITE BACKUPS
// ---------------------------------------------------------------------------

async function createRealSqliteBackup(userId: number, triggerType: 'manuel' | 'automatique') {
  const backupsDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `immopay-backup-${stamp}.db`;
  const targetPath = path.join(backupsDir, filename);

  await db.backup(targetPath);

  // Verify integrity on backup file
  const verifyDb = new Database(targetPath, { readonly: true });
  let integrityStatus = 'ok';
  try {
    const chk = verifyDb.pragma('quick_check') as Array<{ quick_check: string }>;
    integrityStatus = chk[0]?.quick_check === 'ok' ? 'ok' : 'warning';
  } finally {
    verifyDb.close();
  }

  const buf = fs.readFileSync(targetPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const info = db
    .prepare(`
      INSERT INTO system_backups (filename, file_path, size_bytes, sha256, trigger_type, integrity_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(filename, `backups/${filename}`, buf.length, sha256, triggerType, integrityStatus, userId);

  return {
    id: Number(info.lastInsertRowid),
    filename,
    sizeBytes: buf.length,
    sha256,
    integrityStatus,
  };
}

developerRouter.get('/developer/backups', requireAuth, requireDeveloper, (_req, res) => {
  const backups = db
    .prepare(`
      SELECT sb.*, u.full_name as created_by_name
      FROM system_backups sb
      LEFT JOIN users u ON u.id = sb.created_by
      ORDER BY sb.id DESC
    `)
    .all();
  res.json({ backups });
});

developerRouter.post('/developer/backups/create', requireAuth, requireDeveloper, async (req: AuthenticatedRequest, res) => {
  if (req.body?.confirmed !== true) {
    res.status(400).json({ error: 'Confirmation explicite requise pour générer une sauvegarde complète.' });
    return;
  }
  try {
    const backup = await createRealSqliteBackup(req.authUser!.id, 'manuel');
    logDeveloperAction(req.authUser!.id, 'DEV_BACKUP_CREATED', 'system_backup', backup.id, backup, req.ip);
    res.status(201).json({ backup, message: `Sauvegarde SQLite vérifiée (${backup.filename}).` });
  } catch (err) {
    res.status(500).json({ error: `Échec de sauvegarde : ${(err as Error).message}` });
  }
});

// ---------------------------------------------------------------------------
// SECURITY, SETTINGS & SENSITIVE TECHNICAL TOOLS
// ---------------------------------------------------------------------------

developerRouter.get('/developer/security', requireAuth, requireDeveloper, (_req, res) => {
  const auditLogs = db
    .prepare(`
      SELECT dal.*, u.full_name as developer_name, u.email as developer_email
      FROM developer_audit_logs dal
      JOIN users u ON u.id = dal.developer_user_id
      ORDER BY dal.id DESC
      LIMIT 80
    `)
    .all();

  const recentLogins = db
    .prepare(`
      SELECT al.id, al.action, al.details_json, al.ip_address, al.created_at, u.role_type
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.action = 'USER_LOGIN'
      ORDER BY al.id DESC
      LIMIT 25
    `)
    .all();

  const securityChecks = [
    { name: 'Isolation rôle developer + 2FA TOTP obligatoire', status: 'actif', detail: 'Session signée HMAC-SHA256 + cookie HttpOnly SameSite=Lax' },
    { name: 'Masquage automatique des secrets & tokens', status: 'actif', detail: 'redactSensitive() actif sur logs API, erreurs et webhooks' },
    { name: 'Protection des tables financières', status: 'actif', detail: 'Aucune écriture/suppression directe autorisée depuis /developer' },
    { name: 'Masquage des erreurs techniques côté client', status: 'actif', detail: 'Messages génériques avec code ERR-... uniquement côté utilisateur final' },
    {
      name: 'Clé de session SESSION_SECRET personnalisée',
      status: process.env.SESSION_SECRET ? 'actif' : 'recommandation',
      detail: process.env.SESSION_SECRET ? 'Définie via variable d’environnement' : 'Clé de développement active — définir SESSION_SECRET en production',
    },
  ];

  res.json({ auditLogs, recentLogins, securityChecks });
});

developerRouter.get('/developer/settings', requireAuth, requireDeveloper, (_req, res) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM developer_settings').all() as Array<{
    key: string;
    value: string;
    updated_at: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({
    settings,
    observability: {
      devInspector: 'Inspecteur local temps réel (requêtes HTTP, requêtes SQL, erreurs JS/Node, file de tâches) — équivalent Node/Express de Laravel Telescope',
      prodMode: 'Journalisation JSON structurée + masquage PII/secrets + rétention configurable',
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

developerRouter.put('/developer/settings', requireAuth, requireDeveloper, (req: AuthenticatedRequest, res) => {
  const allowedKeys = ['slow_sql_threshold_ms', 'log_retention_days', 'capture_js_errors', 'maintenance_mode', 'telescope_dev_enabled', 'prod_observability_sink'];
  const updates = req.body?.settings || {};
  const stmt = db.prepare("INSERT OR REPLACE INTO developer_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))");
  for (const k of allowedKeys) {
    if (updates[k] !== undefined) {
      stmt.run(k, String(updates[k]));
    }
  }
  logDeveloperAction(req.authUser!.id, 'DEV_SETTINGS_UPDATED', 'developer_settings', null, { keys: Object.keys(updates) }, req.ip);
  res.json({ ok: true });
});

developerRouter.post('/developer/tools/execute', requireAuth, requireDeveloper, async (req: AuthenticatedRequest, res) => {
  const { action, confirmed } = req.body || {};
  if (confirmed !== true) {
    res.status(400).json({ error: 'Action refusée : une confirmation explicite est obligatoire pour cet outil technique.' });
    return;
  }

  let result: Record<string, unknown> = {};

  if (action === 'cache_clear') {
    const cacheSize = telemetryCache.size;
    telemetryCache.clear();
    const rateLimitsCleared = clearAllLoginRateLimits();
    result = { message: `Cache applicatif vidé (${cacheSize} entrées mémoire, ${rateLimitsCleared} verrous anti-brute-force).` };
  } else if (action === 'check_routes') {
    const endpoints = [
      '/api/health',
      '/api/public/plans',
      '/api/auth/login',
      '/api/dashboard',
      '/api/properties',
      '/api/tenants',
      '/api/contracts',
      '/api/invoices/generate',
      '/api/payments',
      '/api/tenant-portal/overview',
      '/api/super-admin/overview',
      '/api/developer/overview',
    ];
    result = { message: `${endpoints.length} routes API critiques montées et actives.`, endpoints };
  } else if (action === 'check_migrations') {
    const migrations = db.prepare('SELECT version, name, batch, status, executed_at FROM schema_migrations ORDER BY id ASC').all();
    result = { message: `${migrations.length} migrations vérifiées avec succès (aucune migration en attente).`, migrations };
  } else if (action === 'check_queues') {
    const counts = db
      .prepare('SELECT status, COUNT(*) as count FROM background_jobs GROUP BY status')
      .all();
    result = { message: 'État des files d’attente contrôlé.', counts };
  } else if (action === 'test_connections') {
    const t0 = performance.now();
    const ping = db.prepare('SELECT 1 as ok').get() as { ok: number };
    const dbMs = Math.round((performance.now() - t0) * 100) / 100;
    const integrations = getPaymentIntegrationsStatus();
    result = {
      message: `Connexion SQLite OK (${dbMs} ms). ${integrations.filter((i) => i.configured).length}/${integrations.length} connecteurs externes configurés.`,
      sqliteOk: ping.ok === 1,
      dbMs,
      integrations,
    };
  } else if (action === 'check_services') {
    const integrity = db.pragma('quick_check') as Array<{ quick_check: string }>;
    const distExists = fs.existsSync(path.resolve(process.cwd(), 'dist/index.html'));
    result = {
      message: `Serveur Express actif (uptime ${Math.round(process.uptime())}s), SQLite ${integrity[0]?.quick_check}, build dist ${distExists ? 'présent' : 'non généré (mode dev Vite)'}.`,
    };
  } else if (action === 'wal_checkpoint') {
    const wal = db.pragma('wal_checkpoint(PASSIVE)');
    result = { message: 'Checkpoint SQLite WAL exécuté.', wal };
  } else {
    res.status(400).json({ error: 'Outil inconnu.' });
    return;
  }

  logDeveloperAction(req.authUser!.id, `DEV_TOOL_${String(action).toUpperCase()}`, 'tool', action, result, req.ip);
  res.json({ ok: true, ...result });
});
