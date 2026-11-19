import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { ensureUser2faRecord } from './twoFactor';

const dbPath = path.resolve(process.cwd(), 'immopay.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role_type TEXT NOT NULL CHECK(role_type IN ('super_admin', 'org_user', 'tenant', 'developer')),
      email_verified_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      price_monthly_xof INTEGER NOT NULL,
      price_annual_xof INTEGER NOT NULL,
      max_properties INTEGER NOT NULL,
      max_tenants INTEGER NOT NULL,
      max_users INTEGER NOT NULL,
      features_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      org_type TEXT NOT NULL CHECK(org_type IN ('agency', 'owner', 'promoter')),
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT DEFAULT 'Abidjan',
      rccm TEXT,
      stamp_text TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'trial', 'suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      permissions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organization_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
      billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'annual')),
      status TEXT NOT NULL CHECK(status IN ('trial', 'active', 'past_due', 'cancelled')),
      trial_ends_at TEXT,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      commune TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Abidjan',
      quartier TEXT,
      floors_count INTEGER NOT NULL DEFAULT 1,
      photo_url TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      property_type TEXT NOT NULL CHECK(property_type IN ('appartement', 'studio', 'villa', 'maison', 'magasin', 'bureau', 'entrepot', 'terrain')),
      address TEXT NOT NULL,
      commune TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Abidjan',
      quartier TEXT,
      bedrooms INTEGER NOT NULL DEFAULT 0,
      bathrooms INTEGER NOT NULL DEFAULT 1,
      area_sqm REAL NOT NULL DEFAULT 0,
      monthly_rent_xof INTEGER NOT NULL,
      deposit_xof INTEGER NOT NULL DEFAULT 0,
      advance_xof INTEGER NOT NULL DEFAULT 0,
      condition_state TEXT NOT NULL DEFAULT 'Bon état',
      status TEXT NOT NULL DEFAULT 'disponible' CHECK(status IN ('disponible', 'occupe', 'maintenance', 'indisponible')),
      photo_url TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE(organization_id, reference)
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      current_address TEXT,
      profession TEXT,
      emergency_contact TEXT,
      id_number TEXT,
      status TEXT NOT NULL DEFAULT 'actif' CHECK(status IN ('actif', 'inactif', 'preavis')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rental_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      reference TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      monthly_rent_xof INTEGER NOT NULL,
      deposit_xof INTEGER NOT NULL DEFAULT 0,
      advance_xof INTEGER NOT NULL DEFAULT 0,
      due_day INTEGER NOT NULL DEFAULT 5,
      special_terms TEXT,
      status TEXT NOT NULL DEFAULT 'actif' CHECK(status IN ('actif', 'en_attente', 'expire', 'resilie')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, reference)
    );

    CREATE TABLE IF NOT EXISTS rent_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      contract_id INTEGER NOT NULL REFERENCES rental_contracts(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      period_label TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount_due_xof INTEGER NOT NULL,
      penalty_xof INTEGER NOT NULL DEFAULT 0,
      discount_xof INTEGER NOT NULL DEFAULT 0,
      amount_paid_xof INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente', 'paye', 'partiel', 'en_retard', 'annule')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(contract_id, period_label)
    );

    CREATE TABLE IF NOT EXISTS rent_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL REFERENCES rent_invoices(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      reference TEXT NOT NULL,
      amount_xof INTEGER NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('wave', 'orange_money', 'mtn_money', 'moov_money', 'virement', 'especes', 'cheque')),
      transaction_ref TEXT,
      payment_date TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'confirme' CHECK(verification_status IN ('confirme', 'en_attente_validation', 'rejete')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, reference)
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      payment_id INTEGER NOT NULL UNIQUE REFERENCES rent_payments(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL REFERENCES rent_invoices(id),
      receipt_number TEXT NOT NULL UNIQUE,
      verification_token TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      balance_remaining_xof INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
      category_id INTEGER NOT NULL REFERENCES expense_categories(id),
      description TEXT NOT NULL,
      amount_xof INTEGER NOT NULL,
      expense_date TEXT NOT NULL,
      vendor_name TEXT,
      receipt_ref TEXT,
      validation_status TEXT NOT NULL DEFAULT 'validee' CHECK(validation_status IN ('validee', 'en_attente', 'rejetee')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      category TEXT NOT NULL CHECK(category IN ('fuite_eau', 'electricite', 'serrure', 'toiture', 'degradation', 'autre')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'moyenne' CHECK(priority IN ('basse', 'moyenne', 'haute', 'urgente')),
      assigned_to TEXT,
      estimated_cost_xof INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'nouveau' CHECK(status IN ('nouveau', 'en_cours', 'en_attente', 'resolu', 'annule')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger_offset_days INTEGER NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('whatsapp', 'sms', 'email', 'in_app')),
      body_template TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(organization_id, code)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'non_lu' CHECK(status IN ('lu', 'non_lu', 'programme', 'echec_config')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS demo_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      company TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      properties_count TEXT,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ouvert' CHECK(status IN ('ouvert', 'en_cours', 'resolu')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(organization_id);
    CREATE INDEX IF NOT EXISTS idx_tenants_org ON tenants(organization_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_org ON rental_contracts(organization_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_org_period ON rent_invoices(organization_id, period_label);
    CREATE INDEX IF NOT EXISTS idx_payments_org ON rent_payments(organization_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_org ON maintenance_requests(organization_id);
    CREATE INDEX IF NOT EXISTS idx_logs_org ON activity_logs(organization_id);
  `);

  seedInitialData();
  ensureDeveloperSchemaAndSeed();
}

export function seedDefaultTemplates(orgId: number): void {
  const templates = [
    {
      code: 'J_MINUS_5',
      name: 'Premier rappel (J-5)',
      offset: -5,
      channel: 'whatsapp',
      body: 'Bonjour {locataire}, nous vous rappelons que votre loyer de {montant} FCFA pour {bien} arrive à échéance le {echeance}. Cordialement, {organisation}.',
    },
    {
      code: 'J_MINUS_2',
      name: 'Deuxième rappel (J-2)',
      offset: -2,
      channel: 'sms',
      body: 'Rappel IMMOPAY CI : votre loyer de {montant} FCFA ({bien}) est dû le {echeance}. Merci de prendre vos dispositions.',
    },
    {
      code: 'J_ZERO',
      name: "Notification d'échéance (Jour J)",
      offset: 0,
      channel: 'in_app',
      body: 'Bonjour {locataire}, votre loyer du mois ({montant} FCFA) est exigible ce jour ({echeance}).',
    },
    {
      code: 'J_PLUS_3',
      name: 'Retard de paiement (J+3)',
      offset: 3,
      channel: 'whatsapp',
      body: 'Bonjour {locataire}, sauf erreur de notre part, votre loyer de {montant} FCFA échu le {echeance} reste en attente de règlement.',
    },
    {
      code: 'J_PLUS_7',
      name: 'Relance officielle (J+7)',
      offset: 7,
      channel: 'email',
      body: 'Relance : un retard de 7 jours est constaté sur le loyer de {bien} ({montant} FCFA). Merci de régulariser rapidement.',
    },
    {
      code: 'J_PLUS_15',
      name: 'Alerte gestionnaire (J+15)',
      offset: 15,
      channel: 'in_app',
      body: 'Alerte critique : impayé de {montant} FCFA depuis 15 jours pour {locataire} ({bien}).',
    },
  ];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO notification_templates (organization_id, code, name, trigger_offset_days, channel, body_template, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  for (const t of templates) {
    stmt.run(orgId, t.code, t.name, t.offset, t.channel, t.body);
  }
}

function seedInitialData(): void {
  const existingPlans = db.prepare('SELECT COUNT(*) as c FROM subscription_plans').get() as { c: number };
  if (existingPlans.c > 0) return;

  const insertSeed = db.transaction(() => {
    // 1. Plans
    const planStmt = db.prepare(`
      INSERT INTO subscription_plans (code, name, tagline, price_monthly_xof, price_annual_xof, max_properties, max_tenants, max_users, features_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    planStmt.run('starter', 'Starter', 'Pour les propriétaires indépendants', 5000, 50000, 5, 10, 1, JSON.stringify(['5 biens maximum', '10 locataires maximum', 'Suivi des loyers & paiements', 'Reçus PDF avec QR code', 'Support standard']));
    const proPlanId = planStmt.run('pro', 'Pro', 'Pour les bailleurs actifs et petites agences', 15000, 150000, 30, 100, 5, JSON.stringify(['30 biens maximum', '100 locataires maximum', 'Contrats PDF personnalisables', 'Rappels automatiques configurables', 'Dépenses & rentabilité nette', 'Rapports PDF, Excel et CSV', 'Gestion des réclamations'])).lastInsertRowid as number;
    planStmt.run('business', 'Business', 'Pour les agences immobilières structurées', 35000, 350000, 150, 500, 20, JSON.stringify(['150 biens maximum', '500 locataires maximum', 'Multi-utilisateurs & rôles avancés', 'Gestion multi-immeubles complète', 'Automatisations & relances avancées', 'Analyses financières détaillées', 'Support prioritaire dédié']));
    planStmt.run('enterprise', 'Entreprise', 'Pour les promoteurs et grands groupes', 0, 0, 99999, 99999, 999, JSON.stringify(['Biens et locataires sur mesure', 'Multi-agences centralisées', 'Paramétrage API & webhooks dédiés', 'Accompagnement et formation sur site']));

    // 2. Roles
    const roleStmt = db.prepare('INSERT INTO roles (code, name, permissions_json) VALUES (?, ?, ?)');
    const adminRoleId = roleStmt.run('admin_client', 'Administrateur Client', JSON.stringify(['*'])).lastInsertRowid as number;
    roleStmt.run('gestionnaire', 'Gestionnaire de biens', JSON.stringify(['properties.*', 'tenants.*', 'contracts.*', 'maintenance.*', 'invoices.read', 'payments.create']));
    const comptableRoleId = roleStmt.run('comptable', 'Comptable', JSON.stringify(['invoices.*', 'payments.*', 'receipts.*', 'expenses.*', 'reports.*'])).lastInsertRowid as number;
    roleStmt.run('agent', 'Agent de terrain', JSON.stringify(['properties.read', 'tenants.read', 'maintenance.*', 'payments.create']));

    // 3. Expense Categories
    const catStmt = db.prepare('INSERT INTO expense_categories (code, name) VALUES (?, ?)');
    const catPlomberie = catStmt.run('plomberie', 'Plomberie').lastInsertRowid as number;
    const catElec = catStmt.run('electricite', 'Électricité').lastInsertRowid as number;
    const catPeinture = catStmt.run('peinture', 'Peinture').lastInsertRowid as number;
    const catRepar = catStmt.run('reparations', 'Réparations').lastInsertRowid as number;
    catStmt.run('entretien', 'Entretien');
    catStmt.run('nettoyage', 'Nettoyage');
    const catGardien = catStmt.run('gardiennage', 'Gardiennage').lastInsertRowid as number;
    const catTaxes = catStmt.run('taxes', 'Taxes et charges').lastInsertRowid as number;
    catStmt.run('renovation', 'Rénovation');
    catStmt.run('honoraires', 'Honoraires');
    catStmt.run('autres', 'Autres');

    // 4. Users
    const adminPass = bcrypt.hashSync('ImmoPay2026!', 10);
    const tenantPass = bcrypt.hashSync('Locataire2026!', 10);
    const superPass = bcrypt.hashSync('SuperAdmin2026!', 10);

    const userStmt = db.prepare(`
      INSERT INTO users (full_name, email, phone, password_hash, role_type, email_verified_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    const adminUserId = userStmt.run('Tanguy Brovou', 'admin@immogestion-abidjan.ci', '+225 07 08 45 12 90', adminPass, 'org_user').lastInsertRowid as number;
    const staffUserId = userStmt.run('Fatou Bamba', 'fatou.bamba@immogestion-abidjan.ci', '+225 05 44 21 89 10', adminPass, 'org_user').lastInsertRowid as number;
    const tenantUserId = userStmt.run('Kouassi Jean-Marc', 'jeanmarc.kouassi@locataire.ci', '+225 07 58 19 30 44', tenantPass, 'tenant').lastInsertRowid as number;
    userStmt.run('Direction IMMOPAY CI', 'superadmin@immopay.ci', '+225 27 22 40 00 10', superPass, 'super_admin');

    // 5. Organizations
    const orgStmt = db.prepare(`
      INSERT INTO organizations (name, slug, org_type, email, phone, address, city, rccm, stamp_text, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const org1Id = orgStmt.run(
      'Immo Gestion Abidjan',
      'immo-gestion-abidjan',
      'agency',
      'contact@immogestion-abidjan.ci',
      '+225 27 22 50 18 40',
      'Cocody Angré 8e Tranche, Rue des Jardins',
      'Abidjan',
      'CI-ABJ-2023-B-14829',
      'IMMO GESTION ABIDJAN · Agrément N° 0412/MCLU',
      'active'
    ).lastInsertRowid as number;

    const org2Id = orgStmt.run(
      'SCI Plateau Patrimoine',
      'sci-plateau-patrimoine',
      'owner',
      'direction@plateaupatrimoine.ci',
      '+225 07 08 45 12 90',
      'Avenue Chardy, Le Plateau',
      'Abidjan',
      'CI-ABJ-2021-B-08411',
      'SCI PLATEAU PATRIMOINE · Direction Générale',
      'active'
    ).lastInsertRowid as number;

    const orgUserStmt = db.prepare('INSERT INTO organization_users (organization_id, user_id, role_id, is_default) VALUES (?, ?, ?, ?)');
    orgUserStmt.run(org1Id, adminUserId, adminRoleId, 1);
    orgUserStmt.run(org2Id, adminUserId, adminRoleId, 0);
    orgUserStmt.run(org1Id, staffUserId, comptableRoleId, 1);

    // Subscriptions
    const subStmt = db.prepare(`
      INSERT INTO subscriptions (organization_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew)
      VALUES (?, ?, ?, ?, date('now', '-15 days'), date('now', '+15 days'), 1)
    `);
    subStmt.run(org1Id, proPlanId, 'monthly', 'active');
    subStmt.run(org2Id, 1, 'monthly', 'active');

    seedDefaultTemplates(org1Id);
    seedDefaultTemplates(org2Id);

    // 6. Buildings for Org 1
    const bldgStmt = db.prepare(`
      INSERT INTO buildings (organization_id, name, address, commune, city, quartier, floors_count, photo_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const bAngreId = bldgStmt.run(org1Id, 'Résidence Angré', 'Boulevard Latrille, 8e Tranche', 'Cocody', 'Abidjan', 'Angré', 4, 'angre', 'Immeuble résidentiel standing avec gardiennage 24h/24 et parking interne.').lastInsertRowid as number;
    const bCocodyId = bldgStmt.run(org1Id, 'Résidence Cocody', 'Route de Bingerville, Palmeraie', 'Cocody', 'Abidjan', 'Riviera Palmeraie', 2, 'cocody', 'Ensemble résidentiel calme avec villas duplex et appartements familiaux.').lastInsertRowid as number;
    const bYopId = bldgStmt.run(org1Id, 'Immeuble Yopougon', 'Rue Principale, Carrefour Maroc', 'Yopougon', 'Abidjan', 'Maroc', 3, 'yopougon', 'Immeuble mixte commerces en rez-de-chaussée, bureaux et logements aux étages.').lastInsertRowid as number;

    // 7. Properties for Org 1
    const propStmt = db.prepare(`
      INSERT INTO properties (organization_id, building_id, reference, name, property_type, address, commune, city, quartier, bedrooms, bathrooms, area_sqm, monthly_rent_xof, deposit_xof, advance_xof, condition_state, status, photo_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const pA1 = propStmt.run(org1Id, bAngreId, 'ANG-A1', 'Appartement A1', 'appartement', 'Résidence Angré, 1er étage', 'Cocody', 'Abidjan', 'Angré 8e Tranche', 2, 2, 85, 280000, 560000, 560000, 'Excellent état', 'occupe', 'angre', 'Appartement 3 pièces lumineux avec balcon et cuisine équipée.').lastInsertRowid as number;
    const pA2 = propStmt.run(org1Id, bAngreId, 'ANG-A2', 'Appartement A2', 'appartement', 'Résidence Angré, 2e étage', 'Cocody', 'Abidjan', 'Angré 8e Tranche', 3, 2, 110, 350000, 700000, 700000, 'Bon état', 'occupe', 'angre', 'Grand 4 pièces familial avec suite parentale.').lastInsertRowid as number;
    propStmt.run(org1Id, bAngreId, 'ANG-A3', 'Appartement A3', 'appartement', 'Résidence Angré, 3e étage', 'Cocody', 'Abidjan', 'Angré 8e Tranche', 2, 2, 85, 275000, 550000, 550000, 'Rénové', 'disponible', 'angre', 'Appartement 3 pièces fraîchement repeint, disponible immédiatement.');
    const pB1 = propStmt.run(org1Id, bAngreId, 'ANG-B1', 'Studio B1', 'studio', 'Résidence Angré, RDC', 'Cocody', 'Abidjan', 'Angré 8e Tranche', 1, 1, 38, 150000, 300000, 300000, 'Bon état', 'occupe', 'angre', 'Studio moderne idéal jeune cadre, climatisation split incluse.').lastInsertRowid as number;
    propStmt.run(org1Id, bAngreId, 'ANG-B2', 'Studio B2', 'studio', 'Résidence Angré, RDC', 'Cocody', 'Abidjan', 'Angré 8e Tranche', 1, 1, 38, 150000, 300000, 300000, 'Travaux plomberie', 'maintenance', 'angre', 'Studio en réfection sanitaire avant remise en location.');
    const pR1 = propStmt.run(org1Id, bCocodyId, 'COC-R1', 'Villa Duplex R1', 'villa', 'Résidence Cocody, Lot 4', 'Cocody', 'Abidjan', 'Riviera Palmeraie', 4, 3, 220, 650000, 1300000, 1300000, 'Standing', 'occupe', 'cocody', 'Villa duplex avec cour arborée et garage deux véhicules.').lastInsertRowid as number;
    const pC2 = propStmt.run(org1Id, bCocodyId, 'COC-C2', 'Appartement C2', 'appartement', 'Résidence Cocody, Bât B', 'Cocody', 'Abidjan', 'Riviera Palmeraie', 2, 2, 92, 320000, 640000, 640000, 'Bon état', 'occupe', 'cocody', 'Appartement 3 pièces calme avec terrasse couverte.').lastInsertRowid as number;
    const pM1 = propStmt.run(org1Id, bYopId, 'YOP-M1', 'Magasin M1', 'magasin', 'Immeuble Yopougon, RDC Façade', 'Yopougon', 'Abidjan', 'Maroc', 0, 1, 55, 220000, 440000, 440000, 'Bon état', 'occupe', 'yopougon', 'Local commercial vitré sur axe très fréquenté.').lastInsertRowid as number;
    const pBu1 = propStmt.run(org1Id, bYopId, 'YOP-B1', 'Bureau B1', 'bureau', 'Immeuble Yopougon, 1er étage', 'Yopougon', 'Abidjan', 'Maroc', 2, 1, 65, 180000, 360000, 360000, 'Bon état', 'occupe', 'yopougon', 'Espace bureaux cloisonné pour cabinet ou PME.').lastInsertRowid as number;
    propStmt.run(org1Id, bYopId, 'YOP-Y2', 'Appartement Y2', 'appartement', 'Immeuble Yopougon, 2e étage', 'Yopougon', 'Abidjan', 'Maroc', 1, 1, 52, 140000, 280000, 280000, 'Bon état', 'disponible', 'yopougon', '2 pièces fonctionnel proche transports.');

    // 8. Tenants for Org 1
    const tenStmt = db.prepare(`
      INSERT INTO tenants (organization_id, user_id, full_name, phone, email, current_address, profession, emergency_contact, id_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const t1 = tenStmt.run(org1Id, tenantUserId, 'Kouassi Jean-Marc', '+225 07 58 19 30 44', 'jeanmarc.kouassi@locataire.ci', 'Résidence Angré, Appt A1', 'Ingénieur Télécoms', 'Kouassi Aya (+225 05 12 33 44 55)', 'CI-004829102', 'actif').lastInsertRowid as number;
    const t2 = tenStmt.run(org1Id, null, 'Koné Mariam', '+225 05 64 22 10 98', 'mariam.kone@exemple.ci', 'Résidence Angré, Appt A2', 'Responsable RH', 'Koné Seydou (+225 07 41 20 88 12)', 'CI-003910441', 'actif').lastInsertRowid as number;
    const t3 = tenStmt.run(org1Id, null, 'Bamba Youssouf', '+225 01 40 77 82 11', 'youssouf.bamba@exemple.ci', 'Résidence Angré, Studio B1', 'Analyste Financier', 'Bamba Karim (+225 07 09 11 22 33)', 'CI-007119204', 'actif').lastInsertRowid as number;
    const t4 = tenStmt.run(org1Id, null, 'Yao Adjoua Clarisse', '+225 07 89 34 15 62', 'clarisse.yao@exemple.ci', 'Résidence Cocody, Villa R1', 'Pharmacienne Titulaire', 'Yao Kouadio (+225 05 88 41 09 73)', 'CI-002847190', 'actif').lastInsertRowid as number;
    const t5 = tenStmt.run(org1Id, null, 'Touré Ibrahim', '+225 05 33 91 48 20', 'ibrahim.toure@exemple.ci', 'Résidence Cocody, Appt C2', 'Architecte DPLG', 'Touré Aminata (+225 07 14 55 90 12)', 'CI-005591827', 'actif').lastInsertRowid as number;
    const t6 = tenStmt.run(org1Id, null, 'Diallo Aminata', '+225 07 11 65 40 83', 'aminata.diallo@exemple.ci', 'Immeuble Yopougon, Magasin M1', 'Commerçante Prêt-à-porter', 'Diallo Oumar (+225 01 55 88 22 10)', 'CI-006129384', 'actif').lastInsertRowid as number;
    const t7 = tenStmt.run(org1Id, null, "N'Guessan Franck", '+225 01 72 90 18 45', 'franck.nguessan@exemple.ci', 'Immeuble Yopougon, Bureau B1', 'Expert Comptable Stagiaire', "N'Guessan Luc (+225 07 49 20 11 04)", 'CI-008391045', 'preavis').lastInsertRowid as number;

    // 9. Contracts for Org 1
    const ctrStmt = db.prepare(`
      INSERT INTO rental_contracts (organization_id, property_id, tenant_id, reference, start_date, end_date, monthly_rent_xof, deposit_xof, advance_xof, due_day, special_terms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const c1 = ctrStmt.run(org1Id, pA1, t1, 'BAIL-2026-001', '2026-01-01', '2026-12-31', 280000, 560000, 560000, 5, 'Charges de gardiennage incluses. Sous-location interdite.', 'actif').lastInsertRowid as number;
    const c2 = ctrStmt.run(org1Id, pA2, t2, 'BAIL-2026-002', '2026-02-01', '2027-01-31', 350000, 700000, 700000, 5, 'Entretien climatisation annuel à la charge du preneur.', 'actif').lastInsertRowid as number;
    const c3 = ctrStmt.run(org1Id, pB1, t3, 'BAIL-2026-003', '2026-03-01', '2026-12-10', 150000, 300000, 300000, 5, 'Contrat arrivant à échéance prochainement (renouvellement à valider).', 'actif').lastInsertRowid as number;
    const c4 = ctrStmt.run(org1Id, pR1, t4, 'BAIL-2026-004', '2026-01-01', '2027-12-31', 650000, 1300000, 1300000, 5, 'Entretien jardin privatif à la charge du locataire.', 'actif').lastInsertRowid as number;
    const c5 = ctrStmt.run(org1Id, pC2, t5, 'BAIL-2026-005', '2026-04-01', '2027-03-31', 320000, 640000, 640000, 5, 'Bail d’habitation principale.', 'actif').lastInsertRowid as number;
    const c6 = ctrStmt.run(org1Id, pM1, t6, 'BAIL-2026-006', '2026-01-15', '2027-01-14', 220000, 440000, 440000, 5, 'Bail à usage commercial (boutique prêt-à-porter).', 'actif').lastInsertRowid as number;
    const c7 = ctrStmt.run(org1Id, pBu1, t7, 'BAIL-2026-007', '2025-12-01', '2026-11-30', 180000, 360000, 360000, 5, 'Bail professionnel bureau.', 'actif').lastInsertRowid as number;
    // Historical expired contract
    ctrStmt.run(org1Id, pB1, t3, 'BAIL-2025-019', '2025-03-01', '2026-02-28', 145000, 290000, 290000, 5, 'Ancien bail renouvelé.', 'expire');

    // 10. Rent Invoices & Payments (6 months: 2026-06 to 2026-11)
    const invStmt = db.prepare(`
      INSERT INTO rent_invoices (organization_id, contract_id, property_id, tenant_id, period_label, due_date, amount_due_xof, penalty_xof, discount_xof, amount_paid_xof, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const payStmt = db.prepare(`
      INSERT INTO rent_payments (organization_id, invoice_id, tenant_id, property_id, reference, amount_xof, payment_method, transaction_ref, payment_date, verification_status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const recStmt = db.prepare(`
      INSERT INTO receipts (organization_id, payment_id, invoice_id, receipt_number, verification_token, issued_at, balance_remaining_xof)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const activeContracts = [
      { id: c1, prop: pA1, ten: t1, rent: 280000, method: 'wave' as const },
      { id: c2, prop: pA2, ten: t2, rent: 350000, method: 'orange_money' as const },
      { id: c3, prop: pB1, ten: t3, rent: 150000, method: 'mtn_money' as const },
      { id: c4, prop: pR1, ten: t4, rent: 650000, method: 'virement' as const },
      { id: c5, prop: pC2, ten: t5, rent: 320000, method: 'wave' as const },
      { id: c6, prop: pM1, ten: t6, rent: 220000, method: 'moov_money' as const },
      { id: c7, prop: pBu1, ten: t7, rent: 180000, method: 'especes' as const },
    ];

    const pastPeriods = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    let payCounter = 1;

    for (const period of pastPeriods) {
      for (const ac of activeContracts) {
        // Make October 2026 have 1 overdue for t7 to make arrears realistic
        const isUnpaidOct = period === '2026-10' && ac.ten === t7;
        const paid = isUnpaidOct ? 0 : ac.rent;
        const status = isUnpaidOct ? 'en_retard' : 'paye';
        const invId = invStmt.run(org1Id, ac.id, ac.prop, ac.ten, period, `${period}-05`, ac.rent, 0, 0, paid, status).lastInsertRowid as number;
        if (!isUnpaidOct) {
          const ref = `PAY-${period.replace('-', '')}-${String(payCounter).padStart(3, '0')}`;
          const recNum = `QUIT-${period.replace('-', '')}-${String(payCounter).padStart(4, '0')}`;
          const pId = payStmt.run(org1Id, invId, ac.ten, ac.prop, ref, ac.rent, ac.method, `TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, `${period}-04`, 'confirme', `Règlement loyer ${period}`, adminUserId).lastInsertRowid as number;
          recStmt.run(org1Id, pId, invId, recNum, crypto.randomBytes(12).toString('hex'), `${period}-04 14:20:00`, 0);
          payCounter++;
        }
      }
    }

    // Current period 2026-11 (rich mix: 4 paid, 1 partial, 1 overdue, 1 pending)
    const novData = [
      { ac: activeContracts[0], paid: 280000, status: 'paye', date: '2026-11-03', due: '2026-11-05' },
      { ac: activeContracts[1], paid: 350000, status: 'paye', date: '2026-11-04', due: '2026-11-05' },
      { ac: activeContracts[2], paid: 150000, status: 'paye', date: '2026-11-05', due: '2026-11-05' },
      { ac: activeContracts[3], paid: 650000, status: 'paye', date: '2026-11-02', due: '2026-11-05' },
      { ac: activeContracts[4], paid: 180000, status: 'partiel', date: '2026-11-07', due: '2026-11-05' },
      { ac: activeContracts[5], paid: 0, status: 'en_retard', date: null, due: '2026-11-05' },
      { ac: activeContracts[6], paid: 0, status: 'en_attente', date: null, due: '2026-11-20' },
    ];

    for (const item of novData) {
      const invId = invStmt.run(org1Id, item.ac.id, item.ac.prop, item.ac.ten, '2026-11', item.due, item.ac.rent, 0, 0, item.paid, item.status).lastInsertRowid as number;
      if (item.paid > 0 && item.date) {
        const ref = `PAY-202611-${String(payCounter).padStart(3, '0')}`;
        const recNum = `QUIT-202611-${String(payCounter).padStart(4, '0')}`;
        const pId = payStmt.run(org1Id, invId, item.ac.ten, item.ac.prop, ref, item.paid, item.ac.method, `TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, item.date, 'confirme', item.status === 'partiel' ? 'Acompte partiel Novembre 2026' : 'Règlement intégral Novembre 2026', adminUserId).lastInsertRowid as number;
        recStmt.run(org1Id, pId, invId, recNum, crypto.randomBytes(12).toString('hex'), `${item.date} 10:15:00`, item.ac.rent - item.paid);
        payCounter++;
      }
    }

    // 11. Expenses
    const expStmt = db.prepare(`
      INSERT INTO expenses (organization_id, property_id, building_id, category_id, description, amount_xof, expense_date, vendor_name, receipt_ref, validation_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    expStmt.run(org1Id, null, bAngreId, catGardien, 'Prestation gardiennage Résidence Angré (Novembre)', 140000, '2026-11-02', 'Ivoire Sécurité Plus', 'FAC-ISP-1102', 'validee', adminUserId);
    expStmt.run(org1Id, pA1, bAngreId, catPlomberie, 'Remplacement flexible et joint évier Appt A1', 35000, '2026-11-06', 'Ets Konan Plomberie', 'FAC-KP-048', 'validee', staffUserId);
    expStmt.run(org1Id, null, bCocodyId, catElec, 'Maintenance groupe électrogène Résidence Cocody', 85000, '2026-11-09', 'Abidjan Énergie Services', 'FAC-AES-892', 'validee', adminUserId);
    expStmt.run(org1Id, null, bYopId, catTaxes, 'Taxe foncière trimestrielle Immeuble Yopougon', 115000, '2026-11-11', 'DGI Côte d\'Ivoire', 'QUIT-DGI-4412', 'en_attente', staffUserId);
    expStmt.run(org1Id, pA2, bAngreId, catPeinture, 'Reprise peinture couloir & séjour Appt A3 (remise en état)', 95000, '2026-10-22', 'Atelier Couleurs CI', 'FAC-ACC-210', 'validee', adminUserId);
    expStmt.run(org1Id, pM1, bYopId, catRepar, 'Réparation volet roulant Magasin M1', 62000, '2026-10-15', 'Métal Ivoire', 'FAC-MI-109', 'validee', adminUserId);

    // 12. Maintenance Requests
    const mntStmt = db.prepare(`
      INSERT INTO maintenance_requests (organization_id, property_id, tenant_id, category, title, description, priority, assigned_to, estimated_cost_xof, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    mntStmt.run(org1Id, pA1, t1, 'fuite_eau', 'Suintement sous lavabo salle d\'eau', 'Légère fuite détectée au niveau du siphon dans la salle d\'eau principale.', 'moyenne', 'Ets Konan Plomberie', 25000, 'en_cours');
    mntStmt.run(org1Id, pM1, t6, 'serrure', 'Serrure rideau métallique grippée', 'Difficulté à verrouiller le rideau côté gauche en fin de journée.', 'haute', 'Métal Ivoire', 45000, 'nouveau');
    mntStmt.run(org1Id, pBu1, t7, 'electricite', 'Disjoncteur prise climatiseur', 'Le disjoncteur dédié saute après 30 minutes d\'utilisation.', 'urgente', 'Élec Pro Abidjan', 35000, 'en_attente');
    mntStmt.run(org1Id, pR1, t4, 'toiture', 'Vérification étanchéité terrasse suite pluie', 'Contrôle préventif effectué, aucune infiltration constatée.', 'basse', 'Bâtiment Côte d\'Ivoire', 0, 'resolu');

    // 13. Notifications & Activity Logs
    const notifStmt = db.prepare(`
      INSERT INTO notifications (organization_id, user_id, tenant_id, channel, title, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    notifStmt.run(org1Id, adminUserId, null, 'in_app', 'Loyer en retard — Magasin M1', 'Diallo Aminata accuse un retard sur l\'échéance du 05/11/2026 (220 000 FCFA).', 'non_lu');
    notifStmt.run(org1Id, adminUserId, null, 'in_app', 'Contrat expirant bientôt', 'Le bail BAIL-2026-003 (Studio B1 - Bamba Youssouf) expire le 10/12/2026 (J-25).', 'non_lu');
    notifStmt.run(org1Id, tenantUserId, t1, 'in_app', 'Quittance disponible', 'Votre quittance QUIT-202611-0036 de 280 000 FCFA est disponible au téléchargement.', 'non_lu');

    const logStmt = db.prepare(`
      INSERT INTO activity_logs (organization_id, user_id, action, entity_type, entity_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    logStmt.run(org1Id, adminUserId, 'PAYMENT_RECORDED', 'rent_payment', 36, JSON.stringify({ message: 'Paiement Wave de 280 000 FCFA enregistré pour Kouassi Jean-Marc (Appt A1)' }));
    logStmt.run(org1Id, staffUserId, 'EXPENSE_CREATED', 'expense', 4, JSON.stringify({ message: 'Dépense de 115 000 FCFA (Taxe foncière) soumise à validation' }));
    logStmt.run(org1Id, tenantUserId, 'MAINTENANCE_CREATED', 'maintenance_request', 1, JSON.stringify({ message: 'Nouvelle réclamation signalée sur Appartement A1 : Suintement sous lavabo' }));

    // 14. Seed Org 2 (SCI Plateau Patrimoine) to prove strict multi-tenant isolation
    const pPlateau1 = propStmt.run(org2Id, null, 'PLT-01', 'Bureau Horizon Plateau', 'bureau', 'Immeuble Alpha 2000, 6e étage', 'Le Plateau', 'Abidjan', 'Plateau Centre', 4, 2, 160, 950000, 1900000, 1900000, 'Standing', 'occupe', 'yopougon', 'Plateau de bureaux panoramique climatisé.').lastInsertRowid as number;
    propStmt.run(org2Id, null, 'PLT-02', 'Appartement Corniche', 'appartement', 'Boulevard de la Corniche', 'Cocody', 'Abidjan', 'Ambassades', 3, 2, 130, 580000, 1160000, 1160000, 'Excellent état', 'disponible', 'cocody', 'Appartement vue lagune.');
    const tPlateau = tenStmt.run(org2Id, null, 'Cabinet Juridique Amani & Associés', '+225 27 20 31 44 00', 'contact@amani-avocats.ci', 'Le Plateau, Immeuble Alpha 2000', 'Cabinet d\'avocats', 'Me Amani Paul (+225 07 07 10 20 30)', 'CI-RC-99201', 'actif').lastInsertRowid as number;
    const cPlateau = ctrStmt.run(org2Id, pPlateau1, tPlateau, 'BAIL-PLT-001', '2026-01-01', '2027-12-31', 950000, 1900000, 1900000, 5, 'Bail professionnel de 24 mois.', 'actif').lastInsertRowid as number;
    const invP = invStmt.run(org2Id, cPlateau, pPlateau1, tPlateau, '2026-11', '2026-11-05', 950000, 0, 0, 950000, 'paye').lastInsertRowid as number;
    const payP = payStmt.run(org2Id, invP, tPlateau, pPlateau1, 'PAY-PLT-202611-001', 950000, 'virement', 'VIR-SGBCI-88412', '2026-11-03', 'confirme', 'Virement mensuel SGBCI', adminUserId).lastInsertRowid as number;
    recStmt.run(org2Id, payP, invP, 'QUIT-PLT-202611-0001', crypto.randomBytes(12).toString('hex'), '2026-11-03 16:00:00', 0);

    // 15. Support ticket
    db.prepare('INSERT INTO support_tickets (organization_id, user_id, subject, message, status) VALUES (?, ?, ?, ?, ?)').run(
      org1Id,
      adminUserId,
      'Configuration API Wave Business',
      'Nous souhaitons activer la validation automatique des webhooks Wave pour nos 3 immeubles.',
      'en_cours'
    );
  });

  insertSeed();
}

function ensureDeveloperSchemaAndSeed(): void {
  // Safe migration if existing DB had users table without 'developer' role_type
  const usersSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as
    | { sql: string }
    | undefined;

  if (usersSqlRow && !usersSqlRow.sql.includes("'developer'")) {
    db.pragma('foreign_keys = OFF');
    const migrateUsers = db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          password_hash TEXT NOT NULL,
          role_type TEXT NOT NULL CHECK(role_type IN ('super_admin', 'org_user', 'tenant', 'developer')),
          email_verified_at TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, full_name, email, phone, password_hash, role_type, email_verified_at, is_active, created_at, updated_at)
        SELECT id, full_name, email, phone, password_hash, role_type, email_verified_at, is_active, created_at, updated_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    migrateUsers();
    db.pragma('foreign_keys = ON');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      batch INTEGER NOT NULL DEFAULT 1,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'executed' CHECK(status IN ('executed', 'pending', 'failed')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS developer_2fa (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      totp_secret TEXT NOT NULL DEFAULT '__ENCRYPTED__',
      totp_secret_encrypted TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_activated INTEGER NOT NULL DEFAULT 0,
      last_verified_at TEXT,
      last_used_step INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS two_factor_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_code TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('backend_node', 'backend_sqlite', 'frontend_js', 'webhook', 'php_laravel')),
      severity TEXT NOT NULL CHECK(severity IN ('critique', 'elevee', 'moyenne', 'faible')),
      module TEXT NOT NULL,
      message TEXT NOT NULL,
      stack_trace TEXT,
      file_path TEXT,
      line_number INTEGER,
      context_json TEXT,
      request_method TEXT,
      request_path TEXT,
      status TEXT NOT NULL DEFAULT 'ouvert' CHECK(status IN ('ouvert', 'en_cours', 'resolu')),
      resolution_note TEXT,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT,
      occurrences INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      user_role TEXT,
      ip_address TEXT,
      response_size INTEGER NOT NULL DEFAULT 0,
      is_error INTEGER NOT NULL DEFAULT 0,
      error_summary TEXT,
      headers_redacted_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sql_query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_sql TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      is_slow INTEGER NOT NULL DEFAULT 0,
      source_route TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      http_status INTEGER,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('succes', 'echec', 'en_attente', 'non_configure')),
      payload_redacted_json TEXT,
      error_message TEXT,
      last_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS background_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('en_attente', 'en_cours', 'execute', 'echoue')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error_reason TEXT,
      payload_json TEXT,
      scheduled_for TEXT NOT NULL DEFAULT (datetime('now')),
      last_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manuel', 'automatique')),
      integrity_status TEXT NOT NULL DEFAULT 'ok',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS developer_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      developer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS developer_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sys_errors_status ON system_errors(status, severity);
    CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sql_logs_slow ON sql_query_logs(is_slow, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dev_audit_created ON developer_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_2fa_recovery_user ON two_factor_recovery_codes(user_id, used_at);
    CREATE INDEX IF NOT EXISTS idx_2fa_attempts_lookup ON two_factor_attempts(user_id, ip_address, created_at);
  `);

  // Idempotent migration of developer_2fa columns to support per-user encrypted secrets & anti-replay
  const twoFaCols = (db.prepare('PRAGMA table_info(developer_2fa)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!twoFaCols.includes('totp_secret_encrypted')) {
    db.exec('ALTER TABLE developer_2fa ADD COLUMN totp_secret_encrypted TEXT');
  }
  if (!twoFaCols.includes('is_activated')) {
    db.exec('ALTER TABLE developer_2fa ADD COLUMN is_activated INTEGER NOT NULL DEFAULT 0');
  }
  if (!twoFaCols.includes('last_used_step')) {
    db.exec('ALTER TABLE developer_2fa ADD COLUMN last_used_step INTEGER');
  }
  if (!twoFaCols.includes('created_at')) {
    db.exec('ALTER TABLE developer_2fa ADD COLUMN created_at TEXT');
  }
  if (!twoFaCols.includes('updated_at')) {
    db.exec('ALTER TABLE developer_2fa ADD COLUMN updated_at TEXT');
  }

  // Seed developer account & individual encrypted 2FA secret idempotently
  const existingDev = db.prepare("SELECT id, email FROM users WHERE role_type = 'developer'").get() as
    | { id: number; email: string }
    | undefined;
  let devUserId: number;
  if (!existingDev) {
    const devPass = bcrypt.hashSync('DevConsole2026!', 10);
    devUserId = Number(
      db
        .prepare(`
          INSERT INTO users (full_name, email, phone, password_hash, role_type, email_verified_at)
          VALUES (?, ?, ?, ?, 'developer', datetime('now'))
        `)
        .run('Équipe Ingénierie IMMOPAY CI', 'tanguybrovou@gmail.com', '+225 27 22 40 00 99', devPass).lastInsertRowid
    );
  } else {
    devUserId = existingDev.id;
    if (existingDev.email === 'dev@immopay.ci') {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run('tanguybrovou@gmail.com', devUserId);
    }
  }

  // Provision individual encrypted TOTP secret for every developer & super_admin account (never shared)
  const privilegedUsers = db
    .prepare("SELECT id FROM users WHERE role_type IN ('developer', 'super_admin')")
    .all() as Array<{ id: number }>;
  for (const u of privilegedUsers) {
    ensureUser2faRecord(u.id);
  }

  // Seed schema_migrations records idempotently
  const migStmt = db.prepare(`
    INSERT OR IGNORE INTO schema_migrations (version, name, batch, checksum, status, duration_ms)
    VALUES (?, ?, ?, ?, 'executed', ?)
  `);
  migStmt.run('2026_11_01_0001', 'create_users_organizations_roles_subscriptions', 1, 'a9f1c2e801', 14);
  migStmt.run('2026_11_01_0002', 'create_buildings_properties_tenants_contracts', 1, 'b47d8e1209', 18);
  migStmt.run('2026_11_01_0003', 'create_rent_invoices_payments_receipts_expenses', 1, 'c82e5a9411', 21);
  migStmt.run('2026_11_16_0004', 'create_developer_telemetry_2fa_backups_jobs', 2, 'd10a77f390', 11);
  migStmt.run('2026_11_19_0005', 'encrypt_per_user_2fa_secrets_and_recovery_codes', 3, 'e48c91a207', 9);

  // Seed developer_settings
  const setStmt = db.prepare('INSERT OR IGNORE INTO developer_settings (key, value) VALUES (?, ?)');
  setStmt.run('slow_sql_threshold_ms', '80');
  setStmt.run('log_retention_days', '30');
  setStmt.run('capture_js_errors', 'true');
  setStmt.run('maintenance_mode', 'false');
  setStmt.run('telescope_dev_enabled', 'true');
  setStmt.run('prod_observability_sink', 'structured_json_stdout');

  // Seed initial background jobs if empty
  const jobsCount = (db.prepare('SELECT COUNT(*) as c FROM background_jobs').get() as { c: number }).c;
  if (jobsCount === 0) {
    const jobStmt = db.prepare(`
      INSERT INTO background_jobs (job_type, name, status, attempts, max_attempts, duration_ms, error_reason, payload_json, last_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    jobStmt.run(
      'check_expiring_contracts',
      'Détection des baux expirant à J-30',
      'execute',
      1,
      3,
      24,
      null,
      JSON.stringify({ windowDays: 30, matchedContracts: 1 }),
      new Date(Date.now() - 3600_000).toISOString()
    );
    jobStmt.run(
      'sqlite_wal_checkpoint',
      'Optimisation & checkpoint journal WAL SQLite',
      'execute',
      1,
      3,
      9,
      null,
      JSON.stringify({ mode: 'PASSIVE' }),
      new Date(Date.now() - 1800_000).toISOString()
    );
    jobStmt.run(
      'dispatch_due_reminders',
      'Envoi des relances WhatsApp / SMS échéances J-5',
      'echoue',
      2,
      3,
      412,
      'WHATSAPP_API_TOKEN absent : passerelle Meta Cloud non configurée dans .env',
      JSON.stringify({ organizationId: 1, templateCode: 'J_MINUS_5', pendingCount: 2 }),
      new Date(Date.now() - 900_000).toISOString()
    );
    jobStmt.run(
      'sync_monthly_invoices',
      'Contrôle idempotent des échéances mensuelles',
      'en_attente',
      0,
      3,
      0,
      null,
      JSON.stringify({ periodLabel: '2026-12' }),
      null
    );
  }

  // Seed initial webhook events if empty
  const whCount = (db.prepare('SELECT COUNT(*) as c FROM webhook_events').get() as { c: number }).c;
  if (whCount === 0) {
    const whStmt = db.prepare(`
      INSERT INTO webhook_events (provider, event_type, endpoint, http_status, latency_ms, attempts, status, payload_redacted_json, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    whStmt.run(
      'wave',
      'checkout.session.completed',
      '/api/webhooks/wave',
      401,
      145,
      2,
      'non_configure',
      JSON.stringify({ reference: 'WV-202611-001', amount_xof: 280000, signature: '***MASQUÉ***' }),
      'WAVE_WEBHOOK_SECRET non défini dans les variables d’environnement serveur.'
    );
    whStmt.run(
      'orange_money',
      'payment.notification',
      '/api/webhooks/orange-money',
      503,
      310,
      1,
      'non_configure',
      JSON.stringify({ order_id: 'OM-202611-002', amount_xof: 350000, token: '***MASQUÉ***' }),
      'ORANGE_MONEY_CLIENT_ID / SECRET non configurés (validation manuelle active).'
    );
  }

  // Seed 1 historical resolved diagnostic reference if system_errors is empty
  const errCount = (db.prepare('SELECT COUNT(*) as c FROM system_errors').get() as { c: number }).c;
  if (errCount === 0) {
    db.prepare(`
      INSERT INTO system_errors (error_code, source, severity, module, message, stack_trace, file_path, line_number, context_json, request_method, request_path, status, resolution_note, resolved_by, resolved_at, occurrences)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(
      'ERR-SEED-001',
      'backend_sqlite',
      'elevee',
      'database',
      'RangeError: Too few parameter values were provided lors de la création initiale des rôles comptables',
      'RangeError: Too few parameter values were provided\n    at seedInitialData (/app/applet/src/server/db.ts:451:17)\n    at initializeDatabase (/app/applet/src/server/db.ts:310:3)',
      'src/server/db.ts',
      451,
      JSON.stringify({ environment: 'development', statement: 'INSERT INTO organization_users' }),
      'BOOT',
      'initializeDatabase',
      'resolu',
      'Correction appliquée : extraction de .lastInsertRowid as number sur comptableRoleId dans src/server/db.ts.',
      devUserId,
      1
    );
  }
}

