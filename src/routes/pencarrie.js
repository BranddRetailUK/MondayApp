// src/routes/pencarrie.js
const express = require('express');
const router = express.Router();

const pen = require('../integrations/pencarrie');

// dynamic import for node-fetch to avoid ESM/CJS headaches
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const { URLSearchParams } = require('node:url');

// Utility: trim whitespace and cap length for safe logging/response
function snippet(s = '', n = 1000) {
  try {
    const one = String(s).replace(/\s+/g, ' ').trim();
    return one.length > n ? `${one.slice(0, n)}…` : one;
  } catch {
    return '';
  }
}
function looksLikeHtml(s = '') {
  return /<!doctype\s+html|<html[\s>]/i.test(s);
}
function looksLikeXml(s = '') {
  return /^<\?xml|^\s*<\w+/i.test(s);
}

// GET /api/pencarrie/debug/whoami  -> confirm base URL, DNS resolution, egress IP
router.get('/debug/whoami', async (req, res) => {
  try {
    const info = await pen.checkIpAndHost();
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/debug/ping  -> perform a real POST to the gateway and echo status/headers/snippet
router.get('/debug/ping', async (req, res) => {
  const out = {
    info: {
      gatewayUrl: process.env.PENCARRIE_GATEWAY_URL,
      customerCode: process.env.PENCARRIE_CUSTOMER_CODE || 'ULPR',
    },
    result: { ok: false },
  };

  // include network info (egress IP + DNS) if available
  try {
    out.info.network = await pen.checkIpAndHost();
  } catch {}

  try {
    const form = new URLSearchParams();
    form.set('function', 'pclist'); // lightweight read call
    form.set('code', out.info.customerCode);

    const r = await fetch(out.info.gatewayUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
      body: form.toString(),
    });

    const text = await r.text().catch(() => '');
    const headersObj = Object.fromEntries(r.headers.entries());

    out.result = {
      ok: r.ok,
      status: r.status,
      contentType: headersObj['content-type'] || null,
      cfRay: headersObj['cf-ray'] || null,
      looksLikeHtml: looksLikeHtml(text),
      looksLikeXml: looksLikeXml(text),
      bodySnippet: snippet(text, 1200),
      headers: headersObj, // handy for support (rate-limit, cache, etc.)
    };

    const status = r.ok ? 200 : 502;
    res.status(status).json(out);
  } catch (e) {
    out.result = { ok: false, error: e.message };
    res.status(502).json(out);
  }
});

// GET /api/pencarrie/orders  -> list orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await pen.listOrders();
    res.json({ ok: true, orders });
  } catch (e) {
    console.error('[PenCarrie] /orders failed:', e);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// GET /api/pencarrie/orders/:ordcode  -> order detail
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
