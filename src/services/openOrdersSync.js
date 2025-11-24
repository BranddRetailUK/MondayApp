// src/services/openOrdersSync.js
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mondayFields = require('../config/mondayFields');
const { parseOpenOrdersFile } = require('./openOrdersParser');
const {
  loadState,
  saveState,
  hasJob: stateHasJob,
  markJobCreated,
  markJobUpdated,
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

function buildItemName(job) {
  const nameParts = [job.jobNumber];
  if (job.customer) nameParts.push(job.customer);
  if (job.jobTitle) nameParts.push(job.jobTitle);
  else if (job.jobType) nameParts.push(job.jobType);
  return nameParts.filter(Boolean).join(' - ') || `Job ${job.jobNumber}`;
}

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

function normalizeLineItem(line = {}) {
  return {
    qty: Number(line.qty) || 0,
    size: String(line.size || '').trim(),
    colour: String(line.colour || '').trim(),
    code: String(line.code || '').trim(),
    description: String(line.description || '').trim(),
  };
}

function computeJobSignature(job) {
  const normalized = {
    jobNumber: String(job.jobNumber || '').trim(),
    jobType: String(job.jobType || '').trim(),
    customer: String(job.customer || '').trim(),
    jobTitle: String(job.jobTitle || '').trim(),
    lineItems: (job.lineItems || []).map(normalizeLineItem),
  };
  return crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
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

function getColumnText(columns = [], columnId) {
  if (!columnId) return '';
  const match = columns.find(col => col.id === columnId);
  return match?.text ? String(match.text).trim() : '';
}

async function ensureItemColumnValue(item, columnId, desired, { dryRun = false } = {}) {
  if (!columnId) return;
  const hasColumn = (item.column_values || []).some(col => col.id === columnId);
  if (!hasColumn) return;
  const current = getColumnText(item.column_values, columnId);
  const desiredStr = desired != null ? String(desired).trim() : '';
  if (current === desiredStr) return;
  if (dryRun) {
    console.log(`[dry-run] would set column ${columnId} on item ${item.id} to "${desiredStr}" (current "${current}")`);
    return;
  }
  try {
    await mondayClient.setTextColumnValue(item.board.id, item.id, columnId, desiredStr);
    console.log(`[sync] Set column ${columnId} on item ${item.id} to "${desiredStr}" (was "${current}")`);
  } catch (err) {
    console.warn(`[sync] Failed to set column ${columnId} on item ${item.id}: ${err.message}`);
  }
}

async function ensureSubitemMatchesLine(subitem, line, index, jobNumber, { dryRun = false } = {}) {
  const boardId = subitem?.board?.id;
  if (!boardId) {
    console.warn(`[sync] Subitem ${subitem.id} missing board id; skipping update.`);
    return;
  }

  const desiredColumns = buildSubitemColumnValues(line);
  for (const [colId, val] of Object.entries(desiredColumns)) {
    const hasColumn = (subitem.column_values || []).some(col => col.id === colId);
    if (!hasColumn) continue;
    const current = getColumnText(subitem.column_values, colId);
    const desiredStr = val != null ? String(val).trim() : '';
    if (current === desiredStr) continue;
    if (dryRun) {
      console.log(`[dry-run] would set subitem ${subitem.id} column ${colId} to "${desiredStr}" (current "${current}")`);
    } else {
      try {
        await mondayClient.setTextColumnValue(boardId, subitem.id, colId, desiredStr);
        console.log(`[sync] Job ${jobNumber} updated subitem ${subitem.id} col ${colId} -> "${desiredStr}" (was "${current}")`);
      } catch (err) {
        console.warn(`[sync] Failed to set subitem ${subitem.id} column ${colId}: ${err.message}`);
      }
    }
  }
}

async function syncSubitemsForItem(item, job, { dryRun = false } = {}) {
  const existingSubitems = item.subitems || [];
  for (let i = 0; i < job.lineItems.length; i++) {
    const line = job.lineItems[i];
    const existing = existingSubitems[i];
    if (existing) {
      await ensureSubitemMatchesLine(existing, line, i, job.jobNumber, { dryRun });
    } else {
      const name = buildSubitemName(line, i);
      const columns = buildSubitemColumnValues(line);
      if (dryRun) {
        console.log(`[dry-run] would create subitem under ${item.id}: ${name}`);
      } else {
        await mondayClient.createSubitem(item.id, name, columns);
        console.log(`[sync] Job ${job.jobNumber} created subitem "${name}" on item ${item.id}`);
      }
    }
  }
  if (existingSubitems.length > job.lineItems.length) {
    const toRemove = existingSubitems.slice(job.lineItems.length);
    for (const sub of toRemove) {
      if (dryRun) {
        console.log(`[dry-run] would archive extra subitem ${sub.id} on job ${job.jobNumber}`);
      } else {
        try {
          await mondayClient.archiveItem(sub.id);
          console.log(`[sync] Archived extra subitem ${sub.id} on job ${job.jobNumber}`);
        } catch (err) {
          console.warn(`[sync] Failed to archive extra subitem ${sub.id}: ${err.message}`);
        }
      }
    }
  }
}

async function updateJobOnMonday(job, existingItem, { dryRun = false } = {}) {
  const itemId = existingItem.id || existingItem;
  const item = await mondayClient.getItemWithColumns(itemId);
  const desiredName = buildItemName(job);
  if (desiredName && item.name !== desiredName) {
    if (dryRun) {
      console.log(`[dry-run] would set item name for ${item.id} to "${desiredName}"`);
    } else {
      try {
        await mondayClient.setItemName(item.board.id, item.id, desiredName);
      } catch (err) {
        console.warn(`[sync] Could not rename item ${item.id}: ${err.message}`);
      }
    }
  }

  await ensureItemColumnValue(item, JOB_NO_COLUMN_ID, job.jobNumber, { dryRun });
  await ensureItemColumnValue(item, CUSTOMER_COLUMN_ID, job.customer, { dryRun });
  await ensureItemColumnValue(item, JOB_TITLE_COLUMN_ID, job.jobTitle, { dryRun });

  await applyJobTypeStatus(item.id, job.jobType, { dryRun });
  await syncSubitemsForItem(item, job, { dryRun });
  return item.id;
}

async function createJobOnMonday(job, { dryRun = false } = {}) {
  const columnValues = {};
  if (JOB_NO_COLUMN_ID) columnValues[JOB_NO_COLUMN_ID] = job.jobNumber;
  if (CUSTOMER_COLUMN_ID) columnValues[CUSTOMER_COLUMN_ID] = job.customer || '';
  if (JOB_TITLE_COLUMN_ID) columnValues[JOB_TITLE_COLUMN_ID] = job.jobTitle || '';

  const itemName = buildItemName(job);

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

  const entries = jobs
    .map(job => ({
      job,
      jobNumber: String(job.jobNumber || '').trim(),
      signature: computeJobSignature(job),
    }))
    .filter(entry => entry.jobNumber);

  const newJobs = entries.filter(entry => {
    if (existing.has(entry.jobNumber)) return false;
    if (stateHasJob(state, entry.jobNumber)) return false;
    return true;
  });

  const updates = entries.filter(entry => {
    if (!existing.has(entry.jobNumber)) return false;
    const prevSignature = state.jobs?.[entry.jobNumber]?.signature || null;
    entry.prevSignature = prevSignature;
    return !prevSignature || prevSignature !== entry.signature;
  });

  const unchanged = entries.filter(entry => {
    if (!existing.has(entry.jobNumber)) return false;
    const prevSignature = state.jobs?.[entry.jobNumber]?.signature || null;
    return prevSignature && prevSignature === entry.signature;
  });

  console.log(
    `[sync] Found ${jobs.length} jobs in CSV; ${newJobs.length} new, ${updates.length} updates (state path ${process.env.OPEN_ORDERS_STATE_PATH || 'default'}).`
  );
  if (unchanged.length) {
    console.log(`[sync] Skipping ${unchanged.length} unchanged jobs (signatures match). Examples: ${unchanged.slice(0, 3).map(e => e.jobNumber).join(', ')}`);
  }

  const results = [];
  for (const entry of newJobs) {
    const job = entry.job;
    try {
      const itemId = await createJobOnMonday(job, { dryRun });
      if (!dryRun && itemId) {
        markJobCreated(state, String(job.jobNumber).trim(), itemId, entry.signature);
      }
      results.push({ job: job.jobNumber, itemId: itemId || null, action: 'created', success: true });
    } catch (err) {
      console.error(`[sync] Failed to create job ${job.jobNumber}:`, err.message);
      results.push({ job: job.jobNumber, success: false, error: err.message });
    }
  }

  for (const entry of updates) {
    const job = entry.job;
    const existingItem = existing.get(entry.jobNumber);
    try {
      console.log(
        `[sync] Updating job ${entry.jobNumber} item ${existingItem.id} (sig ${entry.prevSignature || 'none'} -> ${entry.signature})`
      );
      const itemId = await updateJobOnMonday(job, existingItem, { dryRun });
      if (!dryRun && itemId) {
        markJobUpdated(state, entry.jobNumber, itemId, entry.signature);
      }
      results.push({ job: job.jobNumber, itemId: itemId || null, action: 'updated', success: true });
    } catch (err) {
      console.error(`[sync] Failed to update job ${job.jobNumber}:`, err.message);
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
