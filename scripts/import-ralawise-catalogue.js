#!/usr/bin/env node

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { ensureDatabaseTables } = require('../src/db/databaseSchema');
const {
  auditCatalogueFile,
  imageSourceKey,
  matchExistingProducts,
} = require('../src/services/ralawiseCatalogue');

const DEFAULT_BATCH_SIZE = 750;
const IMPORT_LOCK_ID = 7120260716;

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  if (dryRun === apply) {
    throw new Error('Choose exactly one mode: --dry-run or --apply');
  }

  let fileValue = null;
  const fileEquals = args.find((arg) => arg.startsWith('--file='));
  if (fileEquals) fileValue = fileEquals.slice('--file='.length);
  const fileIndex = args.indexOf('--file');
  if (fileIndex >= 0) fileValue = args[fileIndex + 1];
  if (!fileValue || fileValue.startsWith('--')) {
    throw new Error('An explicit catalogue path is required with --file <path>');
  }

  const batchOption = args.find((arg) => arg.startsWith('--batch-size='));
  const batchSize = batchOption
    ? Number.parseInt(batchOption.slice('--batch-size='.length), 10)
    : DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 50 || batchSize > 5000) {
    throw new Error('--batch-size must be an integer between 50 and 5000');
  }
  if (apply && !args.includes('--confirm-write')) {
    throw new Error('--apply requires --confirm-write after the database target has been verified');
  }

  return {
    help: false,
    dryRun,
    apply,
    confirmWrite: args.includes('--confirm-write'),
    filePath: path.resolve(process.cwd(), fileValue),
    batchSize,
    json: args.includes('--json'),
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-ralawise-catalogue.js --file <CustomerDataFull.csv> --dry-run [--batch-size=750]
  node scripts/import-ralawise-catalogue.js --file <CustomerDataFull.csv> --apply --confirm-write [--batch-size=750]

The importer streams RFC-compliant CSV records, including BOMs and embedded newlines.
Dry-run mode reads catalogue and existing product data but performs no schema or data writes.
Apply mode is an upsert/enrichment operation and never deletes catalogue or DATABASE products.
Add --json to print the complete machine-readable audit report.`);
}

function databaseConnectionString() {
  return process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || null;
}

function databaseTargetLabel(connectionString) {
  if (!connectionString) return 'not configured';
  try {
    const url = new URL(connectionString);
    return `${url.hostname}/${url.pathname.replace(/^\//, '') || '(default)'}`;
  } catch (_error) {
    return 'configured PostgreSQL target';
  }
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function loadDatabaseState(client) {
  const productTableExists = await tableExists(client, 'database_products');
  if (!productTableExists) {
    return {
      products: [],
      existingCatalogueSkus: new Set(),
      styleCodes: new Set(),
      colourKeys: new Set(),
      variantSkus: new Set(),
      imageKeys: new Set(),
    };
  }

  const products = await client.query(`
    SELECT source_product_id, style_id, supplier_name, supplier_code,
           style_code, alt_style_code, colour, size, unit_cost
    FROM database_products
    WHERE source_product_id > 0
    ORDER BY source_product_id
  `);
  const state = {
    products: products.rows,
    existingCatalogueSkus: new Set(),
    styleCodes: new Set(),
    colourKeys: new Set(),
    variantSkus: new Set(),
    imageKeys: new Set(),
  };

  if (await tableExists(client, 'database_ralawise_catalog_styles')) {
    const result = await client.query('SELECT style_code FROM database_ralawise_catalog_styles');
    result.rows.forEach((row) => state.styleCodes.add(row.style_code));
  }
  if (await tableExists(client, 'database_ralawise_catalog_colours')) {
    const result = await client.query(`
      SELECT s.style_code, c.colour_code
      FROM database_ralawise_catalog_colours c
      JOIN database_ralawise_catalog_styles s ON s.id = c.style_id
    `);
    result.rows.forEach((row) => state.colourKeys.add(`${row.style_code}\u0000${row.colour_code}`));
  }
  if (await tableExists(client, 'database_ralawise_catalog_variants')) {
    const result = await client.query('SELECT sku_code FROM database_ralawise_catalog_variants');
    result.rows.forEach((row) => state.variantSkus.add(row.sku_code));
  }
  if (await tableExists(client, 'database_ralawise_catalog_images')) {
    const result = await client.query('SELECT source_key FROM database_ralawise_catalog_images');
    result.rows.forEach((row) => state.imageKeys.add(row.source_key));
  }

  const hasRalawiseSkuColumn = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'database_products'
        AND column_name = 'ralawise_sku'
    ) AS present
  `);
  if (hasRalawiseSkuColumn.rows[0]?.present) {
    const result = await client.query(`
      SELECT ralawise_sku
      FROM database_products
      WHERE source_product_id < 0
        AND NULLIF(BTRIM(ralawise_sku), '') IS NOT NULL
    `);
    result.rows.forEach((row) => state.existingCatalogueSkus.add(row.ralawise_sku));
  }

  return state;
}

function countMissing(values, existing) {
  let missing = 0;
  for (const value of values) if (!existing.has(value)) missing += 1;
  return missing;
}

function buildReport(catalogue, databaseState) {
  const matching = matchExistingProducts(catalogue, databaseState.products, {
    existingCatalogueSkus: databaseState.existingCatalogueSkus,
  });
  return {
    source: {
      bytes: catalogue.audit.bytes,
      sha256: catalogue.audit.sha256,
      records: catalogue.audit.rows,
      styles: catalogue.audit.styles,
      colours: catalogue.audit.colours,
      variants: catalogue.audit.variants,
      images: catalogue.audit.images,
      live: catalogue.audit.live,
      discontinued: catalogue.audit.discontinued,
      otherStatus: catalogue.audit.otherStatus,
      duplicateSkuCount: catalogue.audit.duplicateSkuCount,
      duplicateCombinationGroups: catalogue.audit.duplicateCombinationGroups,
      duplicateCombinationRows: catalogue.audit.duplicateCombinationRows,
      blankSizeCodeWithName: catalogue.audit.blankSizeCodeWithName,
      blankAllPrices: catalogue.audit.blankAllPrices,
      stylesWithMultiplePrimaryImages: catalogue.audit.stylesWithMultiplePrimaryImages,
    },
    catalogueUpserts: {
      stylesToInsert: countMissing(catalogue.styles.keys(), databaseState.styleCodes),
      coloursToInsert: countMissing(catalogue.colourKeys, databaseState.colourKeys),
      variantsToInsert: countMissing(catalogue.skuMap.keys(), databaseState.variantSkus),
      imagesToInsert: countMissing(catalogue.imageKeys, databaseState.imageKeys),
    },
    products: matching,
  };
}

function printableReport(report, mode, target) {
  const source = report.source;
  const products = report.products;
  return [
    `[ralawise-catalogue] Mode: ${mode}`,
    `[ralawise-catalogue] Database target: ${target}`,
    `[ralawise-catalogue] Source: ${source.records} records, ${source.styles} styles, ${source.colours} colours, ${source.variants} unique SKUs`,
    `[ralawise-catalogue] Status: ${source.live} Live, ${source.discontinued} Discontinued, ${source.otherStatus} other`,
    `[ralawise-catalogue] CSV audit: ${source.duplicateSkuCount} duplicate SKUs, ${source.duplicateCombinationGroups} duplicate style/colour/size groups, ${source.blankSizeCodeWithName} blank Size Codes with names`,
    `[ralawise-catalogue] Images: ${source.images} unique rows; ${source.stylesWithMultiplePrimaryImages} styles have multiple primary images`,
    `[ralawise-catalogue] Catalogue inserts: ${report.catalogueUpserts.stylesToInsert} styles, ${report.catalogueUpserts.coloursToInsert} colours, ${report.catalogueUpserts.variantsToInsert} variants, ${report.catalogueUpserts.imagesToInsert} images`,
    `[ralawise-catalogue] Existing products: ${products.matchedCount} matched (${products.matchedLive} Live, ${products.matchedDiscontinued} Discontinued), ${products.ambiguous} ambiguous, ${products.unmatched} unmatched`,
    `[ralawise-catalogue] Costs: ${products.costChanged} changed, ${products.costUnchanged} unchanged, ${products.costMissingPrice} missing Carton Price`,
    `[ralawise-catalogue] Catalogue-only products: ${products.catalogueProductsToInsert} to insert (${products.catalogueProductsToInsertLive} Live, ${products.catalogueProductsToInsertDiscontinued} Discontinued), ${products.catalogueProductsAlreadyPresent} already present`,
    `[ralawise-catalogue] Parent styles: ${products.parentMatched} uniquely matched, ${products.parentAmbiguous} ambiguous, ${products.parentUnmatched} unmatched`,
    `[ralawise-catalogue] Ambiguous products: ${products.parentAmbiguousProducts} from parent matches, ${products.variantAmbiguousProducts} from variant matches`,
  ].join('\n');
}

async function upsertCatalogueBatch(client, rows) {
  const payload = JSON.stringify(rows);
  const styleRows = Array.from(new Map(rows.map((row) => [row.style_code, row])).values());
  const colourRows = Array.from(new Map(
    rows.map((row) => [`${row.style_code}\u0000${row.colour_code}`, row])
  ).values());
  await client.query(`
    INSERT INTO database_ralawise_catalog_styles (
      style_code, manufacturer_style_code, brand, style_name, specification,
      retail_description, product_feature_1, product_feature_2, product_feature_3,
      size_range, sizing_to_fit, size_exclusions, washing_instructions,
      jacket_length, leg_length, fabric, weight_gsm, bag_capacity, print_area,
      embroidery_information, bag_dimensions, product_type, gender, age_group,
      accreditations, tag, sustainable_organic, plus_sizes, categorisation,
      size_guide_url, spec_sheet_url, is_new_product, metadata, import_source,
      source_imported_at, updated_at
    )
    SELECT x.style_code, x.manufacturer_style_code, x.brand, x.style_name,
           x.specification, x.retail_description, x.product_feature_1,
           x.product_feature_2, x.product_feature_3, x.size_range, x.sizing_to_fit,
           x.size_exclusions, x.washing_instructions, x.jacket_length, x.leg_length,
           x.fabric, x.weight_gsm, x.bag_capacity, x.print_area,
           x.embroidery_information, x.bag_dimensions, x.product_type, x.gender,
           x.age_group, x.accreditations, x.tag, x.sustainable_organic, x.plus_sizes,
           x.categorisation, x.size_guide_url, x.spec_sheet_url, x.is_new_product,
           COALESCE(x.style_metadata, '{}'::jsonb), x.import_source, NOW(), NOW()
    FROM jsonb_to_recordset($1::jsonb) AS x(
      style_code text, manufacturer_style_code text, brand text, style_name text,
      specification text, retail_description text, product_feature_1 text,
      product_feature_2 text, product_feature_3 text, size_range text,
      sizing_to_fit text, size_exclusions text, washing_instructions text,
      jacket_length text, leg_length text, fabric text, weight_gsm text,
      bag_capacity text, print_area text, embroidery_information text,
      bag_dimensions text, product_type text, gender text, age_group text,
      accreditations text, tag text, sustainable_organic text, plus_sizes text,
      categorisation text, size_guide_url text, spec_sheet_url text,
      is_new_product boolean, style_metadata jsonb, import_source text
    )
    ON CONFLICT (style_code) DO UPDATE SET
      manufacturer_style_code = EXCLUDED.manufacturer_style_code,
      brand = EXCLUDED.brand,
      style_name = EXCLUDED.style_name,
      specification = EXCLUDED.specification,
      retail_description = EXCLUDED.retail_description,
      product_feature_1 = EXCLUDED.product_feature_1,
      product_feature_2 = EXCLUDED.product_feature_2,
      product_feature_3 = EXCLUDED.product_feature_3,
      size_range = EXCLUDED.size_range,
      sizing_to_fit = EXCLUDED.sizing_to_fit,
      size_exclusions = EXCLUDED.size_exclusions,
      washing_instructions = EXCLUDED.washing_instructions,
      jacket_length = EXCLUDED.jacket_length,
      leg_length = EXCLUDED.leg_length,
      fabric = EXCLUDED.fabric,
      weight_gsm = EXCLUDED.weight_gsm,
      bag_capacity = EXCLUDED.bag_capacity,
      print_area = EXCLUDED.print_area,
      embroidery_information = EXCLUDED.embroidery_information,
      bag_dimensions = EXCLUDED.bag_dimensions,
      product_type = EXCLUDED.product_type,
      gender = EXCLUDED.gender,
      age_group = EXCLUDED.age_group,
      accreditations = EXCLUDED.accreditations,
      tag = EXCLUDED.tag,
      sustainable_organic = EXCLUDED.sustainable_organic,
      plus_sizes = EXCLUDED.plus_sizes,
      categorisation = EXCLUDED.categorisation,
      size_guide_url = EXCLUDED.size_guide_url,
      spec_sheet_url = EXCLUDED.spec_sheet_url,
      is_new_product = EXCLUDED.is_new_product,
      metadata = EXCLUDED.metadata,
      import_source = EXCLUDED.import_source,
      source_imported_at = NOW(),
      updated_at = NOW()
  `, [JSON.stringify(styleRows)]);

  await client.query(`
    INSERT INTO database_ralawise_catalog_colours (
      style_id, colour_code, colour_name, primary_colour, colour_shade,
      pantone, rgb, cmyk, colour_image_url, colour_image_filename,
      is_new_colour, metadata, import_source, source_imported_at, updated_at
    )
    SELECT s.id, x.colour_code, x.colour_name, x.primary_colour, x.colour_shade,
           x.pantone, x.rgb, x.cmyk, x.colour_image_url, x.colour_image_filename,
           x.is_new_colour, COALESCE(x.colour_metadata, '{}'::jsonb),
           x.import_source, NOW(), NOW()
    FROM jsonb_to_recordset($1::jsonb) AS x(
      style_code text, colour_code text, colour_name text, primary_colour text,
      colour_shade text, pantone text, rgb text, cmyk text,
      colour_image_url text, colour_image_filename text, is_new_colour boolean,
      colour_metadata jsonb, import_source text
    )
    JOIN database_ralawise_catalog_styles s ON s.style_code = x.style_code
    ON CONFLICT (style_id, colour_code) DO UPDATE SET
      colour_name = EXCLUDED.colour_name,
      primary_colour = EXCLUDED.primary_colour,
      colour_shade = EXCLUDED.colour_shade,
      pantone = EXCLUDED.pantone,
      rgb = EXCLUDED.rgb,
      cmyk = EXCLUDED.cmyk,
      colour_image_url = EXCLUDED.colour_image_url,
      colour_image_filename = EXCLUDED.colour_image_filename,
      is_new_colour = EXCLUDED.is_new_colour,
      metadata = EXCLUDED.metadata,
      import_source = EXCLUDED.import_source,
      source_imported_at = NOW(),
      updated_at = NOW()
  `, [JSON.stringify(colourRows)]);

  await client.query(`
    INSERT INTO database_ralawise_catalog_variants (
      sku_code, alpha_sku_code, style_id, colour_id, size_code, size_name,
      carton_quantity, pack_quantity, carton_price, pack_price, single_price,
      vat_status, commodity_code, item_weight_kg, country_of_origin, sku_status,
      is_new_sku, ean, primary_image_url, colour_image_url, metadata, is_active,
      import_source, source_imported_at, updated_at
    )
    SELECT x.sku_code, x.alpha_sku_code, s.id, c.id, x.size_code, x.size_name,
           x.carton_quantity, x.pack_quantity, NULLIF(x.carton_price, '')::numeric,
           NULLIF(x.pack_price, '')::numeric, NULLIF(x.single_price, '')::numeric,
           x.vat_status, x.commodity_code, NULLIF(x.item_weight_kg, '')::numeric,
           x.country_of_origin, x.sku_status, x.is_new_sku, x.ean,
           x.primary_image_url, x.colour_image_url,
           COALESCE(x.variant_metadata, '{}'::jsonb), x.is_active,
           x.import_source, NOW(), NOW()
    FROM jsonb_to_recordset($1::jsonb) AS x(
      sku_code text, alpha_sku_code text, style_code text, colour_code text,
      size_code text, size_name text, carton_quantity integer, pack_quantity integer,
      carton_price text, pack_price text, single_price text, vat_status text,
      commodity_code text, item_weight_kg text, country_of_origin text,
      sku_status text, is_new_sku boolean, ean text, primary_image_url text,
      colour_image_url text, variant_metadata jsonb, is_active boolean,
      import_source text
    )
    JOIN database_ralawise_catalog_styles s ON s.style_code = x.style_code
    JOIN database_ralawise_catalog_colours c
      ON c.style_id = s.id AND c.colour_code = x.colour_code
    ON CONFLICT (sku_code) DO UPDATE SET
      alpha_sku_code = EXCLUDED.alpha_sku_code,
      style_id = EXCLUDED.style_id,
      colour_id = EXCLUDED.colour_id,
      size_code = EXCLUDED.size_code,
      size_name = EXCLUDED.size_name,
      carton_quantity = EXCLUDED.carton_quantity,
      pack_quantity = EXCLUDED.pack_quantity,
      carton_price = EXCLUDED.carton_price,
      pack_price = EXCLUDED.pack_price,
      single_price = EXCLUDED.single_price,
      vat_status = EXCLUDED.vat_status,
      commodity_code = EXCLUDED.commodity_code,
      item_weight_kg = EXCLUDED.item_weight_kg,
      country_of_origin = EXCLUDED.country_of_origin,
      sku_status = EXCLUDED.sku_status,
      is_new_sku = EXCLUDED.is_new_sku,
      ean = EXCLUDED.ean,
      primary_image_url = EXCLUDED.primary_image_url,
      colour_image_url = EXCLUDED.colour_image_url,
      metadata = EXCLUDED.metadata,
      is_active = EXCLUDED.is_active,
      import_source = EXCLUDED.import_source,
      source_imported_at = NOW(),
      updated_at = NOW()
  `, [payload]);

  const imagesByKey = new Map();
  for (const row of rows) {
    if (row.primary_image_url) {
      const image = {
        style_code: row.style_code,
        colour_code: null,
        image_type: 'primary',
        source_url: row.primary_image_url,
        filename: row.primary_image_filename,
        licence_expiry_date: row.primary_image_licence_expiry_date,
        source_key: imageSourceKey(row.style_code, null, 'primary', row.primary_image_url),
        import_source: row.import_source,
      };
      imagesByKey.set(image.source_key, image);
    }
    if (row.colour_image_url) {
      const image = {
        style_code: row.style_code,
        colour_code: row.colour_code,
        image_type: 'colour',
        source_url: row.colour_image_url,
        filename: row.colour_image_filename,
        licence_expiry_date: null,
        source_key: imageSourceKey(row.style_code, row.colour_code, 'colour', row.colour_image_url),
        import_source: row.import_source,
      };
      imagesByKey.set(image.source_key, image);
    }
  }
  const images = Array.from(imagesByKey.values());
  if (!images.length) return;

  await client.query(`
    INSERT INTO database_ralawise_catalog_images (
      style_id, colour_id, image_type, source_url, filename, licence_expiry_date,
      source_key, import_source, source_imported_at, updated_at
    )
    SELECT s.id, c.id, x.image_type, x.source_url, x.filename,
           CASE
             WHEN x.licence_expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
               THEN LEFT(x.licence_expiry_date, 10)::date
             ELSE NULL
           END,
           x.source_key, x.import_source, NOW(), NOW()
    FROM jsonb_to_recordset($1::jsonb) AS x(
      style_code text, colour_code text, image_type text, source_url text,
      filename text, licence_expiry_date text, source_key text, import_source text
    )
    JOIN database_ralawise_catalog_styles s ON s.style_code = x.style_code
    LEFT JOIN database_ralawise_catalog_colours c
      ON c.style_id = s.id AND c.colour_code = x.colour_code
    ON CONFLICT (source_key) DO UPDATE SET
      filename = EXCLUDED.filename,
      licence_expiry_date = EXCLUDED.licence_expiry_date,
      import_source = EXCLUDED.import_source,
      source_imported_at = NOW(),
      updated_at = NOW()
  `, [JSON.stringify(images)]);
}

async function assignProductIds(client, styleAssignments) {
  if (styleAssignments.length) {
    await client.query(`
      UPDATE database_ralawise_catalog_styles s
      SET database_product_style_id = x.style_id,
          updated_at = NOW()
      FROM jsonb_to_recordset($1::jsonb) AS x(style_code text, style_id integer)
      WHERE s.style_code = x.style_code
        AND s.database_product_style_id IS NULL
    `, [JSON.stringify(styleAssignments.map((row) => ({
      style_code: row.styleCode,
      style_id: row.styleId,
    })))]);
  }

  await client.query(`
    WITH bounds AS (
      SELECT COALESCE(MIN(database_product_style_id) FILTER (
               WHERE database_product_style_id < 0
             ), 0) - 1 AS first_id
      FROM database_ralawise_catalog_styles
    ), pending AS (
      SELECT id,
             (SELECT first_id FROM bounds)
               - ROW_NUMBER() OVER (ORDER BY style_code) + 1 AS allocated_id
      FROM database_ralawise_catalog_styles
      WHERE database_product_style_id IS NULL
    )
    UPDATE database_ralawise_catalog_styles s
    SET database_product_style_id = pending.allocated_id,
        updated_at = NOW()
    FROM pending
    WHERE s.id = pending.id
  `);

  await client.query(`
    WITH bounds AS (
      SELECT COALESCE(MIN(database_product_source_id) FILTER (
               WHERE database_product_source_id < 0
             ), 0) - 1 AS first_id
      FROM database_ralawise_catalog_variants
    ), pending AS (
      SELECT id,
             (SELECT first_id FROM bounds)
               - ROW_NUMBER() OVER (ORDER BY sku_code) + 1 AS allocated_id
      FROM database_ralawise_catalog_variants
      WHERE database_product_source_id IS NULL
    )
    UPDATE database_ralawise_catalog_variants v
    SET database_product_source_id = pending.allocated_id,
        updated_at = NOW()
    FROM pending
    WHERE v.id = pending.id
  `);
}

async function enrichExistingProducts(client, matches, batchSize) {
  let affected = 0;
  for (let start = 0; start < matches.length; start += batchSize) {
    const batch = matches.slice(start, start + batchSize).map((match) => ({
      source_product_id: match.sourceProductId,
      sku_code: match.skuCode,
    }));
    const result = await client.query(`
      UPDATE database_products p
      SET catalog_source = 'Ralawise',
          supplier_sku = v.sku_code,
          ralawise_sku = v.sku_code,
          supplier_alpha_sku = v.alpha_sku_code,
          supplier_style_code = s.style_code,
          supplier_colour_code = c.colour_code,
          supplier_size_code = v.size_code,
          ralawise_catalog_variant_id = v.id,
          catalogue_status = v.sku_status,
          catalogue_synced_at = NOW(),
          primary_image_url = v.primary_image_url,
          colour_image_url = v.colour_image_url,
          supplier_carton_price = v.carton_price,
          supplier_pack_price = v.pack_price,
          supplier_single_price = v.single_price,
          unit_cost = COALESCE(v.carton_price, p.unit_cost),
          is_product_active = v.is_active,
          imported_at = NOW()
      FROM jsonb_to_recordset($1::jsonb) AS x(source_product_id integer, sku_code text)
      JOIN database_ralawise_catalog_variants v ON v.sku_code = x.sku_code
      JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
      JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
      WHERE p.source_product_id = x.source_product_id
    `, [JSON.stringify(batch)]);
    affected += result.rowCount;
  }
  return affected;
}

async function upsertCatalogueProducts(client, supplierCode) {
  const result = await client.query(`
    INSERT INTO database_products (
      source_product_id, style_id, supplier_name, supplier_code, product_type,
      style_code, alt_style_code, style_name, colour, size, unit_cost, stock,
      is_product_active, catalog_source, supplier_sku, ralawise_sku,
      supplier_alpha_sku, supplier_style_code, supplier_colour_code,
      supplier_size_code, ralawise_catalog_variant_id, catalogue_status,
      catalogue_synced_at, primary_image_url, colour_image_url,
      supplier_carton_price, supplier_pack_price, supplier_single_price,
      imported_at
    )
    SELECT v.database_product_source_id, s.database_product_style_id,
           'Ralawise', $1, s.product_type, s.style_code,
           CASE
             WHEN NULLIF(BTRIM(s.manufacturer_style_code), '') IS NOT NULL
              AND LOWER(BTRIM(s.manufacturer_style_code)) <> LOWER(BTRIM(s.style_code))
               THEN s.manufacturer_style_code
             ELSE NULL
           END,
           s.style_name, c.colour_name, v.size_name, v.carton_price, NULL,
           v.is_active, 'Ralawise', v.sku_code, v.sku_code,
           v.alpha_sku_code, s.style_code, c.colour_code, v.size_code, v.id,
           v.sku_status, NOW(), v.primary_image_url, v.colour_image_url,
           v.carton_price, v.pack_price, v.single_price, NOW()
    FROM database_ralawise_catalog_variants v
    JOIN database_ralawise_catalog_styles s ON s.id = v.style_id
    JOIN database_ralawise_catalog_colours c ON c.id = v.colour_id
    WHERE v.database_product_source_id IS NOT NULL
      AND s.database_product_style_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM database_products matched
        WHERE matched.source_product_id > 0
          AND matched.ralawise_catalog_variant_id = v.id
      )
    ON CONFLICT (source_product_id) DO UPDATE SET
      style_id = EXCLUDED.style_id,
      supplier_name = EXCLUDED.supplier_name,
      supplier_code = EXCLUDED.supplier_code,
      product_type = EXCLUDED.product_type,
      style_code = EXCLUDED.style_code,
      alt_style_code = EXCLUDED.alt_style_code,
      style_name = EXCLUDED.style_name,
      colour = EXCLUDED.colour,
      size = EXCLUDED.size,
      unit_cost = COALESCE(EXCLUDED.unit_cost, database_products.unit_cost),
      stock = NULL,
      is_product_active = EXCLUDED.is_product_active,
      catalog_source = EXCLUDED.catalog_source,
      supplier_sku = EXCLUDED.supplier_sku,
      ralawise_sku = EXCLUDED.ralawise_sku,
      supplier_alpha_sku = EXCLUDED.supplier_alpha_sku,
      supplier_style_code = EXCLUDED.supplier_style_code,
      supplier_colour_code = EXCLUDED.supplier_colour_code,
      supplier_size_code = EXCLUDED.supplier_size_code,
      ralawise_catalog_variant_id = EXCLUDED.ralawise_catalog_variant_id,
      catalogue_status = EXCLUDED.catalogue_status,
      catalogue_synced_at = NOW(),
      primary_image_url = EXCLUDED.primary_image_url,
      colour_image_url = EXCLUDED.colour_image_url,
      supplier_carton_price = EXCLUDED.supplier_carton_price,
      supplier_pack_price = EXCLUDED.supplier_pack_price,
      supplier_single_price = EXCLUDED.supplier_single_price,
      imported_at = NOW()
    RETURNING (xmax = 0) AS inserted
  `, [supplierCode]);
  return result.rows.reduce((counts, row) => {
    if (row.inserted) counts.inserted += 1;
    else counts.updated += 1;
    return counts;
  }, { inserted: 0, updated: 0 });
}

async function applyImport(client, options, catalogue, report) {
  await ensureDatabaseTables(client);
  const importRun = await client.query(`
    INSERT INTO database_ralawise_catalog_imports (
      source_file, source_sha256, mode, status
    ) VALUES ($1, $2, 'apply', 'running')
    RETURNING id
  `, [options.filePath, catalogue.audit.sha256]);
  const importRunId = importRun.rows[0].id;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [IMPORT_LOCK_ID]);
    console.log(`[ralawise-catalogue] Writing catalogue in batches of ${options.batchSize}`);
    await auditCatalogueFile({
      filePath: options.filePath,
      batchSize: options.batchSize,
      collectIndex: false,
      onBatch: (rows) => upsertCatalogueBatch(client, rows),
      onProgress: (rows) => console.log(`[ralawise-catalogue] Applied ${rows} source records`),
    });

    await assignProductIds(client, report.products.styleAssignments);
    const enriched = await enrichExistingProducts(client, report.products.matched, options.batchSize);
    const catalogueProducts = await upsertCatalogueProducts(
      client,
      report.products.supplierCodeConvention
    );
    await client.query('COMMIT');

    const appliedReport = {
      ...report,
      applied: {
        existingProductsEnriched: enriched,
        catalogueProductsInserted: catalogueProducts.inserted,
        catalogueProductsUpdated: catalogueProducts.updated,
      },
    };
    await client.query(`
      UPDATE database_ralawise_catalog_imports
      SET status = 'complete',
          row_count = $1,
          style_count = $2,
          colour_count = $3,
          variant_count = $4,
          live_count = $5,
          discontinued_count = $6,
          report = $7::jsonb,
          finished_at = NOW()
      WHERE id = $8
    `, [
      report.source.records,
      report.source.styles,
      report.source.colours,
      report.source.variants,
      report.source.live,
      report.source.discontinued,
      JSON.stringify(appliedReport),
      importRunId,
    ]);
    return appliedReport;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    await client.query(`
      UPDATE database_ralawise_catalog_imports
      SET status = 'failed',
          report = $1::jsonb,
          finished_at = NOW()
      WHERE id = $2
    `, [JSON.stringify({ error: error.message }), importRunId]);
    throw error;
  }
}

async function run(options, dependencies = {}) {
  if (!fs.existsSync(options.filePath)) {
    throw new Error(`Catalogue file not found: ${options.filePath}`);
  }
  const connectionString = dependencies.connectionString || databaseConnectionString();
  if (!connectionString) throw new Error('DATABASE_PUBLIC_URL or DATABASE_URL is required');
  const target = databaseTargetLabel(connectionString);
  console.log(`[ralawise-catalogue] Reading ${options.filePath}`);
  console.log(`[ralawise-catalogue] Database target: ${target}`);
  console.log('[ralawise-catalogue] Matching is not restricted by existing supplier labels');

  const catalogue = await auditCatalogueFile({
    filePath: options.filePath,
    batchSize: options.batchSize,
    onProgress: (rows) => console.log(`[ralawise-catalogue] Parsed ${rows} records`),
  });
  const pool = dependencies.pool || new Pool({
    connectionString,
    ssl: (process.env.PGSSLMODE || 'require') === 'disable'
      ? false
      : { rejectUnauthorized: false },
  });
  const ownsPool = !dependencies.pool;
  const client = await pool.connect();
  try {
    const databaseState = await loadDatabaseState(client);
    const report = buildReport(catalogue, databaseState);
    console.log(printableReport(report, options.dryRun ? 'dry-run' : 'apply', target));
    if (report.products.ambiguousParents.length) {
      console.log(`[ralawise-catalogue] Ambiguous parents: ${JSON.stringify(report.products.ambiguousParents)}`);
    }
    if (report.products.parentOverridesApplied.length) {
      console.log(`[ralawise-catalogue] Approved parent overrides: ${JSON.stringify(report.products.parentOverridesApplied)}`);
    }
    if (report.products.styleAssignmentOverridesApplied.length) {
      console.log(`[ralawise-catalogue] Approved canonical style assignments: ${JSON.stringify(report.products.styleAssignmentOverridesApplied)}`);
    }
    if (report.products.catalogueStyleAssignmentAmbiguities.length) {
      console.log(`[ralawise-catalogue] Ambiguous catalogue style assignments: ${JSON.stringify(report.products.catalogueStyleAssignmentAmbiguities)}`);
    }
    if (report.products.variantAmbiguousProducts) {
      console.log(`[ralawise-catalogue] Ambiguous variant samples: ${JSON.stringify(report.products.ambiguousSamples)}`);
    }
    if (options.dryRun) {
      console.log('[ralawise-catalogue] Dry run complete. No schema or data writes were performed.');
      if (options.json) console.log(`[ralawise-catalogue] REPORT_JSON ${JSON.stringify(report)}`);
      return report;
    }

    const appliedReport = await applyImport(client, options, catalogue, report);
    if (options.json) console.log(`[ralawise-catalogue] REPORT_JSON ${JSON.stringify(appliedReport)}`);
    return appliedReport;
  } finally {
    client.release();
    if (ownsPool) await pool.end();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  await run(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ralawise-catalogue] Fatal error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyImport,
  assignProductIds,
  buildReport,
  databaseTargetLabel,
  loadDatabaseState,
  parseArgs,
  printableReport,
  run,
  upsertCatalogueBatch,
};
