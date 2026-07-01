#!/usr/bin/env node
require('dotenv').config();

if (
  process.env.DATABASE_PUBLIC_URL &&
  (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('.internal'))
) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  console.log('[test-dashboard-seed] Using DATABASE_PUBLIC_URL for local seed');
}

const path = require('path');
const pool = require('../src/db/pool');
const { ensureDatabaseTables } = require('../src/db/databaseSchema');
const { fetchBoardLitePaged } = require('../src/services/monday');
const { downloadAsset } = require('../src/services/mondayAssets');
const {
  folderForColumn,
  uploadBuffer,
  cloudinaryResultToFile,
} = require('../src/services/cloudinaryDashboard');
const {
  TEST_DASHBOARD_GROUPS,
  TEST_DASHBOARD_COLUMNS,
  TEST_DASHBOARD_SUBITEM_COLUMNS,
  columnSlug,
} = require('../src/services/testDashboardDefaults');
const {
  dashboardFieldLabelsFromValues,
  updateDatabaseJobDashboardFields,
} = require('../src/services/testDashboardDbFields');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipFiles = args.includes('--skip-files');
const limitFilesPerColumn = parseLimitArg('--limit-files-per-column');

main().catch(async (err) => {
  console.error('[test-dashboard-seed] Fatal:', err.message || err);
  await pool.end().catch(() => {});
  process.exit(1);
});

async function main() {
  await ensureDatabaseTables(pool);
  await ensureDefaultMetadata();

  const seedRun = dryRun
    ? { id: null }
    : (await pool.query(
      `INSERT INTO test_dashboard_seed_runs (status, message)
       VALUES ('running', 'Monday snapshot seed running')
       RETURNING id`
    )).rows[0];

  let fileCount = 0;
  let matchedJobCount = 0;
  try {
    const payload = await fetchBoardLitePaged(100, 20);
    const board = payload.boards?.[0];
    if (!board) throw new Error('No Monday board data returned');

    const columns = Array.isArray(board.columns) ? board.columns : [];
    const subitemColumns = Array.isArray(board.subitemColumns) ? board.subitemColumns : [];
    const groups = Array.isArray(board.groups) ? board.groups : [];
    const fileColumns = columns.filter(column => column.type === 'file');

    if (!dryRun) {
      await upsertGroups(groups);
      await upsertColumns(columns, false);
      await upsertColumns(subitemColumns, true);
    }

    const orderMap = await fetchOrderMap(groups);
    for (const group of groups) {
      for (const item of group.items_page?.items || []) {
        const orderNo = extractOrderNo(item.name);
        const job = orderMap.get(orderNo);
        if (!job) {
          console.warn(`[test-dashboard-seed] No database_jobs row for Monday item ${item.id} (${item.name})`);
          continue;
        }
        matchedJobCount += 1;

        const columnValues = {};
        for (const value of item.column_values || []) {
          const column = columns.find(col => col.id === value.id);
          if (!column || column.type === 'file') continue;
          columnValues[value.id] = {
            id: value.id,
            text: value.text || '',
            type: value.type || column.type || 'text',
            value: value.value || '',
          };
        }

        if (!dryRun) {
          await pool.query(
            `INSERT INTO test_dashboard_job_state (
               source_order_id,
               monday_item_id,
               group_id,
               item_name,
               column_values,
               archived,
               seeded_from_monday,
               seeded_at,
               updated_at
             ) VALUES ($1,$2,$3,$4,$5,FALSE,TRUE,NOW(),NOW())
             ON CONFLICT (source_order_id) DO UPDATE SET
               monday_item_id = EXCLUDED.monday_item_id,
               group_id = EXCLUDED.group_id,
               item_name = EXCLUDED.item_name,
               column_values = EXCLUDED.column_values,
               archived = FALSE,
               seeded_from_monday = TRUE,
               seeded_at = NOW(),
               updated_at = NOW()`,
            [
              job.source_order_id,
              String(item.id),
              group.id,
              item.name || null,
              columnValues,
            ]
          );
          await updateDatabaseJobDashboardFields(
            pool,
            job.source_order_id,
            dashboardFieldLabelsFromValues(columnValues)
          );
        }

        if (!skipFiles) {
          for (const column of fileColumns) {
            const value = (item.column_values || []).find(entry => entry.id === column.id);
            const files = parseMondayFiles(value);
            const limitedFiles = Number.isFinite(limitFilesPerColumn)
              ? files.slice(0, limitFilesPerColumn)
              : files;
            for (const file of limitedFiles) {
              if (!file.assetId) continue;
              if (dryRun) {
                fileCount += 1;
                continue;
              }
              const saved = await seedFileToCloudinary({ job, column, file });
              if (saved) fileCount += 1;
            }
          }
        }
      }
    }

    if (!dryRun) {
      await pool.query(
        `UPDATE test_dashboard_seed_runs
         SET status = 'complete',
             finished_at = NOW(),
             monday_board_id = $2,
             group_count = $3,
             column_count = $4,
             job_count = $5,
             matched_job_count = $6,
             file_count = $7,
             message = 'Monday snapshot seed complete'
         WHERE id = $1`,
        [
          seedRun.id,
          board.id || null,
          groups.length,
          columns.length + subitemColumns.length,
          totalItemCount(groups),
          matchedJobCount,
          fileCount,
        ]
      );
    }

    console.log(JSON.stringify({
      ok: true,
      dryRun,
      skipFiles,
      groups: groups.length,
      columns: columns.length,
      subitemColumns: subitemColumns.length,
      mondayItems: totalItemCount(groups),
      matchedJobs: matchedJobCount,
      seededFiles: fileCount,
    }, null, 2));
  } catch (err) {
    if (!dryRun && seedRun.id) {
      await pool.query(
        `UPDATE test_dashboard_seed_runs
         SET status = 'failed',
             finished_at = NOW(),
             message = $2
         WHERE id = $1`,
        [seedRun.id, err.message || String(err)]
      ).catch(() => {});
    }
    throw err;
  } finally {
    await pool.end();
  }
}

async function ensureDefaultMetadata() {
  await upsertGroups(TEST_DASHBOARD_GROUPS);
  await upsertColumns(TEST_DASHBOARD_COLUMNS, false);
  await upsertColumns(TEST_DASHBOARD_SUBITEM_COLUMNS, true);
}

async function upsertGroups(groups) {
  for (const [index, group] of groups.entries()) {
    await pool.query(
      `INSERT INTO test_dashboard_groups (id, title, color, position, sort_order, seeded_from_monday, updated_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         color = EXCLUDED.color,
         position = EXCLUDED.position,
         sort_order = EXCLUDED.sort_order,
         seeded_from_monday = TRUE,
         updated_at = NOW()`,
      [
        group.id,
        group.title || group.id,
        group.color || null,
        nullableNumber(group.position),
        group.sort_order || index + 1,
      ]
    );
  }
}

async function upsertColumns(columns, isSubitem) {
  for (const [index, column] of columns.entries()) {
    await pool.query(
      `INSERT INTO test_dashboard_columns (id, title, type, settings_str, is_subitem, position, seeded_from_monday, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW())
       ON CONFLICT (id, is_subitem) DO UPDATE SET
         title = EXCLUDED.title,
         type = EXCLUDED.type,
         settings_str = EXCLUDED.settings_str,
         position = EXCLUDED.position,
         seeded_from_monday = TRUE,
         updated_at = NOW()`,
      [
        column.id,
        column.title || column.id,
        column.type || 'text',
        column.settings_str || '',
        Boolean(isSubitem),
        nullableNumber(column.position) || defaultColumnPosition(column.id, isSubitem) || index + 1,
      ]
    );
  }
}

async function fetchOrderMap(groups) {
  const orderNos = Array.from(new Set(
    groups
      .flatMap(group => group.items_page?.items || [])
      .map(item => extractOrderNo(item.name))
      .filter(Number.isFinite)
  ));
  const map = new Map();
  if (!orderNos.length) return map;
  const result = await pool.query(
    `SELECT source_order_id, order_no
     FROM database_jobs
     WHERE order_no = ANY($1::int[])`,
    [orderNos]
  );
  for (const row of result.rows) map.set(Number(row.order_no), row);
  return map;
}

async function seedFileToCloudinary({ job, column, file }) {
  const existing = await pool.query(
    `SELECT id FROM test_dashboard_files
     WHERE source_order_id = $1
       AND column_id = $2
       AND metadata->>'monday_asset_id' = $3
     LIMIT 1`,
    [job.source_order_id, column.id, String(file.assetId)]
  );
  if (existing.rowCount) return null;

  console.log(`[test-dashboard-seed] Uploading ${column.title}/${job.order_no}: ${file.name}`);
  const buffer = await downloadAsset(file.assetId);
  const folder = folderForColumn(column, job.order_no || job.source_order_id);
  const publicId = `monday-${file.assetId}-${safeBaseName(file.name)}`;
  const result = await uploadBuffer(buffer, {
    folder,
    publicId,
    filename: file.name,
    context: {
      monday_asset_id: String(file.assetId),
      source_order_id: String(job.source_order_id),
      column_id: column.id,
    },
  });

  const saved = cloudinaryResultToFile(result, {
    original_filename: file.name,
    metadata: {
      monday_asset_id: String(file.assetId),
      monday_file_name: file.name,
      seeded_from_monday: true,
      column_slug: columnSlug(column),
    },
  });

  await pool.query(
    `INSERT INTO test_dashboard_files (
       source_order_id,
       column_id,
       column_title,
       public_id,
       secure_url,
       resource_type,
       format,
       original_filename,
       bytes,
       width,
       height,
       metadata,
       updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (public_id) DO UPDATE SET
       secure_url = EXCLUDED.secure_url,
       resource_type = EXCLUDED.resource_type,
       format = EXCLUDED.format,
       original_filename = EXCLUDED.original_filename,
       bytes = EXCLUDED.bytes,
       width = EXCLUDED.width,
       height = EXCLUDED.height,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      job.source_order_id,
      column.id,
      column.title || column.id,
      saved.public_id,
      saved.secure_url,
      saved.resource_type,
      saved.format,
      saved.original_filename,
      saved.bytes,
      saved.width,
      saved.height,
      saved.metadata,
    ]
  );

  return saved;
}

function parseMondayFiles(value) {
  if (!value?.value) return [];
  try {
    const parsed = JSON.parse(value.value);
    return (Array.isArray(parsed.files) ? parsed.files : [])
      .map(file => ({
        assetId: file.assetId || file.asset_id || file.id || '',
        name: file.name || file.fileName || `asset-${file.assetId || file.id || 'file'}`,
      }))
      .filter(file => file.assetId);
  } catch {
    return [];
  }
}

function extractOrderNo(itemName) {
  const match = String(itemName || '').match(/^\s*(\d{4,})\b/);
  return match ? Number.parseInt(match[1], 10) : NaN;
}

function totalItemCount(groups) {
  return groups.reduce((sum, group) => sum + (group.items_page?.items?.length || 0), 0);
}

function safeBaseName(filename) {
  const base = path.basename(String(filename || 'file')).replace(/\.[^.]+$/, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultColumnPosition(columnId, isSubitem) {
  const source = isSubitem ? TEST_DASHBOARD_SUBITEM_COLUMNS : TEST_DASHBOARD_COLUMNS;
  return source.find(column => column.id === columnId)?.position || null;
}

function parseLimitArg(name) {
  const arg = args.find(value => value.startsWith(`${name}=`));
  if (!arg) return null;
  const parsed = Number.parseInt(arg.slice(name.length + 1), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
