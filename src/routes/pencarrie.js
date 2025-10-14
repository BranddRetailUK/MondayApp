// src/routes/pencarrie.js
const express = require('express');
const router = express.Router();
const pen = require('../integrations/pencarrie');

// GET /api/pencarrie/debug/whoami  -> confirm base URL + egress IP (share IP with PenCarrie)
router.get('/debug/whoami', async (req, res) => {
  try {
    const info = await pen.checkIpAndHost();
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/orders  -> list of live stock orders w/ delivery status
router.get('/orders', async (req, res) => {
  try {
    const orders = await pen.listOrders();
    res.json({ ok: true, orders });
  } catch (e) {
    console.error('[PenCarrie] /orders failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/orders/:ordcode  -> single order detail (incl. line `cref`)
router.get('/orders/:ordcode', async (req, res) => {
  try {
    const data = await pen.getOrder(req.params.ordcode);
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[PenCarrie] /orders/:ordcode failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

module.exports = router;
