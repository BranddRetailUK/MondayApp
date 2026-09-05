#!/usr/bin/env node
require('dotenv').config();

if (
  process.env.DATABASE_PUBLIC_URL &&
  (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('.internal'))
) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  console.log('[invoice-verify] Using DATABASE_PUBLIC_URL for local verification');
}

const fs = require('fs');
const { spawnSync } = require('child_process');
const pool = require('../src/db/pool');

const FIELD_DELIMITER = '\t';
const RECORD_DELIMITER = '\x1e';
const DEFAULT_MDB_PATH = 'PS_XP_tab.mdb';
const MDB_EXPORT_BIN = resolveMdbExportBin();

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
    return;
  }

  const mdbPath = args.find((arg) => !arg.startsWith('--')) || DEFAULT_MDB_PATH;
  const maxMismatches = parseMaxMismatches(args);

  if (!fs.existsSync(mdbPath)) {
    throw new Error(`MDB file not found: ${mdbPath}`);
  }

  console.log(`[invoice-verify] Reading order and invoice numbers from ${mdbPath}`);
  const mdbOrders = readMdbOrders(mdbPath);

  console.log('[invoice-verify] Reading source-backed jobs from Postgres');
  const dbOrders = await readDbOrders();

  const mismatches = compareOrders(mdbOrders, dbOrders);
  const duplicateDbInvoices = await readDuplicateDbInvoices();
  const maxes = await readMaxes();
  const nativeJobs = await readNativeJobsAfterMdb(maxes.mdb_max_source_order_id);

  if (mismatches.length || duplicateDbInvoices.length) {
    console.error('[invoice-verify] FAILED');
    console.error(`[invoice-verify] Source-backed order/invoice mismatches: ${mismatches.length}`);
    for (const mismatch of mismatches.slice(0, maxMismatches)) {
      console.error(
        `[invoice-verify] source_order_id=${mismatch.source_order_id} ` +
        `mdb_order=${formatNumber(mismatch.mdb_order_no)} db_order=${formatNumber(mismatch.db_order_no)} ` +
        `mdb_invoice=${formatNumber(mismatch.mdb_invoice_no)} db_invoice=${formatNumber(mismatch.db_invoice_no)}`
      );
    }
    if (mismatches.length > maxMismatches) {
      console.error(`[invoice-verify] ... ${mismatches.length - maxMismatches} more mismatches`);
    }

    if (duplicateDbInvoices.length) {
      console.error(`[invoice-verify] Duplicate DB invoice numbers: ${duplicateDbInvoices.length}`);
      for (const duplicate of duplicateDbInvoices) {
        console.error(
          `[invoice-verify] invoice_no=${duplicate.invoice_no} ` +
          `source_order_ids=${duplicate.source_order_ids.join(',')}`
        );
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log('[invoice-verify] OK');
  console.log(`[invoice-verify] Checked ${mdbOrders.size} MDB orders against ${dbOrders.size} DB source-backed jobs`);
  console.log(
    `[invoice-verify] MDB max source/order/invoice: ` +
    `source=${maxes.mdb_max_source_order_id}, ` +
    `order=${maxes.mdb_max_order_no}, ` +
    `invoice=${formatNumber(maxes.mdb_max_invoice_no)}`
  );
  console.log(`[invoice-verify] DB max invoice: ${formatNumber(maxes.max_invoice_no)}`);
  console.log(`[invoice-verify] DB max order/source ids: order=${maxes.max_order_no}, source=${maxes.max_source_order_id}`);
  if (nativeJobs.length) {
    console.log('[invoice-verify] Native DB jobs after MDB max:');
    for (const job of nativeJobs) {
      console.log(
        `[invoice-verify] source=${job.source_order_id}, order=${job.order_no}, ` +
        `invoice=${formatNumber(job.invoice_no)}, customer=${job.customer_name || ''}`
      );
    }
  }
}

function readMdbOrders(mdbPath) {
  const result = spawnSync(MDB_EXPORT_BIN, [
    '-d',
    FIELD_DELIMITER,
    '-R',
    RECORD_DELIMITER,
    mdbPath,
    'tblOrder',
  ], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `mdb-export exited with status ${result.status}`);
  }

  const records = result.stdout
    .replace(new RegExp(`${RECORD_DELIMITER}$`), '')
    .split(RECORD_DELIMITER)
    .map((record) => record.replace(/^\n|\n$/g, ''))
    .filter(Boolean);

  const header = records.shift();
  if (!header) throw new Error('tblOrder export was empty');

  const headers = header.split(FIELD_DELIMITER);
  const orderIdIndex = headers.indexOf('OrderID');
  const orderNoIndex = headers.indexOf('lngOrderNo');
  const invoiceNoIndex = headers.indexOf('lngInvoiceNo');
  if (orderIdIndex === -1 || orderNoIndex === -1 || invoiceNoIndex === -1) {
    throw new Error('tblOrder export is missing OrderID, lngOrderNo, or lngInvoiceNo');
  }

  const orders = new Map();
  for (const record of records) {
    const fields = record.split(FIELD_DELIMITER);
    const sourceOrderId = toInt(fields[orderIdIndex]);
    if (!sourceOrderId) continue;
    orders.set(sourceOrderId, {
      order_no: toInt(fields[orderNoIndex]),
      invoice_no: toInt(fields[invoiceNoIndex]),
    });
  }

  return orders;
}

async function readDbOrders() {
  const result = await pool.query(`
    SELECT source_order_id, order_no, invoice_no
    FROM database_jobs
    WHERE is_manual_entry IS NOT TRUE
    ORDER BY source_order_id
  `);

  return new Map(result.rows.map((row) => [
    Number(row.source_order_id),
    {
      order_no: row.order_no === null ? null : Number(row.order_no),
      invoice_no: row.invoice_no === null ? null : Number(row.invoice_no),
    },
  ]));
}

async function readDuplicateDbInvoices() {
  const result = await pool.query(`
    SELECT invoice_no,
           COUNT(*)::int AS count,
           ARRAY_AGG(source_order_id ORDER BY source_order_id) AS source_order_ids
    FROM database_jobs
    WHERE invoice_no IS NOT NULL
    GROUP BY invoice_no
    HAVING COUNT(*) > 1
    ORDER BY invoice_no DESC
    LIMIT 25
  `);
  return result.rows;
}

async function readMaxes() {
  const result = await pool.query(`
    SELECT MAX(invoice_no)::int AS max_invoice_no,
           MAX(order_no)::int AS max_order_no,
           MAX(source_order_id)::int AS max_source_order_id,
           MAX(source_order_id) FILTER (WHERE is_manual_entry IS NOT TRUE)::int AS mdb_max_source_order_id,
           MAX(order_no) FILTER (WHERE is_manual_entry IS NOT TRUE)::int AS mdb_max_order_no,
           MAX(invoice_no) FILTER (WHERE is_manual_entry IS NOT TRUE)::int AS mdb_max_invoice_no
    FROM database_jobs
  `);
  return result.rows[0] || {};
}

async function readNativeJobsAfterMdb(maxSourceOrderId) {
  if (!maxSourceOrderId) return [];
  const result = await pool.query(`
    SELECT source_order_id, order_no, invoice_no, customer_name, job_title
    FROM database_jobs
    WHERE source_order_id > $1
    ORDER BY source_order_id
  `, [maxSourceOrderId]);
  return result.rows;
}

function compareOrders(mdbOrders, dbOrders) {
  const mismatches = [];

  for (const [sourceOrderId, mdbOrder] of mdbOrders) {
    const dbOrder = dbOrders.get(sourceOrderId);
    if (!dbOrder || dbOrder.order_no !== mdbOrder.order_no || dbOrder.invoice_no !== mdbOrder.invoice_no) {
      mismatches.push({
        source_order_id: sourceOrderId,
        mdb_order_no: mdbOrder.order_no,
        db_order_no: dbOrder?.order_no,
        mdb_invoice_no: mdbOrder.invoice_no,
        db_invoice_no: dbOrder?.invoice_no,
      });
    }
  }

  for (const [sourceOrderId, dbOrder] of dbOrders) {
    if (!mdbOrders.has(sourceOrderId)) {
      mismatches.push({
        source_order_id: sourceOrderId,
        mdb_order_no: undefined,
        db_order_no: dbOrder.order_no,
        mdb_invoice_no: undefined,
        db_invoice_no: dbOrder.invoice_no,
      });
    }
  }

  return mismatches.sort((a, b) => a.source_order_id - b.source_order_id);
}

function parseMaxMismatches(args) {
  const arg = args.find((value) => value.startsWith('--max-mismatches='));
  if (!arg) return 25;
  const value = Number.parseInt(arg.split('=')[1], 10);
  return Number.isFinite(value) && value > 0 ? value : 25;
}

function toInt(value) {
  const cleaned = String(value ?? '').replace(/^"|"$/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  return value === null || value === undefined ? 'NULL' : String(value);
}

function resolveMdbExportBin() {
  if (process.env.MDB_EXPORT_BIN) return process.env.MDB_EXPORT_BIN;
  for (const candidate of [
    '/opt/homebrew/bin/mdb-export',
    '/usr/local/bin/mdb-export',
    '/usr/bin/mdb-export',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'mdb-export';
}

function printHelp() {
  console.log(`Usage: node scripts/verify-mdb-invoice-numbers.js [PS_XP_tab.mdb] [--max-mismatches=25]

Compares source-backed database_jobs.order_no and invoice_no values against
tblOrder.lngOrderNo and tblOrder.lngInvoiceNo from the supplied MDB file.
Manual Hub-created jobs are not present in the MDB and are reported separately,
while duplicate invoice numbers are still checked across the whole database_jobs table.`);
}

main()
  .catch((err) => {
    console.error('[invoice-verify] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
