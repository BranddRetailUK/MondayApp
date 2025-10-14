// src/routes/pencarrie.js
const express = require('express');
const router = express.Router();
const pen = require('../integrations/pencarrie');

// GET /api/pencarrie/debug/whoami -> confirm base URL, DNS resolution, egress IP
router.get('/debug/whoami', async (req, res) => {
  try {
    const info = await pen.checkIpAndHost();
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/orders -> list orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await pen.listOrders();
    res.json({ ok: true, orders });
  } catch (e) {
    console.error('[PenCarrie] /orders failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/orders/:ordcode -> order detail
router.get('/orders/:ordcode', async (req, res) => {
  try {
    const data = await pen.getOrder(req.params.ordcode);
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[PenCarrie] /orders/:ordcode failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Extra quick ping to prove gateway path works without business params (some gateways expose a ping)
router.get('/debug/ping', async (req, res) => {
  try {
    const data = await pen.callGateway('ping', {});
    res.json({ ok: true, data });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

module.exports = router;
