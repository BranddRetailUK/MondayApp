const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const { hasFullHubAccess, requireHubFullApiAccess } = require('../middleware/hubAuth');
const { fullName } = require('../services/hubAuth');
const {
  ADMIN_STATUSES,
  MAX_FILE_BYTES,
  MAX_FILE_QUANTITY,
  MAX_JOB_FILES,
  calculateDtfPrice,
  deriveDtfJobStatus,
  safeDtfFilename,
} = require('../services/dtf');
const {
  createEpsPng,
  destroyDtfAsset,
  expectedPublicId,
  signDtfUpload,
  signedDtfDownloadUrl,
  verifyDtfUpload,
} = require('../services/dtfCloudinary');

const router = express.Router();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_EPS_BYTES = 25 * 1024 * 1024;
const epsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_EPS_BYTES },
});

router.post('/api/dtf/jobs', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await enforceRateLimit('jobs:create:user', req.hubUser.id, 20);
    const files = normalizeJobFiles(req.body?.files);
    if (!files.ok) return res.status(400).json({ error: files.error });

    const sheetQuantity = files.value.reduce((sum, file) => sum + file.quantity, 0);
    const pricing = calculateDtfPrice(sheetQuantity);
    const customerName = fullName(req.hubUser) || req.hubUser.email;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const jobResult = await client.query(
        `INSERT INTO dtf_jobs (
           user_id, customer_name, customer_email, status,
           unique_file_count, sheet_quantity, unit_price_pence,
           subtotal_pence, vat_rate, vat_pence, total_pence
         )
         VALUES ($1, $2, $3, 'UPLOADING', $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.hubUser.id,
          customerName,
          req.hubUser.email,
          files.value.length,
          pricing.sheetQuantity,
          pricing.unitPricePence,
          pricing.subtotalPence,
          pricing.vatRate,
          pricing.vatPence,
          pricing.totalPence,
        ]
      );
      const job = jobResult.rows[0];
      const createdFiles = [];
      for (const file of files.value) {
        const fileResult = await client.query(
          `INSERT INTO dtf_job_files (
             job_id, client_id, original_name, mime_type, declared_bytes, quantity
           )
           VALUES ($1, $2, $3, 'application/pdf', $4, $5)
           RETURNING id, client_id, original_name, quantity, upload_status`,
          [job.id, file.clientId, file.name, file.size, file.quantity]
        );
        createdFiles.push(fileResult.rows[0]);
      }
      await client.query('COMMIT');
      return res.status(201).json({
        job: serializeJob(job),
        files: createdFiles.map(serializeFile),
        pricing,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return sendDtfError(res, error, 'Failed to create DTF job');
  }
});

router.post('/api/dtf/uploads/sign', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await enforceRateLimit('uploads:sign:user', req.hubUser.id, 240);
    const jobId = positiveInteger(req.body?.jobId);
    const fileId = positiveInteger(req.body?.fileId);
    if (!jobId || !fileId) return res.status(400).json({ error: 'Invalid upload target.' });

    const result = await pool.query(
      `SELECT file.id, file.job_id, file.upload_status, job.user_id
       FROM dtf_job_files file
       JOIN dtf_jobs job ON job.id = file.job_id
       WHERE file.id = $1 AND file.job_id = $2 AND job.user_id = $3
       LIMIT 1`,
      [fileId, jobId, req.hubUser.id]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).json({ error: 'Upload target not found.' });
    if (file.upload_status === 'UPLOADED') {
      return res.status(409).json({ error: 'This file has already been uploaded.' });
    }
    await pool.query(
      `UPDATE dtf_job_files
       SET upload_status = 'UPLOADING', error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [fileId]
    );
    return res.json(signDtfUpload({ userId: req.hubUser.id, jobId, fileId }));
  } catch (error) {
    return sendDtfError(res, error, 'Failed to prepare DTF upload');
  }
});

router.post('/api/dtf/uploads/finalize', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await enforceRateLimit('uploads:finalize:user', req.hubUser.id, 240);
    const jobId = positiveInteger(req.body?.jobId);
    const fileId = positiveInteger(req.body?.fileId);
    const succeeded = req.body?.success === true;
    const reportedPublicId = String(req.body?.publicId || '').trim();
    if (!jobId || !fileId) return res.status(400).json({ error: 'Invalid upload target.' });

    const existingResult = await pool.query(
      `SELECT file.id, file.job_id, file.original_name, file.upload_status, job.user_id
       FROM dtf_job_files file
       JOIN dtf_jobs job ON job.id = file.job_id
       WHERE file.id = $1 AND file.job_id = $2 AND job.user_id = $3
       LIMIT 1`,
      [fileId, jobId, req.hubUser.id]
    );
    if (!existingResult.rowCount) return res.status(404).json({ error: 'Upload record not found.' });

    const expectedId = expectedPublicId({ userId: req.hubUser.id, jobId, fileId });
    const verification = succeeded
      ? await verifyDtfUpload({
        userId: req.hubUser.id,
        jobId,
        fileId,
        reportedPublicId,
      })
      : null;
    if (!succeeded) await destroyDtfAsset(expectedId);

    const uploadStatus = verification?.ok ? 'UPLOADED' : 'FAILED';
    const errorMessage = verification?.ok
      ? null
      : String(verification?.error || req.body?.errorMessage || 'Upload failed.').slice(0, 320);
    const client = await pool.connect();
    let job;
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE dtf_job_files
         SET upload_status = $2,
             cloudinary_asset_id = $3,
             cloudinary_public_id = $4,
             cloudinary_version = $5,
             verified_bytes = $6,
             page_count = $7,
             page_width = $8,
             page_height = $9,
             error_message = $10,
             updated_at = NOW()
         WHERE id = $1`,
        [
          fileId,
          uploadStatus,
          verification?.ok ? verification.assetId : null,
          verification?.ok ? verification.publicId : null,
          verification?.ok ? verification.version : null,
          verification?.ok ? verification.bytes : null,
          verification?.ok ? verification.pages : null,
          verification?.ok ? verification.width : null,
          verification?.ok ? verification.height : null,
          errorMessage,
        ]
      );
      const statusResult = await client.query(
        'SELECT upload_status FROM dtf_job_files WHERE job_id = $1 ORDER BY id FOR UPDATE',
        [jobId]
      );
      const jobStatus = deriveDtfJobStatus(statusResult.rows.map((row) => row.upload_status));
      const jobResult = await client.query(
        `UPDATE dtf_jobs
         SET status = $2,
             received_at = CASE WHEN $2 = 'RECEIVED' THEN COALESCE(received_at, NOW()) ELSE received_at END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [jobId, jobStatus]
      );
      job = jobResult.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (verification?.ok) await destroyDtfAsset(verification.publicId);
      throw error;
    } finally {
      client.release();
    }

    if (!verification?.ok) {
      return res.status(422).json({ error: errorMessage, job: serializeJob(job) });
    }
    return res.json({ job: serializeJob(job) });
  } catch (error) {
    return sendDtfError(res, error, 'Failed to finalize DTF upload');
  }
});

router.post('/api/dtf/layouts/eps-preview', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await enforceRateLimit('layouts:eps-preview:user', req.hubUser.id, 30);
    const file = await receiveEps(req, res);
    if (!file) return;
    const isEps = file.mimetype === 'application/postscript' || /\.eps$/i.test(file.originalname || '');
    if (!isEps) return res.status(400).json({ error: 'Please provide an EPS file.' });
    const png = await createEpsPng(file.buffer, req.hubUser.id);
    res.type('png');
    return res.send(png);
  } catch (error) {
    return sendDtfError(res, error, 'Could not create the EPS preview');
  }
});

router.get('/api/dtf/files/:fileId', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const fileId = positiveInteger(req.params.fileId);
  if (!fileId) return res.status(400).json({ error: 'Invalid DTF file id.' });
  try {
    const result = await pool.query(
      `SELECT file.original_name, file.cloudinary_public_id, file.upload_status, job.user_id
       FROM dtf_job_files file
       JOIN dtf_jobs job ON job.id = file.job_id
       WHERE file.id = $1
       LIMIT 1`,
      [fileId]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).json({ error: 'DTF file not found.' });
    if (Number(file.user_id) !== Number(req.hubUser.id) && !hasFullHubAccess(req.hubUser)) {
      return res.status(403).json({ error: 'You cannot access this DTF file.' });
    }
    if (file.upload_status !== 'UPLOADED' || !file.cloudinary_public_id) {
      return res.status(409).json({ error: 'DTF file is not available.' });
    }
    return res.redirect(302, signedDtfDownloadUrl(file.cloudinary_public_id, file.original_name));
  } catch (error) {
    return sendDtfError(res, error, 'Failed to open DTF file');
  }
});

router.get('/api/dtf/admin/jobs', requireHubFullApiAccess, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const limit = Math.min(100, Math.max(1, positiveInteger(req.query.limit) || 50));
  const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);
  const status = String(req.query.status || '').trim().toUpperCase();
  if (status && !ADMIN_STATUSES.has(status) && status !== 'UPLOADING') {
    return res.status(400).json({ error: 'Invalid DTF status filter.' });
  }
  try {
    const result = await pool.query(
      `SELECT job.*, COUNT(*) OVER() AS total_count
       FROM dtf_jobs job
       WHERE ($1::TEXT = '' OR job.status = $1)
       ORDER BY job.created_at DESC, job.id DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return res.json({
      jobs: result.rows.map(serializeJob),
      total: Number(result.rows[0]?.total_count || 0),
      limit,
      offset,
    });
  } catch (error) {
    return sendDtfError(res, error, 'Failed to load DTF jobs');
  }
});

router.get('/api/dtf/admin/jobs/:jobId', requireHubFullApiAccess, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const jobId = positiveInteger(req.params.jobId);
  if (!jobId) return res.status(400).json({ error: 'Invalid DTF job id.' });
  try {
    const [jobResult, filesResult] = await Promise.all([
      pool.query('SELECT * FROM dtf_jobs WHERE id = $1 LIMIT 1', [jobId]),
      pool.query('SELECT * FROM dtf_job_files WHERE job_id = $1 ORDER BY id', [jobId]),
    ]);
    if (!jobResult.rowCount) return res.status(404).json({ error: 'DTF job not found.' });
    return res.json({
      job: serializeJob(jobResult.rows[0]),
      files: filesResult.rows.map(serializeFile),
    });
  } catch (error) {
    return sendDtfError(res, error, 'Failed to load DTF job');
  }
});

router.patch('/api/dtf/admin/jobs/:jobId', requireHubFullApiAccess, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const jobId = positiveInteger(req.params.jobId);
  const status = String(req.body?.status || '').trim().toUpperCase();
  if (!jobId) return res.status(400).json({ error: 'Invalid DTF job id.' });
  if (!ADMIN_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid DTF job status.' });
  try {
    const updaterName = fullName(req.hubUser) || req.hubUser.email;
    const result = await pool.query(
      `UPDATE dtf_jobs
       SET status = $2,
           status_updated_by_user_id = $3,
           status_updated_by_name = $4,
           status_updated_at = NOW(),
           received_at = CASE WHEN $2 = 'RECEIVED' THEN COALESCE(received_at, NOW()) ELSE received_at END,
           completed_at = CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId, status, req.hubUser.id, updaterName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'DTF job not found.' });
    return res.json({ job: serializeJob(result.rows[0]) });
  } catch (error) {
    return sendDtfError(res, error, 'Failed to update DTF job');
  }
});

function normalizeJobFiles(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_JOB_FILES) {
    return { ok: false, error: `Choose between 1 and ${MAX_JOB_FILES} PDF files.` };
  }
  const seenIds = new Set();
  const value = [];
  for (const candidate of input) {
    const clientId = String(candidate?.clientId || '').trim().slice(0, 120);
    const name = safeDtfFilename(candidate?.name);
    const size = Number(candidate?.size);
    const quantity = Number(candidate?.quantity);
    const type = String(candidate?.type || '').toLowerCase();
    if (!clientId || seenIds.has(clientId)) return { ok: false, error: 'Each PDF must have a unique upload id.' };
    if (!/\.pdf$/i.test(name) || (type && type !== 'application/pdf')) {
      return { ok: false, error: 'Only PDF gang sheets can be submitted.' };
    }
    if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) {
      return { ok: false, error: 'Each PDF must be between 1 byte and 250MB.' };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_FILE_QUANTITY) {
      return { ok: false, error: `Each PDF quantity must be between 1 and ${MAX_FILE_QUANTITY}.` };
    }
    seenIds.add(clientId);
    value.push({ clientId, name, size, quantity });
  }
  return { ok: true, value };
}

function serializeJob(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    jobNumber: row.job_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    status: row.status,
    uniqueFileCount: Number(row.unique_file_count),
    sheetQuantity: Number(row.sheet_quantity),
    unitPricePence: Number(row.unit_price_pence),
    subtotalPence: Number(row.subtotal_pence),
    vatRate: Number(row.vat_rate),
    vatPence: Number(row.vat_pence),
    totalPence: Number(row.total_pence),
    statusUpdatedByName: row.status_updated_by_name || null,
    statusUpdatedAt: row.status_updated_at || null,
    receivedAt: row.received_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeFile(row) {
  return {
    id: String(row.id),
    clientId: row.client_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    declaredBytes: Number(row.declared_bytes || 0),
    verifiedBytes: row.verified_bytes == null ? null : Number(row.verified_bytes),
    quantity: Number(row.quantity),
    uploadStatus: row.upload_status,
    pageCount: row.page_count == null ? null : Number(row.page_count),
    pageWidth: row.page_width == null ? null : Number(row.page_width),
    pageHeight: row.page_height == null ? null : Number(row.page_height),
    errorMessage: row.error_message || null,
  };
}

async function enforceRateLimit(scope, identifier, limit) {
  const result = await pool.query(
    `INSERT INTO dtf_rate_limit_buckets (scope, identifier, window_started_at, request_count)
     VALUES ($1, $2, NOW(), 1)
     ON CONFLICT (scope, identifier) DO UPDATE
     SET window_started_at = CASE
           WHEN dtf_rate_limit_buckets.window_started_at <= NOW() - ($3 * INTERVAL '1 millisecond')
             THEN NOW()
           ELSE dtf_rate_limit_buckets.window_started_at
         END,
         request_count = CASE
           WHEN dtf_rate_limit_buckets.window_started_at <= NOW() - ($3 * INTERVAL '1 millisecond')
             THEN 1
           ELSE dtf_rate_limit_buckets.request_count + 1
         END
     RETURNING request_count, window_started_at`,
    [scope, String(identifier), RATE_WINDOW_MS]
  );
  const bucket = result.rows[0];
  if (Number(bucket.request_count) > limit) {
    const resetAt = new Date(bucket.window_started_at).getTime() + RATE_WINDOW_MS;
    const error = new Error('Too many requests. Please wait and try again.');
    error.statusCode = 429;
    error.retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    throw error;
  }
}

function receiveEps(req, res) {
  return new Promise((resolve) => {
    epsUpload.single('file')(req, res, (error) => {
      if (error) {
        res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'EPS files must be 25MB or smaller.' : 'Invalid EPS upload.' });
        resolve(null);
        return;
      }
      if (!req.file?.buffer?.length) {
        res.status(400).json({ error: 'Please provide an EPS file.' });
        resolve(null);
        return;
      }
      resolve(req.file);
    });
  });
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function sendDtfError(res, error, fallback) {
  if (error?.statusCode === 429) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    return res.status(429).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

module.exports = router;
