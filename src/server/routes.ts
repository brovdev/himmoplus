import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import express, { type Response } from 'express';
import {
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  checkLoginRateLimit,
  clearLoginRateLimit,
  logActivity,
  requireAuth,
  requireOrgContext,
  requirePermission,
  requireSuperAdmin,
  signSessionToken,
} from './auth';
import { db, seedDefaultTemplates } from './db';

export const apiRouter = express.Router();

function getOrgSubscriptionLimits(orgId: number) {
  return db
    .prepare(`
      SELECT s.*, sp.code as plan_code, sp.name as plan_name, sp.max_properties, sp.max_tenants, sp.max_users,
             sp.price_monthly_xof, sp.price_annual_xof, sp.features_json
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.organization_id = ?
      ORDER BY s.id DESC
      LIMIT 1
    `)
    .get(orgId) as
    | {
        id: number;
        organization_id: number;
        plan_id: number;
        plan_code: string;
        plan_name: string;
        billing_cycle: string;
        status: string;
        trial_ends_at: string | null;
        current_period_start: string;
        current_period_end: string;
        auto_renew: number;
        max_properties: number;
        max_tenants: number;
        max_users: number;
        price_monthly_xof: number;
        price_annual_xof: number;
        features_json: string;
      }
    | undefined;
}

function buildAuthPayload(userId: number, twoFactorVerified = false) {
  const user = db
    .prepare('SELECT id, full_name, email, phone, role_type FROM users WHERE id = ?')
    .get(userId) as
    | { id: number; full_name: string; email: string; phone: string | null; role_type: 'super_admin' | 'org_user' | 'tenant' | 'developer' }
    | undefined;
  if (!user) return null;

  const organizations = db
    .prepare(`
      SELECT o.id, o.name, o.slug, o.org_type, o.email, o.phone, o.address, o.city, o.rccm, o.stamp_text, o.status,
             r.code as role_code, r.name as role_name, ou.is_default
      FROM organization_users ou
      JOIN organizations o ON o.id = ou.organization_id
      JOIN roles r ON r.id = ou.role_id
      WHERE ou.user_id = ?
      ORDER BY ou.is_default DESC, o.id ASC
    `)
    .all(userId);

  return { user, organizations, twoFactorVerified };
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
// PUBLIC ENDPOINTS
// ---------------------------------------------------------------------------

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'immopay-ci' });
});

apiRouter.get('/public/plans', (_req, res) => {
  const plans = db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_monthly_xof ASC').all();
  res.json({ plans });
});

apiRouter.post('/public/demo-request', (req, res) => {
  const { fullName, company, email, phone, propertiesCount, message } = req.body || {};
  if (!fullName || !email || !phone) {
    res.status(400).json({ error: 'Veuillez renseigner votre nom, adresse e-mail et numéro de téléphone.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO demo_requests (full_name, company, email, phone, properties_count, message) VALUES (?, ?, ?, ?, ?, ?)')
    .run(String(fullName).trim(), company || null, String(email).trim(), String(phone).trim(), propertiesCount || null, message || null);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Votre demande de démonstration a bien été enregistrée. Un conseiller IMMOPAY CI vous contactera sous 24h ouvrées.' });
});

apiRouter.get('/verify-receipt/:token', (req, res) => {
  const rec = db
    .prepare(`
      SELECT r.receipt_number, r.issued_at, r.balance_remaining_xof,
             p.amount_xof, p.payment_method, p.payment_date, p.reference as payment_ref,
             o.name as organization_name, o.rccm,
             pr.name as property_name, pr.commune,
             i.period_label
      FROM receipts r
      JOIN rent_payments p ON p.id = r.payment_id
      JOIN organizations o ON o.id = r.organization_id
      JOIN properties pr ON pr.id = p.property_id
      JOIN rent_invoices i ON i.id = r.invoice_id
      WHERE r.verification_token = ?
    `)
    .get(req.params.token);
  if (!rec) {
    res.status(404).json({ valid: false, error: 'Quittance introuvable ou jeton invalide.' });
    return;
  }
  res.json({ valid: true, receipt: rec });
});

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------

apiRouter.post('/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const limit = checkLoginRateLimit(ip);
  if (!limit.allowed) {
    res.status(429).json({ error: `Trop de tentatives de connexion. Réessayez dans ${limit.retryAfterSec} secondes.` });
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'E-mail et mot de passe requis.' });
    return;
  }

  const user = db
    .prepare('SELECT id, email, password_hash, role_type, is_active FROM users WHERE lower(email) = lower(?)')
    .get(String(email).trim()) as
    | { id: number; email: string; password_hash: string; role_type: 'super_admin' | 'org_user' | 'tenant' | 'developer'; is_active: number }
    | undefined;

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    res.status(401).json({ error: 'Identifiants incorrects.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Ce compte est désactivé.' });
    return;
  }

  clearLoginRateLimit(ip);
  const token = signSessionToken({
    userId: user.id,
    roleType: user.role_type,
    twoFactorVerified: user.role_type !== 'developer',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  setSessionCookie(res, token);

  const payload = buildAuthPayload(user.id, user.role_type !== 'developer');
  logActivity(null, user.id, 'USER_LOGIN', 'user', user.id, { email: user.email, roleType: user.role_type }, ip);
  res.json(payload);
});

apiRouter.post('/auth/register', (req, res) => {
  const { fullName, email, phone, password, organizationName, orgType, city } = req.body || {};
  if (!fullName || !email || !password || !organizationName) {
    res.status(400).json({ error: 'Nom complet, e-mail, mot de passe et nom de l’organisation sont obligatoires.' });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (exists) {
    res.status(409).json({ error: 'Un compte existe déjà avec cette adresse e-mail.' });
    return;
  }

  const hash = bcrypt.hashSync(String(password), 10);
  const slugBase = String(organizationName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'org';
  const slug = `${slugBase}-${crypto.randomBytes(2).toString('hex')}`;

  const createAccount = db.transaction(() => {
    const userId = db
      .prepare('INSERT INTO users (full_name, email, phone, password_hash, role_type) VALUES (?, ?, ?, ?, ?)')
      .run(String(fullName).trim(), normalizedEmail, phone ? String(phone).trim() : null, hash, 'org_user')
      .lastInsertRowid as number;

    const orgId = db
      .prepare(`
        INSERT INTO organizations (name, slug, org_type, email, phone, city, stamp_text, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'trial')
      `)
      .run(
        String(organizationName).trim(),
        slug,
        orgType === 'agency' || orgType === 'promoter' ? orgType : 'owner',
        normalizedEmail,
        phone ? String(phone).trim() : null,
        city || 'Abidjan',
        String(organizationName).trim().toUpperCase()
      ).lastInsertRowid as number;

    const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin_client'").get() as { id: number };
    db.prepare('INSERT INTO organization_users (organization_id, user_id, role_id, is_default) VALUES (?, ?, ?, 1)').run(
      orgId,
      userId,
      adminRole.id
    );

    const proPlan = db.prepare("SELECT id FROM subscription_plans WHERE code = 'pro'").get() as { id: number };
    db.prepare(`
      INSERT INTO subscriptions (organization_id, plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, auto_renew)
      VALUES (?, ?, 'monthly', 'trial', date('now', '+14 days'), date('now'), date('now', '+14 days'), 0)
    `).run(orgId, proPlan.id);

    seedDefaultTemplates(orgId);
    logActivity(orgId, userId, 'ORG_REGISTERED', 'organization', orgId, { organizationName }, req.ip);
    return userId;
  });

  const userId = createAccount();
  const token = signSessionToken({
    userId,
    roleType: 'org_user',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  setSessionCookie(res, token);
  res.status(201).json(buildAuthPayload(userId));
});

apiRouter.post('/auth/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Adresse e-mail requise.' });
    return;
  }
  res.json({
    message:
      'Si un compte correspond à cette adresse e-mail, les instructions de réinitialisation ont été enregistrées (configuration SMTP requise en production).',
  });
});

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const payload = buildAuthPayload(req.authUser!.id, Boolean(req.twoFactorVerified));
  res.json(payload);
});

// ---------------------------------------------------------------------------
// ORG-SCOPED ROUTES (MULTI-TENANT ISOLATION ENFORCED)
// ---------------------------------------------------------------------------

apiRouter.get('/dashboard', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const period = typeof req.query.period === 'string' && /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : '2026-11';

  const propStats = db
    .prepare(`
      SELECT
        COUNT(*) as total_properties,
        SUM(CASE WHEN status = 'occupe' THEN 1 ELSE 0 END) as occupied_units,
        SUM(CASE WHEN status = 'disponible' THEN 1 ELSE 0 END) as available_units,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_units
      FROM properties
      WHERE organization_id = ? AND deleted_at IS NULL
    `)
    .get(orgId) as { total_properties: number; occupied_units: number; available_units: number; maintenance_units: number };

  const activeTenants = (
    db.prepare("SELECT COUNT(*) as c FROM tenants WHERE organization_id = ? AND status = 'actif' AND deleted_at IS NULL").get(orgId) as { c: number }
  ).c;

  const activeContracts = (
    db.prepare("SELECT COUNT(*) as c FROM rental_contracts WHERE organization_id = ? AND status = 'actif'").get(orgId) as { c: number }
  ).c;

  const periodFin = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'annule' THEN amount_due_xof + penalty_xof - discount_xof ELSE 0 END), 0) as expected_xof,
        COALESCE(SUM(amount_paid_xof), 0) as collected_xof,
        COALESCE(SUM(CASE WHEN status IN ('en_retard', 'partiel', 'en_attente') THEN MAX(0, amount_due_xof + penalty_xof - discount_xof - amount_paid_xof) ELSE 0 END), 0) as unpaid_xof,
        COALESCE(SUM(CASE WHEN status = 'en_retard' THEN 1 ELSE 0 END), 0) as overdue_count
      FROM rent_invoices
      WHERE organization_id = ? AND period_label = ?
    `)
    .get(orgId, period) as { expected_xof: number; collected_xof: number; unpaid_xof: number; overdue_count: number };

  const monthExpenses = (
    db
      .prepare(`
        SELECT COALESCE(SUM(amount_xof), 0) as total
        FROM expenses
        WHERE organization_id = ? AND strftime('%Y-%m', expense_date) = ? AND validation_status != 'rejetee'
      `)
      .get(orgId, period) as { total: number }
  ).total;

  const monthlySeries = db
    .prepare(`
      SELECT period_label as period,
             COALESCE(SUM(amount_due_xof + penalty_xof - discount_xof), 0) as expected_xof,
             COALESCE(SUM(amount_paid_xof), 0) as collected_xof,
             COALESCE(SUM(CASE WHEN status = 'en_retard' THEN amount_due_xof - amount_paid_xof ELSE 0 END), 0) as overdue_xof
      FROM rent_invoices
      WHERE organization_id = ? AND status != 'annule'
      GROUP BY period_label
      ORDER BY period_label ASC
      LIMIT 12
    `)
    .all(orgId);

  const revenueByBuilding = db
    .prepare(`
      SELECT COALESCE(b.name, 'Biens indépendants') as building_name,
             COALESCE(SUM(p.amount_xof), 0) as collected_xof
      FROM properties pr
      LEFT JOIN buildings b ON b.id = pr.building_id
      LEFT JOIN rent_payments p ON p.property_id = pr.id AND p.verification_status = 'confirme'
      WHERE pr.organization_id = ? AND pr.deleted_at IS NULL
      GROUP BY COALESCE(b.id, 0)
      ORDER BY collected_xof DESC
    `)
    .all(orgId);

  const recentPayments = db
    .prepare(`
      SELECT rp.id, rp.reference, rp.amount_xof, rp.payment_method, rp.payment_date, rp.verification_status,
             t.full_name as tenant_name, pr.name as property_name, i.period_label
      FROM rent_payments rp
      JOIN tenants t ON t.id = rp.tenant_id
      JOIN properties pr ON pr.id = rp.property_id
      JOIN rent_invoices i ON i.id = rp.invoice_id
      WHERE rp.organization_id = ?
      ORDER BY rp.payment_date DESC, rp.id DESC
      LIMIT 5
    `)
    .all(orgId);

  const overdueInvoices = db
    .prepare(`
      SELECT i.id, i.period_label, i.due_date, i.amount_due_xof, i.amount_paid_xof, i.status,
             t.full_name as tenant_name, t.phone as tenant_phone, pr.name as property_name
      FROM rent_invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN properties pr ON pr.id = i.property_id
      WHERE i.organization_id = ? AND i.status IN ('en_retard', 'partiel')
      ORDER BY i.due_date ASC
      LIMIT 6
    `)
    .all(orgId);

  const upcomingInvoices = db
    .prepare(`
      SELECT i.id, i.period_label, i.due_date, i.amount_due_xof, i.amount_paid_xof, i.status,
             t.full_name as tenant_name, pr.name as property_name
      FROM rent_invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN properties pr ON pr.id = i.property_id
      WHERE i.organization_id = ? AND i.status = 'en_attente'
      ORDER BY i.due_date ASC
      LIMIT 5
    `)
    .all(orgId);

  const expiringContracts = db
    .prepare(`
      SELECT rc.id, rc.reference, rc.end_date, t.full_name as tenant_name, pr.name as property_name,
             CAST(julianday(rc.end_date) - julianday('now') AS INTEGER) as days_remaining
      FROM rental_contracts rc
      JOIN tenants t ON t.id = rc.tenant_id
      JOIN properties pr ON pr.id = rc.property_id
      WHERE rc.organization_id = ? AND rc.status = 'actif' AND julianday(rc.end_date) - julianday('now') <= 90
      ORDER BY rc.end_date ASC
      LIMIT 5
    `)
    .all(orgId);

  const pendingExpenses = (
    db.prepare("SELECT COUNT(*) as c FROM expenses WHERE organization_id = ? AND validation_status = 'en_attente'").get(orgId) as { c: number }
  ).c;

  const recentLogs = db
    .prepare(`
      SELECT al.id, al.action, al.details_json, al.created_at, u.full_name as actor_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.organization_id = ?
      ORDER BY al.id DESC
      LIMIT 6
    `)
    .all(orgId);

  res.json({
    period,
    kpis: {
      totalProperties: propStats.total_properties || 0,
      occupiedUnits: propStats.occupied_units || 0,
      availableUnits: propStats.available_units || 0,
      maintenanceUnits: propStats.maintenance_units || 0,
      activeTenants,
      activeContracts,
      expectedRentXof: periodFin.expected_xof,
      collectedRentXof: periodFin.collected_xof,
      unpaidRentXof: periodFin.unpaid_xof,
      overdueCount: periodFin.overdue_count,
      monthExpensesXof: monthExpenses,
      netIncomeXof: periodFin.collected_xof - monthExpenses,
      pendingExpensesCount: pendingExpenses,
    },
    charts: {
      monthlySeries,
      revenueByBuilding,
    },
    recentPayments,
    overdueInvoices,
    upcomingInvoices,
    expiringContracts,
    recentLogs,
  });
});

// BUILDINGS
apiRouter.get('/buildings', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const buildings = db
    .prepare(`
      SELECT b.*,
             COUNT(p.id) as units_count,
             SUM(CASE WHEN p.status = 'occupe' THEN 1 ELSE 0 END) as occupied_count,
             COALESCE(SUM(p.monthly_rent_xof), 0) as potential_rent_xof
      FROM buildings b
      LEFT JOIN properties p ON p.building_id = b.id AND p.deleted_at IS NULL
      WHERE b.organization_id = ?
      GROUP BY b.id
      ORDER BY b.id DESC
    `)
    .all(orgId);
  res.json({ buildings });
});

apiRouter.post('/buildings', requireAuth, requireOrgContext, requirePermission('properties.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { name, address, commune, city, quartier, floorsCount, photoUrl, description } = req.body || {};
  if (!name || !address || !commune) {
    res.status(400).json({ error: 'Nom, adresse et commune de l’immeuble requis.' });
    return;
  }
  const info = db
    .prepare(`
      INSERT INTO buildings (organization_id, name, address, commune, city, quartier, floors_count, photo_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(orgId, String(name).trim(), String(address).trim(), String(commune).trim(), city || 'Abidjan', quartier || null, Number(floorsCount) || 1, photoUrl || 'angre', description || null);
  logActivity(orgId, req.authUser!.id, 'BUILDING_CREATED', 'building', Number(info.lastInsertRowid), { name }, req.ip);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PROPERTIES / UNITS
apiRouter.get('/properties', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const properties = db
    .prepare(`
      SELECT p.*, b.name as building_name,
             t.full_name as current_tenant_name, rc.id as active_contract_id
      FROM properties p
      LEFT JOIN buildings b ON b.id = p.building_id
      LEFT JOIN rental_contracts rc ON rc.property_id = p.id AND rc.status = 'actif'
      LEFT JOIN tenants t ON t.id = rc.tenant_id
      WHERE p.organization_id = ? AND p.deleted_at IS NULL
      ORDER BY p.id DESC
    `)
    .all(orgId);
  res.json({ properties });
});

apiRouter.post('/properties', requireAuth, requireOrgContext, requirePermission('properties.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const sub = getOrgSubscriptionLimits(orgId);
  const currentCount = (
    db.prepare('SELECT COUNT(*) as c FROM properties WHERE organization_id = ? AND deleted_at IS NULL').get(orgId) as { c: number }
  ).c;
  if (sub && currentCount >= sub.max_properties) {
    res.status(403).json({
      error: `Limite du forfait ${sub.plan_name} atteinte (${sub.max_properties} biens maximum). Passez au plan supérieur pour ajouter davantage de biens.`,
    });
    return;
  }

  const {
    buildingId,
    reference,
    name,
    propertyType,
    address,
    commune,
    city,
    quartier,
    bedrooms,
    bathrooms,
    areaSqm,
    monthlyRentXof,
    depositXof,
    advanceXof,
    conditionState,
    status,
    photoUrl,
    description,
  } = req.body || {};

  if (!name || !propertyType || !address || !commune || !monthlyRentXof) {
    res.status(400).json({ error: 'Veuillez renseigner les informations obligatoires du bien et le loyer mensuel.' });
    return;
  }

  const ref = reference ? String(reference).trim().toUpperCase() : `BIEN-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const info = db
    .prepare(`
      INSERT INTO properties (
        organization_id, building_id, reference, name, property_type, address, commune, city, quartier,
        bedrooms, bathrooms, area_sqm, monthly_rent_xof, deposit_xof, advance_xof, condition_state, status, photo_url, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      orgId,
      buildingId ? Number(buildingId) : null,
      ref,
      String(name).trim(),
      propertyType,
      String(address).trim(),
      String(commune).trim(),
      city || 'Abidjan',
      quartier || null,
      Number(bedrooms) || 0,
      Number(bathrooms) || 1,
      Number(areaSqm) || 0,
      Number(monthlyRentXof),
      Number(depositXof) || 0,
      Number(advanceXof) || 0,
      conditionState || 'Bon état',
      status || 'disponible',
      photoUrl || 'angre',
      description || null
    );

  logActivity(orgId, req.authUser!.id, 'PROPERTY_CREATED', 'property', Number(info.lastInsertRowid), { name, ref }, req.ip);
  res.status(201).json({ id: info.lastInsertRowid, reference: ref });
});

apiRouter.put('/properties/:id', requireAuth, requireOrgContext, requirePermission('properties.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM properties WHERE id = ? AND organization_id = ? AND deleted_at IS NULL').get(id, orgId);
  if (!existing) {
    res.status(404).json({ error: 'Bien introuvable dans cette organisation.' });
    return;
  }
  const { name, propertyType, buildingId, address, commune, quartier, bedrooms, bathrooms, areaSqm, monthlyRentXof, status, description, photoUrl } = req.body || {};
  db.prepare(`
    UPDATE properties SET
      name = COALESCE(?, name),
      property_type = COALESCE(?, property_type),
      building_id = ?,
      address = COALESCE(?, address),
      commune = COALESCE(?, commune),
      quartier = COALESCE(?, quartier),
      bedrooms = COALESCE(?, bedrooms),
      bathrooms = COALESCE(?, bathrooms),
      area_sqm = COALESCE(?, area_sqm),
      monthly_rent_xof = COALESCE(?, monthly_rent_xof),
      status = COALESCE(?, status),
      description = COALESCE(?, description),
      photo_url = COALESCE(?, photo_url)
    WHERE id = ? AND organization_id = ?
  `).run(
    name || null,
    propertyType || null,
    buildingId ? Number(buildingId) : null,
    address || null,
    commune || null,
    quartier || null,
    bedrooms !== undefined ? Number(bedrooms) : null,
    bathrooms !== undefined ? Number(bathrooms) : null,
    areaSqm !== undefined ? Number(areaSqm) : null,
    monthlyRentXof !== undefined ? Number(monthlyRentXof) : null,
    status || null,
    description || null,
    photoUrl || null,
    id,
    orgId
  );
  logActivity(orgId, req.authUser!.id, 'PROPERTY_UPDATED', 'property', id, { name }, req.ip);
  res.json({ ok: true });
});

apiRouter.delete('/properties/:id', requireAuth, requireOrgContext, requirePermission('properties.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const activeContract = db.prepare("SELECT id FROM rental_contracts WHERE property_id = ? AND organization_id = ? AND status = 'actif'").get(id, orgId);
  if (activeContract) {
    res.status(409).json({ error: 'Impossible de supprimer un bien lié à un contrat de location actif.' });
    return;
  }
  const info = db.prepare("UPDATE properties SET deleted_at = datetime('now') WHERE id = ? AND organization_id = ?").run(id, orgId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Bien introuvable.' });
    return;
  }
  logActivity(orgId, req.authUser!.id, 'PROPERTY_DELETED', 'property', id, {}, req.ip);
  res.json({ ok: true });
});

// TENANTS
apiRouter.get('/tenants', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const tenants = db
    .prepare(`
      SELECT t.*,
             rc.id as contract_id, rc.reference as contract_ref, rc.monthly_rent_xof, rc.due_day,
             p.name as property_name, p.id as property_id,
             (SELECT MIN(due_date) FROM rent_invoices WHERE tenant_id = t.id AND status IN ('en_attente', 'partiel', 'en_retard')) as next_due_date,
             (SELECT COALESCE(SUM(amount_due_xof + penalty_xof - discount_xof - amount_paid_xof), 0) FROM rent_invoices WHERE tenant_id = t.id AND status IN ('en_retard', 'partiel')) as balance_due_xof
      FROM tenants t
      LEFT JOIN rental_contracts rc ON rc.tenant_id = t.id AND rc.status = 'actif'
      LEFT JOIN properties p ON p.id = rc.property_id
      WHERE t.organization_id = ? AND t.deleted_at IS NULL
      ORDER BY t.id DESC
    `)
    .all(orgId);
  res.json({ tenants });
});

apiRouter.get('/tenants/:id', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ? AND organization_id = ? AND deleted_at IS NULL').get(id, orgId);
  if (!tenant) {
    res.status(404).json({ error: 'Locataire introuvable.' });
    return;
  }
  const contracts = db
    .prepare(`
      SELECT rc.*, p.name as property_name, p.reference as property_ref
      FROM rental_contracts rc
      JOIN properties p ON p.id = rc.property_id
      WHERE rc.tenant_id = ? AND rc.organization_id = ?
      ORDER BY rc.id DESC
    `)
    .all(id, orgId);
  const invoices = db
    .prepare(`
      SELECT i.*, p.name as property_name
      FROM rent_invoices i
      JOIN properties p ON p.id = i.property_id
      WHERE i.tenant_id = ? AND i.organization_id = ?
      ORDER BY i.period_label DESC
    `)
    .all(id, orgId);
  const payments = db
    .prepare(`
      SELECT rp.*, r.receipt_number, r.verification_token, i.period_label
      FROM rent_payments rp
      LEFT JOIN receipts r ON r.payment_id = rp.id
      JOIN rent_invoices i ON i.id = rp.invoice_id
      WHERE rp.tenant_id = ? AND rp.organization_id = ?
      ORDER BY rp.payment_date DESC
    `)
    .all(id, orgId);
  const maintenance = db
    .prepare(`
      SELECT mr.*, p.name as property_name
      FROM maintenance_requests mr
      JOIN properties p ON p.id = mr.property_id
      WHERE mr.tenant_id = ? AND mr.organization_id = ?
      ORDER BY mr.id DESC
    `)
    .all(id, orgId);
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE tenant_id = ? AND organization_id = ? ORDER BY id DESC LIMIT 20')
    .all(id, orgId);

  res.json({ tenant, contracts, invoices, payments, maintenance, notifications });
});

apiRouter.post('/tenants', requireAuth, requireOrgContext, requirePermission('tenants.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const sub = getOrgSubscriptionLimits(orgId);
  const currentCount = (
    db.prepare('SELECT COUNT(*) as c FROM tenants WHERE organization_id = ? AND deleted_at IS NULL').get(orgId) as { c: number }
  ).c;
  if (sub && currentCount >= sub.max_tenants) {
    res.status(403).json({
      error: `Limite du forfait ${sub.plan_name} atteinte (${sub.max_tenants} locataires maximum).`,
    });
    return;
  }

  const { fullName, phone, email, currentAddress, profession, emergencyContact, idNumber, status } = req.body || {};
  if (!fullName || !phone) {
    res.status(400).json({ error: 'Nom complet et téléphone du locataire requis.' });
    return;
  }
  const info = db
    .prepare(`
      INSERT INTO tenants (organization_id, full_name, phone, email, current_address, profession, emergency_contact, id_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      orgId,
      String(fullName).trim(),
      String(phone).trim(),
      email || null,
      currentAddress || null,
      profession || null,
      emergencyContact || null,
      idNumber || null,
      status || 'actif'
    );
  logActivity(orgId, req.authUser!.id, 'TENANT_CREATED', 'tenant', Number(info.lastInsertRowid), { fullName }, req.ip);
  res.status(201).json({ id: info.lastInsertRowid });
});

// CONTRACTS
apiRouter.get('/contracts', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const contracts = db
    .prepare(`
      SELECT rc.*, p.name as property_name, p.reference as property_ref, p.commune,
             t.full_name as tenant_name, t.phone as tenant_phone,
             CAST(julianday(rc.end_date) - julianday('now') AS INTEGER) as days_remaining
      FROM rental_contracts rc
      JOIN properties p ON p.id = rc.property_id
      JOIN tenants t ON t.id = rc.tenant_id
      WHERE rc.organization_id = ?
      ORDER BY rc.id DESC
    `)
    .all(orgId);
  res.json({ contracts });
});

apiRouter.post('/contracts', requireAuth, requireOrgContext, requirePermission('contracts.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { propertyId, tenantId, startDate, endDate, monthlyRentXof, depositXof, advanceXof, dueDay, specialTerms, status } = req.body || {};
  if (!propertyId || !tenantId || !startDate || !endDate || !monthlyRentXof) {
    res.status(400).json({ error: 'Bien, locataire, dates de bail et loyer mensuel requis.' });
    return;
  }

  const prop = db.prepare('SELECT id FROM properties WHERE id = ? AND organization_id = ? AND deleted_at IS NULL').get(Number(propertyId), orgId);
  const ten = db.prepare('SELECT id FROM tenants WHERE id = ? AND organization_id = ? AND deleted_at IS NULL').get(Number(tenantId), orgId);
  if (!prop || !ten) {
    res.status(404).json({ error: 'Bien ou locataire introuvable dans cette organisation.' });
    return;
  }

  const ref = `BAIL-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}-${crypto.randomBytes(1).toString('hex').toUpperCase()}`;
  const contractStatus = status || 'actif';

  const tx = db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO rental_contracts (organization_id, property_id, tenant_id, reference, start_date, end_date, monthly_rent_xof, deposit_xof, advance_xof, due_day, special_terms, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        orgId,
        Number(propertyId),
        Number(tenantId),
        ref,
        startDate,
        endDate,
        Number(monthlyRentXof),
        Number(depositXof) || 0,
        Number(advanceXof) || 0,
        Number(dueDay) || 5,
        specialTerms || null,
        contractStatus
      );
    if (contractStatus === 'actif') {
      db.prepare("UPDATE properties SET status = 'occupe' WHERE id = ? AND organization_id = ?").run(Number(propertyId), orgId);
    }
    logActivity(orgId, req.authUser!.id, 'CONTRACT_CREATED', 'rental_contract', Number(info.lastInsertRowid), { ref }, req.ip);
    return Number(info.lastInsertRowid);
  });

  const contractId = tx();
  res.status(201).json({ id: contractId, reference: ref });
});

apiRouter.post('/contracts/:id/renew', requireAuth, requireOrgContext, requirePermission('contracts.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const { newEndDate, newMonthlyRentXof } = req.body || {};
  const old = db.prepare('SELECT * FROM rental_contracts WHERE id = ? AND organization_id = ?').get(id, orgId) as
    | { id: number; property_id: number; tenant_id: number; end_date: string; monthly_rent_xof: number; deposit_xof: number; advance_xof: number; due_day: number; special_terms: string | null }
    | undefined;
  if (!old) {
    res.status(404).json({ error: 'Contrat introuvable.' });
    return;
  }
  if (!newEndDate) {
    res.status(400).json({ error: 'Nouvelle date de fin requise.' });
    return;
  }

  const ref = `BAIL-${new Date().getFullYear()}-REN-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const tx = db.transaction(() => {
    db.prepare("UPDATE rental_contracts SET status = 'expire' WHERE id = ? AND organization_id = ?").run(id, orgId);
    const info = db
      .prepare(`
        INSERT INTO rental_contracts (organization_id, property_id, tenant_id, reference, start_date, end_date, monthly_rent_xof, deposit_xof, advance_xof, due_day, special_terms, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif')
      `)
      .run(
        orgId,
        old.property_id,
        old.tenant_id,
        ref,
        old.end_date,
        newEndDate,
        Number(newMonthlyRentXof) || old.monthly_rent_xof,
        old.deposit_xof,
        old.advance_xof,
        old.due_day,
        old.special_terms
      );
    logActivity(orgId, req.authUser!.id, 'CONTRACT_RENEWED', 'rental_contract', Number(info.lastInsertRowid), { previousId: id, ref }, req.ip);
    return Number(info.lastInsertRowid);
  });

  const newId = tx();
  res.status(201).json({ id: newId, reference: ref });
});

// RENT INVOICES
apiRouter.get('/invoices', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const invoices = db
    .prepare(`
      SELECT i.*, p.name as property_name, p.reference as property_ref,
             t.full_name as tenant_name, t.phone as tenant_phone,
             rc.reference as contract_ref
      FROM rent_invoices i
      JOIN properties p ON p.id = i.property_id
      JOIN tenants t ON t.id = i.tenant_id
      JOIN rental_contracts rc ON rc.id = i.contract_id
      WHERE i.organization_id = ?
      ORDER BY i.period_label DESC, i.due_date ASC
    `)
    .all(orgId);
  res.json({ invoices });
});

apiRouter.post('/invoices/generate', requireAuth, requireOrgContext, requirePermission('invoices.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { periodLabel } = req.body || {};
  if (!periodLabel || !/^\d{4}-\d{2}$/.test(String(periodLabel))) {
    res.status(400).json({ error: 'Format de période invalide (attendu : AAAA-MM).' });
    return;
  }

  const activeContracts = db
    .prepare("SELECT * FROM rental_contracts WHERE organization_id = ? AND status = 'actif'")
    .all(orgId) as Array<{ id: number; property_id: number; tenant_id: number; monthly_rent_xof: number; due_day: number }>;

  let created = 0;
  let skipped = 0;

  const generateTx = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO rent_invoices (organization_id, contract_id, property_id, tenant_id, period_label, due_date, amount_due_xof, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')
    `);
    for (const c of activeContracts) {
      const day = String(Math.min(28, Math.max(1, c.due_day))).padStart(2, '0');
      const dueDate = `${periodLabel}-${day}`;
      const info = insertStmt.run(orgId, c.id, c.property_id, c.tenant_id, periodLabel, dueDate, c.monthly_rent_xof);
      if (info.changes > 0) created++;
      else skipped++;
    }
    logActivity(orgId, req.authUser!.id, 'INVOICES_GENERATED', 'rent_invoice', null, { periodLabel, created, skipped }, req.ip);
  });

  generateTx();
  res.json({ created, skipped, message: `${created} échéance(s) générée(s) pour ${periodLabel} (${skipped} déjà existante(s) ignorée(s)).` });
});

apiRouter.patch('/invoices/:id', requireAuth, requireOrgContext, requirePermission('invoices.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const { penaltyXof, discountXof, status } = req.body || {};
  const inv = db.prepare('SELECT * FROM rent_invoices WHERE id = ? AND organization_id = ?').get(id, orgId) as
    | { id: number; amount_due_xof: number; penalty_xof: number; discount_xof: number; amount_paid_xof: number; status: string }
    | undefined;
  if (!inv) {
    res.status(404).json({ error: 'Échéance introuvable.' });
    return;
  }

  const nextPenalty = penaltyXof !== undefined ? Number(penaltyXof) : inv.penalty_xof;
  const nextDiscount = discountXof !== undefined ? Number(discountXof) : inv.discount_xof;
  const netDue = Math.max(0, inv.amount_due_xof + nextPenalty - nextDiscount);
  let nextStatus = status || inv.status;
  if (!status) {
    if (inv.amount_paid_xof >= netDue && netDue > 0) nextStatus = 'paye';
    else if (inv.amount_paid_xof > 0) nextStatus = 'partiel';
  }
  db.prepare('UPDATE rent_invoices SET penalty_xof = ?, discount_xof = ?, status = ? WHERE id = ? AND organization_id = ?').run(
    nextPenalty,
    nextDiscount,
    nextStatus,
    id,
    orgId
  );
  logActivity(orgId, req.authUser!.id, 'INVOICE_ADJUSTED', 'rent_invoice', id, { nextPenalty, nextDiscount, nextStatus }, req.ip);
  res.json({ ok: true });
});

// PAYMENTS & AUTOMATIC RECEIPTS
apiRouter.get('/payments', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const payments = db
    .prepare(`
      SELECT rp.*, p.name as property_name, p.address as property_address,
             t.full_name as tenant_name, i.period_label,
             r.id as receipt_id, r.receipt_number, r.verification_token, r.balance_remaining_xof
      FROM rent_payments rp
      JOIN properties p ON p.id = rp.property_id
      JOIN tenants t ON t.id = rp.tenant_id
      JOIN rent_invoices i ON i.id = rp.invoice_id
      LEFT JOIN receipts r ON r.payment_id = rp.id
      WHERE rp.organization_id = ?
      ORDER BY rp.payment_date DESC, rp.id DESC
    `)
    .all(orgId);
  res.json({ payments });
});

apiRouter.post('/payments', requireAuth, requireOrgContext, requirePermission('payments.create'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { invoiceId, amountXof, paymentMethod, transactionRef, paymentDate, notes } = req.body || {};
  if (!invoiceId || !amountXof || Number(amountXof) <= 0 || !paymentMethod) {
    res.status(400).json({ error: 'Échéance, montant positif et mode de paiement requis.' });
    return;
  }

  const invoice = db
    .prepare('SELECT * FROM rent_invoices WHERE id = ? AND organization_id = ?')
    .get(Number(invoiceId), orgId) as
    | {
        id: number;
        tenant_id: number;
        property_id: number;
        period_label: string;
        amount_due_xof: number;
        penalty_xof: number;
        discount_xof: number;
        amount_paid_xof: number;
        status: string;
      }
    | undefined;

  if (!invoice) {
    res.status(404).json({ error: 'Échéance introuvable dans cette organisation.' });
    return;
  }

  const amount = Math.round(Number(amountXof));
  const netDue = Math.max(0, invoice.amount_due_xof + invoice.penalty_xof - invoice.discount_xof);
  const remainingBefore = Math.max(0, netDue - invoice.amount_paid_xof);
  if (amount > remainingBefore && remainingBefore > 0) {
    res.status(400).json({ error: `Le montant saisi (${amount.toLocaleString('fr-FR')} FCFA) dépasse le solde restant (${remainingBefore.toLocaleString('fr-FR')} FCFA).` });
    return;
  }

  const isOfflinePending = req.body.requireManualValidation === true;
  const verificationStatus = isOfflinePending ? 'en_attente_validation' : 'confirme';

  const payRef = `PAY-${invoice.period_label.replace('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const recNum = `QUIT-${invoice.period_label.replace('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const verifToken = crypto.randomBytes(12).toString('hex');
  const pDate = paymentDate || new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    const payInfo = db
      .prepare(`
        INSERT INTO rent_payments (organization_id, invoice_id, tenant_id, property_id, reference, amount_xof, payment_method, transaction_ref, payment_date, verification_status, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        orgId,
        invoice.id,
        invoice.tenant_id,
        invoice.property_id,
        payRef,
        amount,
        paymentMethod,
        transactionRef || null,
        pDate,
        verificationStatus,
        notes || null,
        req.authUser!.id
      );

    const paymentId = Number(payInfo.lastInsertRowid);
    let receiptId: number | null = null;

    if (verificationStatus === 'confirme') {
      const newPaid = invoice.amount_paid_xof + amount;
      const newRemaining = Math.max(0, netDue - newPaid);
      const nextStatus = newRemaining === 0 ? 'paye' : 'partiel';
      db.prepare('UPDATE rent_invoices SET amount_paid_xof = ?, status = ? WHERE id = ?').run(newPaid, nextStatus, invoice.id);

      const recInfo = db
        .prepare(`
          INSERT INTO receipts (organization_id, payment_id, invoice_id, receipt_number, verification_token, balance_remaining_xof)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(orgId, paymentId, invoice.id, recNum, verifToken, newRemaining);
      receiptId = Number(recInfo.lastInsertRowid);
    }

    logActivity(orgId, req.authUser!.id, 'PAYMENT_RECORDED', 'rent_payment', paymentId, { payRef, amount, paymentMethod, verificationStatus }, req.ip);
    return { paymentId, receiptId };
  });

  const result = tx();
  res.status(201).json({ ...result, reference: payRef, receiptNumber: recNum });
});

apiRouter.post('/payments/:id/validate', requireAuth, requireOrgContext, requirePermission('payments.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const paymentId = Number(req.params.id);
  const { action } = req.body || {}; // 'confirme' | 'rejete'
  const pay = db.prepare('SELECT * FROM rent_payments WHERE id = ? AND organization_id = ?').get(paymentId, orgId) as
    | { id: number; invoice_id: number; amount_xof: number; verification_status: string }
    | undefined;
  if (!pay) {
    res.status(404).json({ error: 'Paiement introuvable.' });
    return;
  }
  if (pay.verification_status !== 'en_attente_validation') {
    res.status(409).json({ error: 'Ce paiement a déjà été traité.' });
    return;
  }

  const tx = db.transaction(() => {
    if (action === 'rejete') {
      db.prepare("UPDATE rent_payments SET verification_status = 'rejete' WHERE id = ?").run(paymentId);
      logActivity(orgId, req.authUser!.id, 'PAYMENT_REJECTED', 'rent_payment', paymentId, {}, req.ip);
      return;
    }
    db.prepare("UPDATE rent_payments SET verification_status = 'confirme' WHERE id = ?").run(paymentId);
    const inv = db.prepare('SELECT * FROM rent_invoices WHERE id = ?').get(pay.invoice_id) as {
      id: number;
      period_label: string;
      amount_due_xof: number;
      penalty_xof: number;
      discount_xof: number;
      amount_paid_xof: number;
    };
    const netDue = Math.max(0, inv.amount_due_xof + inv.penalty_xof - inv.discount_xof);
    const newPaid = inv.amount_paid_xof + pay.amount_xof;
    const rem = Math.max(0, netDue - newPaid);
    db.prepare('UPDATE rent_invoices SET amount_paid_xof = ?, status = ? WHERE id = ?').run(newPaid, rem === 0 ? 'paye' : 'partiel', inv.id);
    const recNum = `QUIT-${inv.period_label.replace('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    db.prepare('INSERT INTO receipts (organization_id, payment_id, invoice_id, receipt_number, verification_token, balance_remaining_xof) VALUES (?, ?, ?, ?, ?, ?)').run(
      orgId,
      paymentId,
      inv.id,
      recNum,
      crypto.randomBytes(12).toString('hex'),
      rem
    );
    logActivity(orgId, req.authUser!.id, 'PAYMENT_CONFIRMED', 'rent_payment', paymentId, { recNum }, req.ip);
  });

  tx();
  res.json({ ok: true });
});

// RECEIPTS
apiRouter.get('/receipts', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const receipts = db
    .prepare(`
      SELECT r.*, rp.reference as payment_ref, rp.amount_xof, rp.payment_method, rp.payment_date, rp.transaction_ref,
             t.full_name as tenant_name, t.phone as tenant_phone,
             p.name as property_name, p.address as property_address, p.commune,
             i.period_label, o.name as organization_name, o.address as organization_address, o.stamp_text
      FROM receipts r
      JOIN rent_payments rp ON rp.id = r.payment_id
      JOIN tenants t ON t.id = rp.tenant_id
      JOIN properties p ON p.id = rp.property_id
      JOIN rent_invoices i ON i.id = r.invoice_id
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.organization_id = ?
      ORDER BY r.id DESC
    `)
    .all(orgId);
  res.json({ receipts });
});

// EXPENSES
apiRouter.get('/expenses', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY id ASC').all();
  const expenses = db
    .prepare(`
      SELECT e.*, ec.name as category_name, p.name as property_name, b.name as building_name
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.category_id
      LEFT JOIN properties p ON p.id = e.property_id
      LEFT JOIN buildings b ON b.id = e.building_id
      WHERE e.organization_id = ?
      ORDER BY e.expense_date DESC, e.id DESC
    `)
    .all(orgId);
  res.json({ expenses, categories });
});

apiRouter.post('/expenses', requireAuth, requireOrgContext, requirePermission('expenses.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { categoryId, propertyId, buildingId, description, amountXof, expenseDate, vendorName, receiptRef, validationStatus } = req.body || {};
  if (!categoryId || !description || !amountXof || Number(amountXof) <= 0) {
    res.status(400).json({ error: 'Catégorie, description et montant valide requis.' });
    return;
  }
  const info = db
    .prepare(`
      INSERT INTO expenses (organization_id, property_id, building_id, category_id, description, amount_xof, expense_date, vendor_name, receipt_ref, validation_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      orgId,
      propertyId ? Number(propertyId) : null,
      buildingId ? Number(buildingId) : null,
      Number(categoryId),
      String(description).trim(),
      Math.round(Number(amountXof)),
      expenseDate || new Date().toISOString().slice(0, 10),
      vendorName || null,
      receiptRef || null,
      validationStatus || 'validee',
      req.authUser!.id
    );
  logActivity(orgId, req.authUser!.id, 'EXPENSE_CREATED', 'expense', Number(info.lastInsertRowid), { description, amountXof }, req.ip);
  res.status(201).json({ id: info.lastInsertRowid });
});

apiRouter.patch('/expenses/:id/validate', requireAuth, requireOrgContext, requirePermission('expenses.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['validee', 'rejetee'].includes(status)) {
    res.status(400).json({ error: 'Statut de validation invalide.' });
    return;
  }
  db.prepare('UPDATE expenses SET validation_status = ? WHERE id = ? AND organization_id = ?').run(status, id, orgId);
  logActivity(orgId, req.authUser!.id, 'EXPENSE_VALIDATED', 'expense', id, { status }, req.ip);
  res.json({ ok: true });
});

// MAINTENANCE
apiRouter.get('/maintenance', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const requests = db
    .prepare(`
      SELECT mr.*, p.name as property_name, p.reference as property_ref, t.full_name as tenant_name
      FROM maintenance_requests mr
      JOIN properties p ON p.id = mr.property_id
      LEFT JOIN tenants t ON t.id = mr.tenant_id
      WHERE mr.organization_id = ?
      ORDER BY mr.id DESC
    `)
    .all(orgId);
  res.json({ requests });
});

apiRouter.post('/maintenance', requireAuth, requireOrgContext, requirePermission('maintenance.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { propertyId, tenantId, category, title, description, priority, assignedTo, estimatedCostXof } = req.body || {};
  if (!propertyId || !title || !description) {
    res.status(400).json({ error: 'Bien, titre et description du sinistre requis.' });
    return;
  }
  const info = db
    .prepare(`
      INSERT INTO maintenance_requests (organization_id, property_id, tenant_id, category, title, description, priority, assigned_to, estimated_cost_xof, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nouveau')
    `)
    .run(
      orgId,
      Number(propertyId),
      tenantId ? Number(tenantId) : null,
      category || 'autre',
      String(title).trim(),
      String(description).trim(),
      priority || 'moyenne',
      assignedTo || null,
      Number(estimatedCostXof) || 0
    );
  logActivity(orgId, req.authUser!.id, 'MAINTENANCE_CREATED', 'maintenance_request', Number(info.lastInsertRowid), { title }, req.ip);
  res.status(201).json({ id: info.lastInsertRowid });
});

apiRouter.patch('/maintenance/:id', requireAuth, requireOrgContext, requirePermission('maintenance.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const { status, assignedTo, estimatedCostXof } = req.body || {};
  db.prepare(`
    UPDATE maintenance_requests SET
      status = COALESCE(?, status),
      assigned_to = COALESCE(?, assigned_to),
      estimated_cost_xof = COALESCE(?, estimated_cost_xof)
    WHERE id = ? AND organization_id = ?
  `).run(status || null, assignedTo || null, estimatedCostXof !== undefined ? Number(estimatedCostXof) : null, id, orgId);
  logActivity(orgId, req.authUser!.id, 'MAINTENANCE_UPDATED', 'maintenance_request', id, { status }, req.ip);
  res.json({ ok: true });
});

// REPORTS
apiRouter.get('/reports', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const buildingId = req.query.buildingId ? Number(req.query.buildingId) : null;

  const unitProfitability = db
    .prepare(`
      SELECT p.id, p.reference, p.name, p.property_type, p.status, p.monthly_rent_xof,
             COALESCE(b.name, 'Indépendant') as building_name,
             COALESCE((SELECT SUM(rp.amount_xof) FROM rent_payments rp WHERE rp.property_id = p.id AND rp.verification_status = 'confirme'), 0) as total_collected_xof,
             COALESCE((SELECT SUM(e.amount_xof) FROM expenses e WHERE e.property_id = p.id AND e.validation_status = 'validee'), 0) as total_expenses_xof
      FROM properties p
      LEFT JOIN buildings b ON b.id = p.building_id
      WHERE p.organization_id = ? AND p.deleted_at IS NULL ${buildingId ? 'AND p.building_id = ?' : ''}
      ORDER BY total_collected_xof DESC
    `)
    .all(...(buildingId ? [orgId, buildingId] : [orgId]));

  const buildingProfitability = db
    .prepare(`
      SELECT b.id, b.name, b.commune,
             COUNT(p.id) as units_count,
             SUM(CASE WHEN p.status = 'occupe' THEN 1 ELSE 0 END) as occupied_count,
             COALESCE((SELECT SUM(rp.amount_xof) FROM rent_payments rp JOIN properties p2 ON p2.id = rp.property_id WHERE p2.building_id = b.id AND rp.verification_status = 'confirme'), 0) as total_collected_xof,
             COALESCE((SELECT SUM(e.amount_xof) FROM expenses e WHERE (e.building_id = b.id OR e.property_id IN (SELECT id FROM properties WHERE building_id = b.id)) AND e.validation_status = 'validee'), 0) as total_expenses_xof
      FROM buildings b
      LEFT JOIN properties p ON p.building_id = b.id AND p.deleted_at IS NULL
      WHERE b.organization_id = ?
      GROUP BY b.id
    `)
    .all(orgId);

  res.json({ unitProfitability, buildingProfitability });
});

// NOTIFICATIONS & REMINDERS
apiRouter.get('/notifications', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE organization_id = ? ORDER BY id DESC LIMIT 40')
    .all(orgId);
  const templates = db
    .prepare('SELECT * FROM notification_templates WHERE organization_id = ? ORDER BY trigger_offset_days ASC')
    .all(orgId);
  const providerConfig = {
    whatsappConfigured: Boolean(process.env.WHATSAPP_BUSINESS_TOKEN),
    smsConfigured: Boolean(process.env.SMS_PROVIDER_API_KEY),
    emailConfigured: Boolean(process.env.SMTP_HOST),
  };
  res.json({ notifications, templates, providerConfig });
});

apiRouter.patch('/notifications/:id/read', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  db.prepare("UPDATE notifications SET status = 'lu' WHERE id = ? AND organization_id = ?").run(Number(req.params.id), orgId);
  res.json({ ok: true });
});

apiRouter.put('/notification-templates/:id', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const id = Number(req.params.id);
  const { channel, bodyTemplate, isActive } = req.body || {};
  db.prepare(`
    UPDATE notification_templates SET
      channel = COALESCE(?, channel),
      body_template = COALESCE(?, body_template),
      is_active = COALESCE(?, is_active)
    WHERE id = ? AND organization_id = ?
  `).run(channel || null, bodyTemplate || null, isActive !== undefined ? (isActive ? 1 : 0) : null, id, orgId);
  res.json({ ok: true });
});

apiRouter.post('/reminders/run', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId) as { name: string };
  const unpaid = db
    .prepare(`
      SELECT i.id, i.due_date, i.amount_due_xof, i.amount_paid_xof, t.id as tenant_id, t.full_name, p.name as property_name
      FROM rent_invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN properties p ON p.id = i.property_id
      WHERE i.organization_id = ? AND i.status IN ('en_retard', 'partiel', 'en_attente')
    `)
    .all(orgId) as Array<{ id: number; due_date: string; amount_due_xof: number; amount_paid_xof: number; tenant_id: number; full_name: string; property_name: string }>;

  let queued = 0;
  const stmt = db.prepare(`
    INSERT INTO notifications (organization_id, tenant_id, channel, title, message, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const inv of unpaid) {
    const remaining = Math.max(0, inv.amount_due_xof - inv.amount_paid_xof);
    const msg = `Bonjour ${inv.full_name}, votre loyer de ${remaining.toLocaleString('fr-FR')} FCFA pour ${inv.property_name} (échéance ${inv.due_date}) est attendu. Cordialement, ${org.name}.`;
    stmt.run(orgId, inv.tenant_id, 'in_app', `Relance loyer — ${inv.property_name}`, msg, 'non_lu');
    queued++;
  }

  const externalReady = Boolean(process.env.WHATSAPP_BUSINESS_TOKEN || process.env.SMS_PROVIDER_API_KEY);
  logActivity(orgId, req.authUser!.id, 'REMINDERS_TRIGGERED', 'notification', null, { queued, externalReady }, req.ip);
  res.json({
    queued,
    externalDispatched: externalReady,
    message: externalReady
      ? `${queued} rappel(s) envoyé(s) sur les canaux configurés.`
      : `${queued} notification(s) interne(s) générée(s). L'envoi WhatsApp/SMS externe nécessite la configuration des clés API fournisseur dans les variables d'environnement.`,
  });
});

// USERS & TEAM
apiRouter.get('/users', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const members = db
    .prepare(`
      SELECT u.id, u.full_name, u.email, u.phone, u.is_active, r.code as role_code, r.name as role_name, ou.created_at
      FROM organization_users ou
      JOIN users u ON u.id = ou.user_id
      JOIN roles r ON r.id = ou.role_id
      WHERE ou.organization_id = ?
      ORDER BY ou.id ASC
    `)
    .all(orgId);
  const roles = db.prepare('SELECT id, code, name FROM roles ORDER BY id ASC').all();
  res.json({ members, roles });
});

apiRouter.post('/users', requireAuth, requireOrgContext, requirePermission('users.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { fullName, email, phone, password, roleCode } = req.body || {};
  if (!fullName || !email || !password || !roleCode) {
    res.status(400).json({ error: 'Tous les champs sont requis pour ajouter un collaborateur.' });
    return;
  }

  const sub = getOrgSubscriptionLimits(orgId);
  const currentUsers = (db.prepare('SELECT COUNT(*) as c FROM organization_users WHERE organization_id = ?').get(orgId) as { c: number }).c;
  if (sub && currentUsers >= sub.max_users) {
    res.status(403).json({ error: `Limite d'utilisateurs atteinte pour le forfait ${sub.plan_name} (${sub.max_users} max).` });
    return;
  }

  const role = db.prepare('SELECT id FROM roles WHERE code = ?').get(roleCode) as { id: number } | undefined;
  if (!role) {
    res.status(400).json({ error: 'Rôle invalide.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const tx = db.transaction(() => {
    let user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail) as { id: number } | undefined;
    if (!user) {
      const hash = bcrypt.hashSync(String(password), 10);
      const uId = db
        .prepare("INSERT INTO users (full_name, email, phone, password_hash, role_type) VALUES (?, ?, ?, ?, 'org_user')")
        .run(String(fullName).trim(), normalizedEmail, phone || null, hash).lastInsertRowid as number;
      user = { id: uId };
    }
    db.prepare('INSERT OR REPLACE INTO organization_users (organization_id, user_id, role_id, is_default) VALUES (?, ?, ?, 1)').run(
      orgId,
      user.id,
      role.id
    );
    logActivity(orgId, req.authUser!.id, 'TEAM_MEMBER_ADDED', 'user', user.id, { email: normalizedEmail, roleCode }, req.ip);
    return user.id;
  });

  const userId = tx();
  res.status(201).json({ id: userId });
});

// SUBSCRIPTION & SETTINGS
apiRouter.get('/subscription', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const subscription = getOrgSubscriptionLimits(orgId);
  const plans = db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_monthly_xof ASC').all();
  const usage = {
    propertiesCount: (db.prepare('SELECT COUNT(*) as c FROM properties WHERE organization_id = ? AND deleted_at IS NULL').get(orgId) as { c: number }).c,
    tenantsCount: (db.prepare('SELECT COUNT(*) as c FROM tenants WHERE organization_id = ? AND deleted_at IS NULL').get(orgId) as { c: number }).c,
    usersCount: (db.prepare('SELECT COUNT(*) as c FROM organization_users WHERE organization_id = ?').get(orgId) as { c: number }).c,
  };
  res.json({ subscription, plans, usage });
});

apiRouter.post('/subscription/upgrade', requireAuth, requireOrgContext, requirePermission('subscription.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { planCode, billingCycle, autoRenew } = req.body || {};
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE code = ?').get(planCode) as { id: number; name: string } | undefined;
  if (!plan) {
    res.status(404).json({ error: 'Offre introuvable.' });
    return;
  }
  const cycle = billingCycle === 'annual' ? 'annual' : 'monthly';
  const periodExpr = cycle === 'annual' ? '+365 days' : '+30 days';
  db.prepare(`
    INSERT INTO subscriptions (organization_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew)
    VALUES (?, ?, ?, 'active', date('now'), date('now', ?), ?)
  `).run(orgId, plan.id, cycle, periodExpr, autoRenew ? 1 : 0);
  db.prepare("UPDATE organizations SET status = 'active' WHERE id = ?").run(orgId);
  logActivity(orgId, req.authUser!.id, 'SUBSCRIPTION_UPDATED', 'subscription', plan.id, { planCode, cycle }, req.ip);
  res.json({ ok: true, message: `Votre organisation est désormais sur le plan ${plan.name}.` });
});

apiRouter.get('/settings', requireAuth, requireOrgContext, (req: AuthenticatedRequest, res) => {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.orgId!);
  const logs = db
    .prepare(`
      SELECT al.*, u.full_name as actor_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.organization_id = ?
      ORDER BY al.id DESC
      LIMIT 30
    `)
    .all(req.orgId!);
  res.json({ organization: org, logs });
});

apiRouter.put('/settings', requireAuth, requireOrgContext, requirePermission('settings.write'), (req: AuthenticatedRequest, res) => {
  const orgId = req.orgId!;
  const { name, email, phone, address, city, rccm, stampText } = req.body || {};
  db.prepare(`
    UPDATE organizations SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      rccm = COALESCE(?, rccm),
      stamp_text = COALESCE(?, stamp_text)
    WHERE id = ?
  `).run(name || null, email || null, phone || null, address || null, city || null, rccm || null, stampText || null, orgId);
  logActivity(orgId, req.authUser!.id, 'ORG_SETTINGS_UPDATED', 'organization', orgId, { name }, req.ip);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// TENANT PORTAL (STRICTLY ISOLATED TO AUTHENTICATED TENANT)
// ---------------------------------------------------------------------------

apiRouter.get('/tenant-portal/overview', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUser!.role_type !== 'tenant') {
    res.status(403).json({ error: 'Espace réservé aux comptes locataires.' });
    return;
  }
  const tenant = db.prepare('SELECT * FROM tenants WHERE user_id = ? AND deleted_at IS NULL').get(req.authUser!.id) as
    | { id: number; organization_id: number; full_name: string; phone: string; email: string }
    | undefined;
  if (!tenant) {
    res.status(404).json({ error: 'Fiche locataire associée introuvable.' });
    return;
  }

  const org = db.prepare('SELECT id, name, phone, email, address, stamp_text FROM organizations WHERE id = ?').get(tenant.organization_id);
  const contract = db
    .prepare(`
      SELECT rc.*, p.name as property_name, p.reference as property_ref, p.address as property_address, p.commune
      FROM rental_contracts rc
      JOIN properties p ON p.id = rc.property_id
      WHERE rc.tenant_id = ? AND rc.organization_id = ?
      ORDER BY rc.id DESC
      LIMIT 1
    `)
    .get(tenant.id, tenant.organization_id);

  const invoices = db
    .prepare('SELECT * FROM rent_invoices WHERE tenant_id = ? AND organization_id = ? ORDER BY period_label DESC')
    .all(tenant.id, tenant.organization_id);

  const payments = db
    .prepare(`
      SELECT rp.*, r.receipt_number, r.verification_token, r.balance_remaining_xof, i.period_label, p.name as property_name, p.address as property_address
      FROM rent_payments rp
      LEFT JOIN receipts r ON r.payment_id = rp.id
      JOIN rent_invoices i ON i.id = rp.invoice_id
      JOIN properties p ON p.id = rp.property_id
      WHERE rp.tenant_id = ? AND rp.organization_id = ?
      ORDER BY rp.payment_date DESC
    `)
    .all(tenant.id, tenant.organization_id);

  const maintenance = db
    .prepare(`
      SELECT mr.*, p.name as property_name
      FROM maintenance_requests mr
      JOIN properties p ON p.id = mr.property_id
      WHERE mr.tenant_id = ? AND mr.organization_id = ?
      ORDER BY mr.id DESC
    `)
    .all(tenant.id, tenant.organization_id);

  const notifications = db
    .prepare('SELECT * FROM notifications WHERE tenant_id = ? AND organization_id = ? ORDER BY id DESC LIMIT 15')
    .all(tenant.id, tenant.organization_id);

  res.json({ tenant, organization: org, contract, invoices, payments, maintenance, notifications });
});

apiRouter.post('/tenant-portal/maintenance', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUser!.role_type !== 'tenant') {
    res.status(403).json({ error: 'Espace réservé aux comptes locataires.' });
    return;
  }
  const tenant = db.prepare('SELECT id, organization_id FROM tenants WHERE user_id = ?').get(req.authUser!.id) as
    | { id: number; organization_id: number }
    | undefined;
  const contract = tenant
    ? (db.prepare("SELECT property_id FROM rental_contracts WHERE tenant_id = ? AND status = 'actif' LIMIT 1").get(tenant.id) as
        | { property_id: number }
        | undefined)
    : undefined;
  if (!tenant || !contract) {
    res.status(400).json({ error: 'Aucun logement actif associé à votre compte.' });
    return;
  }
  const { category, title, description, priority } = req.body || {};
  if (!title || !description) {
    res.status(400).json({ error: 'Titre et description de la réclamation requis.' });
    return;
  }
  const info = db
    .prepare(`
      INSERT INTO maintenance_requests (organization_id, property_id, tenant_id, category, title, description, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'nouveau')
    `)
    .run(tenant.organization_id, contract.property_id, tenant.id, category || 'autre', String(title).trim(), String(description).trim(), priority || 'moyenne');
  logActivity(tenant.organization_id, req.authUser!.id, 'TENANT_MAINTENANCE_REPORTED', 'maintenance_request', Number(info.lastInsertRowid), { title }, req.ip);
  res.status(201).json({ id: info.lastInsertRowid });
});

apiRouter.post('/tenant-portal/declare-payment', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUser!.role_type !== 'tenant') {
    res.status(403).json({ error: 'Espace réservé aux comptes locataires.' });
    return;
  }
  const tenant = db.prepare('SELECT id, organization_id FROM tenants WHERE user_id = ?').get(req.authUser!.id) as
    | { id: number; organization_id: number }
    | undefined;
  if (!tenant) {
    res.status(404).json({ error: 'Locataire introuvable.' });
    return;
  }
  const { invoiceId, amountXof, paymentMethod, transactionRef, notes } = req.body || {};
  const invoice = db
    .prepare('SELECT * FROM rent_invoices WHERE id = ? AND tenant_id = ? AND organization_id = ?')
    .get(Number(invoiceId), tenant.id, tenant.organization_id) as
    | { id: number; property_id: number; period_label: string }
    | undefined;
  if (!invoice) {
    res.status(404).json({ error: 'Échéance introuvable.' });
    return;
  }
  if (!transactionRef || !amountXof || Number(amountXof) <= 0) {
    res.status(400).json({ error: 'Montant et référence de transaction requis.' });
    return;
  }

  // Strictly recorded as 'en_attente_validation' — never marked confirmed without server webhook or owner validation!
  const ref = `DECL-${invoice.period_label.replace('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const info = db
    .prepare(`
      INSERT INTO rent_payments (organization_id, invoice_id, tenant_id, property_id, reference, amount_xof, payment_method, transaction_ref, payment_date, verification_status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'), 'en_attente_validation', ?, ?)
    `)
    .run(
      tenant.organization_id,
      invoice.id,
      tenant.id,
      invoice.property_id,
      ref,
      Math.round(Number(amountXof)),
      paymentMethod || 'wave',
      String(transactionRef).trim(),
      notes || 'Déclaration soumise depuis le portail locataire (en attente de confirmation).',
      req.authUser!.id
    );

  logActivity(tenant.organization_id, req.authUser!.id, 'TENANT_PAYMENT_DECLARED', 'rent_payment', Number(info.lastInsertRowid), { ref, transactionRef }, req.ip);
  res.status(201).json({
    id: info.lastInsertRowid,
    reference: ref,
    message: 'Référence transmise au gestionnaire pour vérification et émission de la quittance.',
  });
});

// ---------------------------------------------------------------------------
// SUPER ADMIN IMMOPAY CI (STRICT AGGREGATES, NO TENANT PII)
// ---------------------------------------------------------------------------

apiRouter.get('/super-admin/overview', requireAuth, requireSuperAdmin, (_req, res) => {
  const organizations = db
    .prepare(`
      SELECT o.id, o.name, o.org_type, o.city, o.status, o.created_at,
             sp.name as plan_name, sp.price_monthly_xof, s.status as subscription_status, s.billing_cycle,
             (SELECT COUNT(*) FROM properties p WHERE p.organization_id = o.id AND p.deleted_at IS NULL) as properties_count,
             (SELECT COUNT(*) FROM rental_contracts rc WHERE rc.organization_id = o.id AND rc.status = 'actif') as active_contracts_count
      FROM organizations o
      LEFT JOIN subscriptions s ON s.id = (SELECT MAX(id) FROM subscriptions WHERE organization_id = o.id)
      LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
      ORDER BY o.id DESC
    `)
    .all();

  const stats = {
    totalClients: organizations.length,
    ownersCount: (db.prepare("SELECT COUNT(*) as c FROM organizations WHERE org_type = 'owner'").get() as { c: number }).c,
    agenciesCount: (db.prepare("SELECT COUNT(*) as c FROM organizations WHERE org_type = 'agency'").get() as { c: number }).c,
    totalProperties: (db.prepare('SELECT COUNT(*) as c FROM properties WHERE deleted_at IS NULL').get() as { c: number }).c,
    totalTenantsAggregate: (db.prepare('SELECT COUNT(*) as c FROM tenants WHERE deleted_at IS NULL').get() as { c: number }).c,
    activeContracts: (db.prepare("SELECT COUNT(*) as c FROM rental_contracts WHERE status = 'actif'").get() as { c: number }).c,
    activeSubscriptions: (db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'").get() as { c: number }).c,
    trialSubscriptions: (db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'trial'").get() as { c: number }).c,
    mrrXof: (
      db
        .prepare(`
          SELECT COALESCE(SUM(CASE WHEN s.billing_cycle = 'annual' THEN sp.price_annual_xof / 12 ELSE sp.price_monthly_xof END), 0) as mrr
          FROM subscriptions s
          JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE s.status = 'active' AND s.id IN (SELECT MAX(id) FROM subscriptions GROUP BY organization_id)
        `)
        .get() as { mrr: number }
    ).mrr,
  };

  const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY price_monthly_xof ASC').all();
  const tickets = db
    .prepare(`
      SELECT st.*, o.name as organization_name
      FROM support_tickets st
      JOIN organizations o ON o.id = st.organization_id
      ORDER BY st.id DESC
    `)
    .all();

  const logs = db
    .prepare(`
      SELECT al.id, al.action, al.entity_type, al.created_at, o.name as organization_name
      FROM activity_logs al
      LEFT JOIN organizations o ON o.id = al.organization_id
      ORDER BY al.id DESC
      LIMIT 25
    `)
    .all();

  res.json({ stats, organizations, plans, tickets, logs });
});

apiRouter.patch('/super-admin/organizations/:id/status', requireAuth, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'trial', 'suspended'].includes(status)) {
    res.status(400).json({ error: 'Statut invalide.' });
    return;
  }
  db.prepare('UPDATE organizations SET status = ? WHERE id = ?').run(status, id);
  logActivity(id, req.authUser!.id, 'SUPERADMIN_ORG_STATUS_CHANGED', 'organization', id, { status }, req.ip);
  res.json({ ok: true });
});
