const express = require('express');
const router = express.Router();
const { fetchBoardLitePaged, getAccessToken } = require('../services/monday');
const { BOARD_CACHE_MS } = require('../config/env');

let cache = { data: null, expires: 0, inFlight: null };

router.get('/api/board', async (_req, res) => {
  if (!getAccessToken()) return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });

  const now = Date.now();
  if (cache.data && cache.expires > now) return res.json(cache.data);
  if (cache.inFlight) {
    try { const d = await cache.inFlight; return res.json(d); }
    catch (_) { cache.inFlight = null; }
  }
  cache.inFlight = fetchBoardLitePaged();
  try {
    const data = await cache.inFlight;
    cache.data = data;
    cache.expires = Date.now() + BOARD_CACHE_MS;
    return res.json(data);
  } catch (e) {
    console.error('board fetch failed:', e.message);
    return res.status(500).json({ error: 'Failed to fetch board' });
  } finally {
    cache.inFlight = null;
  }
});

module.exports = router;
