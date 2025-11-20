// src/services/openOrdersSync.js
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mondayFields = require('../config/mondayFields');
const { parseOpenOrdersFile } = require('./openOrdersParser');
const {
  loadState,
  saveState,
  hasJob: stateHasJob,
  markJobCreated,
} = require('./openOrdersState');
const mondayClient = require('./mondayClient');
const { downloadFile } = require('./dropboxClient');

const BOARD_ID =
  Number(
    process.env.LINEITEM_BOARD_ID ||
      mondayFields.BOARD_ID_MAIN ||
      mondayFields.BOARD_ID ||
      mondayFields.BOARD_ID_VISUAL
  ) || null;

const GROUP_ID =
  process.env.LINEITEM_GROUP_ID ||
  mondayFields.DEFAULT_LINEITEM_GROUP_ID ||
  null;

const JOB_NO_COLUMN_ID =
  process.env.LINEITEM_JOB_NO_COLUMN_ID ||
  mondayFields.COLS.JOB_NO ||
  null;

const JOB_TYPE_STATUS_COLUMN_ID = mondayFields.COLS.JOB_TYPE_STATUS || null;

const CUSTOMER_COLUMN_ID = mondayFields.COLS.CUSTOMER || null;
const JOB_TITLE_COLUMN_ID = mondayFields.COLS.JOB_TITLE || null;

const SUBITEM_COLS = mondayFields.SUBITEM_COLS || {};

const JOB_TYPE_LABEL_MAP = {
  PRINT: 'PRINT',
  EMBROIDERY: 'EMBROIDERY',
};

const OPEN_ORDERS_DROPBOX_PATH =
  process.env.OPEN_ORDERS_DROPBOX_PATH || '/MONDAY/open_orders.csv';

const OPEN_ORDERS_LOCAL_PATH =
  process.env.OPEN_ORDERS_LOCAL_PATH ||
  path.join(__dirname, '..', '..', 'tmp', 'open_orders.csv');

function buildSubitemName(line, index) {
  if (line.description) return line.description;
  if (line.code && line.size) return `${line.code} ${line.size}`;
  if (line.code) return line.code;
  return `Line ${index + 1}`;
}

function buildSubitemColumnValues(line) {
  const values = {};
  if (SUBITEM_COLS.CODE) values[SUBITEM_COLS.CODE] = line.code || '';
  if (SUBITEM_COLS.SIZE) values[SUBITEM_COLS.SIZE] = line.size || '';
  if (SUBITEM_COLS.COLOUR) values[SUBITEM_COLS.COLOUR] = line.colour || '';
  if (SUBITEM_COLS.QTY) values[SUBITEM_COLS.QTY] = String(line.qty ?? '');
  return values;
}

function extractJobNumberFromItem(item) {
  let jobNumber = null;
  const columns = item.column_values || [];
  if (JOB_NO_COLUMN_ID) {
    const target = columns.find(col => col.id === JOB_NO_COLUMN_ID);
    if (target && target.text) {
      jobNumber = target.text.trim();
    }
  }
  if (!jobNumber && item.name) {
    const match = item.name.match(/\b(\d{5})\b/);
    if (match) jobNumber = match[1];
  }
  return jobNumber;
}

async function fetchExistingJobs() {
  if (!BOARD_ID) throw new Error('LINEITEM board id not configured');
  const items = await mondayClient.listBoardItems(BOARD_ID, { perPage: 200, maxPages: 20 });
  const map = new Map();
  for (const item of items) {
    const jobNumber = extractJobNumberFromItem(item);
    if (jobNumber) map.set(jobNumber, item);
  }
  return map;
}

async function createJobOnMonday(job, { dryRun = false } = {}) {
  const columnValues = {};
  if (JOB_NO_COLUMN_ID) columnValues[JOB_NO_COLUMN_ID] = job.jobNumber;
  if (CUSTOMER_COLUMN_ID) columnValues[CUSTOMER_COLUMN_ID] = job.customer || '';
  if (JOB_TITLE_COLUMN_ID) columnValues[JOB_TITLE_COLUMN_ID] = job.jobTitle || '';

  const nameParts = [job.jobNumber];
  if (job.customer) nameParts.push(job.customer);
  if (job.jobTitle) nameParts.push(job.jobTitle);
  else if (job.jobType) nameParts.push(job.jobType);
  const itemName = nameParts.filter(Boolean).join(' - ') || `Job ${job.jobNumber}`;

  if (dryRun) {
    console.log(`[dry-run] would create item "${itemName}" with ${job.lineItems.length} subitems`);
    return null;
  }

  const itemId = await mondayClient.createItem(BOARD_ID, GROUP_ID, itemName, columnValues);
  for (let i = 0; i < job.lineItems.length; i++) {
    const line = job.lineItems[i];
    const name = buildSubitemName(line, i);
    const columns = buildSubitemColumnValues(line);
    await mondayClient.createSubitem(itemId, name, columns);
  }

  await applyJobTypeStatus(itemId, job.jobType, { dryRun });
  return itemId;
}

async function applyJobTypeStatus(itemId, jobType, { dryRun }) {
  if (!JOB_TYPE_STATUS_COLUMN_ID || !jobType) return;
  const label = JOB_TYPE_LABEL_MAP[String(jobType).trim().toUpperCase()];
  if (!label) return;
  if (dryRun) {
    console.log(`[dry-run] would set ${JOB_TYPE_STATUS_COLUMN_ID} to ${label} on item ${itemId || '(new item)'}`);
    return;
  }
  await mondayClient.setStatusByLabel(
    BOARD_ID,
    itemId,
    JOB_TYPE_STATUS_COLUMN_ID,
    label
  );
}

async function syncOpenOrdersFile(filePath, { dryRun = false } = {}) {
  const resolved = path.resolve(filePath);
  const jobs = parseOpenOrdersFile(resolved);
  const existing = await fetchExistingJobs();
  const state = loadState();

  const newJobs = jobs.filter(job => {
    if (!job.jobNumber) return false;
    const jobNo = String(job.jobNumber).trim();
    if (!jobNo) return false;
    if (existing.has(jobNo)) return false;
    if (stateHasJob(state, jobNo)) return false;
    return true;
  });
  console.log(
    `[sync] Found ${jobs.length} jobs in CSV; ${newJobs.length} need creation (state path ${process.env.OPEN_ORDERS_STATE_PATH || 'default'}).`
  );

  const results = [];
  for (const job of newJobs) {
    try {
      const itemId = await createJobOnMonday(job, { dryRun });
      if (!dryRun && itemId) {
        markJobCreated(state, String(job.jobNumber).trim(), itemId);
      }
      results.push({ job: job.jobNumber, itemId: itemId || null, success: true });
    } catch (err) {
      console.error(`[sync] Failed to create job ${job.jobNumber}:`, err.message);
      results.push({ job: job.jobNumber, success: false, error: err.message });
    }
  }

  if (!dryRun && results.some(r => r.success)) {
    saveState(state);
  }

  return results;
}

async function downloadOpenOrdersFile(destPath = OPEN_ORDERS_LOCAL_PATH) {
  const { buffer } = await downloadFile(OPEN_ORDERS_DROPBOX_PATH);
  const targetDir = path.dirname(destPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

async function syncOpenOrdersFromDropbox(options = {}) {
  const localPath = await downloadOpenOrdersFile(
    options.localPath || OPEN_ORDERS_LOCAL_PATH
  );
  return syncOpenOrdersFile(localPath, options);
}

module.exports = {
  syncOpenOrdersFile,
  syncOpenOrdersFromDropbox,
  fetchExistingJobs,
};
