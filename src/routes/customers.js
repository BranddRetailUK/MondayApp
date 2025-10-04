// src/routes/customers.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// --- SEARCH MUST COME FIRST ---
router.get('/api/customers/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const r = await pool.query(
      `SELECT id, business_name, contact_name, email
       FROM customers
       WHERE business_name ILIKE $1 OR contact_name ILIKE $1 OR email ILIKE $1
       ORDER BY business_name ASC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /api/customers/search', e);
    res.json([]);
  }
});

// List customers
router.get('/api/customers', async (_req, res) => {
  try {
    const q = await pool.query(`
      SELECT id, business_name, contact_name, email, phone, mobile
      FROM customers
      ORDER BY created_at DESC
    `);
    res.json(q.rows);
  } catch (e) {
    console.error('GET /api/customers', e);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Create
router.post('/api/customers', express.json(), async (req, res) => {
  const b = req.body || {};
  if (!b.business_name || !b.email) return res.status(400).json({ error: 'business_name and email are required' });
  try {
    const q = await pool.query(
      `INSERT INTO customers
       (business_name, contact_name, email, phone, mobile,
        inv_line1, inv_line2, inv_city, inv_region, inv_postcode, inv_country,
        ship_line1, ship_line2, ship_city, ship_region, ship_postcode, ship_country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        b.business_name, b.contact_name || null, b.email,
        b.phone || null, b.mobile || null,
        b.inv_line1 || null, b.inv_line2 || null, b.inv_city || null,
        b.inv_region || null, b.inv_postcode || null, b.inv_country || null,
        b.ship_line1 || null, b.ship_line2 || null, b.ship_city || null,
        b.ship_region || null, b.ship_postcode || null, b.ship_country || null
      ]
    );
    res.status(201).json({ id: q.rows[0].id });
  } catch (e) {
    console.error('POST /api/customers', e);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Customer orders (summary)
router.get('/api/customers/:id/orders', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const q = await pool.query(
      `SELECT id AS order_number, status, total, created_at
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    );
    res.json(q.rows);
  } catch (e) {
    console.error('GET /api/customers/:id/orders', e);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// Get single (keep AFTER search)
router.get('/api/customers/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const q = await pool.query(`SELECT * FROM customers WHERE id = $1`, [id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(q.rows[0]);
  } catch (e) {
    console.error('GET /api/customers/:id', e);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

module.exports = router;
