import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db';
import { scrub2faMasterSecretFromText } from './twoFactor';

const SESSION_SECRET = process.env.SESSION_SECRET || 'immopay-ci-dev-session-secret-change-in-prod';
export const SESSION_COOKIE_NAME = 'immopay_session';

export type UserRoleType = 'super_admin' | 'org_user' | 'tenant' | 'developer';

export interface SessionPayload {
  userId: number;
  roleType: UserRoleType;
  twoFactorVerified?: boolean;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: {
    id: number;
    full_name: string;
    email: string;
    phone: string | null;
    role_type: UserRoleType;
  };
  twoFactorVerified?: boolean;
  orgId?: number;
  orgRoleCode?: string;
  orgPermissions?: string[];
}

export function signSessionToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sensitive Data Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERN =
  /(pass(word|phrase)?|secret|token|cookie|authorization|api[_-]?key|signature|otpauth|otp|totp|recovery[_-]?code|backup[_-]?code|manual[_-]?key|qr[_-]?data|private[_-]?key|cvv|iban|card[_-]?number|session|hash)/i;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[PROFONDEUR_MAX]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const scrubbed = scrub2faMasterSecretFromText(value);
    return scrubbed
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***MASQUÉ***')
      .replace(/immopay_session=[^;\s]+/gi, 'immopay_session=***MASQUÉ***')
      .replace(/otpauth:\/\/totp\/[^\s"']+/gi, 'otpauth://totp/***MASQUÉ***');
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactSensitive(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '***MASQUÉ***';
      } else {
        out[k] = redactSensitive(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

// Simple in-memory login rate limiter (brute-force protection)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return { allowed: true };
  }
  if (entry.count >= 15) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

export function clearLoginRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

export function clearAllLoginRateLimits(): number {
  const size = loginAttempts.size;
  loginAttempts.clear();
  return size;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
    return;
  }
  const user = db
    .prepare('SELECT id, full_name, email, phone, role_type, is_active FROM users WHERE id = ?')
    .get(session.userId) as
    | { id: number; full_name: string; email: string; phone: string | null; role_type: UserRoleType; is_active: number }
    | undefined;

  if (!user || !user.is_active) {
    res.status(401).json({ error: 'Compte utilisateur introuvable ou désactivé.' });
    return;
  }
  req.authUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role_type: user.role_type,
  };
  req.twoFactorVerified = Boolean(session.twoFactorVerified);
  next();
}

export function requireOrgContext(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  if (req.authUser.role_type !== 'org_user') {
    res.status(403).json({ error: 'Accès réservé aux gestionnaires et administrateurs d’organisation.' });
    return;
  }
  const requestedOrgHeader = req.headers['x-organization-id'];
  const requestedOrgId = requestedOrgHeader ? Number(requestedOrgHeader) : null;

  let membership:
    | { organization_id: number; role_code: string; permissions_json: string; org_status: string }
    | undefined;

  if (requestedOrgId && Number.isInteger(requestedOrgId)) {
    membership = db
      .prepare(`
        SELECT ou.organization_id, r.code as role_code, r.permissions_json, o.status as org_status
        FROM organization_users ou
        JOIN roles r ON r.id = ou.role_id
        JOIN organizations o ON o.id = ou.organization_id
        WHERE ou.user_id = ? AND ou.organization_id = ?
      `)
      .get(req.authUser.id, requestedOrgId) as typeof membership;
  } else {
    membership = db
      .prepare(`
        SELECT ou.organization_id, r.code as role_code, r.permissions_json, o.status as org_status
        FROM organization_users ou
        JOIN roles r ON r.id = ou.role_id
        JOIN organizations o ON o.id = ou.organization_id
        WHERE ou.user_id = ?
        ORDER BY ou.is_default DESC, ou.id ASC
        LIMIT 1
      `)
      .get(req.authUser.id) as typeof membership;
  }

  if (!membership) {
    res.status(403).json({ error: 'Accès refusé : vous n’appartenez pas à cette organisation.' });
    return;
  }

  if (membership.org_status === 'suspended') {
    res.status(403).json({ error: 'Ce compte organisation est temporairement suspendu. Contactez le support IMMOPAY CI.' });
    return;
  }

  req.orgId = membership.organization_id;
  req.orgRoleCode = membership.role_code;
  try {
    req.orgPermissions = JSON.parse(membership.permissions_json) as string[];
  } catch {
    req.orgPermissions = [];
  }
  next();
}

export function hasPermission(req: AuthenticatedRequest, perm: string): boolean {
  const perms = req.orgPermissions || [];
  if (perms.includes('*')) return true;
  if (perms.includes(perm)) return true;
  const prefix = perm.split('.')[0];
  return perms.includes(`${prefix}.*`);
}

export function requirePermission(perm: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!hasPermission(req, perm)) {
      res.status(403).json({ error: 'Permissions insuffisantes pour effectuer cette action.' });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role_type !== 'super_admin') {
    res.status(403).json({ error: 'Accès strictement réservé à la direction IMMOPAY CI.' });
    return;
  }
  if (!req.twoFactorVerified) {
    res.status(403).json({
      error: 'Authentification à deux facteurs (2FA) requise pour accéder à l’administration IMMOPAY CI.',
      requires2FA: true,
    });
    return;
  }
  next();
}

export function requireDeveloper(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role_type !== 'developer') {
    res.status(403).json({ error: 'Accès strictement refusé. Interface réservée exclusivement au rôle développeur.' });
    return;
  }
  if (!req.twoFactorVerified) {
    res.status(403).json({
      error: 'Authentification à deux facteurs (2FA) requise pour accéder à la Console Développeur.',
      requires2FA: true,
    });
    return;
  }
  next();
}

export function logActivity(
  orgId: number | null,
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown>,
  ip?: string
): void {
  db.prepare(`
    INSERT INTO activity_logs (organization_id, user_id, action, entity_type, entity_id, details_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orgId, userId, action, entityType, entityId, JSON.stringify(redactSensitive(details)), ip || null);
}

export function logDeveloperAction(
  developerUserId: number,
  action: string,
  targetType: string,
  targetId: string | number | null,
  details: Record<string, unknown>,
  ip?: string
): void {
  try {
    db.prepare(`
      INSERT INTO developer_audit_logs (developer_user_id, action, target_type, target_id, details_json, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      developerUserId,
      action,
      targetType,
      targetId !== null && targetId !== undefined ? String(targetId) : null,
      JSON.stringify(redactSensitive(details)),
      ip || null
    );
  } catch {
    // Audit logging must not crash request pipeline if DB is resetting
  }
}
