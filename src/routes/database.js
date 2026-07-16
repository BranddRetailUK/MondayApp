const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const env = require('../config/env');
const { ensureStockOrderingBasketTables } = require('../db/stockOrderingBasketSchema');
const {
  RalawiseBasketError,
  createRalawiseBasketClient,
} = require('../integrations/ralawiseBasket');
const { fullName } = require('../services/hubAuth');
const {
  StockOrderingRalawiseError,
  basketContainsPlan,
  buildJobBasketPlan,
  matchBasketedJobToPlacedOrders,
  publicBasketError,
} = require('../services/stockOrderingRalawise');
const {
  AWAITING_APPROVAL_LABEL,
  STOCK_ORDERED_LABEL,
  awaitingApprovalStatusValue,
  formatDashboardJobName,
  resolveJobApproved,
  stockOrderedGroupIdForJob,
  stockOrderedStatusValue,
} = require('../services/dashboardAutomation');
const {
  TEST_DASHBOARD_COLUMN_IDS,
  TEST_DASHBOARD_GROUP_IDS,
  STATUS_SETTINGS,
  normalizeColumnTitle,
} = require('../services/testDashboardDefaults');
const {
  normalizeStyleCodeSearchKey,
  normalizedStyleCodeSql,
} = require('../services/productStyleSearch');
const { buildJobFilters } = require('../services/databaseJobFilters');

const DASHBOARD_STATUS_COLORS = buildDashboardStatusColors(STATUS_SETTINGS);
const MAX_STOCK_ORDERING_MARK_IDS = 500;
const RALAWISE_ADDING_STALE_MS = 10 * 60 * 1000;
const RALAWISE_ORDER_HISTORY_LOCK_KEYS = [71060219, 1206];
const ralawiseBasketClient = createRalawiseBasketClient();
let ralawiseOrderHistorySyncPromise = null;
let ralawiseOrderHistoryTimer = null;
const DATABASE_REPORT_PERIODS = Object.freeze({
  daily: Object.freeze({
    label: 'Daily',
    description: 'Today',
    grain: 'hour',
    stepSql: "INTERVAL '1 hour'",
    startSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')",
    endSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '1 day'",
  }),
  weekly: Object.freeze({
    label: 'Weekly',
    description: 'Last 7 days',
    grain: 'day',
    stepSql: "INTERVAL '1 day'",
    startSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') - INTERVAL '6 days'",
    endSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '1 day'",
  }),
  monthly: Object.freeze({
    label: 'Monthly',
    description: 'Last 30 days',
    grain: 'day',
    stepSql: "INTERVAL '1 day'",
    startSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') - INTERVAL '29 days'",
    endSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '1 day'",
  }),
  mtd: Object.freeze({
    label: 'Month to date',
    description: 'Month to date',
    grain: 'day',
    stepSql: "INTERVAL '1 day'",
    startSql: "DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')",
    endSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '1 day'",
  }),
  ytd: Object.freeze({
    label: 'Year to date',
    description: 'Year to date',
    grain: 'month',
    stepSql: "INTERVAL '1 month'",
    startSql: "DATE_TRUNC('year', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')",
    endSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '1 day'",
  }),
  last12: Object.freeze({
    label: 'Last 12 months',
    description: 'Rolling 12 months',
    grain: 'month',
    stepSql: "INTERVAL '1 month'",
    startSql: "DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') - INTERVAL '11 months'",
    endSql: "DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '1 day'",
  }),
});

function buildDashboardStatusColors(settings) {
  const labels = settings?.labels || {};
  const colors = settings?.labels_colors || {};
  return Object.freeze(Object.entries(labels).reduce((map, [index, label]) => {
    const normalized = normalizeColumnTitle(label);
    const color = colors?.[index]?.color;
    if (normalized && color) map[normalized] = color;
    return map;
  }, {}));
}

function parseSourceOrderIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((raw) => Number.parseInt(String(raw), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  return Array.from(new Set(ids));
}

function ralawiseProductSkuSql(alias = 'p') {
  return `COALESCE(
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'ralawise_sku'), ''),
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'supplier_sku'), ''),
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'catalog_sku'), '')
  )`;
}

function ralawiseProductStatusSql(alias = 'p') {
  return `COALESCE(
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'ralawise_catalog_status'), ''),
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'catalogue_status'), ''),
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'catalog_status'), ''),
    NULLIF(BTRIM(TO_JSONB(${alias}) ->> 'supplier_status'), '')
  )`;
}

async function selectDashboardJobsForStockOrdered(client, sourceOrderIds) {
  return client.query(
    `SELECT j.source_order_id,
            j.order_no,
            j.customer_name,
            j.job_title,
            j.order_type,
            j.order_type_abbr,
            j.dashboard_status,
            j.dashboard_type,
            j.proof_approved,
            s.group_id,
            s.item_name,
            s.column_values,
            s.archived
     FROM database_jobs j
     LEFT JOIN test_dashboard_job_state s ON s.source_order_id = j.source_order_id
     WHERE j.source_order_id = ANY($1::int[])
     FOR UPDATE OF j`,
    [sourceOrderIds]
  );
}

async function applyStockOrderedStatus(client, rows) {
  const sourceOrderIds = rows.map((row) => Number(row.source_order_id));
  const updatedJobs = [];
  for (const row of rows) {
    const columnValues = { ...(row.column_values || {}) };
    columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] = stockOrderedStatusValue();
    const groupId = stockOrderedGroupIdForJob(row);
    const itemName = row.item_name || formatDashboardJobName(row);

    await client.query(
      `INSERT INTO test_dashboard_job_state (
         source_order_id,
         group_id,
         item_name,
         column_values,
         archived,
         updated_at
       ) VALUES ($1,$2,$3,$4,FALSE,NOW())
       ON CONFLICT (source_order_id) DO UPDATE SET
         group_id = EXCLUDED.group_id,
         item_name = COALESCE(EXCLUDED.item_name, test_dashboard_job_state.item_name),
         column_values = EXCLUDED.column_values,
         archived = FALSE,
         updated_at = NOW()`,
      [row.source_order_id, groupId, itemName || null, columnValues]
    );

    updatedJobs.push({
      source_order_id: row.source_order_id,
      dashboard_status: STOCK_ORDERED_LABEL,
      group_id: groupId,
    });
  }

  const updatedDbJobs = await client.query(
    `UPDATE database_jobs
     SET dashboard_status = $2,
         dashboard_status_updated_at = NOW(),
         updated_at_source = NOW(),
         imported_at = NOW()
     WHERE source_order_id = ANY($1::int[])
     RETURNING source_order_id, dashboard_status, dashboard_status_updated_at`,
    [sourceOrderIds, STOCK_ORDERED_LABEL]
  );
  const dbJobMap = new Map(updatedDbJobs.rows.map((row) => [Number(row.source_order_id), row]));
  return updatedJobs.map((job) => ({
    ...job,
    dashboard_status_updated_at: dbJobMap.get(Number(job.source_order_id))?.dashboard_status_updated_at || null,
  }));
}

async function selectStockOrderingLinesForBasket(client, sourceOrderId) {
  return client.query(
    `SELECT li.*,
            COALESCE(
              NULLIF(BTRIM(li.ralawise_sku), ''),
              v.sku_code,
              ${ralawiseProductSkuSql('p')}
            ) AS ralawise_sku,
            COALESCE(
              NULLIF(BTRIM(li.catalogue_status), ''),
              v.sku_status,
              ${ralawiseProductStatusSql('p')}
            ) AS ralawise_catalog_status
     FROM database_job_line_items li
     LEFT JOIN database_products p ON p.source_product_id = li.source_product_id
     LEFT JOIN database_ralawise_catalog_variants v
       ON v.id = COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id)
     WHERE li.source_order_id = $1
       AND li.is_non_deliverable IS NOT TRUE
       AND li.is_internal IS NOT TRUE
     ORDER BY COALESCE(li.line_sort_order, li.source_order_item_id),
              li.source_order_item_id`,
    [sourceOrderId]
  );
}

async function recordRalawiseBasketFailure(sourceOrderId, error) {
  const message = publicBasketError(error).slice(0, 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE database_ralawise_basket_jobs
       SET status = 'failed',
           last_error = $2,
           updated_at = NOW()
       WHERE source_order_id = $1
         AND status = 'adding'`,
      [sourceOrderId, message]
    );
    await client.query(
      `UPDATE database_ralawise_basket_lines
       SET status = 'failed',
           updated_at = NOW()
       WHERE source_order_id = $1
         AND status = 'adding'`,
      [sourceOrderId]
    );
    await client.query('COMMIT');
  } catch (failureError) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed to record Ralawise basket error', failureError);
  } finally {
    client.release();
  }
}

function formatRalawiseHistoryDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCFullYear()),
  ].join('/');
}

function ralawiseOrderLookupDateRange(jobs = []) {
  const now = Date.now();
  let fromMs = now - (env.RALAWISE_ORDER_HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  for (const job of jobs) {
    const basketedAt = Date.parse(job?.basketed_at || '');
    if (Number.isFinite(basketedAt)) fromMs = Math.min(fromMs, basketedAt - (24 * 60 * 60 * 1000));
  }
  return {
    fromDate: formatRalawiseHistoryDate(fromMs),
    toDate: formatRalawiseHistoryDate(now + (24 * 60 * 60 * 1000)),
  };
}

async function performRalawisePlacedOrderSync({ source = 'manual' } = {}) {
  await ensureStockOrderingBasketTables(pool);
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      RALAWISE_ORDER_HISTORY_LOCK_KEYS
    );
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return { ok: true, skipped: 'locked', checkedJobs: 0, orderedJobs: 0, costUpdates: 0 };

    const basketedJobs = await client.query(
      `SELECT source_order_id, order_no, line_reference, line_count, basketed_at
       FROM database_ralawise_basket_jobs
       WHERE status = 'basketed'
       ORDER BY basketed_at ASC NULLS LAST, source_order_id
       LIMIT 100`
    );
    if (!basketedJobs.rowCount) {
      return { ok: true, source, checkedJobs: 0, orderedJobs: 0, costUpdates: 0, updatedJobs: [] };
    }

    const sourceOrderIds = basketedJobs.rows.map((job) => Number(job.source_order_id));
    const basketedLines = await client.query(
      `SELECT source_order_item_id, source_order_id, order_no, line_reference, ralawise_sku, quantity
       FROM database_ralawise_basket_lines
       WHERE source_order_id = ANY($1::int[])
         AND status = 'basketed'
       ORDER BY source_order_id, source_order_item_id`,
      [sourceOrderIds]
    );
    const linesByJob = new Map();
    for (const line of basketedLines.rows) {
      if (!linesByJob.has(line.source_order_id)) linesByJob.set(line.source_order_id, []);
      linesByJob.get(line.source_order_id).push(line);
    }

    const lookupRange = ralawiseOrderLookupDateRange(basketedJobs.rows);
    const placedResult = await ralawiseBasketClient.getPlacedOrders({
      fromDate: lookupRange.fromDate,
      toDate: lookupRange.toDate,
      size: 50,
      maxPages: 5,
      includeDetails: true,
    });
    const placedOrders = Array.isArray(placedResult.orders) ? placedResult.orders : [];
    await client.query(
      `UPDATE database_ralawise_basket_jobs
       SET last_checked_at = NOW(), updated_at = NOW()
       WHERE source_order_id = ANY($1::int[])
         AND status = 'basketed'`,
      [sourceOrderIds]
    );

    const updatedJobs = [];
    let orderedJobs = 0;
    let costUpdates = 0;
    let failedJobs = 0;
    for (const job of basketedJobs.rows) {
      const auditLines = linesByJob.get(job.source_order_id) || [];
      if (!auditLines.length || auditLines.length !== Number(job.line_count || 0)) continue;
      const match = matchBasketedJobToPlacedOrders(job, auditLines, placedOrders);
      if (!match.matched) continue;
      try {
        let jobCostUpdates = 0;
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [71060219, job.source_order_id]);
        const currentAudit = await client.query(
          `SELECT status
           FROM database_ralawise_basket_jobs
           WHERE source_order_id = $1
           FOR UPDATE`,
          [job.source_order_id]
        );
        if (currentAudit.rows[0]?.status !== 'basketed') {
          await client.query('ROLLBACK');
          continue;
        }

        for (const assignment of match.assignments) {
          await client.query(
            `UPDATE database_ralawise_basket_lines
             SET status = 'ordered',
                 ralawise_order_number = $2,
                 supplier_order_line = $3,
                 supplier_unit_price = $4,
                 supplier_line_total = $5,
                 ordered_at = COALESCE($6::timestamptz, NOW()),
                 updated_at = NOW()
             WHERE source_order_item_id = $1
               AND source_order_id = $7`,
            [
              assignment.source_order_item_id,
              assignment.ralawise_order_number || null,
              assignment.supplier_order_line || null,
              assignment.supplier_unit_price,
              assignment.supplier_line_total,
              assignment.ordered_at,
              job.source_order_id,
            ]
          );
          if (assignment.supplier_unit_price != null) {
            const costUpdate = await client.query(
              `UPDATE database_job_line_items
               SET unit_cost = $2,
                   updated_at_source = NOW(),
                   imported_at = NOW()
               WHERE source_order_item_id = $1
                 AND source_order_id = $3`,
              [
                assignment.source_order_item_id,
                assignment.supplier_unit_price,
                job.source_order_id,
              ]
            );
            jobCostUpdates += costUpdate.rowCount;
          }
        }

        const orderNumbers = Array.from(new Set(
          match.assignments.flatMap((assignment) => String(assignment.ralawise_order_number || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean))
        ));
        const matchedOrders = placedOrders.filter((order) => orderNumbers.includes(
          String(order.ralawise_order_number || order.sage_order_number || '').trim()
        ));
        const orderedAt = match.assignments.map((assignment) => assignment.ordered_at).find(Boolean) || null;
        const orderUrl = match.assignments.map((assignment) => assignment.order_url).find(Boolean) || null;
        await client.query(
          `UPDATE database_ralawise_basket_jobs
           SET status = 'ordered',
               ralawise_order_number = $2,
               order_url = $3,
               placed_order_snapshot = $4::jsonb,
               last_error = NULL,
               ordered_at = COALESCE($5::timestamptz, NOW()),
               last_checked_at = NOW(),
               updated_at = NOW()
           WHERE source_order_id = $1`,
          [
            job.source_order_id,
            orderNumbers.join(', ') || null,
            orderUrl,
            JSON.stringify(matchedOrders),
            orderedAt,
          ]
        );

        const dashboardJobs = await selectDashboardJobsForStockOrdered(client, [job.source_order_id]);
        if (!dashboardJobs.rowCount) throw new Error('Job disappeared before its placed Ralawise order was saved');
        const statusUpdates = await applyStockOrderedStatus(client, dashboardJobs.rows);
        await client.query('COMMIT');
        orderedJobs += 1;
        costUpdates += jobCostUpdates;
        updatedJobs.push(...statusUpdates);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        failedJobs += 1;
        console.error('Failed to apply placed Ralawise order', {
          sourceOrderId: job.source_order_id,
          message: error?.message,
        });
      }
    }

    return {
      ok: failedJobs === 0,
      source,
      checkedJobs: basketedJobs.rowCount,
      supplierOrders: placedOrders.length,
      orderedJobs,
      costUpdates,
      failedJobs,
      updatedJobs,
    };
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', RALAWISE_ORDER_HISTORY_LOCK_KEYS)
        .catch(() => {});
    }
    client.release();
  }
}

function syncRalawisePlacedOrders(options = {}) {
  if (!ralawiseOrderHistorySyncPromise) {
    ralawiseOrderHistorySyncPromise = performRalawisePlacedOrderSync(options)
      .finally(() => {
        ralawiseOrderHistorySyncPromise = null;
      });
  }
  return ralawiseOrderHistorySyncPromise;
}

function initRalawiseOrderHistoryPoller() {
  if (ralawiseOrderHistoryTimer) return { started: false, reason: 'already_started' };
  if (!env.RALAWISE_ORDER_HISTORY_POLL_ENABLED) return { started: false, reason: 'disabled' };
  if (!env.RALAWISE_USER || !env.RALAWISE_PASSWORD) return { started: false, reason: 'missing_credentials' };
  const run = () => {
    void syncRalawisePlacedOrders({ source: 'poller' })
      .then((result) => {
        if (result.orderedJobs || result.failedJobs) {
          console.log('[ralawise-order-history-poll]', result);
        }
      })
      .catch((error) => {
        console.error('[ralawise-order-history-poll] failed', publicBasketError(error));
      });
  };
  const startupTimer = setTimeout(run, env.RALAWISE_ORDER_HISTORY_POLL_STARTUP_DELAY_MS);
  if (typeof startupTimer.unref === 'function') startupTimer.unref();
  ralawiseOrderHistoryTimer = setInterval(run, env.RALAWISE_ORDER_HISTORY_POLL_INTERVAL_MS);
  if (typeof ralawiseOrderHistoryTimer.unref === 'function') ralawiseOrderHistoryTimer.unref();
  return { started: true };
}

router.get('/api/database/summary', async (_req, res) => {
  try {
    const [jobs, lineItems, positions, addresses, contacts, products, byYear, byType, latestRun] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM database_jobs'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_line_items'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_positions'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_customer_addresses'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_customer_contacts'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_products'),
      pool.query(`
        SELECT source_year, COUNT(*)::int AS count
        FROM database_jobs
        GROUP BY source_year
        ORDER BY source_year
      `),
      pool.query(`
        SELECT COALESCE(order_type, 'Unknown') AS order_type, COUNT(*)::int AS count
        FROM database_jobs
        GROUP BY COALESCE(order_type, 'Unknown')
        ORDER BY count DESC, order_type
      `),
      pool.query(`
        SELECT id, source_file, source_years, job_count, line_item_count,
               position_count, address_count, contact_count, product_count,
               started_at, finished_at, status, message
        FROM database_import_runs
        ORDER BY started_at DESC
        LIMIT 1
      `),
    ]);

    res.json({
      jobs: jobs.rows[0].count,
      lineItems: lineItems.rows[0].count,
      positions: positions.rows[0].count,
      customerAddresses: addresses.rows[0].count,
      customerContacts: contacts.rows[0].count,
      products: products.rows[0].count,
      byYear: byYear.rows,
      byType: byType.rows,
      latestRun: latestRun.rows[0] || null,
    });
  } catch (err) {
    console.error('GET /api/database/summary', err);
    res.status(500).json({ error: 'Failed to fetch database summary' });
  }
});

router.get('/api/database/reports', async (req, res) => {
  const period = resolveDatabaseReportPeriod(req.query.range, req.query.period, req.query.year);
  if (!period) {
    res.status(400).json({ error: 'Invalid financial report period' });
    return;
  }
  const rangeKey = period.range;

  try {
    const report = await pool.query(
      `WITH bounds AS (
         SELECT (${period.startSql})::timestamp AS start_at,
                (${period.endSql})::timestamp AS end_at
       ),
       period_jobs AS (
         SELECT j.source_order_id,
                j.order_no,
                j.customer_name,
                j.job_title,
                j.order_type,
                j.order_type_abbr,
                COALESCE(j.order_date, j.created_at_source) AS sales_at
         FROM database_jobs j
         CROSS JOIN bounds b
         WHERE COALESCE(j.order_date, j.created_at_source) >= b.start_at
           AND COALESCE(j.order_date, j.created_at_source) < b.end_at
       ),
       line_values AS (
         SELECT pj.source_order_id,
                pj.sales_at,
                COALESCE(li.quantity, 0)::numeric AS quantity,
                COALESCE(li.quantity, 0)::numeric * COALESCE(li.unit_price, 0)::numeric AS net_sales,
                COALESCE(li.quantity, 0)::numeric * COALESCE(li.unit_cost, 0)::numeric AS cost_of_goods,
                CASE
                  WHEN TRANSLATE(COALESCE(li.size, ''), '‐‑‒–—―', '------')
                         ~* '(^|[^A-Z0-9])([1-9]|1[0-8])[[:space:]]*-[[:space:]]*([1-9]|1[0-8])([^A-Z0-9]|$)'
                    OR COALESCE(li.size, '') ~* '(^|[^A-Z0-9])Y(XS|S|M|L|XL|XXL)([^A-Z0-9]|$)'
                    OR COALESCE(li.size, '') ~* '(^|[^A-Z0-9])[2-5]T([^A-Z0-9]|$)'
                    OR CONCAT_WS(' ', li.line_description, li.style_name, li.product_type, li.style_code, li.alt_style_code)
                         ~* '(^|[^A-Z0-9])(KID|KIDS|CHILD|CHILDREN|CHILDRENS|YOUTH|JUNIOR|JUNIORS|BOY|BOYS|GIRL|GIRLS)([^A-Z0-9]|$)'
                    THEN 0::numeric
                  WHEN COALESCE(li.vat_rate, 0) > 0 AND COALESCE(li.vat_rate, 0) <= 1
                    THEN COALESCE(li.vat_rate, 0)::numeric * 100
                  ELSE COALESCE(li.vat_rate, 0)::numeric
                END AS vat_percent,
                li.unit_price IS NULL AS price_missing,
                li.unit_cost IS NULL AS cost_missing
         FROM period_jobs pj
         JOIN database_job_line_items li ON li.source_order_id = pj.source_order_id
         WHERE li.is_internal IS NOT TRUE
       ),
       financial_lines AS (
         SELECT source_order_id,
                sales_at,
                quantity,
                net_sales,
                cost_of_goods,
                net_sales * (vat_percent / 100) AS vat,
                price_missing,
                cost_missing
         FROM line_values
       ),
       job_financials AS (
         SELECT pj.source_order_id,
                pj.order_no,
                pj.customer_name,
                pj.job_title,
                COALESCE(NULLIF(TRIM(pj.order_type), ''), NULLIF(TRIM(pj.order_type_abbr), ''), 'Other') AS order_type,
                pj.sales_at,
                COALESCE(SUM(fl.net_sales), 0)::numeric AS net_sales,
                COALESCE(SUM(fl.vat), 0)::numeric AS vat,
                COALESCE(SUM(fl.cost_of_goods), 0)::numeric AS cost_of_goods
         FROM period_jobs pj
         LEFT JOIN financial_lines fl ON fl.source_order_id = pj.source_order_id
         GROUP BY pj.source_order_id, pj.order_no, pj.customer_name, pj.job_title, pj.order_type, pj.order_type_abbr, pj.sales_at
       ),
       series_buckets AS (
         SELECT GENERATE_SERIES(
                  DATE_TRUNC('${period.grain}', b.start_at),
                  DATE_TRUNC('${period.grain}', b.end_at - INTERVAL '1 second'),
                  ${period.stepSql}
                ) AS bucket_start
         FROM bounds b
       ),
       series_rows AS (
         SELECT sb.bucket_start,
                COALESCE(SUM(jf.net_sales + jf.vat), 0)::numeric AS gross_sales,
                COALESCE(SUM(jf.net_sales), 0)::numeric AS net_sales,
                COALESCE(SUM(jf.vat), 0)::numeric AS vat,
                COALESCE(SUM(jf.cost_of_goods), 0)::numeric AS cost_of_goods,
                COALESCE(SUM(jf.net_sales - jf.cost_of_goods), 0)::numeric AS gross_profit,
                COUNT(jf.source_order_id)::int AS order_count
         FROM series_buckets sb
         LEFT JOIN job_financials jf
           ON jf.sales_at >= sb.bucket_start
          AND jf.sales_at < sb.bucket_start + ${period.stepSql}
         GROUP BY sb.bucket_start
         ORDER BY sb.bucket_start
       ),
       summary_row AS (
         SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(net_sales), 0)::numeric AS net_sales,
                COALESCE(SUM(vat), 0)::numeric AS vat,
                COALESCE(SUM(net_sales + vat), 0)::numeric AS gross_sales,
                COALESCE(SUM(cost_of_goods), 0)::numeric AS cost_of_goods,
                COALESCE(SUM(net_sales - cost_of_goods), 0)::numeric AS gross_profit
         FROM job_financials
       ),
       customer_rows AS (
         SELECT COALESCE(NULLIF(TRIM(customer_name), ''), 'Unknown customer') AS customer_name,
                COUNT(*)::int AS order_count,
                SUM(net_sales + vat)::numeric AS gross_sales,
                SUM(net_sales - cost_of_goods)::numeric AS gross_profit
         FROM job_financials
         GROUP BY COALESCE(NULLIF(TRIM(customer_name), ''), 'Unknown customer')
         HAVING SUM(net_sales + vat) <> 0
         ORDER BY gross_sales DESC, customer_name
         LIMIT 5
       ),
       type_rows AS (
         SELECT order_type,
                COUNT(*)::int AS order_count,
                SUM(net_sales + vat)::numeric AS gross_sales
         FROM job_financials
         GROUP BY order_type
         ORDER BY gross_sales DESC, order_type
         LIMIT 8
       ),
       top_order_row AS (
         SELECT source_order_id,
                order_no,
                COALESCE(NULLIF(TRIM(customer_name), ''), 'Unknown customer') AS customer_name,
                (net_sales + vat)::numeric AS gross_sales
         FROM job_financials
         ORDER BY gross_sales DESC, order_no DESC
         LIMIT 1
       ),
       coverage_row AS (
         SELECT COUNT(*)::int AS financial_line_count,
                COUNT(*) FILTER (WHERE price_missing)::int AS missing_price_lines,
                COUNT(*) FILTER (WHERE cost_missing)::int AS missing_cost_lines,
                COALESCE(SUM(quantity), 0)::numeric AS units_sold
         FROM financial_lines
       ),
       available_year_rows AS (
         SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(order_date, created_at_source))::int AS report_year
         FROM database_jobs
         WHERE COALESCE(order_date, created_at_source) IS NOT NULL
       )
       SELECT JSON_BUILD_OBJECT(
                'orderCount', sr.order_count,
                'netSales', sr.net_sales,
                'vat', sr.vat,
                'grossSales', sr.gross_sales,
                'costOfGoods', sr.cost_of_goods,
                'grossProfit', sr.gross_profit,
                'grossMarginPercent', CASE WHEN sr.net_sales = 0 THEN 0 ELSE (sr.gross_profit / sr.net_sales) * 100 END,
                'averageOrderValue', CASE WHEN sr.order_count = 0 THEN 0 ELSE sr.gross_sales / sr.order_count END,
                'financialLineCount', cr.financial_line_count,
                'missingPriceLines', cr.missing_price_lines,
                'missingCostLines', cr.missing_cost_lines,
                'unitsSold', cr.units_sold
              ) AS summary,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                         'bucketStart', TO_CHAR(bucket_start, 'YYYY-MM-DD"T"HH24:MI:SS'),
                         'grossSales', gross_sales,
                         'netSales', net_sales,
                         'vat', vat,
                         'costOfGoods', cost_of_goods,
                         'grossProfit', gross_profit,
                         'orderCount', order_count
                       ) ORDER BY bucket_start)
                FROM series_rows
              ), '[]'::json) AS series,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                         'customerName', customer_name,
                         'orderCount', order_count,
                         'grossSales', gross_sales,
                         'grossProfit', gross_profit
                       ) ORDER BY gross_sales DESC, customer_name)
                FROM customer_rows
              ), '[]'::json) AS top_customers,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                         'orderType', order_type,
                         'orderCount', order_count,
                         'grossSales', gross_sales
                       ) ORDER BY gross_sales DESC, order_type)
                FROM type_rows
              ), '[]'::json) AS order_types,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                         'sourceOrderId', source_order_id,
                         'orderNo', order_no,
                         'customerName', COALESCE(NULLIF(TRIM(customer_name), ''), 'Unknown customer'),
                         'jobTitle', COALESCE(job_title, ''),
                         'grossSales', net_sales + vat,
                         'netSales', net_sales,
                         'costOfGoods', cost_of_goods,
                         'grossProfit', net_sales - cost_of_goods
                       ) ORDER BY sales_at, order_no, source_order_id)
                FROM job_financials
              ), '[]'::json) AS orders,
              (SELECT ROW_TO_JSON(top_order_row) FROM top_order_row) AS top_order,
              COALESCE((
                SELECT JSON_AGG(report_year ORDER BY report_year DESC)
                FROM available_year_rows
              ), '[]'::json) AS available_years,
              TO_CHAR(b.start_at, 'YYYY-MM-DD') AS period_start,
              TO_CHAR(b.end_at - INTERVAL '1 second', 'YYYY-MM-DD') AS period_end
       FROM summary_row sr
       CROSS JOIN coverage_row cr
       CROSS JOIN bounds b`,
      []
    );

    const row = report.rows[0] || {};
    res.json({
      range: rangeKey,
      period: period.periodValue || null,
      rangeLabel: period.label,
      rangeDescription: period.description,
      grain: period.grain,
      periodStart: row.period_start || null,
      periodEnd: row.period_end || null,
      summary: row.summary || emptyDatabaseReportSummary(),
      series: row.series || [],
      topCustomers: row.top_customers || [],
      orderTypes: row.order_types || [],
      orders: row.orders || [],
      topOrder: row.top_order || null,
      availableYears: row.available_years || [],
      basis: 'Order date; invoiceable lines only; internal lines excluded',
    });
  } catch (err) {
    console.error('GET /api/database/reports', err);
    res.status(500).json({ error: 'Failed to fetch database reports' });
  }
});

router.get('/api/database/jobs', async (req, res) => {
  const limit = clampInt(req.query.limit, 100, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const includeTotal = cleanQuery(req.query.includeTotal).toLowerCase() !== 'false';
  const { whereSql, params, orderSql } = buildJobFilters(req.query);

  try {
    const count = includeTotal
      ? await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM database_jobs j
         ${whereSql}`,
        params
      )
      : null;

    const listParams = [...params, limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const jobs = await pool.query(
      `WITH line_summary AS (
         SELECT source_order_id,
                COUNT(*)::int AS line_item_count,
                COALESCE(SUM(quantity), 0)::int AS total_quantity
         FROM database_job_line_items
         GROUP BY source_order_id
       ),
       position_summary AS (
         SELECT source_order_id, COUNT(*)::int AS position_count
         FROM database_job_positions
         GROUP BY source_order_id
       )
       SELECT j.source_order_id,
              j.order_no,
              j.source_year,
              j.order_type,
              j.order_type_abbr,
              j.customer_name,
              j.customer_code,
              j.contact_name,
              j.job_title,
              j.client_order_no,
              j.delivery_method,
              j.payment_terms,
              j.order_taken_by,
              j.order_owner_user_id,
              j.order_owner_name,
              j.delivery_address,
              j.invoice_address,
              j.is_manual_entry,
              j.order_date,
              j.delivery_date,
              j.complete_date,
              j.is_complete,
              j.customer_date_required,
              j.is_reorder,
              j.is_bagged,
              j.is_automatic,
              j.screen_numbers,
              j.has_artwork,
              j.has_screens,
              j.has_shirts,
              j.is_printed,
              j.customer_supplied,
              j.delivery_note_date,
              j.invoice_no,
              j.invoice_date,
              j.trace_staff_id,
              j.created_at_source,
              j.updated_at_source,
              j.invoice_required,
              j.invoice_printed,
              j.pf_invoice_printed,
              j.pf_invoice_date,
              j.dashboard_status,
              j.dashboard_status_updated_at,
              j.proof_approved,
              j.comments,
              COALESCE(ls.line_item_count, 0)::int AS line_item_count,
              COALESCE(ls.total_quantity, 0)::int AS total_quantity,
              COALESCE(ps.position_count, 0)::int AS position_count
       FROM database_jobs j
       LEFT JOIN line_summary ls ON ls.source_order_id = j.source_order_id
       LEFT JOIN position_summary ps ON ps.source_order_id = j.source_order_id
       ${whereSql}
       ${orderSql}
       LIMIT $${limitParam}
       OFFSET $${offsetParam}`,
      listParams
    );

    res.json({
      jobs: jobs.rows,
      total: includeTotal ? count.rows[0].total : null,
      limit,
      offset,
      dashboardStatusColors: DASHBOARD_STATUS_COLORS,
    });
  } catch (err) {
    console.error('GET /api/database/jobs', err);
    res.status(500).json({ error: 'Failed to fetch database jobs' });
  }
});

router.get('/api/database/outstanding-counts', async (_req, res) => {
  try {
    const result = await pool.query(`
      WITH categorized AS (
        SELECT CASE
          WHEN LOWER(COALESCE(order_type, '') || ' ' || COALESCE(order_type_abbr, '')) LIKE '%gift%'
            OR LOWER(COALESCE(order_type_abbr, '')) = 'g'
            THEN 'gifts'
          WHEN LOWER(COALESCE(order_type, '') || ' ' || COALESCE(order_type_abbr, '')) LIKE '%embro%'
            OR LOWER(COALESCE(order_type_abbr, '')) = 'e'
            THEN 'embroidery'
          WHEN LOWER(COALESCE(order_type, '') || ' ' || COALESCE(order_type_abbr, '')) LIKE '%print%'
            OR LOWER(COALESCE(order_type_abbr, '')) = 'p'
            THEN 'print'
          ELSE 'other'
        END AS category
        FROM database_jobs
        WHERE is_complete IS NOT TRUE
      )
      SELECT
        (COUNT(*) FILTER (WHERE category = 'print'))::int AS printing,
        (COUNT(*) FILTER (WHERE category = 'embroidery'))::int AS embroidery,
        (COUNT(*) FILTER (WHERE category = 'gifts'))::int AS business_gifts,
        (COUNT(*))::int AS total
      FROM categorized
    `);

    res.json(result.rows[0] || {
      printing: 0,
      embroidery: 0,
      business_gifts: 0,
      total: 0,
    });
  } catch (err) {
    console.error('GET /api/database/outstanding-counts', err);
    res.status(500).json({ error: 'Failed to fetch outstanding action counts' });
  }
});

router.get('/api/database/stock-ordering', async (_req, res) => {
  try {
    await ensureStockOrderingBasketTables(pool);
    const jobs = await pool.query(
      `WITH candidate_jobs AS (
         SELECT j.source_order_id,
                j.order_no,
                j.order_type,
                j.order_type_abbr,
                j.customer_id,
                j.customer_name,
                j.job_title,
                j.order_taken_by,
                j.order_owner_name,
                j.trace_staff_id,
                j.order_date,
                j.delivery_date,
                j.customer_date_required,
                COALESCE(
                  j.dashboard_status,
                  s.column_values -> '${TEST_DASHBOARD_COLUMN_IDS.STATUS}' ->> 'text'
                ) AS dashboard_status,
                j.dashboard_status_updated_at,
                s.group_id,
                bj.status AS ralawise_basket_status,
                bj.last_error AS ralawise_basket_error,
                bj.basket_url AS ralawise_basket_url,
                bj.stock_warnings AS ralawise_stock_warnings,
                bj.adding_started_at AS ralawise_adding_started_at,
                bj.basketed_at AS ralawise_basketed_at,
                CASE
                  WHEN LOWER(COALESCE(j.order_type, '') || ' ' || COALESCE(j.order_type_abbr, '')) LIKE '%gift%'
                    OR LOWER(COALESCE(j.order_type_abbr, '')) = 'g'
                    THEN 'gifts'
                  WHEN LOWER(COALESCE(j.order_type, '') || ' ' || COALESCE(j.order_type_abbr, '')) LIKE '%embro%'
                    OR LOWER(COALESCE(j.order_type_abbr, '')) = 'e'
                    THEN 'embroidery'
                  WHEN LOWER(COALESCE(j.order_type, '') || ' ' || COALESCE(j.order_type_abbr, '')) LIKE '%print%'
                    OR LOWER(COALESCE(j.order_type_abbr, '')) IN ('p', 'pe', 'ep')
                    THEN 'print'
                  ELSE 'other'
                END AS job_category,
                UPPER(TRIM(COALESCE(
                  j.dashboard_status,
                  s.column_values -> '${TEST_DASHBOARD_COLUMN_IDS.STATUS}' ->> 'text',
                  ''
                ))) AS normalized_status,
                UPPER(TRIM(COALESCE(j.dashboard_status, ''))) AS normalized_db_status,
                UPPER(TRIM(COALESCE(
                  s.column_values -> '${TEST_DASHBOARD_COLUMN_IDS.STATUS}' ->> 'text',
                  ''
                ))) AS normalized_state_status
         FROM database_jobs j
         LEFT JOIN test_dashboard_job_state s ON s.source_order_id = j.source_order_id
         LEFT JOIN database_ralawise_basket_jobs bj ON bj.source_order_id = j.source_order_id
         WHERE j.is_complete IS NOT TRUE
           AND s.archived IS NOT TRUE
       ),
       filtered_jobs AS (
         SELECT *
         FROM candidate_jobs
         WHERE job_category <> 'gifts'
           AND normalized_status NOT IN (
             'READY TO PRINT',
             'TRANSFER PRINTING',
             'IN PRODUCTION',
             'CHECKED IN',
             'COMPLETED',
             'INVOICED',
             'STOCK ORDERED',
             'ORDERED'
           )
           AND normalized_db_status NOT IN (
             'READY TO PRINT',
             'TRANSFER PRINTING',
             'IN PRODUCTION',
             'CHECKED IN',
             'COMPLETED',
             'INVOICED',
             'STOCK ORDERED',
             'ORDERED'
           )
           AND normalized_state_status NOT IN (
             'READY TO PRINT',
             'TRANSFER PRINTING',
             'IN PRODUCTION',
             'CHECKED IN',
             'COMPLETED',
             'INVOICED',
             'STOCK ORDERED',
             'ORDERED'
           )
           AND COALESCE(group_id, '') <> ALL($1::text[])
       ),
       ordering_lines AS (
         SELECT li.*
         FROM database_job_line_items li
         JOIN filtered_jobs fj ON fj.source_order_id = li.source_order_id
         WHERE li.is_non_deliverable IS NOT TRUE
           AND li.is_internal IS NOT TRUE
       ),
       line_summary AS (
         SELECT source_order_id,
                COUNT(*)::int AS stock_ordering_line_count,
                COUNT(*) FILTER (
                  WHERE source_product_id IS NOT NULL
                     OR NULLIF(TRIM(COALESCE(style_code, '')), '') IS NOT NULL
                     OR NULLIF(TRIM(COALESCE(style_name, '')), '') IS NOT NULL
                )::int AS stock_line_count,
                COALESCE(SUM(quantity), 0)::int AS stock_ordering_quantity
         FROM ordering_lines
         GROUP BY source_order_id
       )
       SELECT fj.*,
              COALESCE(ls.stock_ordering_line_count, 0)::int AS stock_ordering_line_count,
              COALESCE(ls.stock_ordering_quantity, 0)::int AS stock_ordering_quantity
       FROM filtered_jobs fj
       JOIN line_summary ls ON ls.source_order_id = fj.source_order_id
       WHERE ls.stock_line_count > 0
       ORDER BY COALESCE(fj.delivery_date, fj.order_date) ASC NULLS LAST,
                fj.order_no DESC`,
      [[
        TEST_DASHBOARD_GROUP_IDS.PRINT,
        TEST_DASHBOARD_GROUP_IDS.EMBROIDERY,
        TEST_DASHBOARD_GROUP_IDS.COMPLETED,
      ]]
    );

    const sourceOrderIds = jobs.rows.map((job) => job.source_order_id);
    const lines = sourceOrderIds.length
      ? await pool.query(
        `SELECT li.*,
                COALESCE(
                  NULLIF(BTRIM(li.ralawise_sku), ''),
                  v.sku_code,
                  ${ralawiseProductSkuSql('p')}
                ) AS ralawise_sku,
                COALESCE(
                  NULLIF(BTRIM(li.catalogue_status), ''),
                  v.sku_status,
                  ${ralawiseProductStatusSql('p')}
                ) AS ralawise_catalog_status,
                v.style_id::int AS ralawise_catalog_style_id
         FROM database_job_line_items li
         LEFT JOIN database_products p ON p.source_product_id = li.source_product_id
         LEFT JOIN database_ralawise_catalog_variants v
           ON v.id = COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id)
         WHERE li.source_order_id = ANY($1::int[])
           AND li.is_non_deliverable IS NOT TRUE
           AND li.is_internal IS NOT TRUE
         ORDER BY li.source_order_id,
                  COALESCE(li.line_sort_order, li.source_order_item_id),
                  li.source_order_item_id`,
        [sourceOrderIds]
      )
      : { rows: [] };

    const linesByJob = new Map();
    for (const line of lines.rows) {
      if (!linesByJob.has(line.source_order_id)) linesByJob.set(line.source_order_id, []);
      linesByJob.get(line.source_order_id).push(line);
    }

    res.json({
      jobs: jobs.rows.map((job) => {
        const lineItems = linesByJob.get(job.source_order_id) || [];
        const plan = buildJobBasketPlan(job, lineItems);
        const addingStartedAt = Date.parse(job.ralawise_adding_started_at || '');
        const addingIsActive = job.ralawise_basket_status === 'adding'
          && Number.isFinite(addingStartedAt)
          && Date.now() - addingStartedAt < RALAWISE_ADDING_STALE_MS;
        const alreadyBasketed = job.ralawise_basket_status === 'basketed';
        return {
          ...job,
          lineItems,
          ralawiseBasket: {
            status: job.ralawise_basket_status || 'pending',
            eligible: !alreadyBasketed && plan.eligible && !addingIsActive,
            busy: addingIsActive,
            alreadyBasketed,
            mappedLineCount: plan.resolved_line_count,
            productLineCount: plan.product_line_count,
            totalQuantity: plan.total_quantity,
            unresolved: plan.unresolved,
            basketUrl: job.ralawise_basket_url || null,
            stockWarnings: job.ralawise_stock_warnings || [],
            error: job.ralawise_basket_error || null,
          },
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/database/stock-ordering', err);
    res.status(500).json({ error: 'Failed to fetch stock ordering jobs' });
  }
});

router.post('/api/database/stock-ordering/mark-ordered', async (req, res) => {
  const sourceOrderIds = parseSourceOrderIds(req.body?.sourceOrderIds);
  if (!sourceOrderIds.length) {
    return res.status(400).json({ error: 'sourceOrderIds must include at least one job id' });
  }
  if (sourceOrderIds.length > MAX_STOCK_ORDERING_MARK_IDS) {
    return res.status(400).json({ error: `Cannot mark more than ${MAX_STOCK_ORDERING_MARK_IDS} jobs at once` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await selectDashboardJobsForStockOrdered(client, sourceOrderIds);

    const foundIds = new Set(result.rows.map((row) => Number(row.source_order_id)));
    const missingIds = sourceOrderIds.filter((id) => !foundIds.has(id));
    if (missingIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'One or more stock ordering jobs were not found',
        missingSourceOrderIds: missingIds,
      });
    }

    const updatedJobs = await applyStockOrderedStatus(client, result.rows);

    await client.query('COMMIT');

    res.json({
      ok: true,
      updatedJobs,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/stock-ordering/mark-ordered', err);
    res.status(500).json({ error: 'Failed to mark stock ordering jobs as ordered' });
  } finally {
    client.release();
  }
});

router.post('/api/database/stock-ordering/ralawise-sync', async (_req, res) => {
  try {
    const result = await syncRalawisePlacedOrders({ source: 'stock-ordering-page' });
    res.status(result.ok === false ? 500 : 200).json(result);
  } catch (error) {
    console.error('POST /api/database/stock-ordering/ralawise-sync', {
      code: error?.code,
      status: error?.status,
      message: error?.upstreamMessage || error?.message,
    });
    res.status(error instanceof RalawiseBasketError
      ? (error.code === 'missing_credentials' ? 503 : 502)
      : 500).json({
      error: error?.upstreamMessage || error?.message || 'Failed to check Ralawise placed orders',
      code: error?.code || 'ralawise_order_history_failed',
    });
  }
});

router.post('/api/database/stock-ordering/:id/ralawise-basket', async (req, res) => {
  const sourceOrderId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(sourceOrderId) || sourceOrderId < 1) {
    return res.status(400).json({ error: 'Invalid stock ordering job id' });
  }

  try {
    await ensureStockOrderingBasketTables(pool);
  } catch (error) {
    console.error('Failed to prepare Ralawise basket audit tables', error);
    return res.status(500).json({ error: 'Failed to prepare Ralawise basket tracking' });
  }

  let job;
  let plan;
  let prepared = false;
  const preparationClient = await pool.connect();
  try {
    await preparationClient.query('BEGIN');
    await preparationClient.query('SELECT pg_advisory_xact_lock($1, $2)', [71060219, sourceOrderId]);

    const jobs = await selectDashboardJobsForStockOrdered(preparationClient, [sourceOrderId]);
    if (!jobs.rowCount) {
      await preparationClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Stock ordering job not found' });
    }
    [job] = jobs.rows;

    const existingAudit = await preparationClient.query(
      `SELECT *
       FROM database_ralawise_basket_jobs
       WHERE source_order_id = $1
       FOR UPDATE`,
      [sourceOrderId]
    );
    const audit = existingAudit.rows[0] || null;
    if (audit?.status === 'basketed') {
      await preparationClient.query('COMMIT');
      return res.json({
        ok: true,
        alreadyBasketed: true,
        basketUrl: audit.basket_url || null,
        stockWarnings: audit.stock_warnings || [],
        updatedJobs: [],
      });
    }
    if (audit?.status === 'ordered') {
      await preparationClient.query('COMMIT');
      return res.json({
        ok: true,
        alreadyOrdered: true,
        ralawiseOrderNumber: audit.ralawise_order_number || null,
        basketUrl: audit.basket_url || null,
        stockWarnings: audit.stock_warnings || [],
        updatedJobs: [],
      });
    }

    const addingStartedAt = Date.parse(audit?.adding_started_at || '');
    if (
      audit?.status === 'adding'
      && Number.isFinite(addingStartedAt)
      && Date.now() - addingStartedAt < RALAWISE_ADDING_STALE_MS
    ) {
      throw new StockOrderingRalawiseError('This job is already being added to Ralawise.', {
        code: 'basket_busy',
        status: 409,
      });
    }

    const lines = await selectStockOrderingLinesForBasket(preparationClient, sourceOrderId);
    plan = buildJobBasketPlan(job, lines.rows);
    if (!plan.eligible) {
      throw new StockOrderingRalawiseError(
        'Every product line needs an exact live Ralawise colour/size SKU before this job can be added.',
        {
          code: 'unresolved_skus',
          status: 409,
          unresolved: plan.unresolved,
        }
      );
    }

    await preparationClient.query(
      `INSERT INTO database_ralawise_basket_jobs (
         source_order_id,
         order_no,
         line_reference,
         status,
         attempt_count,
         line_count,
         total_quantity,
         stock_warnings,
         request_snapshot,
         last_error,
         adding_started_at,
         updated_at
       ) VALUES ($1,$2,$3,'adding',1,$4,$5,'[]'::jsonb,$6::jsonb,NULL,NOW(),NOW())
       ON CONFLICT (source_order_id) DO UPDATE SET
         order_no = EXCLUDED.order_no,
         line_reference = EXCLUDED.line_reference,
         status = 'adding',
         attempt_count = database_ralawise_basket_jobs.attempt_count + 1,
         line_count = EXCLUDED.line_count,
         total_quantity = EXCLUDED.total_quantity,
         stock_warnings = '[]'::jsonb,
         request_snapshot = EXCLUDED.request_snapshot,
         response_snapshot = NULL,
         placed_order_snapshot = NULL,
         ralawise_order_number = NULL,
         order_url = NULL,
         last_error = NULL,
         adding_started_at = NOW(),
         basketed_at = NULL,
         ordered_at = NULL,
         last_checked_at = NULL,
         updated_at = NOW()`,
      [
        sourceOrderId,
        job.order_no || null,
        plan.reference,
        plan.lines.length,
        plan.total_quantity,
        JSON.stringify(plan.items),
      ]
    );

    for (const line of plan.lines) {
      await preparationClient.query(
        `INSERT INTO database_ralawise_basket_lines (
           source_order_item_id,
           source_order_id,
           order_no,
           line_reference,
           ralawise_sku,
           quantity,
           status,
           stock_warning,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'adding',NULL,NOW())
         ON CONFLICT (source_order_item_id) DO UPDATE SET
           source_order_id = EXCLUDED.source_order_id,
           order_no = EXCLUDED.order_no,
           line_reference = EXCLUDED.line_reference,
           ralawise_sku = EXCLUDED.ralawise_sku,
           quantity = EXCLUDED.quantity,
           status = 'adding',
           stock_warning = NULL,
           ralawise_order_number = NULL,
           supplier_order_line = NULL,
           supplier_unit_price = NULL,
           supplier_line_total = NULL,
           basketed_at = NULL,
           ordered_at = NULL,
           updated_at = NOW()`,
        [
          line.source_order_item_id,
          sourceOrderId,
          job.order_no || null,
          plan.reference,
          line.ralawise_sku,
          line.quantity,
        ]
      );
    }

    await preparationClient.query('COMMIT');
    prepared = true;
  } catch (error) {
    await preparationClient.query('ROLLBACK').catch(() => {});
    if (error instanceof StockOrderingRalawiseError) {
      return res.status(error.status || 409).json({
        error: error.message,
        code: error.code,
        unresolved: error.unresolved || [],
      });
    }
    console.error('Failed to prepare stock ordering Ralawise basket', error);
    return res.status(500).json({ error: 'Failed to prepare this job for Ralawise' });
  } finally {
    preparationClient.release();
  }

  let basketResult;
  let recoveredFromBasket = false;
  try {
    const snapshot = await ralawiseBasketClient.getSnapshot();
    recoveredFromBasket = basketContainsPlan(snapshot.items, plan);
    basketResult = recoveredFromBasket
      ? {
        success: true,
        item_count: plan.items.length,
        total_quantity: plan.total_quantity,
        items: plan.items,
        basket_url: snapshot.basket_url,
        stock_warnings: [],
        out_of_stock_count: 0,
        recovered_from_basket: true,
      }
      : await ralawiseBasketClient.addItems(plan.items);
  } catch (error) {
    if (prepared) await recordRalawiseBasketFailure(sourceOrderId, error);
    console.error('POST /api/database/stock-ordering/:id/ralawise-basket', {
      sourceOrderId,
      code: error?.code,
      status: error?.status,
      message: publicBasketError(error),
    });
    const status = error instanceof RalawiseBasketError
      ? (error.code === 'missing_credentials' ? 503 : 502)
      : 500;
    return res.status(status).json({
      error: publicBasketError(error),
      code: error?.code || 'ralawise_basket_failed',
    });
  }

  const stockWarnings = Array.isArray(basketResult.stock_warnings)
    ? basketResult.stock_warnings
    : [];
  const completionClient = await pool.connect();
  try {
    await completionClient.query('BEGIN');
    await completionClient.query('SELECT pg_advisory_xact_lock($1, $2)', [71060219, sourceOrderId]);
    await completionClient.query(
      `UPDATE database_ralawise_basket_jobs
       SET status = 'basketed',
           basket_url = $2,
           stock_warnings = $3::jsonb,
           response_snapshot = $4::jsonb,
           last_error = NULL,
           basketed_at = NOW(),
           updated_at = NOW()
       WHERE source_order_id = $1`,
      [
        sourceOrderId,
        basketResult.basket_url || null,
        JSON.stringify(stockWarnings),
        JSON.stringify(basketResult),
      ]
    );

    const warningBySku = new Map(
      stockWarnings.map((warning) => [String(warning.code || '').trim().toUpperCase(), warning])
    );
    for (const line of plan.lines) {
      const warning = warningBySku.get(line.ralawise_sku) || null;
      await completionClient.query(
        `UPDATE database_ralawise_basket_lines
         SET status = 'basketed',
             stock_warning = $2::jsonb,
             basketed_at = NOW(),
             updated_at = NOW()
         WHERE source_order_item_id = $1`,
        [line.source_order_item_id, warning ? JSON.stringify(warning) : null]
      );
    }
    await completionClient.query('COMMIT');
  } catch (error) {
    await completionClient.query('ROLLBACK').catch(() => {});
    await recordRalawiseBasketFailure(
      sourceOrderId,
      new StockOrderingRalawiseError(
        'Ralawise accepted the basket items, but their audit result could not be saved.',
        { code: 'basket_audit_failed', cause: error }
      )
    );
    console.error('Ralawise basket succeeded but its audit result could not be saved', {
      sourceOrderId,
      message: error?.message,
    });
    return res.status(500).json({
      error: 'The job is in the Ralawise basket, but the local audit could not be saved. Retry the button to reconcile it safely.',
      code: 'basket_audit_failed',
      basketUrl: basketResult.basket_url || null,
    });
  } finally {
    completionClient.release();
  }

  return res.json({
    ok: true,
    recoveredFromBasket,
    basketUrl: basketResult.basket_url || null,
    itemCount: basketResult.item_count || plan.items.length,
    totalQuantity: basketResult.total_quantity || plan.total_quantity,
    stockWarnings,
    outOfStockCount: Number(basketResult.out_of_stock_count || 0),
    updatedJobs: [],
  });
});

router.get('/api/database/users', async (req, res) => {
  try {
    const canManageUsers = req.hubUser?.can_manage_users === true;
    const [usersResult, requestsResult] = await Promise.all([
      pool.query(`
        SELECT id,
               email,
               first_name,
               last_name,
               CONCAT_WS(' ', NULLIF(TRIM(first_name), ''), NULLIF(TRIM(last_name), '')) AS full_name,
               can_manage_users,
               created_at
        FROM hub_users
        ORDER BY LOWER(first_name), LOWER(last_name), LOWER(email)
      `),
      canManageUsers ? pool.query(`
        SELECT request.id,
               request.email,
               request.first_name,
               request.last_name,
               CONCAT_WS(
                 ' ',
                 NULLIF(TRIM(request.first_name), ''),
                 NULLIF(TRIM(request.last_name), '')
               ) AS full_name,
               request.requested_at
        FROM hub_signup_requests request
        WHERE request.status = 'pending'
          AND request.password_hash IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM hub_users users
            WHERE LOWER(users.email) = LOWER(request.email)
          )
        ORDER BY request.requested_at, LOWER(request.email)
      `) : Promise.resolve({ rows: [] }),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      users: usersResult.rows,
      signupRequests: requestsResult.rows,
      canManageUsers,
    });
  } catch (err) {
    console.error('GET /api/database/users', err);
    res.status(500).json({ error: 'Failed to fetch database users' });
  }
});

router.post('/api/database/signup-requests/:id/accept', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.hubUser?.can_manage_users !== true) {
    return res.status(403).json({ error: 'User management permission required' });
  }
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid signup request id' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT id, email, first_name, last_name, password_hash
       FROM hub_signup_requests
       WHERE id = $1
         AND status = 'pending'
       FOR UPDATE`,
      [id]
    );
    const signupRequest = requestResult.rows[0];
    if (!signupRequest || !signupRequest.password_hash) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending signup request not found' });
    }

    let userResult = await client.query(
      `INSERT INTO hub_users (email, first_name, last_name, password_hash, can_manage_users)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT ((LOWER(email))) DO NOTHING
       RETURNING id, email, first_name, last_name, can_manage_users, created_at`,
      [
        signupRequest.email,
        signupRequest.first_name,
        signupRequest.last_name,
        signupRequest.password_hash,
      ]
    );
    if (!userResult.rowCount) {
      userResult = await client.query(
        `SELECT id, email, first_name, last_name, can_manage_users, created_at
         FROM hub_users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [signupRequest.email]
      );
    }

    const reviewerName = fullName(req.hubUser) || req.hubUser?.email || 'Hub user';
    await client.query(
      `UPDATE hub_signup_requests
       SET status = 'accepted',
           password_hash = NULL,
           reviewed_at = NOW(),
           reviewed_by_user_id = $2,
           reviewed_by_name = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [id, req.hubUser.id, reviewerName]
    );
    await client.query('COMMIT');

    const user = userResult.rows[0];
    res.status(201).json({
      ok: true,
      user: {
        ...user,
        full_name: fullName(user),
      },
    });
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/signup-requests/:id/accept', err);
    res.status(500).json({ error: 'Failed to accept signup request' });
  } finally {
    client?.release();
  }
});

router.post('/api/database/signup-requests/:id/reject', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.hubUser?.can_manage_users !== true) {
    return res.status(403).json({ error: 'User management permission required' });
  }
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid signup request id' });
  }

  try {
    const reviewerName = fullName(req.hubUser) || req.hubUser?.email || 'Hub user';
    const result = await pool.query(
      `UPDATE hub_signup_requests
       SET status = 'rejected',
           password_hash = NULL,
           reviewed_at = NOW(),
           reviewed_by_user_id = $2,
           reviewed_by_name = $3,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'
       RETURNING id, email, first_name, last_name`,
      [id, req.hubUser.id, reviewerName]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Pending signup request not found' });
    }

    res.json({ ok: true, request: result.rows[0] });
  } catch (err) {
    console.error('POST /api/database/signup-requests/:id/reject', err);
    res.status(500).json({ error: 'Failed to reject signup request' });
  }
});

router.delete('/api/database/users/:id', async (req, res) => {
  if (req.hubUser?.can_manage_users !== true) {
    return res.status(403).json({ error: 'User management permission required' });
  }
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (id === Number(req.hubUser.id)) {
    return res.status(400).json({ error: 'You cannot remove your own user account' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM hub_users
       WHERE id = $1
       RETURNING id, email, first_name, last_name`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database user not found' });
    }

    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/database/users/:id', err);
    res.status(500).json({ error: 'Failed to delete database user' });
  }
});

router.get('/api/database/customers', async (req, res) => {
  const search = cleanQuery(req.query.q);
  const sort = normalizeCustomerListSort(req.query.sort);
  const params = [];
  let searchSql = '';

  if (search) {
    params.push(`%${search}%`);
    const ref = `$${params.length}`;
    searchSql = `AND (
      customer_name ILIKE ${ref}
      OR customer_code ILIKE ${ref}
      OR contact_name ILIKE ${ref}
      OR contact_email ILIKE ${ref}
      OR CAST(order_no AS TEXT) ILIKE ${ref}
      OR job_title ILIKE ${ref}
    )`;
  }

  const profileSearchSql = search
    ? `AND (
      customer_name ILIKE $1
      OR customer_code ILIKE $1
      OR contact_name ILIKE $1
      OR contact_email ILIKE $1
    )`
    : '';
  const orderSql = customerListOrderSql(sort);

  try {
    const result = await pool.query(
      `WITH customer_jobs AS (
         SELECT
           COALESCE(customer_id::text, LOWER(customer_name)) AS customer_key,
           customer_id,
           customer_name AS business_name,
           customer_code,
           contact_name,
           contact_email,
           source_order_id,
           order_no,
           job_title,
           order_date,
           delivery_date,
           COALESCE(order_date, updated_at_source, created_at_source) AS last_seen_at,
           (COUNT(*) OVER (PARTITION BY COALESCE(customer_id::text, LOWER(customer_name))))::int AS order_count,
           (COUNT(*) FILTER (
             WHERE COALESCE(order_date, updated_at_source, created_at_source) >= NOW() - INTERVAL '3 months'
           ) OVER (PARTITION BY COALESCE(customer_id::text, LOWER(customer_name))))::int AS recent_order_count,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(customer_id::text, LOWER(customer_name))
             ORDER BY COALESCE(order_date, updated_at_source, created_at_source) DESC NULLS LAST,
                      order_no DESC NULLS LAST
           ) AS customer_rank
         FROM database_jobs
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           ${searchSql}
       ),
       job_customers AS (
         SELECT
           CASE
             WHEN customer_id IS NOT NULL THEN customer_id::text
             ELSE 'name:' || business_name
           END AS customer_key,
           NULL::integer AS profile_id,
           customer_id,
           business_name,
           customer_code,
           contact_name,
           contact_email,
           source_order_id AS latest_source_order_id,
           order_no AS latest_order_no,
           job_title AS latest_job_title,
           order_date AS latest_order_date,
           delivery_date AS latest_delivery_date,
           last_seen_at,
           order_count,
           recent_order_count
         FROM customer_jobs
         WHERE customer_rank = 1
       ),
       profile_customers AS (
         SELECT
           'profile:' || id AS customer_key,
           id AS profile_id,
           customer_id,
           customer_name AS business_name,
           customer_code,
           contact_name,
           contact_email,
           NULL::integer AS latest_source_order_id,
           NULL::integer AS latest_order_no,
           NULL::text AS latest_job_title,
           NULL::timestamp AS latest_order_date,
           NULL::timestamp AS latest_delivery_date,
           COALESCE(updated_at_source, created_at_source) AS last_seen_at,
           0::int AS order_count,
           0::int AS recent_order_count
         FROM database_customer_profiles
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM database_jobs existing_job
             WHERE existing_job.customer_name IS NOT NULL
               AND existing_job.customer_name <> ''
               AND (
                 (
                   database_customer_profiles.customer_id IS NOT NULL
                   AND existing_job.customer_id = database_customer_profiles.customer_id
                 )
                 OR LOWER(existing_job.customer_name) = LOWER(database_customer_profiles.customer_name)
               )
           )
           ${profileSearchSql}
       )
       SELECT *
       FROM (
         SELECT * FROM job_customers
         UNION ALL
         SELECT * FROM profile_customers
       ) combined
       ${orderSql}
       LIMIT 5000`,
      params
    );

    res.json({ customers: result.rows });
  } catch (err) {
    console.error('GET /api/database/customers', err);
    res.status(500).json({ error: 'Failed to fetch database customers' });
  }
});

router.get('/api/database/customers/search', async (req, res) => {
  const search = cleanQuery(req.query.q);
  if (!search) return res.json([]);

  try {
    const result = await pool.query(
      `WITH candidates AS (
         SELECT
           CASE
             WHEN customer_id IS NOT NULL THEN customer_id::text
             ELSE 'name:' || customer_name
           END AS customer_key,
           NULL::integer AS profile_id,
           customer_id,
           customer_name AS business_name,
           customer_code,
           contact_id,
           contact_name,
           contact_phone,
           contact_mobile,
           contact_email,
           contact_email AS email,
           delivery_address,
           invoice_address,
           source_order_id,
           order_no,
           COALESCE(order_date, updated_at_source, created_at_source) AS last_seen_at,
           CASE
             WHEN LOWER(customer_name) = LOWER($2) THEN 0
             WHEN customer_name ILIKE $3 THEN 1
             WHEN customer_code ILIKE $3 THEN 2
             WHEN contact_name ILIKE $3 THEN 3
             WHEN contact_email ILIKE $3 THEN 4
             ELSE 5
           END AS match_rank
         FROM database_jobs
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           AND (
             customer_name ILIKE $1
             OR customer_code ILIKE $1
             OR contact_name ILIKE $1
             OR contact_email ILIKE $1
           )
         UNION ALL
         SELECT
           'profile:' || id AS customer_key,
           id AS profile_id,
           customer_id,
           customer_name AS business_name,
           customer_code,
           NULL::integer AS contact_id,
           contact_name,
           contact_phone,
           contact_mobile,
           contact_email,
           contact_email AS email,
           delivery_address,
           invoice_address,
           NULL::integer AS source_order_id,
           NULL::integer AS order_no,
           COALESCE(updated_at_source, created_at_source) AS last_seen_at,
           CASE
             WHEN LOWER(customer_name) = LOWER($2) THEN 0
             WHEN customer_name ILIKE $3 THEN 1
             WHEN customer_code ILIKE $3 THEN 2
             WHEN contact_name ILIKE $3 THEN 3
             WHEN contact_email ILIKE $3 THEN 4
             ELSE 5
           END AS match_rank
         FROM database_customer_profiles
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM database_jobs existing_job
             WHERE existing_job.customer_name IS NOT NULL
               AND existing_job.customer_name <> ''
               AND (
                 (
                   database_customer_profiles.customer_id IS NOT NULL
                   AND existing_job.customer_id = database_customer_profiles.customer_id
                 )
                 OR LOWER(existing_job.customer_name) = LOWER(database_customer_profiles.customer_name)
               )
           )
           AND (
             customer_name ILIKE $1
             OR customer_code ILIKE $1
             OR contact_name ILIKE $1
             OR contact_email ILIKE $1
           )
       ),
       ranked AS (
         SELECT *,
                ROW_NUMBER() OVER (
                  PARTITION BY customer_key
                  ORDER BY match_rank ASC,
                           last_seen_at DESC NULLS LAST,
                           order_no DESC NULLS LAST
                ) AS customer_rank
         FROM candidates
       )
       SELECT customer_key,
              profile_id,
              customer_id,
              business_name,
              customer_code,
              contact_id,
              contact_name,
              contact_phone,
              contact_mobile,
              contact_email,
              email,
              delivery_address,
              invoice_address,
              source_order_id AS latest_source_order_id,
              order_no AS latest_order_no
       FROM ranked
       WHERE customer_rank = 1
       ORDER BY match_rank ASC,
                LOWER(business_name) ASC,
                latest_order_no DESC NULLS LAST
       LIMIT 20`,
      [`%${search}%`, search, `${search}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/database/customers/search', err);
    res.status(500).json({ error: 'Failed to search database customers' });
  }
});

router.get('/api/database/customers/:key', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  try {
    let profile = null;
    let where = customerKey.type === 'id'
      ? 'j.customer_id = $1'
      : 'LOWER(j.customer_name) = LOWER($1)';
    let params = [customerKey.value];

    if (customerKey.type === 'profile') {
      const profileResult = await pool.query(
        `SELECT *
         FROM database_customer_profiles
         WHERE id = $1
         LIMIT 1`,
        [customerKey.value]
      );

      if (!profileResult.rowCount) {
        return res.status(404).json({ error: 'Database customer not found' });
      }

      profile = profileResult.rows[0];
      params = [profile.customer_name];
      where = 'LOWER(j.customer_name) = LOWER($1)';

      if (isFiniteDatabaseValue(profile.customer_id)) {
        params = [profile.customer_id, profile.customer_name];
        where = '(j.customer_id = $1 OR LOWER(j.customer_name) = LOWER($2))';
      }
    } else {
      profile = await findCustomerProfileForKey(customerKey);
    }

    const result = await pool.query(
      `WITH line_summary AS (
         SELECT source_order_id,
                COUNT(*)::int AS line_item_count,
                COALESCE(SUM(quantity), 0)::int AS total_quantity
         FROM database_job_line_items
         GROUP BY source_order_id
       ),
       position_summary AS (
         SELECT source_order_id, COUNT(*)::int AS position_count
         FROM database_job_positions
         GROUP BY source_order_id
       )
       SELECT j.*,
              COALESCE(ls.line_item_count, 0)::int AS line_item_count,
              COALESCE(ls.total_quantity, 0)::int AS total_quantity,
              COALESCE(ps.position_count, 0)::int AS position_count
       FROM database_jobs j
       LEFT JOIN line_summary ls ON ls.source_order_id = j.source_order_id
       LEFT JOIN position_summary ps ON ps.source_order_id = j.source_order_id
       WHERE ${where}
       ORDER BY COALESCE(j.order_date, j.updated_at_source, j.created_at_source) DESC NULLS LAST,
                j.order_no DESC NULLS LAST`,
      params
    );

    const orders = result.rows;
    if (!orders.length && !profile) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const customerId = customerKey.type === 'id'
      ? customerKey.value
      : (isFiniteDatabaseValue(profile?.customer_id) ? Number(profile.customer_id) : firstFinite(orders, 'customer_id'));
    let addressRows = [];

    if (isFiniteDatabaseValue(customerId)) {
      const addresses = await pool.query(
        `SELECT *
         FROM database_customer_addresses
         WHERE customer_id = $1
         ORDER BY COALESCE(updated_at_source, created_at_source) DESC NULLS LAST,
                  source_address_id DESC`,
        [customerId]
      );
      addressRows = addresses.rows;
    }

    const overviewCustomerName = cleanNullable(profile?.customer_name)
      || firstNonEmpty(orders, 'customer_name')
      || (customerKey.type === 'name' ? customerKey.value : null);
    const overviewCustomer = {
      customer_id: isFiniteDatabaseValue(customerId) ? Number(customerId) : null,
      customer_name: overviewCustomerName,
    };

    const [manualContactRows, designNumberRows, customerOverview] = await Promise.all([
      fetchManualCustomerContacts(customerKey, profile, orders),
      fetchCustomerDesignNumbers(orders),
      fetchCustomerOverview(pool, overviewCustomer),
    ]);

    res.json(buildCustomerDetail(customerKey, orders, addressRows, profile, manualContactRows, designNumberRows, customerOverview));
  } catch (err) {
    console.error('GET /api/database/customers/:key', err);
    res.status(500).json({ error: 'Failed to fetch database customer detail' });
  }
});

router.put('/api/database/customers/:key/account-manager', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  const userId = nullableInt(req.body?.user_id);
  let accountManager = cleanNullable(req.body?.account_manager);
  let accountManagerUserId = null;

  try {
    const resolved = await resolveAccountManager(userId, accountManager);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    accountManagerUserId = resolved.userId;
    accountManager = resolved.name;

    if (!accountManager) {
      return res.status(400).json({ error: 'Account manager is required' });
    }

    if (customerKey.type === 'profile') {
      const updated = await pool.query(
        `UPDATE database_customer_profiles
         SET account_manager_user_id = $2,
             account_manager_name = $3,
             updated_by_user_id = $4,
             updated_by_name = $5,
             updated_at_source = NOW(),
             imported_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          customerKey.value,
          accountManagerUserId,
          accountManager,
          req.hubUser?.id || null,
          req.hubUser ? fullName(req.hubUser) : accountManager,
        ]
      );

      if (!updated.rowCount) {
        return res.status(404).json({ error: 'Database customer not found' });
      }

      return res.json({ customer: customerProfileToCustomer(updated.rows[0]) });
    }

    const where = customerKey.type === 'id'
      ? 'customer_id = $1'
      : 'LOWER(customer_name) = LOWER($1)';

    const updated = await pool.query(
      `UPDATE database_jobs
       SET order_owner_user_id = $2,
           order_owner_name = $3,
           updated_at_source = NOW()
       WHERE ${where}
       RETURNING source_order_id, updated_at_source`,
      [customerKey.value, accountManagerUserId, accountManager]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    res.json({
      customer: {
        customer_key: customerKey.type === 'id' ? String(customerKey.value) : `name:${customerKey.value}`,
        account_manager: accountManager,
        account_manager_user_id: accountManagerUserId,
        updated_at_source: latestDate(updated.rows, 'updated_at_source'),
        updated_by: req.hubUser ? fullName(req.hubUser) : accountManager,
      },
    });
  } catch (err) {
    console.error('PUT /api/database/customers/:key/account-manager', err);
    res.status(500).json({ error: 'Failed to update customer account manager' });
  }
});

router.put('/api/database/customers/:key/addresses', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  const invoiceAddress = normalizedCustomerAddress(req.body || {}, 'invoice');
  const deliveryAddress = normalizedCustomerAddress(req.body || {}, 'delivery');

  try {
    let profile = customerKey.type === 'profile'
      ? await findCustomerProfileById(customerKey.value)
      : await findCustomerProfileForKey(customerKey);
    const latestOrder = await latestCustomerOrderForKey(customerKey, profile);
    const actorName = req.hubUser ? fullName(req.hubUser) : null;

    if (!profile && !latestOrder && customerKey.type !== 'name') {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    if (profile) {
      const updated = await pool.query(
        `UPDATE database_customer_profiles
         SET invoice_address = $2,
             invoice_address_line1 = $3,
             invoice_address_line2 = $4,
             invoice_address_line3 = $5,
             invoice_address_line4 = $6,
             invoice_address_line5 = $7,
             invoice_postcode = $8,
             invoice_phone = $9,
             invoice_fax = $10,
             delivery_address = $11,
             delivery_address_line1 = $12,
             delivery_address_line2 = $13,
             delivery_address_line3 = $14,
             delivery_address_line4 = $15,
             delivery_address_line5 = $16,
             delivery_postcode = $17,
             delivery_phone = $18,
             delivery_fax = $19,
             updated_by_user_id = $20,
             updated_by_name = $21,
             updated_at_source = NOW(),
             imported_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          profile.id,
          invoiceAddress.address,
          invoiceAddress.line1,
          invoiceAddress.line2,
          invoiceAddress.line3,
          invoiceAddress.line4,
          invoiceAddress.line5,
          invoiceAddress.postcode,
          invoiceAddress.phone,
          invoiceAddress.fax,
          deliveryAddress.address,
          deliveryAddress.line1,
          deliveryAddress.line2,
          deliveryAddress.line3,
          deliveryAddress.line4,
          deliveryAddress.line5,
          deliveryAddress.postcode,
          deliveryAddress.phone,
          deliveryAddress.fax,
          req.hubUser?.id || null,
          actorName,
        ]
      );
      profile = updated.rows[0];
    } else {
      const resolvedManager = await resolveAccountManager(
        latestOrder?.order_owner_user_id || req.hubUser?.id,
        latestOrder?.order_owner_name || latestOrder?.order_taken_by || actorName
      );
      if (resolvedManager.error) {
        resolvedManager.userId = null;
        resolvedManager.name = latestOrder?.order_owner_name || latestOrder?.order_taken_by || actorName;
      }
      const customerName = cleanNullable(latestOrder?.customer_name) || (customerKey.type === 'name' ? customerKey.value : null);
      if (!customerName) {
        return res.status(404).json({ error: 'Database customer not found' });
      }

      const inserted = await pool.query(
        `INSERT INTO database_customer_profiles (
           customer_id,
           customer_name,
           customer_code,
           contact_name,
           contact_phone,
           contact_mobile,
           contact_email,
           marketing_opt_in,
           invoice_address,
           invoice_address_line1,
           invoice_address_line2,
           invoice_address_line3,
           invoice_address_line4,
           invoice_address_line5,
           invoice_postcode,
           invoice_phone,
           invoice_fax,
           delivery_address,
           delivery_address_line1,
           delivery_address_line2,
           delivery_address_line3,
           delivery_address_line4,
           delivery_address_line5,
           delivery_postcode,
           delivery_phone,
           delivery_fax,
           account_manager_user_id,
           account_manager_name,
           created_by_user_id,
           created_by_name,
           updated_by_user_id,
           updated_by_name,
           created_at_source,
           updated_at_source,
           imported_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, FALSE,
           $8, $9, $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21, $22, $23, $24, $25,
           $26, $27, $28, $29, $30, $31, NOW(), NOW(), NOW()
         )
         RETURNING *`,
        [
          latestOrder?.customer_id || (customerKey.type === 'id' ? customerKey.value : null),
          customerName,
          cleanNullable(latestOrder?.customer_code),
          cleanNullable(latestOrder?.contact_name),
          cleanNullable(latestOrder?.contact_phone),
          cleanNullable(latestOrder?.contact_mobile),
          cleanNullable(latestOrder?.contact_email),
          invoiceAddress.address,
          invoiceAddress.line1,
          invoiceAddress.line2,
          invoiceAddress.line3,
          invoiceAddress.line4,
          invoiceAddress.line5,
          invoiceAddress.postcode,
          invoiceAddress.phone,
          invoiceAddress.fax,
          deliveryAddress.address,
          deliveryAddress.line1,
          deliveryAddress.line2,
          deliveryAddress.line3,
          deliveryAddress.line4,
          deliveryAddress.line5,
          deliveryAddress.postcode,
          deliveryAddress.phone,
          deliveryAddress.fax,
          resolvedManager.userId,
          resolvedManager.name,
          req.hubUser?.id || null,
          actorName,
          req.hubUser?.id || null,
          actorName,
        ]
      );
      profile = inserted.rows[0];
    }

    res.json({
      customer: customerProfileToCustomer(profile),
      addresses: groupedAddresses([], [], profile),
    });
  } catch (err) {
    console.error('PUT /api/database/customers/:key/addresses', err);
    res.status(500).json({ error: 'Failed to update database customer addresses' });
  }
});

router.post('/api/database/customers', async (req, res) => {
  const payload = req.body || {};
  const customerName = cleanNullable(payload.customer_name);
  const customerCode = cleanNullable(payload.customer_code);
  const contactName = contactNameFromPayload(payload);
  const invoiceAddress = normalizedCustomerAddress(payload, 'invoice');
  const deliveryAddress = normalizedCustomerAddress(payload, 'delivery');
  const userId = nullableInt(payload.account_manager_user_id || payload.user_id);

  if (!customerName) {
    return res.status(400).json({ error: 'Customer is required' });
  }

  try {
    const managerFallback = cleanNullable(payload.account_manager) || (req.hubUser ? fullName(req.hubUser) : null);
    const resolvedManager = await resolveAccountManager(userId || req.hubUser?.id, managerFallback);
    if (resolvedManager.error) return res.status(400).json({ error: resolvedManager.error });

    const actorName = req.hubUser ? fullName(req.hubUser) : null;
    const result = await pool.query(
      `INSERT INTO database_customer_profiles (
         customer_name,
         customer_code,
         contact_name,
         contact_phone,
         contact_mobile,
         contact_email,
         marketing_opt_in,
         invoice_address,
         invoice_address_line1,
         invoice_address_line2,
         invoice_address_line3,
         invoice_address_line4,
         invoice_address_line5,
         invoice_postcode,
         invoice_phone,
         invoice_fax,
         delivery_address,
         delivery_address_line1,
         delivery_address_line2,
         delivery_address_line3,
         delivery_address_line4,
         delivery_address_line5,
         delivery_postcode,
         delivery_phone,
         delivery_fax,
         account_manager_user_id,
         account_manager_name,
         created_by_user_id,
         created_by_name,
         updated_by_user_id,
         updated_by_name,
         created_at_source,
         updated_at_source,
         imported_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22, $23,
         $24, $25, $26, $27, $28, $29, $30, $31,
         NOW(), NOW(), NOW()
       )
       RETURNING *`,
      [
        customerName,
        customerCode,
        contactName,
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        toBoolean(payload.marketing_opt_in),
        invoiceAddress.address,
        invoiceAddress.line1,
        invoiceAddress.line2,
        invoiceAddress.line3,
        invoiceAddress.line4,
        invoiceAddress.line5,
        invoiceAddress.postcode,
        invoiceAddress.phone,
        invoiceAddress.fax,
        deliveryAddress.address,
        deliveryAddress.line1,
        deliveryAddress.line2,
        deliveryAddress.line3,
        deliveryAddress.line4,
        deliveryAddress.line5,
        deliveryAddress.postcode,
        deliveryAddress.phone,
        deliveryAddress.fax,
        resolvedManager.userId,
        resolvedManager.name,
        req.hubUser?.id || null,
        actorName,
        req.hubUser?.id || null,
        actorName,
      ]
    );

    res.status(201).json({ customer: customerProfileToCustomer(result.rows[0]) });
  } catch (err) {
    console.error('POST /api/database/customers', err);
    res.status(500).json({ error: 'Failed to create database customer' });
  }
});

router.post('/api/database/customers/:key/contacts', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  const payload = req.body || {};
  const sourceContactId = nullableInt(payload.source_contact_id);
  const contactTitle = cleanNullable(payload.contact_title);
  const contactFirstName = cleanNullable(payload.contact_first_name);
  const contactLastName = cleanNullable(payload.contact_last_name);
  const contactName = contactNameFromParts(contactTitle, contactFirstName, contactLastName);

  if (!contactHasAnyValue(payload)) {
    return res.status(400).json({ error: 'Contact details are required' });
  }

  try {
    const context = await resolveCustomerContactContext(customerKey);
    if (!context) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const actorName = req.hubUser ? fullName(req.hubUser) : null;
    const result = await pool.query(
      `INSERT INTO database_customer_contacts (
         source_contact_id,
         customer_id,
         profile_id,
         customer_name,
         contact_title,
         contact_first_name,
         contact_last_name,
         contact_name,
         contact_phone,
         contact_fax,
         contact_mobile,
         contact_email,
         contact_address,
         created_by_user_id,
         created_by_name,
         updated_by_user_id,
         updated_by_name,
         created_at_source,
         updated_at_source,
         imported_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15,
         $16, $17, NOW(), NOW(), NOW()
       )
       ON CONFLICT (source_contact_id) DO UPDATE
       SET customer_id = EXCLUDED.customer_id,
           profile_id = EXCLUDED.profile_id,
           customer_name = EXCLUDED.customer_name,
           contact_title = EXCLUDED.contact_title,
           contact_first_name = EXCLUDED.contact_first_name,
           contact_last_name = EXCLUDED.contact_last_name,
           contact_name = EXCLUDED.contact_name,
           contact_phone = EXCLUDED.contact_phone,
           contact_fax = EXCLUDED.contact_fax,
           contact_mobile = EXCLUDED.contact_mobile,
           contact_email = EXCLUDED.contact_email,
           contact_address = EXCLUDED.contact_address,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at_source = NOW(),
           imported_at = NOW()
       RETURNING *`,
      [
        sourceContactId,
        context.customer_id,
        context.profile_id,
        context.customer_name,
        contactTitle,
        contactFirstName,
        contactLastName,
        contactName,
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_fax),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        cleanNullable(payload.contact_address),
        req.hubUser?.id || null,
        actorName,
        req.hubUser?.id || null,
        actorName,
      ]
    );

    res.status(201).json({ contact: manualContactToContact(result.rows[0]) });
  } catch (err) {
    console.error('POST /api/database/customers/:key/contacts', err);
    res.status(500).json({ error: 'Failed to create database customer contact' });
  }
});

router.put('/api/database/customers/:key/contacts/:contactId', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  const contactRowId = nullableInt(req.params.contactId);
  if (!customerKey || !contactRowId) {
    return res.status(400).json({ error: 'Invalid contact key' });
  }

  const payload = req.body || {};
  if (!contactHasAnyValue(payload)) {
    return res.status(400).json({ error: 'Contact details are required' });
  }

  try {
    const context = await resolveCustomerContactContext(customerKey);
    if (!context) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const scope = contactScopeClause(context, 13);
    if (!scope.clause) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    const contactTitle = cleanNullable(payload.contact_title);
    const contactFirstName = cleanNullable(payload.contact_first_name);
    const contactLastName = cleanNullable(payload.contact_last_name);
    const actorName = req.hubUser ? fullName(req.hubUser) : null;
    const result = await pool.query(
      `UPDATE database_customer_contacts
       SET contact_title = $2,
           contact_first_name = $3,
           contact_last_name = $4,
           contact_name = $5,
           contact_phone = $6,
           contact_fax = $7,
           contact_mobile = $8,
           contact_email = $9,
           contact_address = $10,
           updated_by_user_id = $11,
           updated_by_name = $12,
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE id = $1
         AND (${scope.clause})
       RETURNING *`,
      [
        contactRowId,
        contactTitle,
        contactFirstName,
        contactLastName,
        contactNameFromParts(contactTitle, contactFirstName, contactLastName),
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_fax),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        cleanNullable(payload.contact_address),
        req.hubUser?.id || null,
        actorName,
        ...scope.params,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    res.json({ contact: manualContactToContact(result.rows[0]) });
  } catch (err) {
    console.error('PUT /api/database/customers/:key/contacts/:contactId', err);
    res.status(500).json({ error: 'Failed to update database customer contact' });
  }
});

router.delete('/api/database/customers/:key/contacts/:contactId', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  const contactRowId = nullableInt(req.params.contactId);
  if (!customerKey || !contactRowId) {
    return res.status(400).json({ error: 'Invalid contact key' });
  }

  try {
    const context = await resolveCustomerContactContext(customerKey);
    if (!context) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const scope = contactScopeClause(context, 2);
    if (!scope.clause) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    const result = await pool.query(
      `DELETE FROM database_customer_contacts
       WHERE id = $1
         AND (${scope.clause})
       RETURNING id`,
      [contactRowId, ...scope.params]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    res.json({ ok: true, contact_id: contactRowId });
  } catch (err) {
    console.error('DELETE /api/database/customers/:key/contacts/:contactId', err);
    res.status(500).json({ error: 'Failed to delete database customer contact' });
  }
});

router.post('/api/database/jobs', async (req, res) => {
  const payload = req.body || {};
  const customerName = cleanNullable(payload.customer_name);
  const contactName = cleanNullable(payload.contact_name);
  const customerId = nullableInt(payload.customer_id);
  const contactId = nullableInt(payload.contact_id);
  const orderType = normalizeDatabaseOrderType(payload.order_type);
  const jobTitle = cleanNullable(payload.job_title);
  const deliveryMethod = cleanNullable(payload.delivery_method);
  const paymentTerms = cleanNullable(payload.payment_terms);
  const deliveryAddress = cleanNullable(payload.delivery_address);
  const invoiceAddress = cleanNullable(payload.invoice_address);
  const orderDate = parseDatabaseDate(payload.order_date, 'Order date');
  const deliveryDate = parseDatabaseDate(payload.delivery_date, 'Delivery date');
  const orderOwnerName = req.hubUser ? fullName(req.hubUser) : cleanNullable(payload.order_taken_by);
  const orderTakenBy = orderOwnerName || cleanNullable(payload.order_taken_by);
  const invoiceRequired = invoiceRequiredValue(payload.invoice_required);

  const missingRequiredFields = [
    ['Customer', customerName],
    ['Contact', contactName],
    ['Order type', orderType],
    ['Job title', jobTitle],
    ['Order date', orderDate],
    ['Delivery date', deliveryDate],
    ['Delivery method', deliveryMethod],
    ['Payment terms', paymentTerms],
    ['Order taken by', orderTakenBy],
    ['Delivery adds', deliveryAddress],
    ['Invoice adds', invoiceAddress],
    ['Invoice required', invoiceRequired !== null],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);

  if (missingRequiredFields.length) {
    return res.status(400).json({
      error: `Missing required fields: ${missingRequiredFields.join(', ')}`,
    });
  }

  if (!orderDate.valid || !deliveryDate.valid) {
    return res.status(400).json({ error: orderDate.error || deliveryDate.error });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060216)');

    const next = await client.query(`
      SELECT
        (COALESCE(MAX(source_order_id), 0) + 1)::int AS source_order_id,
        (GREATEST(COALESCE(MAX(order_no), 50000), 50000) + 1)::int AS order_no
      FROM database_jobs
    `);

    const sourceOrderId = next.rows[0].source_order_id;
    const orderNo = next.rows[0].order_no;
    const orderTypeAbbr = orderTypeAbbreviation(orderType);

    const inserted = await client.query(
      `INSERT INTO database_jobs (
         source_order_id,
         order_no,
         source_year,
         order_type,
         order_type_abbr,
         customer_id,
         customer_name,
         customer_code,
         contact_id,
         contact_name,
         contact_phone,
         contact_mobile,
         contact_email,
         job_title,
         client_order_no,
         delivery_method,
         payment_terms,
         order_taken_by,
         order_owner_user_id,
         order_owner_name,
         invoice_address_id,
         delivery_address_id,
         delivery_address,
         invoice_address,
         order_date,
         delivery_date,
         customer_date_required,
         invoice_no,
         invoice_required,
         dashboard_status,
         dashboard_status_updated_at,
         is_complete,
         is_manual_entry,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
         $25, $26, $27, $28, $29,
         'AWAITING APPROVAL', NOW(),
         FALSE, TRUE, NOW(), NOW()
       )
       RETURNING *`,
      [
        sourceOrderId,
        orderNo,
        orderDate.year,
        orderType,
        orderTypeAbbr,
        customerId,
        customerName,
        cleanNullable(payload.customer_code),
        contactId,
        contactName,
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        jobTitle,
        cleanNullable(payload.client_order_no),
        deliveryMethod,
        paymentTerms,
        orderTakenBy,
        req.hubUser?.id || null,
        orderOwnerName,
        nullableInt(payload.invoice_address_id),
        nullableInt(payload.delivery_address_id),
        deliveryAddress,
        invoiceAddress,
        orderDate.iso,
        deliveryDate.iso,
        toBoolean(payload.customer_date_required),
        null,
        invoiceRequired,
      ]
    );

    const job = inserted.rows[0];
    await client.query(
      `INSERT INTO test_dashboard_job_state (
         source_order_id,
         group_id,
         item_name,
         column_values,
         archived,
         updated_at
       ) VALUES ($1,$2,$3,$4,FALSE,NOW())
       ON CONFLICT (source_order_id) DO UPDATE SET
         group_id = EXCLUDED.group_id,
         item_name = COALESCE(EXCLUDED.item_name, test_dashboard_job_state.item_name),
         column_values = EXCLUDED.column_values || test_dashboard_job_state.column_values,
         archived = FALSE,
         updated_at = NOW()`,
      [
        job.source_order_id,
        TEST_DASHBOARD_GROUP_IDS.OFFICE,
        formatDashboardJobName(job) || null,
        {
          [TEST_DASHBOARD_COLUMN_IDS.STATUS]: awaitingApprovalStatusValue(),
        },
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ job });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/jobs', err);
    res.status(500).json({ error: 'Failed to create database job' });
  } finally {
    client.release();
  }
});

router.put('/api/database/jobs/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const payload = req.body || {};
  const hasJobTitle = Object.prototype.hasOwnProperty.call(payload, 'job_title');
  const hasOrderType = Object.prototype.hasOwnProperty.call(payload, 'order_type');
  const hasComments = Object.prototype.hasOwnProperty.call(payload, 'comments');
  const hasClientOrderNo = Object.prototype.hasOwnProperty.call(payload, 'client_order_no');
  const hasIsComplete = Object.prototype.hasOwnProperty.call(payload, 'is_complete');
  const hasMarkInvoiced = payload.mark_invoiced === true || payload.mark_invoiced === 'true';
  const hasManualInvoiceDate = payload.manual_invoice_date === true || payload.manual_invoice_date === 'true';
  const hasContactFields = ['contact_id', 'contact_name', 'contact_phone', 'contact_mobile', 'contact_email']
    .some((field) => Object.prototype.hasOwnProperty.call(payload, field));
  const hasAddressFields = ['invoice_address_id', 'invoice_address', 'delivery_address_id', 'delivery_address']
    .some((field) => Object.prototype.hasOwnProperty.call(payload, field));

  if (hasOrderType) {
    const orderType = normalizeDatabaseOrderType(payload.order_type);
    if (!orderType) {
      return res.status(400).json({ error: 'Order type must be Business Gifts, Printing, Print + Emb, or Embroidery' });
    }
    payload.order_type = orderType;
  }

  if (!hasJobTitle && !hasOrderType && !hasComments && !hasClientOrderNo && !hasIsComplete && !hasMarkInvoiced && !hasContactFields && !hasAddressFields) {
    return res.status(400).json({ error: 'No supported job fields supplied' });
  }

  if (hasMarkInvoiced) {
    let manualInvoiceDate = null;
    if (hasManualInvoiceDate) {
      const parsedInvoiceDate = parseDatabaseDate(payload.invoice_date, 'Invoice date');
      if (!parsedInvoiceDate) {
        return res.status(400).json({ error: 'Manual invoice date is required' });
      }
      if (!parsedInvoiceDate.valid) {
        return res.status(400).json({ error: parsedInvoiceDate.error });
      }
      manualInvoiceDate = parsedInvoiceDate.iso;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(71060217)');

      const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
      if (!job) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Database job not found' });
      }

      const values = [job.source_order_id];
      const updates = [];
      appendDatabaseJobUpdates(payload, values, updates);
      values.push(manualInvoiceDate);
      const invoiceDateParam = `$${values.length}`;

      const result = await client.query(
        `WITH next_invoice AS (
           SELECT (GREATEST(COALESCE(MAX(invoice_no), 50000), 50000) + 1)::int AS invoice_no
           FROM database_jobs
         )
         UPDATE database_jobs AS j
         SET ${updates.length ? `${updates.join(', ')},` : ''}
             invoice_no = COALESCE(j.invoice_no, next_invoice.invoice_no),
             invoice_required = TRUE,
             invoice_printed = TRUE,
             invoice_date = CASE
               WHEN ${invoiceDateParam}::timestamp IS NOT NULL THEN ${invoiceDateParam}::timestamp
               ELSE COALESCE(j.invoice_date, j.complete_date, NOW())
             END,
             updated_at_source = NOW(),
             imported_at = NOW()
         FROM next_invoice
         WHERE j.source_order_id = $1
         RETURNING j.*`,
        values
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Database job not found' });
      }

      if (hasOrderType) {
        await clearDashboardTypeOverride(client, job.source_order_id);
      }

      await client.query('COMMIT');
      return res.json({ job: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('PUT /api/database/jobs/:id', err);
      return res.status(500).json({ error: 'Failed to mark database job invoiced' });
    } finally {
      client.release();
    }
  }

  try {
    const job = await resolveDatabaseJobForMutation(pool, id);
    if (!job) {
      return res.status(404).json({ error: 'Database job not found' });
    }

    const values = [job.source_order_id];
    const updates = [];
    appendDatabaseJobUpdates(payload, values, updates);
    if (hasIsComplete) {
      values.push(toBoolean(payload.is_complete));
      updates.push(`is_complete = $${values.length}`);
    }

    const result = await pool.query(
      `UPDATE database_jobs
       SET ${updates.join(', ')},
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE source_order_id = $1
       RETURNING *`,
      values
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database job not found' });
    }

    if (hasOrderType) {
      await clearDashboardTypeOverride(pool, job.source_order_id);
    }

    res.json({ job: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/database/jobs/:id', err);
    res.status(500).json({ error: 'Failed to save database job' });
  }
});

router.put('/api/database/jobs/:id/positions', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const positions = normalizePositionPayload(req.body?.positions);
  if (positions.length > 50) {
    return res.status(400).json({ error: 'Too many design position rows' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060217)');

    const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.source_order_id;
    const existingIds = positions
      .map((position) => position.source_order_position_id)
      .filter((positionId) => Number.isFinite(positionId));

    await client.query(
      `DELETE FROM database_job_positions
       WHERE source_order_id = $1
         AND NOT (source_order_position_id = ANY($2::int[]))`,
      [sourceOrderId, existingIds]
    );

    let nextSourcePositionId = null;
    if (positions.some((position) => !Number.isFinite(position.source_order_position_id))) {
      const next = await client.query(`
        SELECT (COALESCE(MAX(source_order_position_id), 0) + 1)::int AS next_id
        FROM database_job_positions
      `);
      nextSourcePositionId = next.rows[0].next_id;
    }

    for (const [index, position] of positions.entries()) {
      const positionSortOrder = index + 1;
      if (Number.isFinite(position.source_order_position_id)) {
        await client.query(
          `UPDATE database_job_positions
           SET position_sort_order = $3,
               position_name = $4,
               colour_notes = $5,
               design_ref = $6,
               updated_at_source = NOW(),
               imported_at = NOW()
           WHERE source_order_id = $1
             AND source_order_position_id = $2`,
          [
            sourceOrderId,
            position.source_order_position_id,
            positionSortOrder,
            position.position_name,
            position.colour_notes,
            position.design_ref,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO database_job_positions (
             source_order_position_id,
             source_order_id,
             position_sort_order,
             position_name,
             colour_notes,
             design_ref,
             created_at_source,
             updated_at_source
           ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            nextSourcePositionId,
            sourceOrderId,
            positionSortOrder,
            position.position_name,
            position.colour_notes,
            position.design_ref,
          ]
        );
        nextSourcePositionId += 1;
      }
    }

    const saved = await client.query(
      `SELECT *
       FROM database_job_positions
       WHERE source_order_id = $1
       ORDER BY COALESCE(position_sort_order, source_order_position_id), source_order_position_id`,
      [sourceOrderId]
    );

    await client.query('COMMIT');
    res.json({ positions: saved.rows });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/database/jobs/:id/positions', err);
    res.status(500).json({ error: 'Failed to save design positions' });
  } finally {
    client.release();
  }
});

router.get('/api/database/products/search', async (req, res) => {
  const search = cleanQuery(req.query.q);
  const field = cleanQuery(req.query.field).toLowerCase() === 'code' ? 'code' : 'style';
  const params = [];
  let whereSql = 'WHERE v.is_active IS TRUE';
  let rankSql = '2';

  if (search) {
    params.push(
      `%${search}%`,
      search,
      `${search}%`,
      normalizeStyleCodeSearchKey(search)
    );
    const normalizedStyleCode = normalizedStyleCodeSql('s.style_code');
    const normalizedManufacturerStyleCode = normalizedStyleCodeSql('s.manufacturer_style_code');
    if (field === 'code') {
      whereSql += `
        AND (
          s.style_code ILIKE $1
          OR s.manufacturer_style_code ILIKE $1
          OR v.sku_code ILIKE $1
          OR v.alpha_sku_code ILIKE $1
          OR COALESCE(la.search_text, '') ILIKE $1
          OR ${normalizedStyleCode} = $4
          OR ${normalizedManufacturerStyleCode} = $4
        )`;
      rankSql = `
        CASE
          WHEN LOWER(COALESCE(v.sku_code, '')) = LOWER($2) THEN 0
          WHEN LOWER(COALESCE(v.alpha_sku_code, '')) = LOWER($2) THEN 0
          WHEN LOWER(COALESCE(s.style_code, '')) = LOWER($2) THEN 0
          WHEN LOWER(COALESCE(s.manufacturer_style_code, '')) = LOWER($2) THEN 0
          WHEN ${normalizedStyleCode} = $4 THEN 0
          WHEN ${normalizedManufacturerStyleCode} = $4 THEN 0
          WHEN UPPER($2) = ANY(COALESCE(la.style_codes, ARRAY[]::text[])) THEN 1
          WHEN UPPER($2) = ANY(COALESCE(la.alt_style_codes, ARRAY[]::text[])) THEN 2
          WHEN v.sku_code ILIKE $3 THEN 1
          WHEN v.alpha_sku_code ILIKE $3 THEN 1
          WHEN s.style_code ILIKE $3 THEN 1
          WHEN s.manufacturer_style_code ILIKE $3 THEN 1
          WHEN COALESCE(la.search_text, '') ILIKE $1 THEN 2
          ELSE 2
        END`;
    } else {
      whereSql += `
        AND (
          s.style_name ILIKE $1
          OR s.brand ILIKE $1
          OR s.style_code ILIKE $1
          OR s.manufacturer_style_code ILIKE $1
          OR COALESCE(la.search_text, '') ILIKE $1
          OR ${normalizedStyleCode} = $4
          OR ${normalizedManufacturerStyleCode} = $4
        )`;
      rankSql = `
        CASE
          WHEN LOWER(COALESCE(s.style_name, '')) = LOWER($2) THEN 0
          WHEN ${normalizedStyleCode} = $4 THEN 0
          WHEN ${normalizedManufacturerStyleCode} = $4 THEN 0
          WHEN UPPER($2) = ANY(COALESCE(la.style_codes, ARRAY[]::text[])) THEN 1
          WHEN UPPER($2) = ANY(COALESCE(la.alt_style_codes, ARRAY[]::text[])) THEN 2
          WHEN s.style_name ILIKE $3 THEN 1
          WHEN COALESCE(la.search_text, '') ILIKE $1 THEN 1
          WHEN s.brand ILIKE $3 THEN 2
          WHEN s.style_code ILIKE $3 THEN 2
          WHEN s.manufacturer_style_code ILIKE $3 THEN 3
          ELSE 4
        END`;
    }
  }

  try {
    const result = await pool.query(
      `WITH legacy_style_aliases AS (
         SELECT v.style_id,
                ARRAY_AGG(DISTINCT UPPER(BTRIM(p.style_code))) FILTER (
                  WHERE NULLIF(BTRIM(p.style_code), '') IS NOT NULL
                ) AS style_codes,
                ARRAY_AGG(DISTINCT UPPER(BTRIM(p.alt_style_code))) FILTER (
                  WHERE NULLIF(BTRIM(p.alt_style_code), '') IS NOT NULL
                ) AS alt_style_codes,
                STRING_AGG(
                  DISTINCT CONCAT_WS(
                    ' ',
                    NULLIF(BTRIM(p.style_code), ''),
                    NULLIF(BTRIM(p.alt_style_code), '')
                  ),
                  ' '
                ) FILTER (
                  WHERE NULLIF(BTRIM(p.style_code), '') IS NOT NULL
                     OR NULLIF(BTRIM(p.alt_style_code), '') IS NOT NULL
                ) AS search_text
         FROM database_products p
         JOIN database_ralawise_catalog_variants v ON v.id = p.ralawise_catalog_variant_id
         WHERE p.source_product_id > 0
         GROUP BY v.style_id
       ),
       candidates AS (
         SELECT s.id AS style_id,
                s.style_code,
                s.manufacturer_style_code,
                s.style_name,
                s.product_type,
                s.brand,
                v.database_product_source_id,
                v.sku_code,
                v.alpha_sku_code,
                v.sku_status,
                v.primary_image_url,
                v.colour_image_url,
                v.carton_price,
                v.pack_price,
                v.single_price,
                v.size_code,
                v.size_name,
                c.id AS colour_id,
                ${rankSql} AS match_rank
         FROM database_ralawise_catalog_styles s
         JOIN database_ralawise_catalog_variants v ON v.style_id = s.id
         JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
         LEFT JOIN legacy_style_aliases la ON la.style_id = s.id
         ${whereSql}
       )
       SELECT style_id::int,
              style_id::int AS ralawise_catalog_style_id,
              MIN(database_product_source_id)::int AS sample_product_id,
              MIN(style_code) AS style_code,
              MIN(manufacturer_style_code) AS alt_style_code,
              MIN(style_name) AS style_name,
              MIN(product_type) AS product_type,
              'Ralawise'::text AS supplier_name,
              MIN(sku_code) AS supplier_sku,
              MIN(alpha_sku_code) AS supplier_alpha_sku,
              MIN(sku_status) AS catalogue_status,
              MIN(NULLIF(primary_image_url, 'Not available')) AS primary_image_url,
              MIN(colour_image_url) AS colour_image_url,
              MIN(carton_price) AS supplier_carton_price,
              MIN(pack_price) AS supplier_pack_price,
              MIN(single_price) AS supplier_single_price,
              COUNT(*)::int AS variant_count,
              COUNT(DISTINCT colour_id)::int AS colour_count,
              COUNT(DISTINCT COALESCE(NULLIF(size_code, ''), size_name))::int AS size_count,
              MIN(match_rank)::int AS match_rank
       FROM candidates
       GROUP BY style_id
       ORDER BY MIN(match_rank) ASC,
                LOWER(MIN(style_name)) ASC NULLS LAST,
                LOWER(MIN(style_code)) ASC NULLS LAST
       LIMIT 20`,
      params
    );

    res.json({ products: result.rows });
  } catch (err) {
    console.error('GET /api/database/products/search', err);
    res.status(500).json({ error: 'Failed to search database products' });
  }
});

router.get('/api/database/products/styles', async (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const search = cleanQuery(req.query.q).slice(0, 120);
  const normalizedSearch = normalizeStyleCodeSearchKey(search);
  const requestedStyleId = cleanQuery(req.query.styleId);
  const selectedStyleId = requestedStyleId ? Number(requestedStyleId) : null;
  if (requestedStyleId && (!Number.isInteger(selectedStyleId) || selectedStyleId < 1)) {
    return res.status(400).json({ error: 'Invalid style id' });
  }
  const requestedSort = cleanQuery(req.query.sort).toLowerCase();
  const sort = new Set(['most-used', 'highest-price', 'lowest-price', 'az', 'za']).has(requestedSort)
    ? requestedSort
    : 'most-used';
  const normalizedStyleCode = normalizedStyleCodeSql('s.style_code');
  const normalizedManufacturerStyleCode = normalizedStyleCodeSql('s.manufacturer_style_code');
  const usesPriceSort = sort === 'highest-price' || sort === 'lowest-price';
  const stylePriceCteSql = usesPriceSort
    ? `,
       style_prices AS (
         SELECT v.style_id::int AS style_id,
                MIN(v.carton_price) FILTER (WHERE v.carton_price > 0) AS min_positive_unit_cost,
                MAX(v.carton_price) FILTER (WHERE v.carton_price > 0) AS max_positive_unit_cost
         FROM database_ralawise_catalog_variants v
         JOIN candidate_styles cs ON cs.style_id = v.style_id
         GROUP BY v.style_id
       )`
    : '';
  const stylePriceJoinSql = usesPriceSort
    ? 'LEFT JOIN style_prices sp ON sp.style_id = cs.style_id'
    : '';
  const sortSql = {
    'highest-price': 'sp.max_positive_unit_cost DESC NULLS LAST',
    'lowest-price': 'sp.min_positive_unit_cost ASC NULLS LAST',
    az: "LOWER(COALESCE(cs.style_name, '')) ASC, LOWER(COALESCE(cs.style_code, '')) ASC",
    za: "LOWER(COALESCE(cs.style_name, '')) DESC, LOWER(COALESCE(cs.style_code, '')) DESC",
    'most-used': 'COALESCE(su.usage_count, 0) DESC, COALESCE(su.usage_quantity, 0) DESC',
  }[sort];
  const orderSql = `cs.search_rank ASC,
                    ${sortSql},
                    LOWER(COALESCE(cs.style_name, '')) ASC,
                    LOWER(COALESCE(cs.style_code, '')) ASC,
                    cs.style_id ASC`;

  try {
    const result = await pool.query(
      `WITH style_aliases AS (
         SELECT v.style_id::int AS style_id,
                ARRAY_AGG(DISTINCT UPPER(BTRIM(p.style_code))) FILTER (
                  WHERE NULLIF(BTRIM(p.style_code), '') IS NOT NULL
                ) AS style_code_aliases,
                ARRAY_AGG(DISTINCT UPPER(BTRIM(p.alt_style_code))) FILTER (
                  WHERE NULLIF(BTRIM(p.alt_style_code), '') IS NOT NULL
                ) AS alt_style_code_aliases,
                STRING_AGG(DISTINCT NULLIF(BTRIM(p.style_code), ''), ' ') FILTER (
                  WHERE NULLIF(BTRIM(p.style_code), '') IS NOT NULL
                ) AS legacy_style_codes,
                STRING_AGG(DISTINCT NULLIF(BTRIM(p.alt_style_code), ''), ' ') FILTER (
                  WHERE NULLIF(BTRIM(p.alt_style_code), '') IS NOT NULL
                ) AS legacy_alt_style_codes
         FROM database_products p
         JOIN database_ralawise_catalog_variants v ON v.id = p.ralawise_catalog_variant_id
         WHERE p.source_product_id > 0
         GROUP BY v.style_id
       ),
       candidate_styles AS (
         SELECT s.id::int AS style_id,
                NULLIF(BTRIM(s.style_code), '') AS style_code,
                NULLIF(BTRIM(s.manufacturer_style_code), '') AS alt_style_code,
                NULLIF(BTRIM(s.style_name), '') AS style_name,
                NULLIF(BTRIM(s.product_type), '') AS product_type,
                NULLIF(BTRIM(s.brand), '') AS brand,
                aliases.style_code_aliases,
                aliases.alt_style_code_aliases,
                aliases.legacy_style_codes,
                aliases.legacy_alt_style_codes,
                CASE
                  WHEN $1::text IS NULL THEN 0
                  WHEN ${normalizedStyleCode} = $3 THEN 0
                  WHEN ${normalizedManufacturerStyleCode} = $3 THEN 1
                  WHEN UPPER($2) = ANY(COALESCE(aliases.style_code_aliases, ARRAY[]::text[])) THEN 2
                  WHEN UPPER($2) = ANY(COALESCE(aliases.alt_style_code_aliases, ARRAY[]::text[])) THEN 3
                  ELSE 4
                END::int AS search_rank
         FROM database_ralawise_catalog_styles s
         LEFT JOIN style_aliases aliases ON aliases.style_id = s.id
         WHERE ($6::int IS NULL OR s.id = $6)
           AND (
             $1::text IS NULL
             OR s.style_name ILIKE $1
             OR s.brand ILIKE $1
             OR s.product_type ILIKE $1
             OR s.style_code ILIKE $1
             OR s.manufacturer_style_code ILIKE $1
             OR COALESCE(aliases.legacy_style_codes, '') ILIKE $1
             OR COALESCE(aliases.legacy_alt_style_codes, '') ILIKE $1
             OR ${normalizedStyleCode} = $3
             OR ${normalizedManufacturerStyleCode} = $3
           )
       ),
       style_usage AS (
         SELECT v.style_id::int AS style_id,
                COUNT(*)::int AS usage_count,
                COALESCE(SUM(COALESCE(li.quantity, 0)), 0)::int AS usage_quantity
         FROM database_job_line_items li
         JOIN database_ralawise_catalog_variants v
           ON v.id = li.ralawise_catalog_variant_id
         JOIN candidate_styles cs ON cs.style_id = v.style_id
         GROUP BY v.style_id
       )${stylePriceCteSql},
       ordered_styles AS (
         SELECT cs.*,
                COALESCE(su.usage_count, 0)::int AS usage_count,
                COALESCE(su.usage_quantity, 0)::int AS usage_quantity,
                COUNT(*) OVER()::int AS total_count,
                ROW_NUMBER() OVER (ORDER BY ${orderSql})::int AS page_order
         FROM candidate_styles cs
         LEFT JOIN style_usage su ON su.style_id = cs.style_id
         ${stylePriceJoinSql}
         ORDER BY ${orderSql}
         LIMIT $4 OFFSET $5
       ),
       paged_styles AS (
         SELECT os.style_id,
                MIN(v.database_product_source_id)::int AS sample_product_id,
                os.style_code,
                os.alt_style_code,
                os.style_name,
                os.product_type,
                os.brand,
                'Ralawise'::text AS supplier_name,
                MIN(NULLIF(BTRIM(v.primary_image_url), '')) FILTER (
                  WHERE LOWER(BTRIM(COALESCE(v.primary_image_url, ''))) <> 'not available'
                ) AS primary_image_url,
                COUNT(*)::int AS catalogue_variant_count,
                COUNT(*) FILTER (WHERE v.is_active)::int AS live_catalogue_variant_count,
                MIN(v.carton_price) AS min_unit_cost,
                MAX(v.carton_price) AS max_unit_cost,
                MIN(v.carton_price) FILTER (WHERE v.carton_price > 0) AS min_positive_unit_cost,
                MAX(v.carton_price) FILTER (WHERE v.carton_price > 0) AS max_positive_unit_cost,
                COALESCE(
                  JSON_AGG(DISTINCT v.carton_price ORDER BY v.carton_price) FILTER (
                    WHERE v.carton_price IS NOT NULL
                  ),
                  '[]'::json
                ) AS unit_costs,
                COUNT(*)::int AS variant_count,
                COUNT(*) FILTER (WHERE v.is_active)::int AS active_variant_count,
                COUNT(DISTINCT v.colour_id)::int AS colour_count,
                COUNT(DISTINCT COALESCE(NULLIF(BTRIM(v.size_code), ''), NULLIF(BTRIM(v.size_name), '')))::int AS size_count,
                os.style_code_aliases,
                os.alt_style_code_aliases,
                os.legacy_style_codes,
                os.legacy_alt_style_codes,
                os.usage_count,
                os.usage_quantity,
                os.search_rank,
                os.total_count,
                os.page_order
         FROM ordered_styles os
         JOIN database_ralawise_catalog_variants v ON v.style_id = os.style_id
         GROUP BY os.style_id,
                  os.style_code,
                  os.alt_style_code,
                  os.style_name,
                  os.product_type,
                  os.brand,
                  os.style_code_aliases,
                  os.alt_style_code_aliases,
                  os.legacy_style_codes,
                  os.legacy_alt_style_codes,
                  os.usage_count,
                  os.usage_quantity,
                  os.search_rank,
                  os.total_count,
                  os.page_order
       )
       SELECT ps.*,
              COALESCE(sz.sizes, '[]'::json) AS sizes,
              COALESCE(co.colours, '[]'::json) AS colours
       FROM paged_styles ps
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'label', size_rows.size,
                    'variant_count', size_rows.variant_count
                  )
                  ORDER BY size_rows.size_order ASC NULLS LAST,
                           LOWER(size_rows.size),
                           size_rows.size
                ) AS sizes
         FROM (
           SELECT NULLIF(BTRIM(v.size_name), '') AS size,
                  MIN(NULLIF(BTRIM(v.size_code), '')) AS size_order,
                  COUNT(*)::int AS variant_count
           FROM database_ralawise_catalog_variants v
           WHERE v.style_id = ps.style_id
             AND v.is_active IS TRUE
             AND NULLIF(BTRIM(v.size_name), '') IS NOT NULL
           GROUP BY NULLIF(BTRIM(v.size_name), '')
         ) size_rows
       ) sz ON TRUE
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'key', colour_rows.colour_order,
                    'label', colour_rows.colour,
                    'variant_count', colour_rows.variant_count,
                    'image_url', colour_rows.image_url,
                    'sizes', colour_rows.sizes
                  )
                  ORDER BY colour_rows.colour_order ASC,
                           LOWER(colour_rows.colour),
                           colour_rows.colour
                ) AS colours
         FROM (
           SELECT NULLIF(BTRIM(c.colour_name), '') AS colour,
                  MIN(c.id) AS colour_order,
                  COUNT(*)::int AS variant_count,
                  COALESCE(
                    MIN(NULLIF(BTRIM(v.colour_image_url), '')) FILTER (
                      WHERE LOWER(BTRIM(COALESCE(v.colour_image_url, ''))) <> 'not available'
                    ),
                    MIN(NULLIF(BTRIM(v.primary_image_url), '')) FILTER (
                      WHERE LOWER(BTRIM(COALESCE(v.primary_image_url, ''))) <> 'not available'
                    )
                  ) AS image_url,
                  JSON_AGG(
                    DISTINCT NULLIF(BTRIM(v.size_name), '')
                    ORDER BY NULLIF(BTRIM(v.size_name), '')
                  ) FILTER (
                    WHERE NULLIF(BTRIM(v.size_name), '') IS NOT NULL
                  ) AS sizes
           FROM database_ralawise_catalog_variants v
           JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
           WHERE v.style_id = ps.style_id
             AND v.is_active IS TRUE
             AND NULLIF(BTRIM(c.colour_name), '') IS NOT NULL
           GROUP BY NULLIF(BTRIM(c.colour_name), '')
         ) colour_rows
       ) co ON TRUE
       ORDER BY ps.page_order ASC`,
      [search ? `%${search}%` : null, search || null, normalizedSearch, limit, offset, selectedStyleId]
    );

    const total = Number(result.rows[0]?.total_count || 0);
    const styles = result.rows.map(({ total_count, page_order, style_code_aliases, alt_style_code_aliases, ...style }) => style);
    res.json({
      styles,
      total,
      limit,
      offset,
      nextOffset: offset + styles.length,
      hasMore: offset + styles.length < total,
    });
  } catch (err) {
    console.error('GET /api/database/products/styles', err);
    res.status(500).json({ error: 'Failed to fetch product styles' });
  }
});

router.get('/api/database/products/styles/:styleId/variants', async (req, res) => {
  const styleId = Number.parseInt(req.params.styleId, 10);
  if (!Number.isFinite(styleId)) {
    return res.status(400).json({ error: 'Invalid style id' });
  }

  try {
    const result = await pool.query(
      `SELECT v.database_product_source_id::int AS source_product_id,
              s.id::int AS style_id,
              s.id::int AS ralawise_catalog_style_id,
              s.database_product_style_id AS legacy_product_style_id,
              c.id::int AS colour_id,
              NULL::int AS size_id,
              'Ralawise'::text AS supplier_name,
              s.style_code,
              s.manufacturer_style_code AS alt_style_code,
              s.style_name,
              s.product_type,
              c.colour_name AS colour,
              v.size_name AS size,
              v.carton_price AS unit_cost,
              NULL::int AS stock,
              v.is_active AS is_product_active,
              'Ralawise'::text AS catalog_source,
              v.id AS ralawise_catalog_variant_id,
              v.sku_code AS ralawise_sku,
              v.sku_code AS supplier_sku,
              v.alpha_sku_code AS supplier_alpha_sku,
              s.style_code AS supplier_style_code,
              c.colour_code AS supplier_colour_code,
              v.size_code AS supplier_size_code,
              v.sku_status AS catalogue_status,
              NULLIF(v.primary_image_url, 'Not available') AS primary_image_url,
              v.colour_image_url,
              v.carton_price AS supplier_carton_price,
              v.pack_price AS supplier_pack_price,
              v.single_price AS supplier_single_price
       FROM database_ralawise_catalog_variants v
       JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
       JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
       WHERE s.id = $1
         AND v.is_active IS TRUE
       ORDER BY LOWER(COALESCE(c.colour_name, '')) ASC,
                c.id ASC,
                LOWER(COALESCE(v.size_name, '')) ASC,
                v.sku_code ASC`,
      [styleId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product style not found' });
    }

    res.json({ products: result.rows });
  } catch (err) {
    console.error('GET /api/database/products/styles/:styleId/variants', err);
    res.status(500).json({ error: 'Failed to fetch product variants' });
  }
});

router.get('/api/database/products/:sourceProductId/detail', async (req, res) => {
  const sourceProductId = Number.parseInt(req.params.sourceProductId, 10);
  if (!Number.isFinite(sourceProductId) || sourceProductId === 0) {
    return res.status(400).json({ error: 'Invalid source product id' });
  }

  try {
    const result = await pool.query(
      `SELECT p.*,
              CASE
                WHEN v.id IS NULL THEN NULL
                ELSE JSONB_BUILD_OBJECT(
                  'style', TO_JSONB(s),
                  'colour', TO_JSONB(c),
                  'variant', TO_JSONB(v),
                  'images', COALESCE(images.images, '[]'::jsonb)
                )
              END AS ralawise_catalogue
       FROM database_products p
       LEFT JOIN database_ralawise_catalog_variants v
         ON v.id = p.ralawise_catalog_variant_id
       LEFT JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
       LEFT JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
       LEFT JOIN LATERAL (
         SELECT JSONB_AGG(TO_JSONB(i) ORDER BY i.image_type, i.source_url) AS images
         FROM database_ralawise_catalog_images i
         WHERE i.style_id = v.style_id
           AND (i.colour_id IS NULL OR i.colour_id = v.colour_id)
       ) images ON TRUE
       WHERE p.source_product_id = $1
       LIMIT 1`,
      [sourceProductId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('GET /api/database/products/:sourceProductId/detail', err);
    res.status(500).json({ error: 'Failed to fetch product detail' });
  }
});

router.post('/api/database/jobs/:id/line-items', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const variantId = nullableInt(req.body?.ralawise_catalog_variant_id);
  const productId = nullableInt(req.body?.source_product_id);
  if (!variantId && !productId) {
    return res.status(400).json({ error: 'A Ralawise product variant is required' });
  }

  const quantity = nullableInt(req.body?.quantity) || 1;
  if (quantity < 1 || quantity > 100000) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 100000' });
  }

  const unitPrice = nullableNumber(req.body?.unit_price);
  const vatRate = nullableNumber(req.body?.vat_rate);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060218)');

    const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    let productRow;
    if (variantId) {
      const variant = await selectRalawiseOrderVariant(client, variantId);
      if (!variant) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Live Ralawise product variant not found' });
      }
      productRow = {
        ...variant,
        source_product_id: variant.canonical_source_product_id,
        style_id: variant.legacy_product_style_id,
        supplier_name: 'Ralawise',
        stock: null,
      };
    } else {
      const product = await client.query(
        `SELECT *
         FROM database_products
         WHERE source_product_id = $1
         LIMIT 1`,
        [productId]
      );
      if (!product.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found in referenced product table' });
      }
      productRow = product.rows[0];
    }

    const next = await client.query(`
      SELECT (COALESCE(MAX(source_order_item_id), 0) + 1)::int AS next_id
      FROM database_job_line_items
    `);

    const sourceOrderId = job.source_order_id;
    const sourceOrderItemId = next.rows[0].next_id;
    const nextSort = await client.query(
      `SELECT (COALESCE(MAX(line_sort_order), COUNT(*)) + 1)::int AS next_sort_order
       FROM database_job_line_items
       WHERE source_order_id = $1`,
      [sourceOrderId]
    );

    await client.query(
      `INSERT INTO database_job_line_items (
         source_order_item_id,
         source_order_id,
         line_sort_order,
         source_product_id,
         line_description,
         quantity,
         unit_price,
         unit_cost,
         vat_rate,
         is_non_deliverable,
         is_internal,
         supplier_name,
         style_id,
         style_code,
         alt_style_code,
         style_name,
         colour,
         size,
         product_type,
         stock,
         is_product_active,
         ralawise_catalog_variant_id,
         ralawise_sku,
         supplier_style_code,
         supplier_colour_code,
         supplier_size_code,
         catalogue_status,
         catalogue_synced_at,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         FALSE, FALSE, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23, $24, $25,
         CASE WHEN $20::bigint IS NULL THEN NULL ELSE NOW() END,
         NOW(), NOW()
       )`,
      [
        sourceOrderItemId,
        sourceOrderId,
        nextSort.rows[0].next_sort_order,
        productRow.source_product_id,
        productRow.style_name,
        quantity,
        unitPrice,
        productRow.unit_cost,
        vatRate,
        productRow.supplier_name,
        productRow.style_id,
        productRow.style_code,
        productRow.alt_style_code,
        productRow.style_name,
        productRow.colour,
        productRow.size,
        productRow.product_type,
        productRow.stock,
        productRow.is_product_active,
        productRow.ralawise_catalog_variant_id || null,
        productRow.ralawise_sku || null,
        productRow.supplier_style_code || null,
        productRow.supplier_colour_code || null,
        productRow.supplier_size_code || null,
        productRow.catalogue_status || null,
      ]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.status(201).json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/jobs/:id/line-items', err);
    res.status(500).json({ error: 'Failed to add database line item' });
  } finally {
    client.release();
  }
});

router.post('/api/database/jobs/:id/line-items/custom', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const lineType = normalizeCustomLineType(req.body?.line_type);
  if (!lineType) {
    return res.status(400).json({ error: 'Line type must be nonstock, nondelivery, or internal' });
  }

  const description = cleanNullable(req.body?.line_description);
  if (!description) {
    return res.status(400).json({ error: 'Line description is required' });
  }

  const quantity = nullableInt(req.body?.quantity) || 1;
  if (quantity < 1 || quantity > 100000) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 100000' });
  }

  const flags = customLineFlags(lineType);
  const unitCost = nullableNumber(req.body?.unit_cost);
  const unitPrice = nullableNumber(req.body?.unit_price);
  const vatRate = normalizeVatRate(req.body?.vat_rate);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060220)');

    const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const next = await client.query(`
      SELECT (COALESCE(MAX(source_order_item_id), 0) + 1)::int AS next_id
      FROM database_job_line_items
    `);

    const sourceOrderId = job.source_order_id;
    const sourceOrderItemId = next.rows[0].next_id;
    const nextSort = await client.query(
      `SELECT (COALESCE(MAX(line_sort_order), COUNT(*)) + 1)::int AS next_sort_order
       FROM database_job_line_items
       WHERE source_order_id = $1`,
      [sourceOrderId]
    );

    await client.query(
      `INSERT INTO database_job_line_items (
         source_order_item_id,
         source_order_id,
         line_sort_order,
         line_description,
         quantity,
         unit_price,
         unit_cost,
         vat_rate,
         is_non_deliverable,
         is_internal,
         supplier_name,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
       )`,
      [
        sourceOrderItemId,
        sourceOrderId,
        nextSort.rows[0].next_sort_order,
        description,
        quantity,
        unitPrice,
        unitCost,
        vatRate,
        flags.isNonDeliverable,
        flags.isInternal,
        cleanNullable(req.body?.supplier_name),
      ]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.status(201).json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/jobs/:id/line-items/custom', err);
    res.status(500).json({ error: 'Failed to add custom database line item' });
  } finally {
    client.release();
  }
});

router.put('/api/database/jobs/:id/line-items/order', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const orderedLineIds = normalizeLineOrderPayload(req.body?.line_item_ids);
  if (!orderedLineIds.length) {
    return res.status(400).json({ error: 'Line item order is required' });
  }

  if (orderedLineIds.length > 500) {
    return res.status(400).json({ error: 'Too many line items to reorder' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060219)');

    const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.source_order_id;
    const existing = await client.query(
      `SELECT source_order_item_id
       FROM database_job_line_items
       WHERE source_order_id = $1
         AND source_order_item_id = ANY($2::int[])`,
      [sourceOrderId, orderedLineIds]
    );

    if (existing.rowCount !== orderedLineIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Line item order contains rows outside this order' });
    }

    const values = [];
    const rowPlaceholders = orderedLineIds.map((lineId, index) => {
      values.push(lineId, index + 1);
      return `($${index * 2 + 1}::int, $${index * 2 + 2}::int)`;
    });

    await client.query(
      `UPDATE database_job_line_items AS line_items
       SET line_sort_order = updates.line_sort_order,
           updated_at_source = NOW(),
           imported_at = NOW()
       FROM (VALUES ${rowPlaceholders.join(', ')}) AS updates(source_order_item_id, line_sort_order)
       WHERE line_items.source_order_id = $${values.length + 1}
         AND line_items.source_order_item_id = updates.source_order_item_id`,
      [...values, sourceOrderId]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/database/jobs/:id/line-items/order', err);
    res.status(500).json({ error: 'Failed to save line item order' });
  } finally {
    client.release();
  }
});

router.put('/api/database/jobs/:id/line-items/:lineItemId', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const lineItemId = Number.parseInt(req.params.lineItemId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(lineItemId)) {
    return res.status(400).json({ error: 'Invalid job or line item id' });
  }

  const payload = req.body || {};
  const requestedVariantId = hasOwn(payload, 'ralawise_catalog_variant_id')
    ? nullableInt(payload.ralawise_catalog_variant_id)
    : null;
  if (hasOwn(payload, 'ralawise_catalog_variant_id') && !requestedVariantId) {
    return res.status(400).json({ error: 'Ralawise product variant is required' });
  }
  const requestedProductId = hasOwn(payload, 'source_product_id') ? nullableInt(payload.source_product_id) : null;
  if (hasOwn(payload, 'source_product_id') && !requestedProductId) {
    return res.status(400).json({ error: 'Product is required' });
  }

  const update = buildLineItemUpdate(payload);
  if (update.error) {
    return res.status(400).json({ error: update.error });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060221)');

    const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.source_order_id;
    const existing = await client.query(
      `SELECT li.source_order_item_id,
              li.source_product_id,
              li.legacy_source_product_id,
              li.style_id,
              COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id) AS current_variant_id,
              current_variant.style_id AS current_catalog_style_id
       FROM database_job_line_items li
       LEFT JOIN database_products p ON p.source_product_id = li.source_product_id
       LEFT JOIN database_ralawise_catalog_variants current_variant
         ON current_variant.id = COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id)
       WHERE li.source_order_id = $1
         AND li.source_order_item_id = $2
       FOR UPDATE OF li`,
      [sourceOrderId, lineItemId]
    );

    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Line item not found for this order' });
    }

    const canonicalLockedFields = [
      'style_code',
      'alt_style_code',
      'style_name',
      'colour',
      'size',
      'supplier_name',
    ];
    if (
      (existing.rows[0].current_variant_id || requestedVariantId)
      && canonicalLockedFields.some((field) => hasOwn(payload, field))
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Catalogue product identity fields can only be changed by selecting another Ralawise variant',
      });
    }

    if (requestedVariantId) {
      const variant = await selectRalawiseOrderVariant(client, requestedVariantId);
      if (!variant) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Live Ralawise product variant not found' });
      }
      const currentCatalogStyleId = nullableInt(existing.rows[0].current_catalog_style_id);
      if (
        currentCatalogStyleId
        && currentCatalogStyleId !== nullableInt(variant.ralawise_catalog_style_id)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected product is not a variant of this line item style' });
      }
      if (
        nullableInt(existing.rows[0].source_product_id) > 0
        && !nullableInt(existing.rows[0].legacy_source_product_id)
      ) {
        addLineItemUpdateField(update, 'legacy_source_product_id', existing.rows[0].source_product_id);
      }
      appendLineItemRalawiseVariantUpdate(update, variant);
    } else if (requestedProductId) {
      const product = await client.query(
        `SELECT *
         FROM database_products
         WHERE source_product_id = $1
         LIMIT 1`,
        [requestedProductId]
      );
      if (!product.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found in referenced product table' });
      }
      const existingStyleId = nullableInt(existing.rows[0].style_id);
      const productStyleId = nullableInt(product.rows[0].style_id);
      if (existingStyleId && productStyleId && existingStyleId !== productStyleId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected product is not a variant of this line item style' });
      }
      appendLineItemProductUpdate(update, product.rows[0]);
    }

    if (!update.assignments.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No editable line item fields supplied' });
    }

    const sourceOrderIndex = update.values.length + 1;
    const lineItemIndex = update.values.length + 2;
    await client.query(
      `UPDATE database_job_line_items
       SET ${update.assignments.join(', ')},
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE source_order_id = $${sourceOrderIndex}
         AND source_order_item_id = $${lineItemIndex}`,
      [...update.values, sourceOrderId, lineItemId]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/database/jobs/:id/line-items/:lineItemId', err);
    res.status(500).json({ error: 'Failed to save database line item' });
  } finally {
    client.release();
  }
});

router.delete('/api/database/jobs/:id/line-items/:lineItemId', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const lineItemId = Number.parseInt(req.params.lineItemId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(lineItemId)) {
    return res.status(400).json({ error: 'Invalid job or line item id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060222)');

    const job = await resolveDatabaseJobForMutation(client, id, { forUpdate: true });
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.source_order_id;
    const deleted = await client.query(
      `DELETE FROM database_job_line_items
       WHERE source_order_id = $1
         AND source_order_item_id = $2
       RETURNING source_order_item_id`,
      [sourceOrderId, lineItemId]
    );

    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Line item not found for this order' });
    }

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DELETE /api/database/jobs/:id/line-items/:lineItemId', err);
    res.status(500).json({ error: 'Failed to delete database line item' });
  } finally {
    client.release();
  }
});

router.get('/api/database/jobs/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  try {
    const job = await pool.query(
      `SELECT *
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [id]
    );

    if (!job.rowCount) return res.status(404).json({ error: 'Database job not found' });

    const selectedJob = job.rows[0];
    const sourceOrderId = selectedJob.source_order_id;
    const [lineItems, positions, dashboardState, proofFiles, customerOverview] = await Promise.all([
      fetchLineItems(pool, sourceOrderId),
      pool.query(
        `SELECT *
         FROM database_job_positions
         WHERE source_order_id = $1
         ORDER BY COALESCE(position_sort_order, source_order_position_id), source_order_position_id`,
        [sourceOrderId]
      ),
      pool.query(
        `SELECT column_values
         FROM test_dashboard_job_state
         WHERE source_order_id = $1
         LIMIT 1`,
        [sourceOrderId]
      ),
      pool.query(
        `SELECT *
         FROM test_dashboard_files
         WHERE source_order_id = $1
           AND (column_id = $2 OR UPPER(TRIM(column_title)) = 'PROOF')
         ORDER BY created_at, id`,
        [sourceOrderId, TEST_DASHBOARD_COLUMN_IDS.PROOF]
      ),
      fetchCustomerOverview(pool, selectedJob),
    ]);
    const resolvedJob = {
      ...selectedJob,
      proof_approved: resolveJobApproved(selectedJob, dashboardState.rows[0]),
    };

    res.json({
      job: resolvedJob,
      lineItems,
      positions: positions.rows,
      proofFiles: proofFiles.rows.map(databaseProofFileToApi),
      customerOverview,
    });
  } catch (err) {
    console.error('GET /api/database/jobs/:id', err);
    res.status(500).json({ error: 'Failed to fetch database job detail' });
  }
});

async function fetchCustomerOverview(db, job) {
  const match = customerJobMatch(job);
  if (!match) return null;

  const result = await db.query(
    `WITH customer_jobs AS (
       SELECT j.*
       FROM database_jobs j
       WHERE ${match.whereSql}
     ),
     order_totals AS (
       SELECT cj.source_order_id,
              COALESCE(SUM(
                CASE
                  WHEN li.is_internal IS TRUE THEN 0
                  ELSE COALESCE(li.quantity, 0)::numeric * COALESCE(li.unit_price, 0)::numeric
                END
              ), 0)::numeric AS net_total
       FROM customer_jobs cj
       LEFT JOIN database_job_line_items li ON li.source_order_id = cj.source_order_id
       GROUP BY cj.source_order_id
     ),
     summary AS (
       SELECT MAX(COALESCE(cj.order_date, cj.created_at_source, cj.updated_at_source)) AS last_order_date,
              COUNT(*)::int AS order_count,
              COUNT(*) FILTER (
                WHERE COALESCE(cj.order_date, cj.created_at_source, cj.updated_at_source) >= CURRENT_DATE - INTERVAL '3 months'
              )::int AS activity_3_months,
              COALESCE(SUM(ot.net_total) FILTER (
                WHERE COALESCE(cj.order_date, cj.created_at_source, cj.updated_at_source) >= CURRENT_DATE - INTERVAL '12 months'
              ), 0)::numeric AS spend_12_months,
              COALESCE(AVG(ot.net_total), 0)::numeric AS average_order_value,
              COUNT(*) FILTER (
                WHERE cj.is_complete IS NOT TRUE
                  AND NOT (
                    COALESCE(UPPER(TRIM(cj.dashboard_status)), '') = 'COMPLETED'
                    AND (cj.invoice_printed IS TRUE OR cj.pf_invoice_printed IS TRUE)
                  )
              )::int AS open_jobs,
              COUNT(*) FILTER (
                WHERE cj.invoice_required IS NOT FALSE
                  AND cj.invoice_printed IS NOT TRUE
                  AND cj.pf_invoice_printed IS NOT TRUE
              )::int AS unpaid_uninvoiced_jobs
       FROM customer_jobs cj
       LEFT JOIN order_totals ot ON ot.source_order_id = cj.source_order_id
     ),
     top_order_types AS (
       SELECT COALESCE(JSON_AGG(row_to_json(type_rows)), '[]'::json) AS rows
       FROM (
         SELECT COALESCE(NULLIF(TRIM(order_type), ''), 'Unknown') AS label,
                COUNT(*)::int AS count
         FROM customer_jobs
         GROUP BY COALESCE(NULLIF(TRIM(order_type), ''), 'Unknown')
         ORDER BY COUNT(*) DESC, COALESCE(NULLIF(TRIM(order_type), ''), 'Unknown')
         LIMIT 3
       ) type_rows
     ),
     top_products AS (
       SELECT COALESCE(JSON_AGG(row_to_json(product_rows)), '[]'::json) AS rows
       FROM (
         SELECT COALESCE(
                  NULLIF(TRIM(li.style_name), ''),
                  NULLIF(TRIM(li.line_description), ''),
                  NULLIF(TRIM(li.style_code), ''),
                  NULLIF(TRIM(li.alt_style_code), ''),
                  NULLIF(TRIM(li.product_type), ''),
                  'Unknown'
                ) AS label,
                COALESCE(SUM(li.quantity), 0)::int AS quantity,
                COUNT(*)::int AS count
         FROM customer_jobs cj
         JOIN database_job_line_items li ON li.source_order_id = cj.source_order_id
         WHERE li.is_internal IS NOT TRUE
         GROUP BY COALESCE(
                  NULLIF(TRIM(li.style_name), ''),
                  NULLIF(TRIM(li.line_description), ''),
                  NULLIF(TRIM(li.style_code), ''),
                  NULLIF(TRIM(li.alt_style_code), ''),
                  NULLIF(TRIM(li.product_type), ''),
                  'Unknown'
                )
         ORDER BY COALESCE(SUM(li.quantity), 0) DESC, COUNT(*) DESC, label
         LIMIT 3
       ) product_rows
     )
     SELECT summary.*,
            top_order_types.rows AS top_order_types,
            top_products.rows AS top_products
     FROM summary, top_order_types, top_products`,
    match.params
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    last_order_date: row.last_order_date || null,
    order_count: Number(row.order_count || 0),
    activity_3_months: Number(row.activity_3_months || 0),
    spend_12_months: Number(row.spend_12_months || 0),
    average_order_value: Number(row.average_order_value || 0),
    top_order_types: Array.isArray(row.top_order_types) ? row.top_order_types : [],
    top_products: Array.isArray(row.top_products) ? row.top_products : [],
    open_jobs: Number(row.open_jobs || 0),
    unpaid_uninvoiced_jobs: Number(row.unpaid_uninvoiced_jobs || 0),
  };
}

function customerJobMatch(job) {
  const clauses = [];
  const params = [];

  if (isFiniteDatabaseValue(job?.customer_id)) {
    params.push(Number(job.customer_id));
    clauses.push(`j.customer_id = $${params.length}`);
  }

  const customerName = cleanNullable(job?.customer_name);
  if (customerName) {
    params.push(customerName);
    clauses.push(`LOWER(j.customer_name) = LOWER($${params.length})`);
  }

  if (!clauses.length) return null;
  return {
    whereSql: clauses.map((clause) => `(${clause})`).join(' OR '),
    params,
  };
}

function databaseProofFileToApi(row) {
  const name = row.original_filename || row.public_id || 'Proof file';
  return {
    id: row.id,
    dashboardFileId: row.id,
    source_order_id: row.source_order_id,
    column_id: row.column_id,
    column_title: row.column_title,
    name,
    publicId: row.public_id,
    public_id: row.public_id,
    url: row.secure_url,
    public_url: row.secure_url,
    secure_url: row.secure_url,
    mime: mimeFromDatabaseProofFile(row, name),
    resourceType: row.resource_type || '',
    resource_type: row.resource_type || '',
    format: row.format || '',
    bytes: row.bytes,
    width: row.width,
    height: row.height,
  };
}

function mimeFromDatabaseProofFile(row, name) {
  const format = cleanQuery(row.format).toLowerCase();
  if (format === 'pdf' || /\.pdf$/i.test(name || '')) return 'application/pdf';
  if (row.resource_type === 'image' && format) return `image/${format === 'jpg' ? 'jpeg' : format}`;
  return '';
}

function cleanQuery(value) {
  return String(value || '').trim();
}

function normalizeDatabaseReportPeriod(value) {
  const period = cleanQuery(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(DATABASE_REPORT_PERIODS, period) ? period : 'ytd';
}

function resolveDatabaseReportPeriod(rangeValue, periodValue, yearValue) {
  const requestedRange = cleanQuery(rangeValue).toLowerCase();
  if (requestedRange === 'custom-month') return customDatabaseReportMonth(periodValue);
  if (requestedRange === 'custom-year') return customDatabaseReportYear(periodValue);

  const range = normalizeDatabaseReportPeriod(requestedRange);
  if (range === 'ytd' && cleanQuery(yearValue)) {
    return selectedDatabaseReportYear(yearValue);
  }
  return { ...DATABASE_REPORT_PERIODS[range], range };
}

function customDatabaseReportMonth(value) {
  const match = cleanQuery(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;

  const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = endDate.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${start}T00:00:00Z`));

  return {
    range: 'custom-month',
    periodValue: `${match[1]}-${match[2]}`,
    label,
    description: label,
    grain: 'day',
    stepSql: "INTERVAL '1 day'",
    startSql: `TIMESTAMP '${start}'`,
    endSql: `TIMESTAMP '${end}'`,
  };
}

function customDatabaseReportYear(value) {
  const year = normalizeDatabaseReportYear(value);
  if (!year) return null;
  return fullDatabaseReportYear(year, 'custom-year');
}

function selectedDatabaseReportYear(value) {
  const year = normalizeDatabaseReportYear(value);
  if (!year) return null;
  const currentYear = currentLondonYear();
  if (year === currentYear) {
    return {
      ...DATABASE_REPORT_PERIODS.ytd,
      range: 'ytd',
      periodValue: String(year),
      description: `Year to date ${year}`,
    };
  }
  return fullDatabaseReportYear(year, 'ytd', `Year ${year}`);
}

function fullDatabaseReportYear(year, range, description = String(year)) {
  return {
    range,
    periodValue: String(year),
    label: String(year),
    description,
    grain: 'month',
    stepSql: "INTERVAL '1 month'",
    startSql: `TIMESTAMP '${year}-01-01'`,
    endSql: `TIMESTAMP '${year + 1}-01-01'`,
  };
}

function normalizeDatabaseReportYear(value) {
  if (!/^\d{4}$/.test(cleanQuery(value))) return 0;
  const year = Number.parseInt(value, 10);
  return year >= 1900 && year <= 2100 ? year : 0;
}

function currentLondonYear() {
  return Number(new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(new Date()));
}

function emptyDatabaseReportSummary() {
  return {
    orderCount: 0,
    netSales: 0,
    vat: 0,
    grossSales: 0,
    costOfGoods: 0,
    grossProfit: 0,
    grossMarginPercent: 0,
    averageOrderValue: 0,
    financialLineCount: 0,
    missingPriceLines: 0,
    missingCostLines: 0,
    unitsSold: 0,
  };
}

function normalizeCustomerListSort(value) {
  const sort = cleanQuery(value).toLowerCase();
  if (sort === 'recent' || sort === 'active' || sort === 'az' || sort === 'za') return sort;
  return 'recent';
}

function customerListOrderSql(sort) {
  if (sort === 'recent') {
    return `ORDER BY COALESCE(latest_order_date, last_seen_at) DESC NULLS LAST,
                    latest_order_no DESC NULLS LAST,
                    LOWER(business_name) ASC,
                    business_name ASC`;
  }
  if (sort === 'active') {
    return `ORDER BY recent_order_count DESC,
                    COALESCE(latest_order_date, last_seen_at) DESC NULLS LAST,
                    latest_order_no DESC NULLS LAST,
                    LOWER(business_name) ASC,
                    business_name ASC`;
  }
  if (sort === 'za') {
    return `ORDER BY LOWER(business_name) DESC,
                    business_name DESC`;
  }
  return `ORDER BY LOWER(business_name) ASC,
                  business_name ASC`;
}

function cleanNullable(value) {
  const clean = cleanQuery(value);
  return clean || null;
}

function normalizePositionPayload(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((position) => ({
      source_order_position_id: nullableInt(position?.source_order_position_id),
      position_name: cleanNullable(position?.position_name),
      colour_notes: cleanNullable(position?.colour_notes),
      design_ref: cleanNullable(position?.design_ref),
    }))
    .filter((position) => position.position_name || position.colour_notes || position.design_ref);
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function nullableInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLineOrderPayload(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];

  for (const item of value) {
    const id = nullableInt(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function buildLineItemUpdate(payload) {
  const assignments = [];
  const values = [];
  const addField = (column, value) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (hasOwn(payload, 'style_name')) {
    const styleName = cleanNullable(payload.style_name);
    addField('style_name', styleName);
    if (!hasOwn(payload, 'line_description')) addField('line_description', styleName);
  }

  const textFields = ['style_code', 'alt_style_code', 'colour', 'size', 'line_description', 'supplier_name'];
  for (const field of textFields) {
    if (hasOwn(payload, field)) addField(field, cleanNullable(payload[field]));
  }

  for (const field of ['unit_cost', 'unit_price']) {
    if (hasOwn(payload, field)) addField(field, nullableNumber(payload[field]));
  }

  if (hasOwn(payload, 'quantity')) {
    const quantity = nullableInt(payload.quantity);
    if (!quantity || quantity < 1 || quantity > 100000) {
      return { error: 'Quantity must be between 1 and 100000', assignments: [], values: [] };
    }
    addField('quantity', quantity);
  }

  if (hasOwn(payload, 'vat_rate')) {
    addField('vat_rate', normalizeVatRate(payload.vat_rate));
  }

  return { assignments, values };
}

function addLineItemUpdateField(update, column, value) {
  update.values.push(value);
  update.assignments.push(`${column} = $${update.values.length}`);
}

function appendDatabaseJobUpdates(payload, values, updates) {
  if (hasOwn(payload, 'order_type')) {
    const orderType = normalizeDatabaseOrderType(payload.order_type);
    values.push(orderType);
    updates.push(`order_type = $${values.length}`);
    values.push(orderTypeAbbreviation(orderType));
    updates.push(`order_type_abbr = $${values.length}`);
    updates.push('dashboard_type = NULL');
  }

  const textFields = [
    'job_title',
    'comments',
    'client_order_no',
    'contact_name',
    'contact_phone',
    'contact_mobile',
    'contact_email',
    'invoice_address',
    'delivery_address',
  ];
  for (const field of textFields) {
    if (!hasOwn(payload, field)) continue;
    values.push(cleanNullable(payload[field]));
    updates.push(`${field} = $${values.length}`);
  }

  const intFields = ['contact_id', 'invoice_address_id', 'delivery_address_id'];
  for (const field of intFields) {
    if (!hasOwn(payload, field)) continue;
    values.push(nullableInt(payload[field]));
    updates.push(`${field} = $${values.length}`);
  }
}

function appendLineItemProductUpdate(update, productRow) {
  addLineItemUpdateField(update, 'source_product_id', productRow.source_product_id);
  addLineItemUpdateField(update, 'line_description', productRow.style_name);
  addLineItemUpdateField(update, 'unit_cost', productRow.unit_cost);
  addLineItemUpdateField(update, 'supplier_name', productRow.supplier_name);
  addLineItemUpdateField(update, 'style_id', productRow.style_id);
  addLineItemUpdateField(update, 'style_code', productRow.style_code);
  addLineItemUpdateField(update, 'alt_style_code', productRow.alt_style_code);
  addLineItemUpdateField(update, 'style_name', productRow.style_name);
  addLineItemUpdateField(update, 'colour', productRow.colour);
  addLineItemUpdateField(update, 'size', productRow.size);
  addLineItemUpdateField(update, 'product_type', productRow.product_type);
  addLineItemUpdateField(update, 'stock', productRow.stock);
  addLineItemUpdateField(update, 'is_product_active', productRow.is_product_active);
}

function appendLineItemRalawiseVariantUpdate(update, variantRow) {
  addLineItemUpdateField(update, 'line_description', variantRow.style_name);
  addLineItemUpdateField(update, 'unit_cost', variantRow.unit_cost);
  addLineItemUpdateField(update, 'supplier_name', 'Ralawise');
  addLineItemUpdateField(update, 'style_code', variantRow.style_code);
  addLineItemUpdateField(update, 'alt_style_code', variantRow.alt_style_code);
  addLineItemUpdateField(update, 'style_name', variantRow.style_name);
  addLineItemUpdateField(update, 'colour', variantRow.colour);
  addLineItemUpdateField(update, 'size', variantRow.size);
  addLineItemUpdateField(update, 'product_type', variantRow.product_type);
  addLineItemUpdateField(update, 'stock', null);
  addLineItemUpdateField(update, 'is_product_active', variantRow.is_product_active);
  addLineItemUpdateField(update, 'ralawise_catalog_variant_id', variantRow.ralawise_catalog_variant_id);
  addLineItemUpdateField(update, 'ralawise_sku', variantRow.ralawise_sku);
  addLineItemUpdateField(update, 'supplier_style_code', variantRow.supplier_style_code);
  addLineItemUpdateField(update, 'supplier_colour_code', variantRow.supplier_colour_code);
  addLineItemUpdateField(update, 'supplier_size_code', variantRow.supplier_size_code);
  addLineItemUpdateField(update, 'catalogue_status', variantRow.catalogue_status);
  update.assignments.push('catalogue_synced_at = NOW()');
}

async function selectRalawiseOrderVariant(db, variantId, options = {}) {
  const activeClause = options.includeInactive ? '' : 'AND v.is_active IS TRUE';
  const result = await db.query(
    `SELECT v.id AS ralawise_catalog_variant_id,
            v.database_product_source_id::int AS canonical_source_product_id,
            v.sku_code AS ralawise_sku,
            v.alpha_sku_code AS supplier_alpha_sku,
            v.sku_status AS catalogue_status,
            v.is_active AS is_product_active,
            v.carton_price AS unit_cost,
            s.id::int AS ralawise_catalog_style_id,
            s.database_product_style_id AS legacy_product_style_id,
            s.style_code,
            s.manufacturer_style_code AS alt_style_code,
            s.style_name,
            s.product_type,
            c.colour_name AS colour,
            v.size_name AS size,
            s.style_code AS supplier_style_code,
            c.colour_code AS supplier_colour_code,
            v.size_code AS supplier_size_code
     FROM database_ralawise_catalog_variants v
     JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
     JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
     WHERE v.id = $1
       ${activeClause}
     LIMIT 1`,
    [variantId]
  );
  return result.rows[0] || null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVatRate(value) {
  const parsed = nullableNumber(value);
  if (parsed === null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeCustomLineType(value) {
  const clean = cleanQuery(value).toLowerCase();
  if (clean === 'nonstock' || clean === 'non-stock') return 'nonstock';
  if (clean === 'nondelivery' || clean === 'non-delivery' || clean === 'non-deliverable') return 'nondelivery';
  if (clean === 'internal') return 'internal';
  return '';
}

function customLineFlags(lineType) {
  return {
    isNonDeliverable: lineType === 'nondelivery',
    isInternal: lineType === 'internal',
  };
}

async function fetchLineItems(db, sourceOrderId) {
  const result = await db.query(
    `SELECT li.*,
            COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id) AS ralawise_catalog_variant_id,
            COALESCE(NULLIF(BTRIM(li.ralawise_sku), ''), v.sku_code) AS ralawise_sku,
            COALESCE(NULLIF(BTRIM(li.catalogue_status), ''), v.sku_status) AS catalogue_status,
            v.style_id::int AS ralawise_catalog_style_id,
            s.style_code AS ralawise_catalog_style_code,
            c.colour_code AS ralawise_catalog_colour_code,
            v.size_code AS ralawise_catalog_size_code
     FROM database_job_line_items li
     LEFT JOIN database_products p ON p.source_product_id = li.source_product_id
     LEFT JOIN database_ralawise_catalog_variants v
       ON v.id = COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id)
     LEFT JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
     LEFT JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
     WHERE li.source_order_id = $1
     ORDER BY COALESCE(li.line_sort_order, li.source_order_item_id), li.source_order_item_id`,
    [sourceOrderId]
  );
  return result.rows;
}

async function resolveDatabaseJobForMutation(db, id, options = {}) {
  const lockClause = options.forUpdate ? 'FOR UPDATE' : '';
  const result = await db.query(
    `SELECT source_order_id, order_no
     FROM database_jobs
     WHERE source_order_id = $1 OR order_no = $1
     ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
     LIMIT 1
     ${lockClause}`,
    [id]
  );
  return result.rows[0] || null;
}

async function clearDashboardTypeOverride(db, sourceOrderId) {
  await db.query(
    `UPDATE test_dashboard_job_state
     SET column_values = COALESCE(column_values, '{}'::jsonb) - $2,
         updated_at = NOW()
     WHERE source_order_id = $1`,
    [sourceOrderId, TEST_DASHBOARD_COLUMN_IDS.TYPE]
  );
}

function parseDatabaseDate(value, label) {
  const clean = cleanQuery(value);
  if (!clean) return null;

  let year;
  let month;
  let day;

  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    year = Number.parseInt(iso[1], 10);
    month = Number.parseInt(iso[2], 10);
    day = Number.parseInt(iso[3], 10);
  } else {
    const legacy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!legacy) {
      return { valid: false, error: `${label} must be DD/MM/YY or YYYY-MM-DD` };
    }
    day = Number.parseInt(legacy[1], 10);
    month = Number.parseInt(legacy[2], 10);
    year = Number.parseInt(legacy[3], 10);
    if (year < 100) year += 2000;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { valid: false, error: `${label} is not a valid date` };
  }

  return {
    valid: true,
    year,
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function normalizeDatabaseOrderType(value) {
  const clean = cleanQuery(value).toLowerCase().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (clean.includes('gift')) return 'Business Gifts';
  const isPrint = clean.includes('print');
  const isEmbroidery = clean.includes('embro') || /\bemb\b/.test(clean);
  if (isPrint && isEmbroidery) return 'Print + Emb';
  if (isEmbroidery) return 'Embroidery';
  if (isPrint) return 'Printing';
  return null;
}

function orderTypeAbbreviation(orderType) {
  const normalized = normalizeDatabaseOrderType(orderType);
  if (normalized === 'Business Gifts') return 'G';
  if (normalized === 'Print + Emb') return 'PE';
  if (normalized === 'Embroidery') return 'E';
  if (normalized === 'Printing') return 'P';
  return null;
}

function invoiceRequiredValue(value) {
  const clean = cleanQuery(value).toLowerCase();
  if (!clean) return null;
  if (clean === 'yes' || clean === 'true' || clean === '1') return true;
  if (clean === 'no' || clean === 'false' || clean === '0') return false;
  return null;
}

function parseCustomerKey(value) {
  const clean = cleanQuery(value);
  if (!clean) return null;

  if (clean.toLowerCase().startsWith('profile:')) {
    const id = Number.parseInt(clean.slice(8).trim(), 10);
    return Number.isFinite(id) ? { type: 'profile', value: id } : null;
  }

  if (clean.toLowerCase().startsWith('name:')) {
    const name = clean.slice(5).trim();
    return name ? { type: 'name', value: name } : null;
  }

  if (/^\d+$/.test(clean)) {
    return { type: 'id', value: Number.parseInt(clean, 10) };
  }

  return { type: 'name', value: clean };
}

async function findCustomerProfileById(profileId) {
  const id = Number.parseInt(profileId, 10);
  if (!Number.isFinite(id)) return null;

  const result = await pool.query(
    `SELECT *
     FROM database_customer_profiles
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findCustomerProfileForKey(customerKey) {
  if (!customerKey) return null;
  if (customerKey.type === 'profile') return findCustomerProfileById(customerKey.value);

  const where = customerKey.type === 'id'
    ? 'customer_id = $1'
    : 'LOWER(customer_name) = LOWER($1)';
  const result = await pool.query(
    `SELECT *
     FROM database_customer_profiles
     WHERE ${where}
     ORDER BY updated_at_source DESC NULLS LAST, id DESC
     LIMIT 1`,
    [customerKey.value]
  );
  return result.rows[0] || null;
}

async function latestCustomerOrderForKey(customerKey, profile = null) {
  if (!customerKey && !profile) return null;

  let where = '';
  let params = [];
  if (profile) {
    if (isFiniteDatabaseValue(profile.customer_id) && cleanNullable(profile.customer_name)) {
      where = '(customer_id = $1 OR LOWER(customer_name) = LOWER($2))';
      params = [profile.customer_id, profile.customer_name];
    } else if (isFiniteDatabaseValue(profile.customer_id)) {
      where = 'customer_id = $1';
      params = [profile.customer_id];
    } else if (cleanNullable(profile.customer_name)) {
      where = 'LOWER(customer_name) = LOWER($1)';
      params = [profile.customer_name];
    }
  } else if (customerKey.type === 'id') {
    where = 'customer_id = $1';
    params = [customerKey.value];
  } else if (customerKey.type === 'name') {
    where = 'LOWER(customer_name) = LOWER($1)';
    params = [customerKey.value];
  }

  if (!where) return null;

  const result = await pool.query(
    `SELECT *
     FROM database_jobs
     WHERE ${where}
       AND customer_name IS NOT NULL
       AND customer_name <> ''
     ORDER BY COALESCE(order_date, updated_at_source, created_at_source) DESC NULLS LAST,
              order_no DESC NULLS LAST
     LIMIT 1`,
    params
  );
  return result.rows[0] || null;
}

function buildCustomerDetail(customerKey, orders, addressRows = [], profile = null, manualContactRows = [], designNumberRows = [], customerOverview = null) {
  const latest = orders[0] || {};
  const businessName = cleanNullable(profile?.customer_name) || firstNonEmpty(orders, 'customer_name');
  const customerId = isFiniteDatabaseValue(profile?.customer_id) ? Number(profile.customer_id) : firstFinite(orders, 'customer_id');
  const accountManager = customerAccountManagerFromProfile(profile) || customerAccountManagerFromOrders(orders);

  return {
    customer: {
      customer_key: profile ? `profile:${profile.id}` : (customerKey.type === 'id' ? String(customerKey.value) : `name:${businessName || customerKey.value}`),
      profile_id: profile?.id || null,
      customer_id: customerId,
      business_name: businessName,
      customer_code: cleanNullable(profile?.customer_code) || firstNonEmpty(orders, 'customer_code'),
      contact_name: cleanNullable(profile?.contact_name) || firstNonEmpty(orders, 'contact_name'),
      contact_phone: cleanNullable(profile?.contact_phone) || firstNonEmpty(orders, 'contact_phone'),
      contact_mobile: cleanNullable(profile?.contact_mobile) || firstNonEmpty(orders, 'contact_mobile'),
      contact_email: cleanNullable(profile?.contact_email) || firstNonEmpty(orders, 'contact_email'),
      marketing_opt_in: Boolean(profile?.marketing_opt_in),
      account_manager: accountManager.name,
      account_manager_user_id: accountManager.user_id,
      created_at_source: profile?.created_at_source || earliestDate(orders, 'created_at_source'),
      updated_at_source: profile?.updated_at_source || latestDate(orders, 'updated_at_source'),
      updated_by: profile?.updated_by_name || latest.order_taken_by || latest.trace_staff_id || null,
      latest_source_order_id: latest.source_order_id || null,
      latest_order_no: latest.order_no || null,
      order_count: orders.length,
    },
    orders,
    contacts: groupedContacts(orders, profile, manualContactRows),
    addresses: groupedAddresses(orders, addressRows, profile),
    designNumbers: designNumberRows,
    customerOverview,
  };
}

function customerAccountManagerFromProfile(profile) {
  if (!profile || !cleanQuery(profile.account_manager_name)) return null;
  return {
    name: profile.account_manager_name,
    user_id: isFiniteDatabaseValue(profile.account_manager_user_id) ? Number(profile.account_manager_user_id) : null,
  };
}

function customerAccountManagerFromOrders(orders) {
  const chronological = orders.slice().sort((a, b) => {
    const byCreated = dateTime(a.created_at_source || a.order_date) - dateTime(b.created_at_source || b.order_date);
    if (byCreated) return byCreated;
    return Number(a.order_no || 0) - Number(b.order_no || 0);
  });

  const owner = chronological.find((order) => cleanQuery(order.order_owner_name));
  if (owner) {
    return {
      name: owner.order_owner_name,
      user_id: isFiniteDatabaseValue(owner.order_owner_user_id) ? Number(owner.order_owner_user_id) : null,
    };
  }

  const takenBy = chronological.find((order) => cleanQuery(order.order_taken_by));
  if (takenBy) return { name: takenBy.order_taken_by, user_id: null };

  const legacyStaff = chronological.find((order) => cleanQuery(order.trace_staff_id));
  if (legacyStaff) return { name: String(legacyStaff.trace_staff_id), user_id: null };

  return { name: null, user_id: null };
}

async function fetchManualCustomerContacts(customerKey, profile, orders) {
  const clauses = [];
  const params = [];

  if (isFiniteDatabaseValue(profile?.id)) {
    params.push(Number(profile.id));
    clauses.push(`profile_id = $${params.length}`);
  }

  const customerId = isFiniteDatabaseValue(profile?.customer_id)
    ? Number(profile.customer_id)
    : firstFinite(orders, 'customer_id');
  if (isFiniteDatabaseValue(customerId)) {
    params.push(Number(customerId));
    clauses.push(`customer_id = $${params.length}`);
  }

  const customerName = cleanNullable(profile?.customer_name)
    || firstNonEmpty(orders, 'customer_name')
    || (customerKey.type === 'name' ? customerKey.value : null);
  if (customerName) {
    params.push(customerName);
    clauses.push(`LOWER(customer_name) = LOWER($${params.length})`);
  }

  if (!clauses.length) return [];

  const result = await pool.query(
    `SELECT *
     FROM database_customer_contacts
     WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}
     ORDER BY COALESCE(updated_at_source, created_at_source) DESC NULLS LAST,
              id DESC`,
    params
  );

  return result.rows;
}

async function fetchCustomerDesignNumbers(orders) {
  const sourceOrderIds = (orders || [])
    .map((order) => Number.parseInt(order.source_order_id, 10))
    .filter((orderId) => Number.isFinite(orderId));

  if (!sourceOrderIds.length) return [];

  const [designResult, referenceResult] = await Promise.all([
    pool.query(
      `SELECT design_ref,
              source_order_id,
              order_no,
              order_date,
              job_title
       FROM (
         SELECT DISTINCT ON (LOWER(BTRIM(p.design_ref)), j.source_order_id)
                BTRIM(p.design_ref) AS design_ref,
                j.source_order_id,
                j.order_no,
                j.order_date,
                j.job_title
         FROM database_job_positions p
         JOIN database_jobs j ON j.source_order_id = p.source_order_id
         WHERE p.source_order_id = ANY($1::int[])
           AND NULLIF(BTRIM(p.design_ref), '') IS NOT NULL
         ORDER BY LOWER(BTRIM(p.design_ref)),
                  j.source_order_id,
                  COALESCE(p.position_sort_order, p.source_order_position_id),
                  p.source_order_position_id
       ) design_numbers
       ORDER BY LOWER(design_ref), order_no NULLS LAST, source_order_id`,
      [sourceOrderIds]
    ),
    pool.query(
      `WITH position_text AS (
         SELECT source_order_id,
                STRING_AGG(CONCAT_WS(' ', position_name, colour_notes, design_ref), ' ') AS text_value
         FROM database_job_positions
         WHERE source_order_id = ANY($1::int[])
         GROUP BY source_order_id
       ),
       line_item_text AS (
         SELECT source_order_id,
                STRING_AGG(line_description, ' ') AS text_value
         FROM database_job_line_items
         WHERE source_order_id = ANY($1::int[])
         GROUP BY source_order_id
       )
       SELECT j.source_order_id,
              j.order_no,
              j.order_date,
              j.job_title,
              CONCAT_WS(' ',
                j.job_title,
                j.client_order_no,
                j.screen_numbers,
                j.comments,
                position_text.text_value,
                line_item_text.text_value
              ) AS reference_source_text
       FROM database_jobs j
       LEFT JOIN position_text ON position_text.source_order_id = j.source_order_id
       LEFT JOIN line_item_text ON line_item_text.source_order_id = j.source_order_id
       WHERE j.source_order_id = ANY($1::int[])`,
      [sourceOrderIds]
    ),
  ]);

  const referencesByOrder = new Map();
  const orderById = new Map();
  for (const row of referenceResult.rows) {
    const sourceOrderId = Number(row.source_order_id);
    if (!Number.isFinite(sourceOrderId)) continue;

    const references = extractOrderDesignReferences(row.reference_source_text).join(', ');
    referencesByOrder.set(sourceOrderId, references);
    orderById.set(sourceOrderId, {
      source_order_id: row.source_order_id,
      order_no: row.order_no,
      order_date: row.order_date,
      job_title: row.job_title,
    });
  }

  const rows = designResult.rows.map((row) => ({
    ...row,
    design_ref: displayDesignReference(row.design_ref),
    psg_numbers: referencesByOrder.get(Number(row.source_order_id)) || '',
  }));
  const designOrderIds = new Set(rows.map((row) => Number(row.source_order_id)));

  for (const [sourceOrderId, psgNumbers] of referencesByOrder.entries()) {
    if (!psgNumbers || designOrderIds.has(sourceOrderId)) continue;
    const order = orderById.get(sourceOrderId);
    if (!order) continue;
    rows.push({
      design_ref: '',
      psg_numbers: psgNumbers,
      ...order,
    });
  }

  return collapseCustomerDesignNumberRows(rows).sort(compareCustomerDesignNumberRows);
}

const STITCH_REFERENCE_LABEL = String.raw`(?:STITCH[\s._/-]*COUNT|STITCHES?|S[\s._/-]*T(?:[\s._/-]*(?:S|C))?)`;
const PSG_REFERENCE_PATTERN = new RegExp(
  String.raw`\bP[\s._/-]*S[\s._/-]*G(?:[\s:._#/-]*(?:NO\.?|NUM(?:BER)?)?[\s:._#/-]*)?(\d+\s*[A-Z]?)\b` +
    String.raw`(?:\s*(?:[,;/|+&-]\s*)?(?:${STITCH_REFERENCE_LABEL}[\s:._#/-]*(\d[\d,\s]*\d)|(\d[\d,\s]*\d)))?`,
  'gi'
);
const STITCH_REFERENCE_PATTERN = new RegExp(
  String.raw`\b${STITCH_REFERENCE_LABEL}(?:[\s:._#/-]*(?:NO\.?|NUM(?:BER)?)?[\s:._#/-]*)?(\d[\d,\s]*\d)\b`,
  'gi'
);

function extractOrderDesignReferences(value) {
  const psgReferences = [];
  const stitchReferences = [];
  const seen = new Set();
  const text = String(value || '');
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;

  let match;
  while ((match = PSG_REFERENCE_PATTERN.exec(text))) {
    addOrderDesignReference(psgReferences, seen, 'PSG', match[1]);
    addOrderDesignReference(stitchReferences, seen, 'ST', match[2] || match[3]);
  }

  while ((match = STITCH_REFERENCE_PATTERN.exec(text))) {
    addOrderDesignReference(stitchReferences, seen, 'ST', match[1]);
  }

  return [...psgReferences, ...stitchReferences];
}

function addOrderDesignReference(references, seen, prefix, rawValue) {
  const value = prefix === 'PSG'
    ? String(rawValue || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    : String(rawValue || '').replace(/\D/g, '');
  if (!value) return;

  const reference = `${prefix}${value}`;
  if (seen.has(reference)) return;
  seen.add(reference);
  references.push(reference);
}

function displayDesignReference(value) {
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;
  const withoutReferences = String(value || '')
    .replace(PSG_REFERENCE_PATTERN, ' ')
    .replace(STITCH_REFERENCE_PATTERN, ' ');
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;

  return withoutReferences
    .replace(/\s+/g, ' ')
    .replace(/^[,;:/|._\-\s]+|[,;:/|._\-\s]+$/g, '')
    .trim();
}

function collapseCustomerDesignNumberRows(rows) {
  const mergedByOrder = new Map();

  for (const row of rows || []) {
    const sourceOrderId = Number(row.source_order_id);
    const key = Number.isFinite(sourceOrderId) ? `source:${sourceOrderId}` : `order:${row.order_no || ''}`;
    const existing = mergedByOrder.get(key);

    if (!existing) {
      mergedByOrder.set(key, {
        ...row,
        design_ref: cleanMergedList(row.design_ref),
        psg_numbers: cleanMergedList(row.psg_numbers),
      });
      continue;
    }

    existing.design_ref = mergeReferenceLists(existing.design_ref, row.design_ref);
    existing.psg_numbers = mergeReferenceLists(existing.psg_numbers, row.psg_numbers);
    existing.order_no = existing.order_no || row.order_no;
    existing.order_date = existing.order_date || row.order_date;
    existing.job_title = existing.job_title || row.job_title;
  }

  return Array.from(mergedByOrder.values())
    .filter((row) => cleanQuery(row.design_ref) || cleanQuery(row.psg_numbers));
}

function mergeReferenceLists(left, right) {
  const values = [];
  const seen = new Set();

  for (const value of [...splitReferenceList(left), ...splitReferenceList(right)]) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }

  return values.join(', ');
}

function cleanMergedList(value) {
  return mergeReferenceLists('', value);
}

function splitReferenceList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function compareCustomerDesignNumberRows(a, b) {
  const designA = cleanQuery(a.design_ref);
  const designB = cleanQuery(b.design_ref);
  if (designA && !designB) return -1;
  if (!designA && designB) return 1;

  const byDesign = designA.localeCompare(designB, undefined, { sensitivity: 'base' });
  if (byDesign) return byDesign;

  const byOrder = Number(a.order_no || 0) - Number(b.order_no || 0);
  if (byOrder) return byOrder;

  return Number(a.source_order_id || 0) - Number(b.source_order_id || 0);
}

async function resolveCustomerContactContext(customerKey) {
  if (customerKey.type === 'profile') {
    const profile = await pool.query(
      `SELECT id, customer_id, customer_name
       FROM database_customer_profiles
       WHERE id = $1
       LIMIT 1`,
      [customerKey.value]
    );

    if (!profile.rowCount) return null;
    const row = profile.rows[0];
    return {
      profile_id: row.id,
      customer_id: isFiniteDatabaseValue(row.customer_id) ? Number(row.customer_id) : null,
      customer_name: row.customer_name,
    };
  }

  const where = customerKey.type === 'id'
    ? 'customer_id = $1'
    : 'LOWER(customer_name) = LOWER($1)';

  const result = await pool.query(
    `SELECT customer_id, customer_name
     FROM database_jobs
     WHERE ${where}
       AND customer_name IS NOT NULL
       AND customer_name <> ''
     ORDER BY COALESCE(order_date, updated_at_source, created_at_source) DESC NULLS LAST,
              order_no DESC NULLS LAST
     LIMIT 1`,
    [customerKey.value]
  );

  if (!result.rowCount) return null;

  return {
    profile_id: null,
    customer_id: isFiniteDatabaseValue(result.rows[0].customer_id) ? Number(result.rows[0].customer_id) : null,
    customer_name: result.rows[0].customer_name,
  };
}

function contactScopeClause(context, startIndex) {
  const clauses = [];
  const params = [];

  if (isFiniteDatabaseValue(context?.profile_id)) {
    params.push(Number(context.profile_id));
    clauses.push(`profile_id = $${startIndex + params.length - 1}`);
  }

  if (isFiniteDatabaseValue(context?.customer_id)) {
    params.push(Number(context.customer_id));
    clauses.push(`customer_id = $${startIndex + params.length - 1}`);
  }

  const customerName = cleanNullable(context?.customer_name);
  if (customerName) {
    params.push(customerName);
    clauses.push(`LOWER(customer_name) = LOWER($${startIndex + params.length - 1})`);
  }

  return {
    clause: clauses.join(' OR '),
    params,
  };
}

function manualContactToContact(contact) {
  return {
    contact_id: contact.source_contact_id || null,
    contact_row_id: contact.id || null,
    manual_contact_id: contact.id || null,
    contact_title: contact.contact_title || null,
    contact_first_name: contact.contact_first_name || null,
    contact_last_name: contact.contact_last_name || null,
    contact_name: contact.contact_name || contactNameFromParts(
      contact.contact_title,
      contact.contact_first_name,
      contact.contact_last_name
    ),
    contact_phone: contact.contact_phone || null,
    contact_fax: contact.contact_fax || null,
    contact_mobile: contact.contact_mobile || null,
    contact_email: contact.contact_email || null,
    contact_address: contact.contact_address || null,
    latest_order_no: null,
    latest_source_order_id: null,
    order_count: 0,
    first_seen_at: contact.created_at_source || null,
    last_seen_at: contact.updated_at_source || contact.created_at_source || null,
  };
}

function contactHasAnyValue(payload) {
  return [
    payload?.contact_title,
    payload?.contact_first_name,
    payload?.contact_last_name,
    payload?.contact_phone,
    payload?.contact_fax,
    payload?.contact_mobile,
    payload?.contact_email,
    payload?.contact_address,
  ].some((value) => cleanQuery(value));
}

function groupedContacts(orders, profile = null, manualContactRows = []) {
  const contacts = new Map();

  for (const contact of manualContactRows || []) {
    const normalizedContact = manualContactToContact(contact);
    const key = isFiniteDatabaseValue(normalizedContact.contact_id)
      ? `id:${normalizedContact.contact_id}`
      : `manual:${contact.id}`;
    contacts.set(key, normalizedContact);
  }

  if (
    profile &&
    (profile.contact_name || profile.contact_phone || profile.contact_mobile || profile.contact_email)
  ) {
    const key = [
      profile.contact_name,
      profile.contact_phone,
      profile.contact_mobile,
      profile.contact_email,
    ].map((value) => cleanQuery(value).toLowerCase()).join('|');

    contacts.set(key, {
      contact_id: null,
      contact_row_id: null,
      manual_contact_id: null,
      contact_title: null,
      contact_first_name: null,
      contact_last_name: null,
      contact_name: profile.contact_name || null,
      contact_phone: profile.contact_phone || null,
      contact_fax: null,
      contact_mobile: profile.contact_mobile || null,
      contact_email: profile.contact_email || null,
      contact_address: profile.invoice_address || null,
      latest_order_no: null,
      latest_source_order_id: null,
      order_count: 0,
      first_seen_at: profile.created_at_source || null,
      last_seen_at: profile.updated_at_source || profile.created_at_source || null,
    });
  }

  for (const order of orders) {
    if (!order.contact_name && !order.contact_phone && !order.contact_mobile && !order.contact_email) continue;

    const key = isFiniteDatabaseValue(order.contact_id)
      ? `id:${order.contact_id}`
      : [
          order.contact_name,
          order.contact_phone,
          order.contact_mobile,
          order.contact_email,
        ].map((value) => cleanQuery(value).toLowerCase()).join('|');

    const existing = contacts.get(key) || {
      contact_id: order.contact_id || null,
      contact_row_id: null,
      manual_contact_id: null,
      contact_title: null,
      contact_first_name: null,
      contact_last_name: null,
      contact_name: order.contact_name || null,
      contact_phone: order.contact_phone || null,
      contact_fax: null,
      contact_mobile: order.contact_mobile || null,
      contact_email: order.contact_email || null,
      contact_address: null,
      latest_order_no: order.order_no || null,
      latest_source_order_id: order.source_order_id || null,
      order_count: 0,
      first_seen_at: seenDate(order),
      last_seen_at: seenDate(order),
    };

    existing.contact_name = existing.contact_name || order.contact_name || null;
    existing.contact_phone = existing.contact_phone || order.contact_phone || null;
    existing.contact_mobile = existing.contact_mobile || order.contact_mobile || null;
    existing.contact_email = existing.contact_email || order.contact_email || null;
    existing.order_count += 1;

    if (!existing.latest_order_no || isLater(seenDate(order), existing.last_seen_at)) {
      existing.latest_order_no = order.order_no || null;
      existing.latest_source_order_id = order.source_order_id || null;
      existing.last_seen_at = seenDate(order);
    }

    if (isEarlier(seenDate(order), existing.first_seen_at)) {
      existing.first_seen_at = seenDate(order);
    }

    contacts.set(key, existing);
  }

  return Array.from(contacts.values()).sort((a, b) => {
    const byName = cleanQuery(a.contact_name).localeCompare(cleanQuery(b.contact_name), 'en', { sensitivity: 'base' });
    if (byName) return byName;
    return Number(b.latest_order_no || 0) - Number(a.latest_order_no || 0);
  });
}

function groupedAddresses(orders, addressRows = [], profile = null) {
  const addresses = new Map();

  if (profile) {
    addProfileAddress(addresses, profile, 'invoice');
    addProfileAddress(addresses, profile, 'delivery');
  }

  for (const address of addressRows) {
    addImportedAddress(addresses, address, orders);
  }

  for (const order of orders) {
    if (!order.invoice_address_id) {
      addAddress(addresses, order, 'Invoice', order.invoice_address);
    }
    if (!order.delivery_address_id) {
      addAddress(addresses, order, 'Delivery', order.delivery_address);
    }
  }

  return Array.from(addresses.values()).sort((a, b) => {
    const byDate = dateTime(b.last_seen_at) - dateTime(a.last_seen_at);
    if (byDate) return byDate;
    return a.address.localeCompare(b.address, 'en', { sensitivity: 'base' });
  });
}

function addProfileAddress(addresses, profile, role) {
  const fields = customerProfileAddressFields(profile, role);
  if (!fields.address) return;

  const key = normalizedAddressKey(fields.address);
  const addressType = role === 'invoice' ? 'Invoice' : 'Delivery';
  const existing = addresses.get(key) || {
    source_address_id: null,
    address_type: addressType,
    address: fields.address,
    address_line1: fields.line1,
    address_line2: fields.line2,
    address_line3: fields.line3,
    address_line4: fields.line4,
    address_line5: fields.line5,
    postcode: fields.postcode,
    phone: fields.phone || null,
    fax: fields.fax || null,
    mobile: profile.contact_mobile || null,
    created_at_source: profile.created_at_source || null,
    updated_at_source: profile.updated_at_source || null,
    updated_by: profile.updated_by_name || null,
    latest_order_no: null,
    latest_source_order_id: null,
    order_count: 0,
    first_seen_at: profile.created_at_source || null,
    last_seen_at: profile.updated_at_source || profile.created_at_source || null,
  };

  existing.address_type = mergedAddressType(existing.address_type, [addressType]);
  existing.address_line1 = existing.address_line1 || fields.line1 || null;
  existing.address_line2 = existing.address_line2 || fields.line2 || null;
  existing.address_line3 = existing.address_line3 || fields.line3 || null;
  existing.address_line4 = existing.address_line4 || fields.line4 || null;
  existing.address_line5 = existing.address_line5 || fields.line5 || null;
  existing.postcode = existing.postcode || fields.postcode || null;
  existing.phone = existing.phone || fields.phone || null;
  existing.fax = existing.fax || fields.fax || null;
  existing.mobile = existing.mobile || profile.contact_mobile || null;
  existing.updated_by = existing.updated_by || profile.updated_by_name || null;

  addresses.set(key, existing);
}

function addImportedAddress(addresses, addressRow, orders) {
  const address = formatImportedAddress(addressRow);
  if (!address) return;

  const sourceAddressId = Number(addressRow.source_address_id);
  const matchingOrders = orders.filter((order) => (
    Number(order.invoice_address_id) === sourceAddressId ||
    Number(order.delivery_address_id) === sourceAddressId
  ));
  const latestOrder = matchingOrders[0] || null;
  const roles = new Set(splitAddressRoles(addressRow.address_type));

  for (const order of matchingOrders) {
    if (Number(order.invoice_address_id) === sourceAddressId) roles.add('Invoice');
    if (Number(order.delivery_address_id) === sourceAddressId) roles.add('Delivery');
  }

  const key = normalizedAddressKey(address);
  const existing = addresses.get(key) || {
    source_address_id: addressRow.source_address_id || null,
    address_type: roles.size ? Array.from(roles).join(' / ') : 'Address',
    address,
    address_line1: addressRow.address_line1 || null,
    address_line2: addressRow.address_line2 || null,
    address_line3: addressRow.address_line3 || null,
    address_line4: addressRow.address_line4 || null,
    address_line5: addressRow.address_line5 || null,
    postcode: addressRow.postcode || null,
    phone: addressRow.phone || null,
    fax: addressRow.fax || null,
    mobile: addressRow.mobile || null,
    created_at_source: addressRow.created_at_source || null,
    updated_at_source: addressRow.updated_at_source || null,
    updated_by: addressRow.trace_staff_id || null,
    latest_order_no: latestOrder?.order_no || null,
    latest_source_order_id: latestOrder?.source_order_id || null,
    order_count: matchingOrders.length,
    first_seen_at: addressRow.created_at_source || latestOrder?.order_date || null,
    last_seen_at: addressRow.updated_at_source || addressRow.created_at_source || latestOrder?.order_date || null,
  };

  if (existing !== addresses.get(key)) {
    addresses.set(key, existing);
    return;
  }

  existing.address_type = mergedAddressType(existing.address_type, roles);
  existing.address_line1 = existing.address_line1 || addressRow.address_line1 || null;
  existing.address_line2 = existing.address_line2 || addressRow.address_line2 || null;
  existing.address_line3 = existing.address_line3 || addressRow.address_line3 || null;
  existing.address_line4 = existing.address_line4 || addressRow.address_line4 || null;
  existing.address_line5 = existing.address_line5 || addressRow.address_line5 || null;
  existing.postcode = existing.postcode || addressRow.postcode || null;
  existing.phone = existing.phone || addressRow.phone || null;
  existing.fax = existing.fax || addressRow.fax || null;
  existing.mobile = existing.mobile || addressRow.mobile || null;
  existing.created_at_source = existing.created_at_source || addressRow.created_at_source || null;
  existing.updated_at_source = existing.updated_at_source || addressRow.updated_at_source || null;
  existing.updated_by = existing.updated_by || addressRow.trace_staff_id || null;
  existing.order_count = Math.max(existing.order_count || 0, matchingOrders.length);

  if (latestOrder && isLater(seenDate(latestOrder), existing.last_seen_at)) {
    existing.latest_order_no = latestOrder.order_no || null;
    existing.latest_source_order_id = latestOrder.source_order_id || null;
    existing.last_seen_at = seenDate(latestOrder);
  }
}

function addAddress(addresses, order, addressType, address) {
  const cleanAddress = cleanQuery(address);
  if (!cleanAddress) return;

  const key = normalizedAddressKey(cleanAddress);
  const fields = splitAddressFields(cleanAddress);
  const existing = addresses.get(key) || {
    address_type: addressType,
    address: cleanAddress,
    ...fields,
    latest_order_no: order.order_no || null,
    latest_source_order_id: order.source_order_id || null,
    order_count: 0,
    first_seen_at: seenDate(order),
    last_seen_at: seenDate(order),
  };

  existing.address_type = mergedAddressType(existing.address_type, [addressType]);
  existing.order_count += 1;

  if (isLater(seenDate(order), existing.last_seen_at)) {
    existing.latest_order_no = order.order_no || null;
    existing.latest_source_order_id = order.source_order_id || null;
    existing.last_seen_at = seenDate(order);
  }

  if (isEarlier(seenDate(order), existing.first_seen_at)) {
    existing.first_seen_at = seenDate(order);
  }

  addresses.set(key, existing);
}

function formatImportedAddress(address) {
  return [
    address.address_line1,
    address.address_line2,
    address.address_line3,
    address.address_line4,
    address.address_line5,
    address.postcode,
  ].map(cleanQuery).filter(Boolean).join(', ');
}

function splitAddressFields(address) {
  const parts = cleanQuery(address)
    .split(/\r?\n|,\s*/)
    .map((part) => cleanQuery(part))
    .filter(Boolean);

  return {
    address_line1: parts[0] || null,
    address_line2: parts[1] || null,
    address_line3: parts[2] || null,
    address_line4: parts[3] || null,
    address_line5: parts[4] || null,
    postcode: parts[5] || null,
    phone: null,
    fax: null,
    mobile: null,
    created_at_source: null,
    updated_at_source: null,
    updated_by: null,
  };
}

function normalizedCustomerAddress(payload, prefix) {
  const fieldPrefix = prefix === 'delivery' ? 'delivery' : 'invoice';
  const lines = [1, 2, 3, 4, 5].map((index) => (
    cleanNullable(payload?.[`${fieldPrefix}_address_line${index}`])
  ));
  const postcode = cleanNullable(payload?.[`${fieldPrefix}_postcode`]);
  const phone = cleanNullable(payload?.[`${fieldPrefix}_phone`]);
  const fax = cleanNullable(payload?.[`${fieldPrefix}_fax`]);
  const suppliedAddress = cleanNullable(payload?.[`${fieldPrefix}_address`]);
  const normalized = normalizedUkPostcodeAddressParts(lines, postcode);
  const address = suppliedAddress || [...normalized.lines, normalized.postcode].filter(Boolean).join(', ') || null;

  return {
    address,
    line1: normalized.lines[0],
    line2: normalized.lines[1],
    line3: normalized.lines[2],
    line4: normalized.lines[3],
    line5: normalized.lines[4],
    postcode: normalized.postcode,
    phone,
    fax,
  };
}

function normalizedUkPostcodeAddressParts(lines, postcode) {
  const normalizedLines = (lines || []).map((line) => cleanNullable(line));
  let normalizedPostcode = formatUkPostcode(postcode) || cleanNullable(postcode);

  for (let index = normalizedLines.length - 1; index >= 0; index -= 1) {
    const extracted = extractUkPostcodeFromAddressLine(normalizedLines[index]);
    if (!extracted) continue;
    normalizedLines[index] = extracted.remaining || null;
    if (
      !normalizedPostcode
      || compactPostcode(normalizedPostcode) === compactPostcode(extracted.postcode)
    ) {
      normalizedPostcode = extracted.postcode;
    }
  }

  while (normalizedLines.length < 5) normalizedLines.push(null);
  return {
    lines: normalizedLines.slice(0, 5),
    postcode: normalizedPostcode || null,
  };
}

function extractUkPostcodeFromAddressLine(value) {
  const clean = cleanNullable(value);
  if (!clean) return null;
  const exact = formatUkPostcode(clean);
  if (exact) return { postcode: exact, remaining: null };

  const match = clean.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  if (!match) return null;
  const postcode = formatUkPostcode(match[1]);
  if (!postcode) return null;
  const remaining = clean
    .replace(match[0], '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  return { postcode, remaining: remaining || null };
}

function formatUkPostcode(value) {
  const compact = compactPostcode(value);
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

function compactPostcode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function customerProfileAddressFields(profile, role) {
  const prefix = role === 'delivery' ? 'delivery' : 'invoice';
  const lines = [1, 2, 3, 4, 5].map((index) => (
    cleanNullable(profile?.[`${prefix}_address_line${index}`])
  ));
  const postcode = cleanNullable(profile?.[`${prefix}_postcode`]);
  const phone = cleanNullable(profile?.[`${prefix}_phone`]);
  const fax = cleanNullable(profile?.[`${prefix}_fax`]);
  const normalized = normalizedUkPostcodeAddressParts(lines, postcode);
  const address = cleanNullable(profile?.[`${prefix}_address`]) || [...normalized.lines, normalized.postcode].filter(Boolean).join(', ') || null;

  return {
    address,
    line1: normalized.lines[0],
    line2: normalized.lines[1],
    line3: normalized.lines[2],
    line4: normalized.lines[3],
    line5: normalized.lines[4],
    postcode: normalized.postcode,
    phone,
    fax,
  };
}

function contactNameFromPayload(payload) {
  const contactName = cleanNullable(payload?.contact_name);
  if (contactName) return contactName;

  const parts = [
    payload?.contact_title,
    payload?.contact_first_name,
    payload?.contact_last_name,
  ].map(cleanQuery).filter(Boolean);

  return parts.length ? parts.join(' ') : null;
}

function contactNameFromParts(title, firstName, lastName) {
  const parts = [firstName, lastName].map(cleanQuery).filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

async function resolveAccountManager(userId, fallbackName) {
  if (isFiniteDatabaseValue(userId)) {
    const user = await pool.query(
      `SELECT id, first_name, last_name
       FROM hub_users
       WHERE id = $1
       LIMIT 1`,
      [Number(userId)]
    );

    if (!user.rowCount) {
      return { error: 'Account manager user was not found' };
    }

    return {
      userId: user.rows[0].id,
      name: fullName(user.rows[0]),
    };
  }

  return {
    userId: null,
    name: cleanNullable(fallbackName),
  };
}

function customerProfileToCustomer(profile) {
  return {
    customer_key: `profile:${profile.id}`,
    profile_id: profile.id,
    customer_id: profile.customer_id || null,
    business_name: profile.customer_name || null,
    customer_code: profile.customer_code || null,
    contact_name: profile.contact_name || null,
    contact_phone: profile.contact_phone || null,
    contact_mobile: profile.contact_mobile || null,
    contact_email: profile.contact_email || null,
    marketing_opt_in: Boolean(profile.marketing_opt_in),
    account_manager: profile.account_manager_name || null,
    account_manager_user_id: profile.account_manager_user_id || null,
    created_at_source: profile.created_at_source || null,
    updated_at_source: profile.updated_at_source || null,
    updated_by: profile.updated_by_name || null,
    latest_source_order_id: null,
    latest_order_no: null,
    latest_job_title: null,
    latest_order_date: null,
    latest_delivery_date: null,
    last_seen_at: profile.updated_at_source || profile.created_at_source || null,
    order_count: 0,
  };
}

function normalizedAddressKey(address) {
  return cleanQuery(address).replace(/\s+/g, ' ').toLowerCase();
}

function splitAddressRoles(value) {
  return cleanQuery(value)
    .split('/')
    .map((role) => cleanQuery(role))
    .filter(Boolean);
}

function mergedAddressType(current, roles) {
  const merged = new Set(splitAddressRoles(current));
  for (const role of roles) {
    const cleanRole = cleanQuery(role);
    if (cleanRole) merged.add(cleanRole);
  }
  return merged.size ? Array.from(merged).join(' / ') : 'Address';
}

function firstNonEmpty(rows, field) {
  const row = rows.find((item) => cleanQuery(item[field]));
  return row ? row[field] : null;
}

function firstFinite(rows, field) {
  const row = rows.find((item) => isFiniteDatabaseValue(item[field]));
  return row ? Number(row[field]) : null;
}

function isFiniteDatabaseValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function earliestDate(rows, field) {
  return rows
    .map((row) => row[field])
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || null;
}

function latestDate(rows, field) {
  return rows
    .map((row) => row[field])
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

function seenDate(order) {
  return order.order_date || order.updated_at_source || order.created_at_source || null;
}

function dateTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isLater(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() > new Date(current).getTime();
}

function isEarlier(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() < new Date(current).getTime();
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || cleanQuery(value).toLowerCase() === 'true';
}

router.initRalawiseOrderHistoryPoller = initRalawiseOrderHistoryPoller;
router.syncRalawisePlacedOrders = syncRalawisePlacedOrders;

module.exports = router;
