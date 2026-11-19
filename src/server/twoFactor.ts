import crypto from 'crypto';
import QRCode from 'qrcode';
import { db } from './db';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOTP_STEP_SECONDS = 30;
const TOTP_ALLOWED_DRIFT_STEPS = 1; // Tolérance stricte : ±1 fenêtre de 30s (±30 secondes)
const MAX_2FA_FAILURES_PER_WINDOW = 5;
const MAX_2FA_FAILURES_GLOBAL_USER = 10;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RECOVERY_CODE_COUNT = 8;

const KNOWN_WEAK_PLACEHOLDERS = new Set([
  'immopaydev2fatotp',
  'change-me',
  'change-me-to-a-strong-random-secret-key',
  'my_developer_2fa_secret',
  'secret',
  '123456',
]);

function readMasterSecretRaw(): string {
  const secret = process.env.DEVELOPER_2FA_SECRET;
  if (!secret || typeof secret !== 'string') {
    throw new Error(
      'SECURITE CRITIQUE : La variable d’environnement DEVELOPER_2FA_SECRET est absente. Le serveur ne peut pas démarrer sans clé de chiffrement 2FA.'
    );
  }
  const trimmed = secret.trim();
  if (trimmed.length < 32) {
    throw new Error(
      'SECURITE CRITIQUE : DEVELOPER_2FA_SECRET doit contenir au moins 32 caractères aléatoires.'
    );
  }
  if (KNOWN_WEAK_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    throw new Error(
      'SECURITE CRITIQUE : DEVELOPER_2FA_SECRET utilise une valeur par défaut ou un exemple non sécurisé.'
    );
  }
  return trimmed;
}

export function assertDeveloper2faSecretConfigured(): void {
  readMasterSecretRaw();
}

function deriveSubKey(purpose: string): Buffer {
  const master = readMasterSecretRaw();
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(master, 'utf8'),
      Buffer.from('immopay-ci-2fa-hkdf-salt-2026', 'utf8'),
      Buffer.from(purpose, 'utf8'),
      32
    )
  );
}

export function scrub2faMasterSecretFromText(text: string): string {
  const raw = process.env.DEVELOPER_2FA_SECRET?.trim();
  if (!raw || raw.length < 8) return text;
  return text.split(raw).join('***MASQUÉ***');
}

// ---------------------------------------------------------------------------
// Base32 & Individual Secret Generation / AES-256-GCM Encryption
// ---------------------------------------------------------------------------

function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function decodeBase32(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateIndividualTotpSecret(): string {
  // 160 bits (20 octets) recommandés par la RFC 4226/6238, compatibles Google & Microsoft Authenticator
  return encodeBase32(crypto.randomBytes(20));
}

export function encryptTotpSecret(plainBase32: string): string {
  const key = deriveSubKey('immopay-ci-totp-aes-256-gcm-v1');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptTotpSecret(payload: string): string {
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Format de secret TOTP chiffré invalide.');
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  const key = deriveSubKey('immopay-ci-totp-aes-256-gcm-v1');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(cipherB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// RFC 6238 TOTP Generation & Verification (SHA-1, 6 digits, 30s)
// ---------------------------------------------------------------------------

export function generateTotpCodeForStep(secretBase32: string, stepCounter: number): string {
  const key = decodeBase32(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(stepCounter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateTotpCode(secretBase32: string, stepOffset = 0): string {
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  return generateTotpCodeForStep(secretBase32, currentStep + stepOffset);
}

export function verifyTotpCode(
  secretBase32: string,
  candidate: string,
  lastUsedStep?: number | null
): { valid: boolean; matchedStep?: number; replayed?: boolean } {
  const trimmed = String(candidate || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(trimmed)) return { valid: false };

  const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -TOTP_ALLOWED_DRIFT_STEPS; offset <= TOTP_ALLOWED_DRIFT_STEPS; offset++) {
    const step = currentStep + offset;
    const expected = generateTotpCodeForStep(secretBase32, step);
    if (crypto.timingSafeEqual(Buffer.from(trimmed), Buffer.from(expected))) {
      if (lastUsedStep !== null && lastUsedStep !== undefined && step <= lastUsedStep) {
        return { valid: false, replayed: true };
      }
      return { valid: true, matchedStep: step };
    }
  }
  return { valid: false };
}

// ---------------------------------------------------------------------------
// QR Code Provisioning (Individual per user)
// ---------------------------------------------------------------------------

export function buildOtpAuthUri(email: string, plainBase32: string): string {
  const issuer = 'IMMOPAY CI';
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${plainBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

export async function generateIndividualQrDataUrl(email: string, plainBase32: string): Promise<string> {
  const uri = buildOtpAuthUri(email, plainBase32);
  return QRCode.toDataURL(uri, { width: 200, margin: 1 });
}

// ---------------------------------------------------------------------------
// Per-user Record Provisioning & Secret Rotation
// ---------------------------------------------------------------------------

export interface User2faRecord {
  user_id: number;
  totp_secret_encrypted: string;
  enabled: number;
  is_activated: number;
  last_verified_at: string | null;
  last_used_step: number | null;
}

export function ensureUser2faRecord(userId: number): User2faRecord {
  const existing = db
    .prepare(
      'SELECT user_id, totp_secret_encrypted, enabled, is_activated, last_verified_at, last_used_step FROM developer_2fa WHERE user_id = ?'
    )
    .get(userId) as User2faRecord | undefined;

  if (existing && existing.totp_secret_encrypted && existing.totp_secret_encrypted.startsWith('v1:')) {
    return existing;
  }

  const uniqueSecret = generateIndividualTotpSecret();
  const encrypted = encryptTotpSecret(uniqueSecret);

  if (!existing) {
    db.prepare(`
      INSERT INTO developer_2fa (user_id, totp_secret, totp_secret_encrypted, enabled, is_activated, created_at, updated_at)
      VALUES (?, '__ENCRYPTED__', ?, 1, 0, datetime('now'), datetime('now'))
    `).run(userId, encrypted);
  } else {
    db.prepare(`
      UPDATE developer_2fa
      SET totp_secret = '__ENCRYPTED__', totp_secret_encrypted = ?, is_activated = 0, last_used_step = NULL, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(encrypted, userId);
  }

  return db
    .prepare(
      'SELECT user_id, totp_secret_encrypted, enabled, is_activated, last_verified_at, last_used_step FROM developer_2fa WHERE user_id = ?'
    )
    .get(userId) as User2faRecord;
}

export function rotateUser2faSecret(userId: number): User2faRecord {
  const uniqueSecret = generateIndividualTotpSecret();
  const encrypted = encryptTotpSecret(uniqueSecret);

  db.prepare(`
    INSERT INTO developer_2fa (user_id, totp_secret, totp_secret_encrypted, enabled, is_activated, last_verified_at, last_used_step, created_at, updated_at)
    VALUES (?, '__ENCRYPTED__', ?, 1, 0, NULL, NULL, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      totp_secret = '__ENCRYPTED__',
      totp_secret_encrypted = excluded.totp_secret_encrypted,
      enabled = 1,
      is_activated = 0,
      last_used_step = NULL,
      updated_at = datetime('now')
  `).run(userId, encrypted);

  return ensureUser2faRecord(userId);
}

// ---------------------------------------------------------------------------
// One-Time Recovery Codes (Hashed in DB, Single-Use Atomic Consumption)
// ---------------------------------------------------------------------------

function normalizeRecoveryInput(code: string): string {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function hashRecoveryCode(userId: number, normalizedCode: string): string {
  const key = deriveSubKey('immopay-ci-recovery-code-hmac-v1');
  return crypto.createHmac('sha256', key).update(`${userId}:${normalizedCode}`).digest('hex');
}

function generateSingleRecoveryCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function issueRecoveryCodesForUser(userId: number): string[] {
  const plainCodes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    plainCodes.push(generateSingleRecoveryCode());
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM two_factor_recovery_codes WHERE user_id = ?').run(userId);
    const stmt = db.prepare('INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const code of plainCodes) {
      const normalized = normalizeRecoveryInput(code);
      stmt.run(userId, hashRecoveryCode(userId, normalized));
    }
  });
  tx();

  return plainCodes;
}

export function countRemainingRecoveryCodes(userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) as c FROM two_factor_recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .get(userId) as { c: number };
  return row.c;
}

export function consumeRecoveryCode(userId: number, candidate: string): boolean {
  const normalized = normalizeRecoveryInput(candidate);
  if (normalized.length !== 8) return false;

  const candidateHashBuf = Buffer.from(hashRecoveryCode(userId, normalized), 'hex');

  const tx = db.transaction(() => {
    const unusedRows = db
      .prepare('SELECT id, code_hash FROM two_factor_recovery_codes WHERE user_id = ? AND used_at IS NULL')
      .all(userId) as Array<{ id: number; code_hash: string }>;

    for (const row of unusedRows) {
      const storedBuf = Buffer.from(row.code_hash, 'hex');
      if (storedBuf.length === candidateHashBuf.length && crypto.timingSafeEqual(storedBuf, candidateHashBuf)) {
        const res = db
          .prepare("UPDATE two_factor_recovery_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL")
          .run(row.id);
        return res.changes === 1;
      }
    }
    return false;
  });

  return tx();
}

// ---------------------------------------------------------------------------
// Persistent Rate Limiting for 2FA Attempts
// ---------------------------------------------------------------------------

export function check2faRateLimit(
  userId: number,
  ipAddress: string
): { allowed: boolean; retryAfterSec?: number; remainingAttempts: number } {
  const windowExpr = `-${RATE_LIMIT_WINDOW_MINUTES} minutes`;
  const ipRow = db
    .prepare(
      `SELECT COUNT(*) as cnt, MAX(created_at) as last_at
       FROM two_factor_attempts
       WHERE user_id = ? AND ip_address = ? AND success = 0 AND created_at >= datetime('now', ?)`
    )
    .get(userId, ipAddress, windowExpr) as { cnt: number; last_at: string | null };

  const userRow = db
    .prepare(
      `SELECT COUNT(*) as cnt, MAX(created_at) as last_at
       FROM two_factor_attempts
       WHERE user_id = ? AND success = 0 AND created_at >= datetime('now', ?)`
    )
    .get(userId, windowExpr) as { cnt: number; last_at: string | null };

  if (ipRow.cnt >= MAX_2FA_FAILURES_PER_WINDOW || userRow.cnt >= MAX_2FA_FAILURES_GLOBAL_USER) {
    const oldestRelevant = db
      .prepare(
        `SELECT strftime('%s', created_at) as ts
         FROM two_factor_attempts
         WHERE user_id = ? AND success = 0 AND created_at >= datetime('now', ?)
         ORDER BY id ASC LIMIT 1`
      )
      .get(userId, windowExpr) as { ts: string | null } | undefined;

    const unlockAt = oldestRelevant?.ts
      ? Number(oldestRelevant.ts) + RATE_LIMIT_WINDOW_MINUTES * 60
      : Math.floor(Date.now() / 1000) + RATE_LIMIT_WINDOW_MINUTES * 60;
    const retryAfterSec = Math.max(30, unlockAt - Math.floor(Date.now() / 1000));
    return { allowed: false, retryAfterSec, remainingAttempts: 0 };
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(0, MAX_2FA_FAILURES_PER_WINDOW - ipRow.cnt),
  };
}

export function record2faAttempt(userId: number, ipAddress: string, success: boolean, method: 'totp' | 'recovery'): void {
  db.prepare('INSERT INTO two_factor_attempts (user_id, ip_address, success, method) VALUES (?, ?, ?, ?)').run(
    userId,
    ipAddress || 'unknown',
    success ? 1 : 0,
    method
  );
  if (success) {
    // Purge les échecs précédents pour cette IP après validation réussie
    db.prepare('DELETE FROM two_factor_attempts WHERE user_id = ? AND ip_address = ? AND success = 0').run(
      userId,
      ipAddress || 'unknown'
    );
  }
}

export function clearAll2faRateLimits(): number {
  const res = db.prepare('DELETE FROM two_factor_attempts WHERE success = 0').run();
  return res.changes;
}
