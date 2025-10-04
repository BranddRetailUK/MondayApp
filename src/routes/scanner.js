const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const router = express.Router();

const { signPayload, advanceScan } = require('../services/scanner');
const { getAccessToken, changeColumnValue } = require('../services/monday');
const {
  BOARD_ID, STATUS_COLUMN_ID, CHECKED_IN_COLUMN_ID
} = require('../config/env');

// Compact states map
router.get('/api/scan-states', async (_req, res) => {
  const pool = require('../db/pool');
  try {
    const q = await pool.query('SELECT item_id, scan_count, status FROM job_scans');
    const map = {}; for (const r of q.rows) map[r.item_id] = { scan_count: r.scan_count, status: r.status };
    res.json({ ok: true, map });
  } catch (e) {
    console.error('scan-states error:', e);
    res.status(500).json({ ok: false, error: 'failed' });
  }
});

router.get('/api/scan-url', (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  const ts = Date.now().toString();
  const sig = signPayload(itemId, ts);
  const base = `https://${req.get('host')}`;
  const url = `${base}/scan?i=${encodeURIComponent(itemId)}&ts=${ts}&sig=${sig}`;
  res.json({ url });
});

router.get('/scan', async (req, res) => {
  const { i, ts, sig, json } = req.query;
  if (json) res.set('Access-Control-Allow-Origin', '*');
  if (!i || !ts || !sig) return res.status(400).send('Invalid scan URL');
  const expected = signPayload(i, ts);
  if (sig !== expected) return res.status(403).send('Signature check failed');
  if (!getAccessToken()) return res.status(401).send('Not authenticated');

  try {
    const { scan_count, status } = await advanceScan(String(i));
    // Monday updates
    if (scan_count === 1 && CHECKED_IN_COLUMN_ID) {
      await changeColumnValue(i, CHECKED_IN_COLUMN_ID, JSON.stringify({ checked: 'true' }));
    }
    if (scan_count >= 2 && STATUS_COLUMN_ID) {
      const label = scan_count === 2 ? 'In Production' : 'Completed';
      await changeColumnValue(i, STATUS_COLUMN_ID, JSON.stringify({ label }));
    }
    if (json) return res.json({ ok: true, scan_count, status });
    res.send(`<html><body style="font-family:Arial;padding:20px">
      <div>Scan recorded</div>
      <div>Count: ${scan_count} — Status: <b>${status}</b></div>
      <script>setTimeout(()=>{ try{window.close()}catch(e){} }, 1200)</script>
    </body></html>`);
  } catch (e) {
    console.error('scan error:', e.message);
    return json ? res.status(500).json({ ok:false, error:'Failed to update' }) : res.status(500).send('Failed to update');
  }
});

// API endpoint for scanner device posting raw URL fragments
router.post('/api/scanner', express.json(), async (req, res) => {
  try {
    const { scan } = req.body;
    if (!scan || typeof scan !== 'string') return res.status(400).json({ error: 'No scan data' });

    let url;
    try { url = new URL(scan.trim()); }
    catch { url = new URL(`/scan?${scan.trim()}`, `http://dummy.local`); }

    const i = url.searchParams.get('i');
    let ts = url.searchParams.get('ts');
    let s = url.searchParams.get('sig');
    if (!i) return res.status(400).json({ error: 'Invalid scan string - no item id' });

    if (!ts) ts = Date.now().toString();
    if (!s) s = signPayload(i, ts);
    if (!getAccessToken()) return res.status(401).json({ error: 'Not authenticated with Monday' });

    const { scan_count, status } = await advanceScan(String(i));
    if (scan_count === 1 && CHECKED_IN_COLUMN_ID) {
      await changeColumnValue(i, CHECKED_IN_COLUMN_ID, JSON.stringify({ checked: 'true' }));
    }
    if (scan_count >= 2 && STATUS_COLUMN_ID) {
      const label = scan_count === 2 ? 'In Production' : 'Completed';
      await changeColumnValue(i, STATUS_COLUMN_ID, JSON.stringify({ label }));
    }
    res.json({ ok: true, item: i, scan_count, status });
  } catch (e) {
    console.error('POST /api/scanner error:', e);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});

// QR image render
router.get('/api/qr', async (req, res) => {
  const data = req.query.data || '';
  try {
    const buf = await require('qrcode').toBuffer(data, { width: 384, margin: 0 });
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch {
    res.status(400).send('Invalid QR data');
  }
});

module.exports = router;
