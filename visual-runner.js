// visual-runner.js — Optimised, preserves original artwork filenames
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { exec } = require('child_process');

// ---- Global Axios config ----
axios.defaults.headers.common['Connection'] = 'keep-alive';
axios.defaults.decompress = true;

const BASE_URL =
  process.env.VISUAL_WORKER_BASE_URL ||
  'https://mondayapp-refactor-production.up.railway.app';

const WORKER_KEY = process.env.VISUAL_WORKER_KEY;
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_API_URL = 'https://api.monday.com/v2';

if (!WORKER_KEY) throw new Error('VISUAL_WORKER_KEY not set in env');

const VISUAL_ROOT = path.join(__dirname, 'visual generator');
const JOBS_DIR = path.join(VISUAL_ROOT, 'VisualJobs');
const OUTPUT_DIR = path.join(VISUAL_ROOT, 'VisualOutput');
const ART_DIR = path.join(VISUAL_ROOT, 'VisualArtwork');
const JSX_SCRIPT = path.join(VISUAL_ROOT, 'ai-visual.jsx');

if (!fs.existsSync(ART_DIR)) fs.mkdirSync(ART_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ------------------------------------------------------------
// MONDAY HELPERS
// ------------------------------------------------------------
async function claimNextJob() {
  const { data } = await axios.post(
    `${BASE_URL}/api/visual-jobs/next`,
    { workerId: 'local-runner' },
    { headers: { 'X-Worker-Key': WORKER_KEY } }
  );
  if (!data.ok) return null;
  return data.job;
}

async function getAssetPublicUrl(assetId) {
  const query = `
    query ($ids: [ID!]!) {
      assets (ids: $ids) {
        id
        public_url
        url
      }
    }
  `;
  const { data } = await axios.post(
    MONDAY_API_URL,
    { query, variables: { ids: [assetId] } },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: MONDAY_API_TOKEN,
      },
    }
  );

  if (data.errors || !data.data?.assets?.[0]) {
    console.error('[runner] asset query error:', data.errors || data);
    throw new Error('Failed to fetch public_url for ' + assetId);
  }
  return data.data.assets[0].public_url || data.data.assets[0].url;
}

function extractFileMetaFromColumn(col) {
  if (!col || !col.value) return null;
  try {
    const parsed = JSON.parse(col.value); // { files: [ { name, assetId, ... } ] }
    if (parsed.files && parsed.files[0]) return parsed.files[0];
  } catch {}
  return null;
}

async function downloadFile(url, destPath) {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    maxRedirects: 5,
  });

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', reject);
  });
}

// Download artwork using ORIGINAL filenames (supports PNG, AI, SVG, etc.)
async function prepareArtwork(job) {
  const rawCols = job.metadata?.rawColumns || {};
  const frontMeta = extractFileMetaFromColumn(rawCols.file_mkxjg8eh);
  const backMeta  = extractFileMetaFromColumn(rawCols.file_mkxj6djb);

  // Clean folder: we only care about current job
  try {
    const existing = fs.readdirSync(ART_DIR);
    for (const f of existing) fs.unlinkSync(path.join(ART_DIR, f));
  } catch {}

  if (frontMeta) {
    const frontUrl = await getAssetPublicUrl(frontMeta.assetId);
    const frontName = frontMeta.name || 'front_art';
    const dest = path.join(ART_DIR, frontName);
    console.log('[runner] downloading front artwork →', frontName);
    await downloadFile(frontUrl, dest);
  }

  if (backMeta) {
    const backUrl = await getAssetPublicUrl(backMeta.assetId);
    const backName = backMeta.name || 'back_art';
    const dest = path.join(ART_DIR, backName);
    console.log('[runner] downloading back artwork →', backName);
    await downloadFile(backUrl, dest);
  }
}

// Upload proof back to Monday backend
async function completeJob(jobId, proofPath) {
  const url = `${BASE_URL}/api/visual-jobs/complete`;
  const form = new FormData();
  form.append('jobId', String(jobId));
  form.append('success', 'true');
  form.append('file', fs.readFileSync(proofPath), path.basename(proofPath));

  const start = Date.now();
  try {
    const { status, data } = await axios.post(url, form, {
      headers: { 'X-Worker-Key': WORKER_KEY, ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000,
    });
    const ms = Date.now() - start;
    console.log(`[runner] /complete status: ${status} (${ms}ms)`);
    console.log('[runner] /complete response:', data);
  } catch (err) {
    console.error('[runner] upload failed:', err.message);
  }
}

// ------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------
async function runOnce() {
  const job = await claimNextJob();
  if (!job) return false;

  console.log(
    `[runner] claimed job ${job.id} (board ${job.board_id}, item ${job.item_id})`
  );

  const jobJsonPath = path.join(JOBS_DIR, 'current-job.json');
  fs.writeFileSync(jobJsonPath, JSON.stringify(job, null, 2));

  await prepareArtwork(job);

  const safeCustomer = (job.customer || 'customer').replace(/[^\w\d_-]+/g, '_');
  const safeTitle    = (job.job_title || 'job').replace(/[^\w\d_-]+/g, '_');
  const proofFileName = `${safeCustomer}_${safeTitle}_proof.pdf`;
  const proofPath = path.join(OUTPUT_DIR, proofFileName);
  if (fs.existsSync(proofPath)) fs.unlinkSync(proofPath);

  console.log('[runner] launching Illustrator (non-blocking)...');

  exec(
  `osascript -e 'tell application "Adobe Illustrator"
      activate
      do javascript file "${JSX_SCRIPT}"
    end tell' >/dev/null 2>&1 &`
);


  const start = Date.now();
  while (!fs.existsSync(proofPath)) {
    if (Date.now() - start > 300000) throw new Error('Proof generation timeout (5min)');
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('[runner] proof generated:', proofPath);
  await completeJob(job.id, proofPath);
  return true;
}

async function main() {
  console.log('[runner] Optimised runner started');
  while (true) {
    try {
      const processed = await runOnce();
      if (!processed) {
        await new Promise(r => setTimeout(r, 2000)); // fast poll when idle
      }
    } catch (err) {
      console.error('[runner] fatal error:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main();
