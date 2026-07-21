const path = require('path');
const express = require('express');
const pool = require('../db/pool');
const {
  cleanName,
  createSession,
  destroySession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordValidationError,
  safeUser,
  verifyPassword,
} = require('../services/hubAuth');

const router = express.Router();
const publicDir = path.join(__dirname, '..', '..', 'public');
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_RATE_LIMIT = 5;
const LOGIN_ACCOUNT_RATE_LIMIT = 10;
const LOGIN_IP_RATE_LIMIT = 50;
const DUMMY_PASSWORD_HASH = 'scrypt$16384$8$1$wjWNrvsckqK0J3mjkcFJFQ$PqiRkpiCmGEacgAVoF5B3beceEmMsvLCvravesg5JQd5bdBW6OBl65MHkAtgWUiYTUl5VJX0xBFBhBgftHcwWw';
const authRateBuckets = new Map();

router.get('/login', (req, res) => {
  if (req.hubUser) return res.redirect(safeNext(req.query.next));
  return res.sendFile(path.join(publicDir, 'login.html'));
});

router.get('/signup', (req, res) => {
  if (req.hubUser) return res.redirect(safeNext(req.query.next));
  return res.sendFile(path.join(publicDir, 'login.html'));
});

router.get('/api/auth/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ user: req.hubUser || null });
});

router.post('/api/auth/signup', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const firstName = cleanName(req.body?.first_name);
  const lastName = cleanName(req.body?.last_name);
  const password = String(req.body?.password || '');

  res.set('Cache-Control', 'no-store');
  if (!consumeRateLimit(req, res, 'signup', '', SIGNUP_RATE_LIMIT)) return;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  const passwordError = passwordValidationError(password, { email, firstName, lastName });
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  let client;
  try {
    const passwordHash = await hashPassword(password);
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO hub_signup_requests (
         email, first_name, last_name, password_hash, status,
         requested_at, updated_at, reviewed_at, reviewed_by_user_id, reviewed_by_name
       )
       SELECT $1, $2, $3, $4, 'pending', NOW(), NOW(), NULL, NULL, NULL
       WHERE NOT EXISTS (
         SELECT 1
         FROM hub_users
         WHERE LOWER(email) = LOWER($1)
       )
       ON CONFLICT ((LOWER(email))) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           password_hash = EXCLUDED.password_hash,
           status = 'pending',
           requested_at = NOW(),
           updated_at = NOW(),
           reviewed_at = NULL,
           reviewed_by_user_id = NULL,
           reviewed_by_name = NULL`,
      [email, firstName, lastName, passwordHash]
    );
    await client.query(
      `UPDATE hub_signup_requests request
       SET status = 'accepted',
           password_hash = NULL,
           updated_at = NOW()
       WHERE LOWER(request.email) = LOWER($1)
         AND EXISTS (
           SELECT 1
           FROM hub_users users
           WHERE LOWER(users.email) = LOWER(request.email)
         )`,
      [email]
    );
    await client.query('COMMIT');

    res.status(202).json({
      ok: true,
      status: 'pending',
      message: 'Your request has been received.',
    });
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('POST /api/auth/signup', err);
    return res.status(500).json({ error: 'Failed to submit signup request' });
  } finally {
    client?.release();
  }
});

router.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  res.set('Cache-Control', 'no-store');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!consumeRateLimit(req, res, 'login-account', email, LOGIN_ACCOUNT_RATE_LIMIT)) return;
  if (!consumeRateLimit(req, res, 'login-ip', '', LOGIN_IP_RATE_LIMIT)) return;

  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, password_hash, can_manage_users, access_scope
       FROM hub_users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];
    const valid = await verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await pool.query('UPDATE hub_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
    await createSession(req, res, user.id);
    clearRateLimit(req, 'login-account', email);
    res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('POST /api/auth/login', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

router.post('/api/auth/logout', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await destroySession(req, res);
  res.json({ ok: true });
});

function consumeRateLimit(req, res, scope, identifier, limit) {
  const now = Date.now();
  pruneRateBuckets(now);
  const key = rateLimitKey(req, scope, identifier);
  let bucket = authRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + AUTH_RATE_WINDOW_MS };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return false;
  }

  bucket.count += 1;
  authRateBuckets.set(key, bucket);
  return true;
}

function clearRateLimit(req, scope, identifier) {
  authRateBuckets.delete(rateLimitKey(req, scope, identifier));
}

function rateLimitKey(req, scope, identifier) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 80);
  return `${scope}:${ip}:${String(identifier || '').slice(0, 254)}`;
}

function pruneRateBuckets(now) {
  if (authRateBuckets.size < 1000) return;
  for (const [key, bucket] of authRateBuckets.entries()) {
    if (bucket.resetAt <= now) authRateBuckets.delete(key);
  }
}

function safeNext(value) {
  const next = String(value || '/');
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

module.exports = router;
