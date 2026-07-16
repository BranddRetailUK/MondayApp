const crypto = require('crypto');
const { promisify } = require('util');
const pool = require('../db/pool');
const { NODE_ENV } = require('../config/env');

const scryptAsync = promisify(crypto.scrypt);
const COOKIE_NAME = 'uh_session';
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PASSWORD_KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 80;
const COMMON_PASSWORDS = new Set([
  '123456789012',
  'letmeinletmein',
  'password1234',
  'qwertyqwerty',
  'ultimatepromotions',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > EMAIL_MAX_LENGTH || /\s/.test(email)) return false;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@')) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

function cleanName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, NAME_MAX_LENGTH);
}

function passwordValidationError(password, identity = {}) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be no more than ${MAX_PASSWORD_LENGTH} characters`;
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase()) || new Set(value).size < 4) {
    return 'Choose a less predictable password';
  }

  const lowerPassword = value.toLowerCase();
  const identityParts = [
    normalizeEmail(identity.email).split('@')[0],
    cleanName(identity.firstName),
    cleanName(identity.lastName),
  ]
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 4);
  if (identityParts.some((part) => lowerPassword.includes(part))) {
    return 'Password must not contain your name or email address';
  }
  return '';
}

function fullName(user) {
  return [user?.first_name, user?.last_name].map(cleanName).filter(Boolean).join(' ');
}

function safeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: fullName(row),
    can_manage_users: row.can_manage_users === true,
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const key = await scryptAsync(String(password), salt, PASSWORD_KEY_LENGTH, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt,
    key.toString('base64url'),
  ].join('$');
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(String(password), salt, expected.length, {
    N: Number.parseInt(n, 10),
    r: Number.parseInt(r, 10),
    p: Number.parseInt(p, 10),
    maxmem: 64 * 1024 * 1024,
  });

  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

function parseCookies(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function sessionHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function sessionCookie(token, req) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  return parts.join('; ');
}

function shouldUseSecureCookie(req) {
  return NODE_ENV === 'production' || req?.secure || req?.get?.('x-forwarded-proto') === 'https';
}

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = sessionHash(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await pool.query(
    `INSERT INTO hub_sessions (id, user_id, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      userId,
      expiresAt,
      String(req.get('user-agent') || '').slice(0, 500) || null,
      String(req.ip || '').slice(0, 80) || null,
    ]
  );

  res.setHeader('Set-Cookie', sessionCookie(token, req));
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    await pool.query('DELETE FROM hub_sessions WHERE id = $1', [sessionHash(token)]).catch(() => {});
  }
  res.setHeader('Set-Cookie', clearSessionCookie(req));
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.can_manage_users
     FROM hub_sessions s
     JOIN hub_users u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.expires_at > NOW()
     LIMIT 1`,
    [sessionHash(token)]
  );

  if (!result.rowCount) return null;
  return safeUser(result.rows[0]);
}

module.exports = {
  COOKIE_NAME,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  cleanName,
  createSession,
  currentUser,
  destroySession,
  fullName,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordValidationError,
  safeUser,
  verifyPassword,
};
