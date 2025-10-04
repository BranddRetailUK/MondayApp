// src/routes/pencarrie.js
const express = require('express');
const router = express.Router();
const { listOrders, getOrder } = require('../integrations/pencarrie');

// GET /api/pencarrie/orders  -> list of live stock orders w/ delivery status
router.get('/orders', async (req, res) => {
  try {
    const orders = await listOrders();
    res.json({ ok: true, orders });
  } catch (e) {
    console.error('[PenCarrie] /orders failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/orders/:ordcode  -> single order detail (incl. line `cref`)
router.get('/orders/:ordcode', async (req, res) => {
  try {
    const data = await getOrder(req.params.ordcode);
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[PenCarrie] /orders/:ordcode failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

module.exports = router;
