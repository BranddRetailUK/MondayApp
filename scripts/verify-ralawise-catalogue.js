#!/usr/bin/env node

require('dotenv').config();

const { Client } = require('pg');

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
        AND p.style_id IN (959, 1179, 1372)
      GROUP BY p.style_id
      ORDER BY p.style_id
    `,
    importRuns: `
      SELECT id, status, row_count, style_count, colour_count, variant_count,
             live_count, discontinued_count, report -> 'applied' AS applied,
             started_at, finished_at
      FROM database_ralawise_catalog_imports
      ORDER BY id DESC
      LIMIT 3
    `,
  };

  try {
    for (const [name, sql] of Object.entries(queries)) {
      const result = await client.query(sql);
      console.log(`${name}=${JSON.stringify(result.rows)}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[ralawise-catalogue-verify] ${error.message}`);
  process.exitCode = 1;
});
