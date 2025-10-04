const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const upload = require('../middleware/upload');

// List orders (with first-line preview)
router.get('/api/orders', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  try {
    const q = await pool.query(
      `WITH first_items AS (
         SELECT DISTINCT ON (oi.order_id)
           oi.order_id, oi.product_code, oi.product_title, oi.colour, oi.size
         FROM order_items oi
         ORDER BY oi.order_id, COALESCE(oi.line_no, 999999)
       )
       SELECT o.*,
              c.business_name AS customer_name,
              fi.product_code AS fi_code,
              fi.product_title AS fi_title,
              fi.colour AS fi_colour,
              fi.size AS fi_size
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN first_items fi ON fi.order_id = o.id
       ORDER BY o.created_at DESC
       LIMIT $1`, [limit]
    );

    const rows = q.rows.map(r => ({
      ...r,
      first_item: {
        product_code: r.fi_code,
        product_title: r.fi_title,
        colour: r.fi_colour,
        size: r.fi_size
      }
    }));
    res.json(rows);
  } catch (e) {
    console.error('GET /api/orders', e);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Create order (multipart)
router.post('/api/orders', upload.array('files', 20), async (req, res) => {
  try {
    const { customer_id, job_title, status, notes } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

    let items = [];
    try {
      items = JSON.parse(req.body.items || '[]');
      if (!Array.isArray(items)) items = [];
    } catch { items = []; }

    if (!items.length && (req.body.product_code || req.body.product_title || req.body.colour || req.body.size)) {
      items = [{
        line_no: 1,
        product_code: req.body.product_code || null,
        garment_type: req.body.garment_type || null,
        product_title: req.body.product_title || null,
        colour: req.body.colour || null,
        size: req.body.size || null,
        quantity: 1
      }];
    }
    if (!items.length) return res.status(400).json({ error: 'At least one order item is required' });

    const first = items[0] || {};
    const q = await pool.query(
      `INSERT INTO orders
       (customer_id, job_title, product_code, garment_type, product_title, colour, size, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        parseInt(customer_id,10),
        job_title || null,
        first.product_code || null,
        first.garment_type || null,
        first.product_title || null,
        first.colour || null,
        first.size || null,
        status || 'Draft',
        notes || null
      ]
    );
    const orderId = q.rows[0].id;

    // All items
    for (const it of items) {
      await pool.query(
        `INSERT INTO order_items
         (order_id, line_no, product_code, garment_type, product_title, colour, size, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          orderId,
          it.line_no || null,
          it.product_code || null,
          it.garment_type || null,
          it.product_title || null,
          it.colour || null,
          it.size || null,
          parseInt(it.quantity || 1, 10)
        ]
      );
    }

    // Files
    const files = req.files || [];
    for (const f of files) {
      await pool.query(
        `INSERT INTO order_files (order_id, filename, mimetype, size, path)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, f.filename, f.mimetype || null, f.size || null, `/uploads/${f.filename}`]
      );
    }

    res.status(201).json({ id: orderId });
  } catch (e) {
    console.error('POST /api/orders', e);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get one order (with items/files)
router.get('/api/orders/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const o = await pool.query(
      `SELECT o.*, c.business_name AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id=$1`, [id]);
    if (!o.rowCount) return res.status(404).json({ error: 'Not found' });

    const items = await pool.query(
      `SELECT id, line_no, product_code, garment_type, product_title, colour, size, quantity
       FROM order_items
       WHERE order_id=$1
       ORDER BY COALESCE(line_no, 999999), id`, [id]);
    const files = await pool.query(
      `SELECT id, filename, mimetype, size, path, created_at
       FROM order_files
       WHERE order_id=$1
       ORDER BY created_at ASC`, [id]);

    res.json({ order: o.rows[0], items: items.rows, files: files.rows });
  } catch (e) {
    console.error('GET /api/orders/:id', e);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

module.exports = router;
