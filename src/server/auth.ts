import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db';

const SESSION_SECRET = process.env.SESSION_SECRET || 'immopay-ci-dev-session-secret-change-in-prod';
export const SESSION_COOKIE_NAME = 'immopay_session';

export interface SessionPayload {
  userId: number;
  roleType: 'super_admin' | 'org_user' | 'tenant';
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: {
    id: number;
    full_name: string;
    email: string;
    phone: string | null;
    role_type: 'super_admin' | 'org_user' | 'tenant';
  };
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
    | { id: number; full_name: string; email: string; phone: string | null; role_type: 'super_admin' | 'org_user' | 'tenant'; is_active: number }
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
  `).run(orgId, userId, action, entityType, entityId, JSON.stringify(details), ip || null);
}
