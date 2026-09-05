const crypto = require('crypto');
const pool = require('../db/pool');
const {
  SCAN_SECRET, STEP1_STATUS_LABEL, STEP2_STATUS_LABEL, STEP3_STATUS_LABEL
} = require('../config/env');

function signPayload(itemId, ts) {
  return crypto.createHmac('sha256', SCAN_SECRET).update(`${itemId}.${ts}`).digest('hex');
}

async function advanceScan(itemId) {
  const row = await pool.query('SELECT scan_count FROM job_scans WHERE item_id = $1', [itemId]);
  if (row.rowCount === 0) {
    await pool.query("INSERT INTO job_scans (item_id, scan_count, status) VALUES ($1, 0, 'Pending')", [itemId]);
  }
  const cur = await pool.query('SELECT scan_count FROM job_scans WHERE item_id = $1', [itemId]);
  const prev = cur.rows[0].scan_count || 0;
  const nextCount = prev >= 3 ? 3 : prev + 1;
  const newStatus = nextCount === 1 ? STEP1_STATUS_LABEL : nextCount === 2 ? STEP2_STATUS_LABEL : STEP3_STATUS_LABEL;
  await pool.query('UPDATE job_scans SET scan_count=$2, status=$3, last_scanned_at=NOW() WHERE item_id=$1', [itemId, nextCount, newStatus]);
  await pool.query('INSERT INTO job_scan_events (item_id, scan_number, new_status) VALUES ($1,$2,$3)', [itemId, nextCount, newStatus]);
  return { scan_count: nextCount, status: newStatus };
}

module.exports = { signPayload, advanceScan };
