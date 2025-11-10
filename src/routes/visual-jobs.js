// src/routes/visual-jobs.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 1024 * 1024 * 200 } }); // 200MB
const { Pool } = require('pg');

const pool = require('../db'); // your existing pg Pool export

// ---- ENV
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID_VISUAL = parseInt(process.env.BOARD_ID_VISUAL || '0', 10);
const STATUS_COLUMN_ID_VISUAL = process.env.STATUS_COLUMN_ID_VISUAL || 'status';
const FINISHED_VISUAL_COLUMN_ID = process.env.FINISHED_VISUAL_COLUMN_ID || 'files';
const VISUAL_WORKER_KEY = process.env.VISUAL_WORKER_KEY;
const CLAIM_SECS = parseInt(process.env.VISUAL_CLAIM_SECS || '300', 10);

// ---- Monday client (minimal)
const monday = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: { Authorization: MONDAY_API_KEY, 'Content-Type': 'application/json' }
});

async function mondayGQL(query, variables = {}) {
  const { data } = await monday.post('', { query, variables });
  if (data.errors) {
    const msg = data.errors.map(e => e.message).join('; ');
    throw new Error(`Monday GQL error: ${msg}`);
  }
  return data.data;
}

async function setStatusByIndex(boardId, itemId, columnId, index) {
  const query = `
    mutation SetStatus($boardId: Int!, $itemId: Int!, $columnId: String!, $val: JSON!) {
      change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $val) { id }
    }
  `;
  return mondayGQL(query, {
    boardId,
    itemId,
    columnId,
    val: String(index) // index-based setter expects string index
  });
}

async function uploadFileToColumn(boardId, itemId, columnId, fileBuffer, filename) {
  // Monday "add_file_to_column" requires multipart with query + variables + file
  const formData = new (require('form-data'))();
  const query = `
    mutation ($file: File!, $itemId: Int!, $columnId: String!) {
      add_file_to_column (file: $file, item_id: $itemId, column_id: $columnId) { id }
    }
  `;
  formData.append('query', query);
  formData.append('variables', JSON.stringify({ itemId, columnId }));
  formData.append('map', JSON.stringify({ "0": ["variables.file"] }));
  formData.append('0', fileBuffer, { filename });

  const { data } = await axios.post('https://api.monday.com/v2/file', formData, {
    headers: { 
      Authorization: MONDAY_API_KEY,
      ...formData.getHeaders()
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  if (data.errors) {
    const msg = data.errors.map(e => e.message).join('; ');
    throw new Error(`Monday upload error: ${msg}`);
  }
  return data.data;
}

// ---- Security helpers
function requireWorkerKey(req, res, next) {
  const key = req.header('X-Worker-Key');
  if (!VISUAL_WORKER_KEY || key !== VISUAL_WORKER_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

// ---- Enqueue
router.post('/enqueue', async (req, res) => {
  try {
    const {
      boardId,
      itemId,
      groupId,
      jobTitle,
      jobNo,
      customer,
      frontPos,
      backPos,
      garmentColour,
      frontArtUrl,
      backArtUrl,
      priority = 100,
      metadata = {}
    } = req.body || {};

    if (!boardId || !itemId) {
      return res.status(400).json({ error: 'boardId and itemId are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO visual_jobs
       (board_id, item_id, group_id, job_title, job_no, customer, front_pos, back_pos, garment_colour, front_art_url, back_art_url, metadata, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'queued')
       RETURNING *`,
      [
        boardId, itemId, groupId || null, jobTitle || null, jobNo || null, customer || null,
        frontPos || null, backPos || null, garmentColour || null,
        frontArtUrl || null, backArtUrl || null, metadata || {}, priority
      ]
    );

    res.json({ ok: true, job: rows[0] });
  } catch (err) {
    console.error('[visual-jobs/enqueue] error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ---- Claim next
router.post('/next', requireWorkerKey, async (req, res) => {
  const workerId = req.body.workerId || 'unnamed-worker';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomically find & claim next available job
    // Order: status queued, not locked (or lock expired), lowest priority, oldest created
    const claimSql = `
      SELECT id
      FROM visual_jobs
      WHERE status = 'queued'
        AND (lock_until IS NULL OR lock_until < now())
      ORDER BY priority ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const claim = await client.query(claimSql);

    if (claim.rowCount === 0) {
      await client.query('COMMIT');
      return res.json({ ok: true, job: null });
    }

    const jobId = claim.rows[0].id;

    const update = await client.query(
      `UPDATE visual_jobs
       SET status='in_progress',
           attempts=attempts+1,
           claimed_by=$1,
           lock_until=now() + ($2 || ' seconds')::interval
       WHERE id=$3
       RETURNING *`,
      [workerId, String(CLAIM_SECS), jobId]
    );

    await client.query('COMMIT');
    res.json({ ok: true, job: update.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[visual-jobs/next] error:', err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

// ---- Heartbeat (extend lease)
router.post('/heartbeat', requireWorkerKey, async (req, res) => {
  try {
    const { jobId, workerId } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const { rows, rowCount } = await pool.query(
      `UPDATE visual_jobs
       SET lock_until=now() + ($1 || ' seconds')::interval
       WHERE id=$2 AND status='in_progress' AND claimed_by=COALESCE($3, claimed_by)
       RETURNING *`,
      [String(CLAIM_SECS), jobId, workerId || null]
    );

    if (rowCount === 0) return res.status(409).json({ error: 'not_claimed_or_mismatch' });
    res.json({ ok: true, job: rows[0] });
  } catch (err) {
    console.error('[visual-jobs/heartbeat] error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ---- Complete (upload to Monday + flip status)
router.post('/complete', requireWorkerKey, upload.single('file'), async (req, res) => {
  try {
    const { jobId, success, notes } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    // Get job
    const jobQ = await pool.query('SELECT * FROM visual_jobs WHERE id=$1', [jobId]);
    if (jobQ.rowCount === 0) return res.status(404).json({ error: 'job_not_found' });
    const job = jobQ.rows[0];

    let outputUrl = job.output_url || null;

    if (success === 'true' || success === true) {
      // Require file for success
      if (!req.file) return res.status(400).json({ error: 'file required for success' });

      // 1) Upload file to Monday FINISHED_VISUAL column
      await uploadFileToColumn(
        job.board_id,
        job.item_id,
        FINISHED_VISUAL_COLUMN_ID,
        req.file.buffer,
        req.file.originalname || 'visual.pdf'
      );

      // We don’t get a direct public URL back here; that’s fine. Track a pseudo-URL label.
      outputUrl = `monday://board/${job.board_id}/item/${job.item_id}/column/${FINISHED_VISUAL_COLUMN_ID}`;

      // 2) Flip status to "Done" via index (you said “In progress” is index 0 on this board; set “Done” accordingly)
      // If your "Done" index is something else, change it here.
      const DONE_INDEX = 1; // <-- adjust if needed
      await setStatusByIndex(job.board_id, job.item_id, STATUS_COLUMN_ID_VISUAL, DONE_INDEX);

      // 3) Mark job done
      const upd = await pool.query(
        `UPDATE visual_jobs
         SET status='done', lock_until=NULL, output_url=$1, notes=$2
         WHERE id=$3
         RETURNING *`,
        [outputUrl, notes || null, jobId]
      );
      return res.json({ ok: true, job: upd.rows[0] });
    } else {
      // Mark failed
      const upd = await pool.query(
        `UPDATE visual_jobs
         SET status='failed', lock_until=NULL, notes=$1
         WHERE id=$2
         RETURNING *`,
        [notes || null, jobId]
      );
      return res.json({ ok: true, job: upd.rows[0] });
    }
  } catch (err) {
    console.error('[visual-jobs/complete] error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
