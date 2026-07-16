#!/usr/bin/env node

require('dotenv').config();

const { Client } = require('pg');
const { ensureDatabaseTables } = require('../src/db/databaseSchema');

const BACKFILL_LOCK_ID = 7120260717;

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  if (dryRun === apply) throw new Error('Choose exactly one mode: --dry-run or --apply');
  if (apply && !args.includes('--confirm-write')) {
    throw new Error('--apply requires --confirm-write after the database target has been verified');
  }
  return { help: false, dryRun, apply };
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-ralawise-line-items.js --dry-run
  node scripts/backfill-ralawise-line-items.js --apply --confirm-write

The backfill adds canonical Ralawise variant identity to historical order lines.
It never changes their Access source product id, descriptions, colours, sizes,
costs, prices, quantities, VAT, or other historical snapshot fields.`);
}

function connectionString() {
  return process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || null;
}

function targetLabel(value) {
  if (!value) return 'not configured';
  try {
    const url = new URL(value);
    return `${url.hostname}/${url.pathname.replace(/^\//, '') || '(default)'}`;
  } catch (_error) {
    return 'configured PostgreSQL target';
  }
}

async function lineIdentityColumnsExist(client) {
  const result = await client.query(`
    SELECT COUNT(*)::int AS present
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'database_job_line_items'
      AND column_name IN (
        'ralawise_catalog_variant_id',
        'ralawise_sku',
        'supplier_style_code',
        'supplier_colour_code',
        'supplier_size_code',
        'catalogue_status',
        'catalogue_synced_at'
      )
  `);
  return result.rows[0]?.present === 7;
}

async function auditBackfill(client) {
  const result = await client.query(`
    WITH candidates AS (
      SELECT li.source_order_item_id,
             li.source_order_id,
             li.source_product_id,
             li.ralawise_catalog_variant_id AS line_variant_id,
             p.ralawise_catalog_variant_id AS product_variant_id,
             v.sku_status,
             v.is_active
      FROM database_job_line_items li
      JOIN database_products p ON p.source_product_id = li.source_product_id
      JOIN database_ralawise_catalog_variants v
        ON v.id = p.ralawise_catalog_variant_id
      WHERE p.ralawise_catalog_variant_id IS NOT NULL
    )
    SELECT COUNT(*)::int AS candidate_lines,
           COUNT(DISTINCT source_order_id)::int AS candidate_jobs,
           COUNT(*) FILTER (WHERE line_variant_id IS NULL)::int AS lines_to_backfill,
           COUNT(DISTINCT source_order_id) FILTER (WHERE line_variant_id IS NULL)::int AS jobs_to_backfill,
           COUNT(*) FILTER (WHERE line_variant_id = product_variant_id)::int AS already_linked,
           COUNT(*) FILTER (
             WHERE line_variant_id IS NOT NULL
               AND line_variant_id <> product_variant_id
           )::int AS conflicting_links,
           COUNT(*) FILTER (WHERE source_product_id > 0)::int AS historical_access_lines,
           COUNT(*) FILTER (WHERE is_active)::int AS live_lines,
           COUNT(*) FILTER (WHERE NOT is_active)::int AS inactive_lines
    FROM candidates
  `);
  return result.rows[0];
}

async function historicalSnapshotFingerprint(client) {
  const result = await client.query(`
    WITH historical_rows AS (
      SELECT li.source_order_item_id,
             to_jsonb(li) - ARRAY[
               'ralawise_catalog_variant_id',
               'ralawise_sku',
               'supplier_style_code',
               'supplier_colour_code',
               'supplier_size_code',
               'catalogue_status',
               'catalogue_synced_at'
             ]::text[] AS snapshot
      FROM database_job_line_items li
    )
    SELECT COUNT(*)::int AS line_count,
           MD5(COALESCE(
             STRING_AGG(MD5(snapshot::text), '' ORDER BY source_order_item_id),
             ''
           )) AS fingerprint
    FROM historical_rows
  `);
  return result.rows[0];
}

async function applyBackfill(client) {
  const result = await client.query(`
    UPDATE database_job_line_items li
    SET ralawise_catalog_variant_id = v.id,
        ralawise_sku = v.sku_code,
        supplier_style_code = s.style_code,
        supplier_colour_code = c.colour_code,
        supplier_size_code = v.size_code,
        catalogue_status = v.sku_status,
        catalogue_synced_at = NOW()
    FROM database_products p
    JOIN database_ralawise_catalog_variants v
      ON v.id = p.ralawise_catalog_variant_id
    JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
    JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
    WHERE p.source_product_id = li.source_product_id
      AND li.ralawise_catalog_variant_id IS NULL
    RETURNING li.source_order_item_id
  `);
  return result.rowCount;
}

async function run(options, dependencies = {}) {
  const url = dependencies.connectionString || connectionString();
  if (!url) throw new Error('DATABASE_PUBLIC_URL or DATABASE_URL is required');
  const client = dependencies.client || new Client({
    connectionString: url,
    ssl: (process.env.PGSSLMODE || 'require') === 'disable'
      ? false
      : { rejectUnauthorized: false },
  });
  const ownsClient = !dependencies.client;
  if (ownsClient) await client.connect();

  try {
    if (options.apply) await ensureDatabaseTables(client);
    if (!(await lineIdentityColumnsExist(client))) {
      throw new Error('Canonical line-item columns are not installed; run the database migration before dry-run');
    }

    const before = await auditBackfill(client);
    console.log(`[ralawise-line-backfill] Mode: ${options.dryRun ? 'dry-run' : 'apply'}`);
    console.log(`[ralawise-line-backfill] Database target: ${targetLabel(url)}`);
    console.log(`[ralawise-line-backfill] Candidates: ${before.candidate_lines} lines across ${before.candidate_jobs} jobs`);
    console.log(`[ralawise-line-backfill] Pending: ${before.lines_to_backfill} lines across ${before.jobs_to_backfill} jobs`);
    console.log(`[ralawise-line-backfill] Existing: ${before.already_linked}; conflicts: ${before.conflicting_links}`);
    console.log(`[ralawise-line-backfill] Historical Access ids preserved: ${before.historical_access_lines}`);

    if (before.conflicting_links) {
      throw new Error('Conflicting existing line-level Ralawise links require review; no writes performed');
    }
    if (options.dryRun) {
      console.log('[ralawise-line-backfill] Dry run complete. No schema or data writes were performed.');
      return { before, updated: 0 };
    }

    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [BACKFILL_LOCK_ID]);
      const historicalBefore = await historicalSnapshotFingerprint(client);
      const updated = await applyBackfill(client);
      const after = await auditBackfill(client);
      const historicalAfter = await historicalSnapshotFingerprint(client);
      if (after.lines_to_backfill || after.conflicting_links) {
        throw new Error('Post-apply verification failed');
      }
      if (
        historicalAfter.line_count !== historicalBefore.line_count
        || historicalAfter.fingerprint !== historicalBefore.fingerprint
      ) {
        throw new Error('Historical line-item verification failed; rolling back all changes');
      }
      await client.query('COMMIT');
      console.log(`[ralawise-line-backfill] Updated ${updated} line items; historical snapshot fields were unchanged.`);
      console.log(`[ralawise-line-backfill] Historical fingerprint verified: ${historicalAfter.fingerprint}`);
      return { before, after, historicalBefore, historicalAfter, updated };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    if (ownsClient) await client.end();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  await run(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ralawise-line-backfill] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyBackfill,
  auditBackfill,
  historicalSnapshotFingerprint,
  lineIdentityColumnsExist,
  parseArgs,
  run,
};
