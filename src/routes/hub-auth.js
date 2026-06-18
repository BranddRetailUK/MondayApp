const path = require('path');
const express = require('express');
const pool = require('../db/pool');
const {
  ALLOWED_EMAIL_DOMAIN,
  cleanName,
  createSession,
  destroySession,
  hashPassword,
  isAllowedEmail,
  normalizeEmail,
  safeUser,
  verifyPassword,
} = require('../services/hubAuth');

const router = express.Router();
const publicDir = path.join(__dirname, '..', '..', 'public');

router.get('/login', (req, res) => {
  if (req.hubUser) return res.redirect(safeNext(req.query.next));
  return res.sendFile(path.join(publicDir, 'login.html'));
});

router.get('/signup', (req, res) => {
  if (req.hubUser) return res.redirect(safeNext(req.query.next));
  return res.sendFile(path.join(publicDir, 'login.html'));
});

router.get('/api/auth/me', (req, res) => {
  res.json({ user: req.hubUser || null });
});

router.post('/api/auth/signup', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const firstName = cleanName(req.body?.first_name);
  const lastName = cleanName(req.body?.last_name);
  const password = String(req.body?.password || '');

  if (!isAllowedEmail(email)) {
    return res.status(400).json({ error: `Signups are limited to @${ALLOWED_EMAIL_DOMAIN} email addresses` });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const inserted = await pool.query(
      `INSERT INTO hub_users (email, first_name, last_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, first_name, last_name`,
      [email, firstName, lastName, passwordHash]
    );

    await createSession(req, res, inserted.rows[0].id);
    res.status(201).json({ user: safeUser(inserted.rows[0]) });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'An account already exists for this email address' });
    }
    console.error('POST /api/auth/signup', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, password_hash
       FROM hub_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];
    const valid = user ? await verifyPassword(password, user.password_hash) : false;
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await pool.query('UPDATE hub_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
    await createSession(req, res, user.id);
    res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('POST /api/auth/login', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

router.post('/api/auth/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

function safeNext(value) {
  const next = String(value || '/');
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

module.exports = router;
