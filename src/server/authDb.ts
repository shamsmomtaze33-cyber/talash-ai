import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { initLearningDb } from './learningDb.js';

export const OFFICIAL_OWNER_EMAIL = 'shamsmomtaze33@gmail.com';
export const OFFICIAL_APP_NAME = 'TALASH Ai';

export type UserRole = 'super_admin' | 'admin' | 'user';
export type UserStatus = 'active' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  isImmutableOwner: boolean;
  emailVerified: boolean;
  providers: string[];
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string;
}

export interface GlobalAppSettings {
  appName: string;
  ownerEmail: string;
  defaultModel: 'auto' | 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | 'openai-gpt';
  googleSearchMode: 'auto' | 'always' | 'off';
  allowNewRegistrations: boolean;
  googleOAuthEnabled: boolean;
  facebookOAuthEnabled: boolean;
  siteDomain: string;
  googleSiteVerification: string;
  customSystemInstruction: string;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalAppSettings = {
  appName: OFFICIAL_APP_NAME,
  ownerEmail: OFFICIAL_OWNER_EMAIL,
  defaultModel: 'auto',
  googleSearchMode: 'auto',
  allowNewRegistrations: true,
  googleOAuthEnabled: false,
  facebookOAuthEnabled: false,
  siteDomain: '',
  googleSiteVerification: '',
  customSystemInstruction: '',
};

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const EMAIL_VERIFY_DURATION_MS = 1000 * 60 * 60 * 24; // 24 hours
const PASSWORD_RESET_DURATION_MS = 1000 * 60 * 30; // 30 minutes
let initialized = false;

export class EmailNotVerifiedError extends Error {
  readonly email: string;
  constructor(email: string) {
    super('Please verify your email address before signing in.');
    this.name = 'EmailNotVerifiedError';
    this.email = email;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateShortCode(): string {
  // 8-character unambiguous uppercase code (e.g., 4H7K9M2P)
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function hashPasswordScrypt(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPasswordScrypt(password: string, salt: string, storedHashHex: string): boolean {
  try {
    const derived = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHashHex, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

function ensureUsersColumns(): void {
  const db = initLearningDb();
  const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const existingNames = new Set(cols.map((c) => c.name));

  if (!existingNames.has('password_salt')) {
    db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT');
  }
  if (!existingNames.has('password_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }
  if (!existingNames.has('email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  }
  if (!existingNames.has('email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
  }
}

function ensureAuthSchema(): void {
  const db = initLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'user')),
      is_immutable_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_immutable_owner IN (0, 1)),
      providers_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      password_salt TEXT,
      password_hash TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
      email_verified_at TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS prevent_owner_role_tamper
    BEFORE UPDATE ON users
    WHEN OLD.is_immutable_owner = 1 AND (
      NEW.role != 'super_admin' OR
      NEW.is_immutable_owner != 1 OR
      NEW.status != 'active' OR
      NEW.email != '${OFFICIAL_OWNER_EMAIL}'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Immutable Super Admin ownership cannot be modified or transferred.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_owner_delete
    BEFORE DELETE ON users
    WHEN OLD.is_immutable_owner = 1
    BEGIN
      SELECT RAISE(ABORT, 'Immutable Super Admin owner account cannot be deleted.');
    END;

    CREATE TABLE IF NOT EXISTS owner_credentials (
      email TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_email_verify_token_hash ON email_verification_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_email_verify_user_id ON email_verification_tokens(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pw_reset_token_hash ON password_reset_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_pw_reset_user_id ON password_reset_tokens(user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'facebook')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_tickets (
      ticket TEXT PRIMARY KEY,
      session_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureUsersColumns();
}

function ensureImmutableOwnerAccount(): void {
  const db = initLearningDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      'SELECT id, name, avatar_url, providers_json, password_salt, password_hash, email_verified, created_at FROM users WHERE LOWER(email) = ?'
    )
    .get(OFFICIAL_OWNER_EMAIL) as
    | {
        id: string;
        name: string;
        avatar_url: string | null;
        providers_json: string;
        password_salt: string | null;
        password_hash: string | null;
        email_verified: number;
        created_at: string;
      }
    | undefined;

  const ownerCred = db
    .prepare('SELECT salt, password_hash FROM owner_credentials WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as { salt: string; password_hash: string } | undefined;

  if (!existing) {
    const salt = ownerCred?.salt ?? null;
    const hash = ownerCred?.password_hash ?? null;
    db.prepare(
      `
      INSERT INTO users (
        id, email, name, avatar_url, role, is_immutable_owner,
        providers_json, status, password_salt, password_hash,
        email_verified, email_verified_at, created_at, last_login_at
      ) VALUES (?, ?, ?, ?, 'super_admin', 1, ?, 'active', ?, ?, 1, ?, ?, ?)
    `
    ).run(
      'owner-shamsmomtaze33',
      OFFICIAL_OWNER_EMAIL,
      'Shams Momtaze (Owner)',
      null,
      JSON.stringify(hash ? ['owner', 'email'] : ['owner']),
      salt,
      hash,
      now,
      now,
      now
    );
  } else {
    const nextSalt = existing.password_salt || ownerCred?.salt || null;
    const nextHash = existing.password_hash || ownerCred?.password_hash || null;
    db.prepare(
      `
      UPDATE users
      SET
        email = ?,
        role = 'super_admin',
        is_immutable_owner = 1,
        status = 'active',
        email_verified = 1,
        email_verified_at = COALESCE(email_verified_at, ?),
        password_salt = COALESCE(password_salt, ?),
        password_hash = COALESCE(password_hash, ?)
      WHERE id = ?
    `
    ).run(OFFICIAL_OWNER_EMAIL, now, nextSalt, nextHash, existing.id);
  }
}

export function initAuthDb(): void {
  if (initialized) return;
  ensureAuthSchema();
  ensureImmutableOwnerAccount();
  initialized = true;
}

interface UserDbRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  is_immutable_owner: number;
  email_verified: number;
  email_verified_at: string | null;
  password_salt: string | null;
  password_hash: string | null;
  providers_json: string;
  status: string;
  created_at: string;
  last_login_at: string;
}

function parseProviders(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
  } catch {
    // ignore malformed json
  }
  return [];
}

function mapUserRow(row: UserDbRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: row.role as UserRole,
    isImmutableOwner: row.is_immutable_owner === 1,
    emailVerified: row.email_verified === 1 || row.is_immutable_owner === 1,
    providers: parseProviders(row.providers_json),
    status: row.status as UserStatus,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function hasOwnerClaimedCredential(): boolean {
  initAuthDb();
  const db = initLearningDb();
  const cred = db
    .prepare('SELECT email FROM owner_credentials WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as { email?: string } | undefined;
  if (cred?.email) return true;

  const ownerRow = db
    .prepare('SELECT password_hash FROM users WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as { password_hash?: string | null } | undefined;
  return Boolean(ownerRow?.password_hash);
}

export function isOwnerEnvKeyConfigured(): boolean {
  return Boolean(process.env.OWNER_ACCESS_KEY?.trim());
}

export function claimOwnerPasskey(newPasskey: string): AuthUser {
  initAuthDb();
  const trimmed = newPasskey.trim();
  if (trimmed.length < 8) {
    throw new Error('Owner passkey must be at least 8 characters long.');
  }
  if (isOwnerEnvKeyConfigured()) {
    throw new Error('OWNER_ACCESS_KEY is configured in server environment Secrets.');
  }
  if (hasOwnerClaimedCredential()) {
    throw new Error('Owner password has already been claimed. Sign in with your email and password.');
  }

  const db = initLearningDb();
  const { salt, hash } = hashPasswordScrypt(trimmed);
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO owner_credentials (email, salt, password_hash, updated_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(OFFICIAL_OWNER_EMAIL, salt, hash, now);

  ensureImmutableOwnerAccount();
  const owner = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as unknown as UserDbRow;

  const providers = parseProviders(owner.providers_json);
  if (!providers.includes('email')) providers.push('email');

  db.prepare(
    `
    UPDATE users
    SET password_salt = ?, password_hash = ?, providers_json = ?, email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), last_login_at = ?
    WHERE id = ?
  `
  ).run(salt, hash, JSON.stringify(providers), now, now, owner.id);

  const updated = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(owner.id) as unknown as UserDbRow;
  return mapUserRow(updated);
}

export function verifyOwnerPasskey(emailInput: string, passkey: string): AuthUser {
  initAuthDb();
  const normalizedEmail = normalizeEmail(emailInput);
  if (normalizedEmail !== OFFICIAL_OWNER_EMAIL) {
    throw new Error('Direct owner passkey access is restricted strictly to the official owner account.');
  }

  const envKey = process.env.OWNER_ACCESS_KEY?.trim();
  if (envKey) {
    const inputBuf = Buffer.from(passkey);
    const envBuf = Buffer.from(envKey);
    if (inputBuf.length !== envBuf.length || !timingSafeEqual(inputBuf, envBuf)) {
      throw new Error('Invalid owner access key.');
    }
  } else {
    const db = initLearningDb();
    const ownerRow = db
      .prepare('SELECT password_salt, password_hash FROM users WHERE LOWER(email) = ?')
      .get(OFFICIAL_OWNER_EMAIL) as { password_salt: string | null; password_hash: string | null } | undefined;

    const cred = db
      .prepare('SELECT salt, password_hash FROM owner_credentials WHERE LOWER(email) = ?')
      .get(OFFICIAL_OWNER_EMAIL) as { salt: string; password_hash: string } | undefined;

    const activeSalt = ownerRow?.password_salt || cred?.salt;
    const activeHash = ownerRow?.password_hash || cred?.password_hash;

    if (!activeSalt || !activeHash) {
      throw new Error('Owner password is not set yet. Use First-Time Owner Setup or Create Account.');
    }

    if (!verifyPasswordScrypt(passkey, activeSalt, activeHash)) {
      throw new Error('Incorrect owner email or password.');
    }
  }

  ensureImmutableOwnerAccount();
  const db = initLearningDb();
  const now = new Date().toISOString();
  const owner = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as unknown as UserDbRow;

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, owner.id);
  return mapUserRow({ ...owner, last_login_at: now });
}

export function rotateOwnerPasskey(currentPasskey: string, newPasskey: string): void {
  initAuthDb();
  if (isOwnerEnvKeyConfigured()) {
    throw new Error('OWNER_ACCESS_KEY is managed via server Secrets and cannot be changed in the UI.');
  }
  const db = initLearningDb();
  const existing = db
    .prepare('SELECT salt, password_hash FROM owner_credentials WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as { salt: string; password_hash: string } | undefined;

  const ownerRow = db
    .prepare('SELECT id, password_salt, password_hash FROM users WHERE LOWER(email) = ?')
    .get(OFFICIAL_OWNER_EMAIL) as { id: string; password_salt: string | null; password_hash: string | null } | undefined;

  const verifySalt = existing?.salt || ownerRow?.password_salt;
  const verifyHash = existing?.password_hash || ownerRow?.password_hash;

  if (verifySalt && verifyHash && !verifyPasswordScrypt(currentPasskey, verifySalt, verifyHash)) {
    throw new Error('Current owner password is incorrect.');
  }

  const trimmedNew = newPasskey.trim();
  if (trimmedNew.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  const { salt, hash } = hashPasswordScrypt(trimmedNew);
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO owner_credentials (email, salt, password_hash, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      salt = excluded.salt,
      password_hash = excluded.password_hash,
      updated_at = excluded.updated_at
  `
  ).run(OFFICIAL_OWNER_EMAIL, salt, hash, now);

  if (ownerRow?.id) {
    db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?').run(
      salt,
      hash,
      ownerRow.id
    );
  }
}

// ============================================================================
// Standard Email + Password Registration, Verification & Password Recovery
// ============================================================================
function storeEmailVerificationToken(userId: string): { token: string; code: string } {
  const db = initLearningDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFY_DURATION_MS).toISOString();
  const token = randomBytes(32).toString('hex');
  const code = generateShortCode();

  // Invalidate any prior unused verification tokens for this user
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL').run(userId);

  db.prepare(
    `
    INSERT INTO email_verification_tokens (id, user_id, token_hash, code_hash, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)
  `
  ).run(
    `ev-${randomBytes(8).toString('hex')}`,
    userId,
    hashToken(token),
    hashToken(code),
    expiresAt,
    now.toISOString()
  );

  return { token, code };
}

function storePasswordResetToken(userId: string): { token: string; code: string } {
  const db = initLearningDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_DURATION_MS).toISOString();
  const token = randomBytes(32).toString('hex');
  const code = generateShortCode();

  // Replace previous unused reset tokens for this user
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(userId);

  db.prepare(
    `
    INSERT INTO password_reset_tokens (id, user_id, token_hash, code_hash, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)
  `
  ).run(
    `pr-${randomBytes(8).toString('hex')}`,
    userId,
    hashToken(token),
    hashToken(code),
    expiresAt,
    now.toISOString()
  );

  return { token, code };
}

export function registerEmailUser(params: {
  name: string;
  email: string;
  password: string;
}): { user: AuthUser; verificationToken: string | null; verificationCode: string | null } {
  initAuthDb();
  const db = initLearningDb();

  const name = params.name.trim();
  const email = normalizeEmail(params.email);
  const password = params.password;

  if (!name || name.length < 2) {
    throw new Error('Please enter your full name (at least 2 characters).');
  }
  if (!isValidEmailFormat(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const isOwner = email === OFFICIAL_OWNER_EMAIL;
  const existing = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(email) as unknown as UserDbRow | undefined;

  if (existing) {
    // Allow first-time password bootstrap for immutable owner only if owner has no password claimed yet
    if (isOwner && !hasOwnerClaimedCredential() && !isOwnerEnvKeyConfigured()) {
      const { salt, hash } = hashPasswordScrypt(password);
      const now = new Date().toISOString();
      const providers = parseProviders(existing.providers_json);
      if (!providers.includes('email')) providers.push('email');

      db.prepare(
        `
        INSERT INTO owner_credentials (email, salt, password_hash, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          salt = excluded.salt,
          password_hash = excluded.password_hash,
          updated_at = excluded.updated_at
      `
      ).run(OFFICIAL_OWNER_EMAIL, salt, hash, now);

      db.prepare(
        `
        UPDATE users
        SET name = ?, password_salt = ?, password_hash = ?, providers_json = ?,
            email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), last_login_at = ?
        WHERE id = ?
      `
      ).run(name, salt, hash, JSON.stringify(providers), now, now, existing.id);

      const updated = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(existing.id) as unknown as UserDbRow;
      return { user: mapUserRow(updated), verificationToken: null, verificationCode: null };
    }

    throw new Error('An account with this email already exists. Please sign in or recover your password.');
  }

  const settings = getGlobalAppSettings();
  if (!settings.allowNewRegistrations) {
    throw new Error('New account registrations are currently paused by the Super Administrator.');
  }

  const { salt, hash } = hashPasswordScrypt(password);
  const id = `usr-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO users (
      id, email, name, avatar_url, role, is_immutable_owner,
      providers_json, status, password_salt, password_hash,
      email_verified, email_verified_at, created_at, last_login_at
    ) VALUES (?, ?, ?, NULL, 'user', 0, '["email"]', 'active', ?, ?, 0, NULL, ?, ?)
  `
  ).run(id, email, name.slice(0, 120), salt, hash, now, now);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserDbRow;
  const { token, code } = storeEmailVerificationToken(id);

  return {
    user: mapUserRow(created),
    verificationToken: token,
    verificationCode: code,
  };
}

export function loginWithEmailPassword(params: {
  email: string;
  password: string;
  requireVerifiedEmail: boolean;
}): AuthUser {
  initAuthDb();
  const db = initLearningDb();
  const email = normalizeEmail(params.email);
  const password = params.password;

  if (!isValidEmailFormat(email) || !password) {
    throw new Error('Please enter both your email address and password.');
  }

  if (email === OFFICIAL_OWNER_EMAIL) {
    return verifyOwnerPasskey(email, password);
  }

  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(email) as unknown as UserDbRow | undefined;

  if (!row || !row.password_salt || !row.password_hash) {
    throw new Error('Invalid email or password.');
  }

  if (!verifyPasswordScrypt(password, row.password_salt, row.password_hash)) {
    throw new Error('Invalid email or password.');
  }

  if (row.status === 'suspended') {
    throw new Error('This account has been suspended by an administrator.');
  }

  if (params.requireVerifiedEmail && row.email_verified !== 1) {
    throw new EmailNotVerifiedError(row.email);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id);
  return mapUserRow({ ...row, last_login_at: now });
}

export function issueEmailVerificationForAddress(emailInput: string): {
  user: AuthUser;
  token: string;
  code: string;
} | null {
  initAuthDb();
  const db = initLearningDb();
  const email = normalizeEmail(emailInput);
  if (!isValidEmailFormat(email)) return null;

  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(email) as unknown as UserDbRow | undefined;

  if (!row || row.email_verified === 1 || row.status === 'suspended') {
    return null;
  }

  const { token, code } = storeEmailVerificationToken(row.id);
  return { user: mapUserRow(row), token, code };
}

export function verifyEmailByTokenOrCode(params: {
  token?: string;
  email?: string;
  code?: string;
}): AuthUser {
  initAuthDb();
  const db = initLearningDb();
  const nowIso = new Date().toISOString();

  let matchedTokenRow:
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (params.token && params.token.trim().length > 10) {
    const tokenHash = hashToken(params.token.trim());
    matchedTokenRow = db
      .prepare('SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ?')
      .get(tokenHash) as typeof matchedTokenRow;
  } else if (params.email && params.code) {
    const email = normalizeEmail(params.email);
    const code = params.code.trim().toUpperCase();
    const userRow = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
      .get(email) as { id: string } | undefined;
    if (userRow) {
      const codeHash = hashToken(code);
      matchedTokenRow = db
        .prepare(
          'SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE user_id = ? AND code_hash = ? ORDER BY created_at DESC LIMIT 1'
        )
        .get(userRow.id, codeHash) as typeof matchedTokenRow;
    }
  }

  if (!matchedTokenRow || matchedTokenRow.used_at || matchedTokenRow.expires_at <= nowIso) {
    throw new Error('This email verification link or code is invalid or has expired.');
  }

  db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE id = ?').run(nowIso, matchedTokenRow.id);
  db.prepare('UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(
    nowIso,
    matchedTokenRow.user_id
  );

  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(matchedTokenRow.user_id) as unknown as UserDbRow | undefined;

  if (!user) {
    throw new Error('Account not found.');
  }
  return mapUserRow(user);
}

export function issuePasswordResetForAddress(emailInput: string): {
  user: AuthUser;
  token: string;
  code: string;
} | null {
  initAuthDb();
  const db = initLearningDb();
  const email = normalizeEmail(emailInput);
  if (!isValidEmailFormat(email)) return null;

  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(email) as unknown as UserDbRow | undefined;

  if (!row || (row.status === 'suspended' && row.is_immutable_owner !== 1)) {
    return null;
  }

  const { token, code } = storePasswordResetToken(row.id);
  return { user: mapUserRow(row), token, code };
}

export function createAdminRecoveryTokenForUser(targetUserId: string): {
  user: AuthUser;
  token: string;
  code: string;
} {
  initAuthDb();
  const db = initLearningDb();
  const row = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(targetUserId) as unknown as UserDbRow | undefined;

  if (!row) {
    throw new Error('User account not found.');
  }

  const { token, code } = storePasswordResetToken(row.id);
  return { user: mapUserRow(row), token, code };
}

export function resetPasswordWithTokenOrCode(params: {
  token?: string;
  email?: string;
  code?: string;
  newPassword: string;
}): AuthUser {
  initAuthDb();
  const db = initLearningDb();

  if (!params.newPassword || params.newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  const nowIso = new Date().toISOString();
  let matchedRow:
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (params.token && params.token.trim().length > 10) {
    const tokenHash = hashToken(params.token.trim());
    matchedRow = db
      .prepare('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?')
      .get(tokenHash) as typeof matchedRow;
  } else if (params.email && params.code) {
    const email = normalizeEmail(params.email);
    const code = params.code.trim().toUpperCase();
    const userRow = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
      .get(email) as { id: string } | undefined;
    if (userRow) {
      const codeHash = hashToken(code);
      matchedRow = db
        .prepare(
          'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE user_id = ? AND code_hash = ? ORDER BY created_at DESC LIMIT 1'
        )
        .get(userRow.id, codeHash) as typeof matchedRow;
    }
  }

  if (!matchedRow || matchedRow.used_at || matchedRow.expires_at <= nowIso) {
    throw new Error('This password recovery link or code is invalid or has expired.');
  }

  const targetUser = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(matchedRow.user_id) as unknown as UserDbRow | undefined;

  if (!targetUser) {
    throw new Error('Account not found.');
  }

  const { salt, hash } = hashPasswordScrypt(params.newPassword);
  const providers = parseProviders(targetUser.providers_json);
  if (!providers.includes('email')) providers.push('email');

  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(nowIso, matchedRow.id);
  db.prepare(
    `
    UPDATE users
    SET
      password_salt = ?,
      password_hash = ?,
      providers_json = ?,
      email_verified = 1,
      email_verified_at = COALESCE(email_verified_at, ?)
    WHERE id = ?
  `
  ).run(salt, hash, JSON.stringify(providers), nowIso, targetUser.id);

  if (targetUser.is_immutable_owner === 1 || targetUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL) {
    db.prepare(
      `
      INSERT INTO owner_credentials (email, salt, password_hash, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        salt = excluded.salt,
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at
    `
    ).run(OFFICIAL_OWNER_EMAIL, salt, hash, nowIso);
  }

  // Revoke all active sessions after password reset
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUser.id);

  const updated = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(targetUser.id) as unknown as UserDbRow;
  return mapUserRow(updated);
}

export function changeUserPassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): void {
  initAuthDb();
  const db = initLearningDb();

  if (!params.newPassword || params.newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  const row = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(params.userId) as unknown as UserDbRow | undefined;

  if (!row) {
    throw new Error('Account not found.');
  }

  if (row.password_salt && row.password_hash) {
    if (!verifyPasswordScrypt(params.currentPassword, row.password_salt, row.password_hash)) {
      throw new Error('Current password is incorrect.');
    }
  }

  const { salt, hash } = hashPasswordScrypt(params.newPassword);
  const nowIso = new Date().toISOString();
  const providers = parseProviders(row.providers_json);
  if (!providers.includes('email')) providers.push('email');

  db.prepare('UPDATE users SET password_salt = ?, password_hash = ?, providers_json = ? WHERE id = ?').run(
    salt,
    hash,
    JSON.stringify(providers),
    row.id
  );

  if (row.is_immutable_owner === 1 || row.email.toLowerCase() === OFFICIAL_OWNER_EMAIL) {
    db.prepare(
      `
      INSERT INTO owner_credentials (email, salt, password_hash, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        salt = excluded.salt,
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at
    `
    ).run(OFFICIAL_OWNER_EMAIL, salt, hash, nowIso);
  }
}

export function upsertOAuthUser(params: {
  email: string;
  name: string;
  avatarUrl?: string | null;
  provider: 'google' | 'facebook';
}): AuthUser {
  initAuthDb();
  const db = initLearningDb();
  const email = normalizeEmail(params.email);
  if (!email) {
    throw new Error('OAuth provider did not return a verified email address.');
  }

  const now = new Date().toISOString();
  const isOwner = email === OFFICIAL_OWNER_EMAIL;
  const existing = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(email) as unknown as UserDbRow | undefined;

  if (!existing) {
    const settings = getGlobalAppSettings();
    if (!isOwner && !settings.allowNewRegistrations) {
      throw new Error('New user registrations are currently paused by the Administrator.');
    }

    const id = isOwner
      ? 'owner-shamsmomtaze33'
      : `usr-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const role: UserRole = isOwner ? 'super_admin' : 'user';
    const providers = JSON.stringify([params.provider]);

    db.prepare(
      `
      INSERT INTO users (
        id, email, name, avatar_url, role, is_immutable_owner,
        providers_json, status, email_verified, email_verified_at, created_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)
    `
    ).run(
      id,
      email,
      params.name.trim() || email.split('@')[0],
      params.avatarUrl ?? null,
      role,
      isOwner ? 1 : 0,
      providers,
      now,
      now,
      now
    );

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserDbRow;
    return mapUserRow(created);
  }

  if (existing.status === 'suspended' && !isOwner) {
    throw new Error('This account has been suspended by an administrator.');
  }

  const providers = parseProviders(existing.providers_json);
  if (!providers.includes(params.provider)) {
    providers.push(params.provider);
  }

  const resolvedName =
    params.name.trim() && params.name.trim() !== existing.name ? params.name.trim() : existing.name;
  const resolvedAvatar = params.avatarUrl ?? existing.avatar_url;

  db.prepare(
    `
    UPDATE users
    SET
      name = ?,
      avatar_url = ?,
      providers_json = ?,
      email_verified = 1,
      email_verified_at = COALESCE(email_verified_at, ?),
      role = CASE WHEN is_immutable_owner = 1 THEN 'super_admin' ELSE role END,
      status = CASE WHEN is_immutable_owner = 1 THEN 'active' ELSE status END,
      last_login_at = ?
    WHERE id = ?
  `
  ).run(resolvedName, resolvedAvatar, JSON.stringify(providers), now, now, existing.id);

  const updated = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(existing.id) as unknown as UserDbRow;
  return mapUserRow(updated);
}

export function createUserSession(userId: string, userAgent?: string): {
  sessionToken: string;
  expiresAt: string;
} {
  initAuthDb();
  const db = initLearningDb();
  const sessionToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(sessionToken);
  const id = `sess-${randomBytes(8).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  db.prepare(
    `
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(id, userId, tokenHash, expiresAt, now.toISOString(), userAgent?.slice(0, 220) ?? null);

  return { sessionToken, expiresAt };
}

export function getUserBySessionToken(rawToken: string): AuthUser | null {
  if (!rawToken || rawToken.length < 32) return null;
  initAuthDb();
  const db = initLearningDb();
  const tokenHash = hashToken(rawToken);

  const row = db
    .prepare(
      `
      SELECT u.*, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `
    )
    .get(tokenHash) as (UserDbRow & { expires_at: string }) | undefined;

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  if (row.status === 'suspended' && row.is_immutable_owner !== 1) {
    return null;
  }

  return mapUserRow(row);
}

export function revokeSessionToken(rawToken: string): void {
  if (!rawToken) return;
  initAuthDb();
  const db = initLearningDb();
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
}

export function createOAuthState(provider: 'google' | 'facebook'): string {
  initAuthDb();
  const db = initLearningDb();
  const state = randomBytes(24).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 10).toISOString();

  db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now.toISOString());

  db.prepare(
    `
    INSERT INTO oauth_states (state, provider, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(state, provider, expiresAt, now.toISOString());

  return state;
}

export function consumeOAuthState(state: string, provider: 'google' | 'facebook'): boolean {
  if (!state) return false;
  initAuthDb();
  const db = initLearningDb();
  const nowIso = new Date().toISOString();
  const row = db
    .prepare('SELECT state, provider, expires_at FROM oauth_states WHERE state = ?')
    .get(state) as { state: string; provider: string; expires_at: string } | undefined;

  if (!row) return false;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

  return row.provider === provider && row.expires_at > nowIso;
}

export function createOAuthTicket(sessionToken: string): string {
  initAuthDb();
  const db = initLearningDb();
  const ticket = randomBytes(24).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 2).toISOString();

  db.prepare('DELETE FROM oauth_tickets WHERE expires_at <= ?').run(now.toISOString());
  db.prepare(
    `
    INSERT INTO oauth_tickets (ticket, session_token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(ticket, sessionToken, expiresAt, now.toISOString());

  return ticket;
}

export function consumeOAuthTicket(ticket: string): { user: AuthUser; sessionToken: string } | null {
  if (!ticket) return null;
  initAuthDb();
  const db = initLearningDb();
  const nowIso = new Date().toISOString();
  const row = db
    .prepare('SELECT ticket, session_token, expires_at FROM oauth_tickets WHERE ticket = ?')
    .get(ticket) as { ticket: string; session_token: string; expires_at: string } | undefined;

  if (!row) return null;
  db.prepare('DELETE FROM oauth_tickets WHERE ticket = ?').run(ticket);
  if (row.expires_at <= nowIso) return null;

  const user = getUserBySessionToken(row.session_token);
  if (!user) return null;
  return { user, sessionToken: row.session_token };
}

export function listAllUsers(): AuthUser[] {
  initAuthDb();
  const db = initLearningDb();
  const rows = db
    .prepare(
      `
      SELECT * FROM users
      ORDER BY is_immutable_owner DESC,
        CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        created_at DESC
    `
    )
    .all() as unknown as UserDbRow[];

  return rows.map(mapUserRow);
}

export function updateUserRoleOrStatus(params: {
  targetUserId: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'suspended';
  emailVerified?: boolean;
}): AuthUser {
  initAuthDb();
  const db = initLearningDb();
  const target = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(params.targetUserId) as unknown as UserDbRow | undefined;

  if (!target) {
    throw new Error('User account not found.');
  }

  if (target.is_immutable_owner === 1 || target.email.toLowerCase() === OFFICIAL_OWNER_EMAIL) {
    throw new Error('Official Super Admin ownership cannot be modified or suspended.');
  }

  const nextRole = params.role ?? (target.role as 'admin' | 'user');
  const nextStatus = params.status ?? (target.status as 'active' | 'suspended');
  const nextVerified =
    typeof params.emailVerified === 'boolean' ? (params.emailVerified ? 1 : 0) : target.email_verified;
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE users
    SET
      role = ?,
      status = ?,
      email_verified = ?,
      email_verified_at = CASE WHEN ? = 1 THEN COALESCE(email_verified_at, ?) ELSE NULL END
    WHERE id = ?
  `
  ).run(nextRole, nextStatus, nextVerified, nextVerified, nowIso, params.targetUserId);

  if (nextStatus === 'suspended') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.targetUserId);
  }

  const updated = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(params.targetUserId) as unknown as UserDbRow;
  return mapUserRow(updated);
}

export function deleteUserAccount(targetUserId: string): void {
  initAuthDb();
  const db = initLearningDb();
  const target = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(targetUserId) as unknown as UserDbRow | undefined;

  if (!target) {
    throw new Error('User account not found.');
  }

  if (target.is_immutable_owner === 1 || target.email.toLowerCase() === OFFICIAL_OWNER_EMAIL) {
    throw new Error('Official Super Admin owner account cannot be deleted.');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
}

export function getGlobalAppSettings(): GlobalAppSettings {
  initAuthDb();
  const db = initLearningDb();
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{
    key: string;
    value: string;
  }>;

  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    appName: OFFICIAL_APP_NAME,
    ownerEmail: OFFICIAL_OWNER_EMAIL,
    defaultModel:
      (map.get('defaultModel') as GlobalAppSettings['defaultModel']) ||
      DEFAULT_GLOBAL_SETTINGS.defaultModel,
    googleSearchMode:
      (map.get('googleSearchMode') as GlobalAppSettings['googleSearchMode']) ||
      DEFAULT_GLOBAL_SETTINGS.googleSearchMode,
    allowNewRegistrations:
      map.get('allowNewRegistrations') !== undefined
        ? map.get('allowNewRegistrations') === 'true'
        : DEFAULT_GLOBAL_SETTINGS.allowNewRegistrations,
    googleOAuthEnabled:
      map.get('googleOAuthEnabled') !== undefined
        ? map.get('googleOAuthEnabled') === 'true'
        : DEFAULT_GLOBAL_SETTINGS.googleOAuthEnabled,
    facebookOAuthEnabled:
      map.get('facebookOAuthEnabled') !== undefined
        ? map.get('facebookOAuthEnabled') === 'true'
        : DEFAULT_GLOBAL_SETTINGS.facebookOAuthEnabled,
    siteDomain:
      map.get('siteDomain') || process.env.CUSTOM_DOMAIN?.trim() || DEFAULT_GLOBAL_SETTINGS.siteDomain,
    googleSiteVerification:
      map.get('googleSiteVerification') ||
      process.env.GOOGLE_SITE_VERIFICATION?.trim() ||
      DEFAULT_GLOBAL_SETTINGS.googleSiteVerification,
    customSystemInstruction:
      map.get('customSystemInstruction') || DEFAULT_GLOBAL_SETTINGS.customSystemInstruction,
  };
}

export function updateGlobalAppSettings(
  updates: Partial<Omit<GlobalAppSettings, 'appName' | 'ownerEmail'>>,
  updatedByEmail: string
): GlobalAppSettings {
  initAuthDb();
  const db = initLearningDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(
    `
    INSERT INTO app_settings (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `
  );

  if (updates.defaultModel) {
    stmt.run('defaultModel', updates.defaultModel, updatedByEmail, now);
  }
  if (updates.googleSearchMode) {
    stmt.run('googleSearchMode', updates.googleSearchMode, updatedByEmail, now);
  }
  if (typeof updates.allowNewRegistrations === 'boolean') {
    stmt.run(
      'allowNewRegistrations',
      updates.allowNewRegistrations ? 'true' : 'false',
      updatedByEmail,
      now
    );
  }
  if (typeof updates.googleOAuthEnabled === 'boolean') {
    stmt.run(
      'googleOAuthEnabled',
      updates.googleOAuthEnabled ? 'true' : 'false',
      updatedByEmail,
      now
    );
  }
  if (typeof updates.facebookOAuthEnabled === 'boolean') {
    stmt.run(
      'facebookOAuthEnabled',
      updates.facebookOAuthEnabled ? 'true' : 'false',
      updatedByEmail,
      now
    );
  }
  if (typeof updates.siteDomain === 'string') {
    stmt.run('siteDomain', updates.siteDomain.trim(), updatedByEmail, now);
  }
  if (typeof updates.googleSiteVerification === 'string') {
    stmt.run('googleSiteVerification', updates.googleSiteVerification.trim(), updatedByEmail, now);
  }
  if (typeof updates.customSystemInstruction === 'string') {
    stmt.run('customSystemInstruction', updates.customSystemInstruction.trim(), updatedByEmail, now);
  }

  return getGlobalAppSettings();
}
