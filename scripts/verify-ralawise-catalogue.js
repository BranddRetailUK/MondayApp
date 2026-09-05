#!/usr/bin/env node

require('dotenv').config();

const { Client } = require('pg');
const { buildJobBasketPlan } = require('../src/services/stockOrderingRalawise');
const {
  TEST_DASHBOARD_COLUMN_IDS,
  TEST_DASHBOARD_GROUP_IDS,
} = require('../src/services/testDashboardDefaults');

function connectionString() {
  return process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || null;
}

async function main() {
  const url = connectionString();
  if (!url) throw new Error('DATABASE_PUBLIC_URL or DATABASE_URL is required');
  const client = new Client({
    connectionString: url,
    ssl: (process.env.PGSSLMODE || 'require') === 'disable'
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();

  const queries = {
    catalogueCounts: `
      SELECT (SELECT COUNT(*) FROM database_ralawise_catalog_styles)::int AS styles,
             (SELECT COUNT(*) FROM database_ralawise_catalog_colours)::int AS colours,
             (SELECT COUNT(*) FROM database_ralawise_catalog_variants)::int AS variants,
             (SELECT COUNT(*) FROM database_ralawise_catalog_images)::int AS images
    `,
    productCounts: `
      SELECT COUNT(*)::int AS total_products,
             COUNT(*) FILTER (WHERE source_product_id < 0)::int AS catalogue_only,
             COUNT(*) FILTER (
               WHERE source_product_id > 0
                 AND ralawise_catalog_variant_id IS NOT NULL
             )::int AS enriched_access,
             COUNT(DISTINCT ralawise_sku) FILTER (
               WHERE source_product_id > 0
                 AND ralawise_catalog_variant_id IS NOT NULL
             )::int AS enriched_unique_skus
      FROM database_products
    `,
    variantStatuses: `
      SELECT sku_status, is_active, COUNT(*)::int AS variants
      FROM database_ralawise_catalog_variants
      GROUP BY sku_status, is_active
      ORDER BY sku_status, is_active
    `,
    catalogueProductStatuses: `
      SELECT catalogue_status, is_product_active, COUNT(*)::int AS products
      FROM database_products
      WHERE source_product_id < 0
      GROUP BY catalogue_status, is_product_active
      ORDER BY catalogue_status, is_product_active
    `,
    lineIdentityCounts: `
      SELECT COUNT(*)::int AS total_lines,
             COUNT(*) FILTER (WHERE source_product_id > 0)::int AS historical_access_lines,
             COUNT(*) FILTER (WHERE ralawise_catalog_variant_id IS NOT NULL)::int AS canonical_lines,
             COUNT(*) FILTER (
               WHERE source_product_id > 0
                 AND ralawise_catalog_variant_id IS NOT NULL
             )::int AS canonical_historical_access_lines,
             COUNT(*) FILTER (
               WHERE source_product_id > 0
                 AND ralawise_catalog_variant_id IS NULL
             )::int AS unmapped_historical_access_lines
      FROM database_job_line_items
    `,
    lineIdentityIntegrity: `
      SELECT COUNT(*) FILTER (WHERE v.id IS NULL)::int AS orphan_variant_links,
             COUNT(*) FILTER (
               WHERE NULLIF(BTRIM(li.ralawise_sku), '') IS DISTINCT FROM v.sku_code
             )::int AS sku_mismatches,
             COUNT(*) FILTER (
               WHERE NULLIF(BTRIM(li.supplier_style_code), '') IS DISTINCT FROM s.style_code
             )::int AS style_code_mismatches,
             COUNT(*) FILTER (
               WHERE NULLIF(BTRIM(li.supplier_colour_code), '') IS DISTINCT FROM c.colour_code
             )::int AS colour_code_mismatches,
             COUNT(*) FILTER (
               WHERE NULLIF(BTRIM(li.supplier_size_code), '') IS DISTINCT FROM v.size_code
             )::int AS size_code_mismatches
      FROM database_job_line_items li
      LEFT JOIN database_ralawise_catalog_variants v ON v.id = li.ralawise_catalog_variant_id
      LEFT JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
      LEFT JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
      WHERE li.ralawise_catalog_variant_id IS NOT NULL
    `,
    imageUrlIntegrity: `
      SELECT (
               SELECT COUNT(*)
               FROM database_ralawise_catalog_variants
               WHERE LOWER(BTRIM(COALESCE(primary_image_url, ''))) = 'not available'
             )::int AS variant_sentinels,
             (
               SELECT COUNT(*)
               FROM database_ralawise_catalog_variants
               WHERE primary_image_url IS NOT NULL
                 AND primary_image_url !~* '^https://'
             )::int AS non_https_variant_images,
             (
               SELECT COUNT(*)
               FROM database_ralawise_catalog_images
               WHERE LOWER(BTRIM(COALESCE(source_url, ''))) = 'not available'
             )::int AS retained_image_sentinels
    `,
    approvedStyleAssignments: `
      SELECT style_code, database_product_style_id
      FROM database_ralawise_catalog_styles
      WHERE style_code IN ('GD005', 'PR150')
      ORDER BY style_code
    `,
    approvedAccessLinks: `
      SELECT p.style_id,
             COUNT(*)::int AS linked_rows,
             COUNT(DISTINCT v.sku_code)::int AS unique_skus,
             MIN(s.style_code) AS catalogue_style,
             MAX(s.style_code) AS catalogue_style_max
      FROM database_products p
      JOIN database_ralawise_catalog_variants v
        ON v.id = p.ralawise_catalog_variant_id
      JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
      WHERE p.source_product_id > 0
        AND p.style_id IN (
          959, 1155, 1179, 1349, 1372, 1418, 1472, 1531,
          2563, 2662, 2766, 2795, 3587, 3595, 3677
        )
      GROUP BY p.style_id
      ORDER BY p.style_id
    `,
    rejectedAccessLinks: `
      SELECT style_id,
             COUNT(*) FILTER (WHERE ralawise_catalog_variant_id IS NOT NULL)::int AS unsafe_links
      FROM database_products
      WHERE source_product_id > 0
        AND style_id IN (3670, 3671)
      GROUP BY style_id
      ORDER BY style_id
    `,
    importRuns: `
      SELECT id, status, row_count, style_count, colour_count, variant_count,
             live_count, discontinued_count, report -> 'applied' AS applied,
             started_at, finished_at
      FROM database_ralawise_catalog_imports
      ORDER BY id DESC
      LIMIT 3
    `,
    stockOrderingLines: `
      WITH candidate_jobs AS (
        SELECT j.source_order_id,
               j.order_no,
               s.group_id,
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
        WHERE j.is_complete IS NOT TRUE
          AND s.archived IS NOT TRUE
      ),
      filtered_jobs AS (
        SELECT source_order_id, order_no
        FROM candidate_jobs
        WHERE job_category <> 'gifts'
          AND normalized_status NOT IN (
            'READY TO PRINT', 'TRANSFER PRINTING', 'IN PRODUCTION', 'CHECKED IN',
            'COMPLETED', 'INVOICED', 'STOCK ORDERED', 'ORDERED'
          )
          AND normalized_db_status NOT IN (
            'READY TO PRINT', 'TRANSFER PRINTING', 'IN PRODUCTION', 'CHECKED IN',
            'COMPLETED', 'INVOICED', 'STOCK ORDERED', 'ORDERED'
          )
          AND normalized_state_status NOT IN (
            'READY TO PRINT', 'TRANSFER PRINTING', 'IN PRODUCTION', 'CHECKED IN',
            'COMPLETED', 'INVOICED', 'STOCK ORDERED', 'ORDERED'
          )
          AND COALESCE(group_id, '') <> ALL($1::text[])
          AND EXISTS (
            SELECT 1
            FROM database_job_line_items product_line
            WHERE product_line.source_order_id = candidate_jobs.source_order_id
              AND product_line.is_non_deliverable IS NOT TRUE
              AND product_line.is_internal IS NOT TRUE
              AND (
                product_line.source_product_id IS NOT NULL
                OR NULLIF(BTRIM(COALESCE(product_line.style_code, '')), '') IS NOT NULL
                OR NULLIF(BTRIM(COALESCE(product_line.style_name, '')), '') IS NOT NULL
              )
          )
      )
      SELECT fj.source_order_id,
             fj.order_no,
             li.source_order_item_id,
             li.source_product_id,
             li.line_description,
             li.style_code,
             li.style_name,
             li.colour,
             li.size,
             li.quantity,
             li.ralawise_catalog_variant_id,
             p.ralawise_catalog_variant_id AS product_catalog_variant_id,
             COALESCE(NULLIF(BTRIM(li.ralawise_sku), ''), v.sku_code) AS ralawise_sku,
             COALESCE(NULLIF(BTRIM(li.catalogue_status), ''), v.sku_status) AS ralawise_catalog_status
      FROM filtered_jobs fj
      JOIN database_job_line_items li ON li.source_order_id = fj.source_order_id
      LEFT JOIN database_products p ON p.source_product_id = li.source_product_id
      LEFT JOIN database_ralawise_catalog_variants v
        ON v.id = COALESCE(li.ralawise_catalog_variant_id, p.ralawise_catalog_variant_id)
      WHERE li.is_non_deliverable IS NOT TRUE
        AND li.is_internal IS NOT TRUE
      ORDER BY fj.source_order_id,
               COALESCE(li.line_sort_order, li.source_order_item_id),
               li.source_order_item_id
    `,
  };

  try {
    for (const [name, sql] of Object.entries(queries)) {
      const params = name === 'stockOrderingLines'
        ? [[
          TEST_DASHBOARD_GROUP_IDS.PRINT,
          TEST_DASHBOARD_GROUP_IDS.EMBROIDERY,
          TEST_DASHBOARD_GROUP_IDS.COMPLETED,
        ]]
        : [];
      const result = await client.query(sql, params);
      if (name !== 'stockOrderingLines') {
        console.log(`${name}=${JSON.stringify(result.rows)}`);
        continue;
      }

      const jobs = new Map();
      for (const line of result.rows) {
        const id = Number(line.source_order_id);
        if (!jobs.has(id)) jobs.set(id, { source_order_id: id, order_no: line.order_no, lines: [] });
        jobs.get(id).lines.push(line);
      }
      const coverage = Array.from(jobs.values()).map((job) => {
        const plan = buildJobBasketPlan(job, job.lines);
        return {
          source_order_id: job.source_order_id,
          order_no: job.order_no,
          eligible: plan.eligible,
          product_lines: plan.product_line_count,
          mapped_lines: plan.resolved_line_count,
          total_quantity: plan.total_quantity,
          unresolved: plan.unresolved.map((item) => {
            const line = job.lines.find((candidate) => (
              Number(candidate.source_order_item_id) === Number(item.source_order_item_id)
            ));
            return line
              ? {
                ...item,
                source_product_id: line.source_product_id,
                line_variant_id: line.ralawise_catalog_variant_id,
                product_variant_id: line.product_catalog_variant_id,
              }
              : item;
          }),
        };
      });
      console.log(`${name}=${JSON.stringify(coverage)}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[ralawise-catalogue-verify] ${error.message}`);
  process.exitCode = 1;
});
