// src/routes/scanner.js
const express = require('express');
const router = express.Router();

const { signPayload, advanceScan } = require('../services/scanner');
const { getAccessToken, changeColumnValue } = require('../services/monday');

// Use the same config vars you already have wired
const {
  BOARD_ID,              // not directly used here but preserved for consistency
  STATUS_COLUMN_ID,      // e.g. "label__1"
  CHECKED_IN_COLUMN_ID,  // e.g. "checkbox__1"
} = require('../config/env');

// Align to your KNOWN-WORKING label envs (fall back to sane defaults)
const STEP2_STATUS_LABEL = process.env.STEP2_STATUS_LABEL || 'IN PRODUCTION';
const STEP3_STATUS_LABEL = process.env.STEP3_STATUS_LABEL || 'COMPLETED';

// ———————————————————————————————————————————————————————————
// Utility: apply Monday status by LABEL (using your existing wrapper)
// ———————————————————————————————————————————————————————————
async function setStatusByLabel(itemId, label) {
  // Monday expects a JSON string payload for column value mutations
  return changeColumnValue(
    itemId,
    STATUS_COLUMN_ID,
    JSON.stringify({ label })
  );
}

// ———————————————————————————————————————————————————————————
// (Optional) compact states map route (unchanged from your setup)
// ———————————————————————————————————————————————————————————
router.get('/api/scan-states', async (_req, res) => {
  const pool = require('../db/pool');
  try {
    const q = await pool.query('SELECT item_id, scan_count, status FROM job_scans');
    const map = {};
    for (const r of q.rows) map[r.item_id] = { scan_count: r.scan_count, status: r.status };
    res.json({ ok: true, map });
  } catch (e) {
    console.error('scan-states error:', e);
    res.status(500).json({ ok: false, error: 'failed' });
  }
});

// ———————————————————————————————————————————————————————————
// GET /scan — used by QR URL; records scan and pushes updates
// ———————————————————————————————————————————————————————————
router.get('/scan', async (req, res) => {
  const { i, ts, sig, json } = req.query;
  if (json) res.set('Access-Control-Allow-Origin', '*');
  if (!i || !ts || !sig) return res.status(400).send('Invalid scan URL');

  const expected = signPayload(i, ts);
  if (sig !== expected) return res.status(403).send('Signature check failed');
  if (!getAccessToken()) return res.status(401).send('Not authenticated');

  try {
    const { scan_count, status } = await advanceScan(String(i));

    // 1) First scan: tick the "checked in" checkbox column
    if (scan_count === 1 && CHECKED_IN_COLUMN_ID) {
      await changeColumnValue(i, CHECKED_IN_COLUMN_ID, JSON.stringify({ checked: 'true' }));
    }

    // 2) Second scan: set STATUS by label from ENV
    if (scan_count === 2 && STATUS_COLUMN_ID) {
      await setStatusByLabel(i, STEP2_STATUS_LABEL);
    }

    // 3) Third scan: set STATUS by label from ENV
    if (scan_count === 3 && STATUS_COLUMN_ID) {
      await setStatusByLabel(i, STEP3_STATUS_LABEL);
    }

    if (json) return res.json({ ok: true, scan_count, status });
    res.send(`<html><body style="font-family:Arial;padding:20px">
      <div>Scan recorded</div>
      <div>Count: ${scan_count} — Status: <b>${status}</b></div>
      <script>setTimeout(()=>{ try{window.close()}catch(e){} }, 1200)</script>
    </body></html>`);
  } catch (e) {
    console.error('GET /scan error:', e?.message || e);
    return json
      ? res.status(500).json({ ok:false, error:'Failed to update' })
      : res.status(500).send('Failed to update');
  }
});

// ———————————————————————————————————————————————————————————
/**
 * POST /api/scanner
 * Scanner device posts raw query string or full URL; we re-run the same flow.
 * Still aligns with ENV label logic for steps 2/3.
 */
// ———————————————————————————————————————————————————————————
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

    // Apply Monday updates in the same sequence as GET /scan
    let monday_error = null;
    try {
      if (scan_count === 1 && CHECKED_IN_COLUMN_ID) {
        await changeColumnValue(i, CHECKED_IN_COLUMN_ID, JSON.stringify({ checked: 'true' }));
      }
      if (scan_count === 2 && STATUS_COLUMN_ID) {
        await setStatusByLabel(i, STEP2_STATUS_LABEL);
      }
      if (scan_count === 3 && STATUS_COLUMN_ID) {
        await setStatusByLabel(i, STEP3_STATUS_LABEL);
      }
    } catch (mErr) {
      monday_error = mErr?.message || String(mErr);
      console.error('Monday update error:', monday_error);
      // We still return ok:true so the UI can progress; error is surfaced in payload.
    }

    res.json({ ok: true, item: i, scan_count, status, monday_error });
  } catch (e) {
    console.error('POST /api/scanner error:', e);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});

module.exports = router;
