// visual-runner.js
// Local worker that:
// 1) Claims next queued visual job
// 2) Writes current-job.json for Illustrator
// 3) Downloads front/back artwork from Monday
// 4) Runs ai-visual.jsx to generate a proof
// 5) Uploads the exported PDF to Monday and marks DONE

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const FormData = require('form-data');
const { execSync } = require('child_process');

const BASE_URL =
  process.env.VISUAL_WORKER_BASE_URL ||
  'https://mondayapp-refactor-production.up.railway.app';

const WORKER_KEY = process.env.VISUAL_WORKER_KEY;
if (!WORKER_KEY) throw new Error('VISUAL_WORKER_KEY not set in env');

const VISUAL_ROOT = path.join(__dirname, 'visual generator');
const JOBS_DIR = path.join(VISUAL_ROOT, 'VisualJobs');
const OUTPUT_DIR = path.join(VISUAL_ROOT, 'VisualOutput');
const ART_DIR = path.join(VISUAL_ROOT, 'VisualArtwork');
const JSX_SCRIPT = path.join(VISUAL_ROOT, 'ai-visual.jsx');

// ensure artwork dir exists
if (!fs.existsSync(ART_DIR)) fs.mkdirSync(ART_DIR, { recursive: true });

async function claimNextJob() {
  const url = `${BASE_URL}/api/visual-jobs/next`;
  const { data } = await axios.post(
    url,
    { workerId: 'local-runner' },
    { headers: { 'X-Worker-Key': WORKER_KEY } }
  );
  if (!data.ok) {
    console.error('[runner] /next returned error:', data);
    return null;
  }
  return data.job;
}

async function completeJob(jobId, proofPath) {
  const url = `${BASE_URL}/api/visual-jobs/complete`;
  const fileBuffer = fs.readFileSync(proofPath);

  const form = new FormData();
  form.append('jobId', String(jobId));
  form.append('success', 'true');
  form.append('file', fileBuffer, path.basename(proofPath));

  const { data } = await axios.post(url, form, {
    headers: { 'X-Worker-Key': WORKER_KEY, ...form.getHeaders() },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  if (!data.ok) console.error('[runner] /complete returned error:', data);
  else console.log('[runner] job completed:', data.job);
}

// ---- artwork download helpers ----
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

async function prepareArtwork(job) {
  const frontUrl = job.metadata?.rawColumns?.file_mkxjg8eh?.text;
  const backUrl = job.metadata?.rawColumns?.file_mkxj6djb?.text;

  if (frontUrl) {
    const dest = path.join(ART_DIR, 'front_art.png');
    console.log('[runner] downloading front artwork...');
    await downloadFile(frontUrl, dest);
  }
  if (backUrl) {
    const dest = path.join(ART_DIR, 'back_art.png');
    console.log('[runner] downloading back artwork...');
    await downloadFile(backUrl, dest);
  }
}

// ---- main loop ----
async function runOnce() {
  console.log('[runner] claiming next job from queue...');
  const job = await claimNextJob();
  if (!job) {
    console.log('[runner] no queued jobs');
    return;
  }

  console.log(
    `[runner] claimed job ${job.id} (board ${job.board_id}, item ${job.item_id})`
  );

  // Step 1: Write job JSON for Illustrator
  const jobJsonPath = path.join(JOBS_DIR, 'current-job.json');
  fs.writeFileSync(jobJsonPath, JSON.stringify(job, null, 2));
  console.log('[runner] wrote current-job.json');

  // Step 2: Download artwork
  await prepareArtwork(job);

  // Step 3: Launch Illustrator with the JSX script
  console.log('[runner] launching Illustrator...');
  try {
    execSync(
      `osascript -e 'tell application "Adobe Illustrator" to do javascript file "${JSX_SCRIPT}"'`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[runner] Illustrator execution failed:', err);
    return;
  }

  // Step 4: Determine expected proof file name
  const safeCustomer = (job.customer || 'customer').replace(/[^\w\d_-]+/g, '_');
  const safeTitle = (job.job_title || 'job').replace(/[^\w\d_-]+/g, '_');
  const proofFileName = `${safeCustomer}_${safeTitle}_proof.pdf`;
  const proofPath = path.join(OUTPUT_DIR, proofFileName);

  if (!fs.existsSync(proofPath)) {
    console.error('[runner] proof not found at:', proofPath);
    return;
  }

  console.log('[runner] proof generated:', proofPath);

  // Step 5: Upload proof to Monday
  await completeJob(job.id, proofPath);
}

async function main() {
  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error('[runner] fatal error in loop:', err);
    }
    await new Promise(r => setTimeout(r, 10000)); // 10s poll
  }
}

main().catch(e => {
  console.error('[runner] crashed:', e);
  process.exit(1);
});
