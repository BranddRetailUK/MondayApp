// src/services/dropboxLineItemImporter.js
require('dotenv').config();

const mondayFields = require('../config/mondayFields');
const {
  listProcessableFiles,
  downloadFile,
  moveToArchive,
  moveToError,
  findFileByJobNumber,
  IMPORT_FOLDER,
} = require('./dropboxClient');
const mondayClient = require('./mondayClient');
const { parseLineItemsFromBuffer } = require('./lineItemParser');

const BOARD_ID =
  Number(
    process.env.LINEITEM_BOARD_ID ||
      mondayFields.BOARD_ID_MAIN ||
      mondayFields.BOARD_ID ||
      mondayFields.BOARD_ID_VISUAL
  ) || null;

const JOB_NO_COLUMN_ID =
  process.env.LINEITEM_JOB_NO_COLUMN_ID ||
  mondayFields.COLS.JOB_NO ||
  null;

const SUBITEM_COLS = mondayFields.SUBITEM_COLS || {};

function buildSubitemName(lineItem, index) {
  const base =
    lineItem.styleName ||
    lineItem.styleCode ||
    lineItem.productId ||
    `Line ${index + 1}`;
  return base.trim();
}

function buildColumnValues(lineItem) {
  const values = {};
  if (SUBITEM_COLS.CODE) values[SUBITEM_COLS.CODE] = lineItem.styleCode || '';
  if (SUBITEM_COLS.SIZE) values[SUBITEM_COLS.SIZE] = lineItem.size || '';
  if (SUBITEM_COLS.COLOUR) values[SUBITEM_COLS.COLOUR] = lineItem.colour || '';
  if (SUBITEM_COLS.QTY) values[SUBITEM_COLS.QTY] = String(lineItem.qty ?? '');
  return values;
}

async function resolveJobItem(jobNumber, targetItemId = null) {
  if (targetItemId) {
    return { id: targetItemId, name: null };
  }

  if (!BOARD_ID) {
    throw new Error('LINEITEM board id not configured');
  }

  if (JOB_NO_COLUMN_ID) {
    try {
      const matches = await mondayClient.findItemsByColumnValue(
        BOARD_ID,
        JOB_NO_COLUMN_ID,
        jobNumber,
        3
      );
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        throw new Error(
          `Multiple Monday items match job number ${jobNumber}.`
        );
      }
    } catch (err) {
      console.warn(
        `[lineitem-importer] failed column lookup (${JOB_NO_COLUMN_ID}): ${err.message}`
      );
    }
  }

  const fallback = await mondayClient.findItemByNamePrefix(BOARD_ID, jobNumber);
  if (!fallback) {
    throw new Error(`No Monday item found for job number ${jobNumber}`);
  }
  return fallback;
}

async function createSubitems(itemId, lineItems, { dryRun = false } = {}) {
  for (let i = 0; i < lineItems.length; i++) {
    const lineItem = lineItems[i];
    const name = buildSubitemName(lineItem, i);
    const columnValues = buildColumnValues(lineItem);

    if (dryRun) {
      console.log('[dry-run] would create subitem:', { parent: itemId, name, columnValues });
      continue;
    }

    await mondayClient.createSubitem(itemId, name, columnValues);
  }
}

async function processDropboxEntry(entry, options = {}) {
  const {
    dryRun = false,
    targetItemId = null,
    moveOnSuccess = true,
    moveOnError = true,
  } = options;

  const entryPath = entry.path_lower || entry.path_display || entry.path;
  if (!entryPath) throw new Error('Entry path missing from Dropbox metadata');

  try {
    const { buffer } = await downloadFile(entryPath);
    const { items, errors, jobNumber } = parseLineItemsFromBuffer(buffer, entry.name);

    if (!jobNumber) {
      throw new Error('Filename must include 5 digit job number.');
    }
    if (errors.length) {
      const reasons = errors.map(err => `Row ${err.rowNumber}: ${err.reason}`).join('; ');
      throw new Error(`Validation failed — ${reasons}`);
    }

    console.log(
      `[lineitem-importer] job #${jobNumber} -> ${items.length} line items (dryRun=${dryRun})`
    );

    const jobItem = await resolveJobItem(jobNumber, targetItemId);
    await createSubitems(jobItem.id, items, { dryRun });

    if (!dryRun && moveOnSuccess) {
      await moveToArchive(entryPath);
    }

    return {
      ok: true,
      jobNumber,
      lineItems: items.length,
      itemId: jobItem.id,
      file: entry.name,
    };
  } catch (err) {
    if (!dryRun && moveOnError) {
      try {
        await moveToError(entryPath);
      } catch (moveErr) {
        console.error('[lineitem-importer] failed moving to error folder:', moveErr.message);
      }
    }
    throw err;
  }
}

async function importAllPending({ dryRun = false } = {}) {
  const entries = await listProcessableFiles();
  const results = [];
  for (const entry of entries) {
    try {
      const result = await processDropboxEntry(entry, { dryRun });
      results.push({ entry: entry.name, success: true, result });
    } catch (err) {
      results.push({ entry: entry.name, success: false, error: err });
    }
  }
  return results;
}

const activeJobs = new Set();

async function processJobNumber(jobNumber, { dryRun = false, targetItemId = null } = {}) {
  const key = String(jobNumber || '').trim();
  if (!key) return { ok: false, reason: 'invalid_job_number' };

  if (activeJobs.has(key)) {
    return { ok: false, reason: 'job_in_progress', jobNumber: key };
  }

  activeJobs.add(key);
  try {
    const entry = await findFileByJobNumber(jobNumber);
    if (!entry) {
      return { ok: false, reason: 'file_not_found', jobNumber };
    }

    const result = await processDropboxEntry(entry, {
      dryRun,
      targetItemId,
    });
    return { ok: true, ...result };
  } finally {
    activeJobs.delete(key);
  }
}

module.exports = {
  BOARD_ID,
  JOB_NO_COLUMN_ID,
  IMPORT_FOLDER,
  processDropboxEntry,
  processJobNumber,
  importAllPending,
};
