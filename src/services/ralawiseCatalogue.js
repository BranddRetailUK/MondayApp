const fs = require('node:fs');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { parse } = require('csv-parse');

const EXPECTED_HEADERS = Object.freeze([
  'Sku Code', 'Alpha Sku Code', 'Style Code', 'Manufacturer Style Code', 'Brand',
  'Style Name', 'Colour Code', 'Colour Name', 'Size Code', 'Size Name',
  'Specification', 'Retail Description', 'Product Feature 1', 'Product Feature 2',
  'Product Feature 3', 'Size Range', 'Sizing To Fit', 'Size Exclusions',
  'Washing Instructions', 'Jacket Length', 'Leg Length', 'Fabric', 'Weight (GSM)',
  'Bag Capacity', 'Print Area', 'Embroidery Information', 'Bag Dimensions',
  'Product Type', 'Gender', 'Age Group', 'Accreditations', 'Tag',
  'Sustainable/Organic', 'Plus Sizes', 'Categorisation', 'Primary Colour',
  'Colour Shade', 'Pantone', 'RGB', 'CMYK', 'Carton Quantity', 'Pack Quantity',
  'Vat Status', 'Carton Price', 'Pack Price', 'Single Price', 'Commodity Code',
  'Item Weight in KG', 'Country of Origin', 'Sku Status', 'Primary Product Image URL',
  'Primary Product Image File Name', 'Primary Image Licence Expiry Date',
  'Colour Image', 'Colour Image File Name', 'New SKU', 'New Product', 'New Colour',
  'Size Guide', 'Spec Sheet', 'EAN Code',
]);

// Audited Access parents whose legacy/alternate codes intentionally collide
// with another Ralawise style. These explicit mappings are the only exception
// to the importer's normal unique-parent requirement.
const RALAWISE_PARENT_MATCH_OVERRIDES = Object.freeze({
  1155: 'J599M',
  1349: 'KK350',
  1418: 'JH001',
  1472: 'WM101',
  1531: 'GD001',
  2563: 'GD01B',
  2662: 'R200X',
  2766: 'R207X',
  2795: 'J266M',
  3587: 'RX101',
  3595: 'R903X',
  3677: 'RX402',
  959: 'GD005',
  1179: 'PR150',
  1372: 'GD005',
});

// These legacy parent ids reuse a code that now identifies a different
// Ralawise product. Never let a code-only match attach their children to the
// current catalogue style.
const RALAWISE_PARENT_MATCH_REJECTIONS = Object.freeze({
  3670: 'Legacy PW265 is a PW2 rain jacket; catalogue PW265 is a DX4 polo shirt',
  3671: 'Legacy PW261 is a PW2 winter jacket; catalogue PW261 is a DX4 baffle gilet',
});

// Access styles 959 and 1372 are duplicate local parents for the same GD005
// product. Preserve both positive IDs on existing rows, while grouping newly
// created catalogue-only GD005 variants under the older canonical style 959.
const RALAWISE_STYLE_ASSIGNMENT_OVERRIDES = Object.freeze({
  GD005: 959,
});

function text(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function canonicalCode(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.replace(/\s+/g, ' ').toUpperCase() : null;
}

function normalizeParentCode(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.replace(/\s+/g, ' ').toLowerCase() : '';
}

function normalizeVariantExact(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.toLowerCase() : '';
}

function normalizeVariantLoose(value) {
  return normalizeVariantExact(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeLegacyColour(value) {
  const words = normalizeVariantExact(value)
    .replace(/\bartic\b/g, 'arctic')
    .replace(/\blt\b/g, 'light');
  const compact = words.replace(/[^\p{L}\p{N}]+/gu, '');
  const aliases = {
    bottle: 'bottlegreen',
    forest: 'forestgreen',
  };
  return aliases[compact] || compact;
}

function normalizeLegacySize(value) {
  const compact = normalizeVariantLoose(value);
  const aliases = {
    extrasmall: 'xs',
    xsmall: 'xs',
    yxs: 'xs',
    small: 's',
    ys: 's',
    medium: 'm',
    med: 'm',
    ym: 'm',
    large: 'l',
    yl: 'l',
    extralarge: 'xl',
    xlarge: 'xl',
    yxl: 'xl',
    xxl: '2xl',
    xxlarge: '2xl',
    doublexl: '2xl',
    xxxl: '3xl',
    xxxlarge: '3xl',
    triplexl: '3xl',
    xxxxl: '4xl',
    one: 'onesize',
    onesizefitsall: 'onesize',
  };
  return aliases[compact] || compact;
}

function legacyPairKey(colour, size) {
  return `${normalizeLegacyColour(colour)}\u0000${normalizeLegacySize(size)}`;
}

function imageUrl(value) {
  const cleaned = text(value);
  if (!cleaned || normalizeVariantExact(cleaned) === 'not available') return null;
  return cleaned;
}

function decimalString(value) {
  const cleaned = text(value)?.replace(/[£,]/g, '');
  if (!cleaned || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;

  const negative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/^[+-]/, '');
  const [wholeRaw = '0', fractionRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  const unsignedCanonical = fraction ? `${whole}.${fraction}` : whole;
  if (/^0(?:\.0*)?$/.test(unsignedCanonical)) return '0';
  return negative ? `-${unsignedCanonical}` : unsignedCanonical;
}

function decimalEqual(left, right) {
  const a = decimalString(left);
  const b = decimalString(right);
  return a !== null && b !== null && a === b;
}

function nonNegativeDecimalString(value) {
  const parsed = decimalString(value);
  return parsed && parsed.startsWith('-') ? null : parsed;
}

function integer(value) {
  const cleaned = text(value);
  if (!cleaned || !/^[+-]?\d+$/.test(cleaned)) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanFlag(value) {
  const normalized = normalizeVariantExact(value);
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function nullableWeight(value) {
  const weight = nonNegativeDecimalString(value);
  return weight === '0' ? null : weight;
}

function isLiveStatus(value) {
  return normalizeVariantExact(value) === 'live';
}

function pairKey(colour, size, normalizer) {
  return `${normalizer(colour)}\u0000${normalizer(size)}`;
}

function imageSourceKey(styleCode, colourCode, imageType, url) {
  return [styleCode, colourCode || '', imageType, url].join('|');
}

function mapCsvRow(row, importSource = null) {
  const styleCode = canonicalCode(row['Style Code']);
  const colourCode = canonicalCode(row['Colour Code']);
  const skuCode = canonicalCode(row['Sku Code']);
  const skuStatus = text(row['Sku Status']) || 'Unknown';
  const primaryImageUrl = imageUrl(row['Primary Product Image URL']);
  const colourImageUrl = imageUrl(row['Colour Image']);

  if (!styleCode) throw new Error(`Ralawise row ${skuCode || '(missing SKU)'} has no Style Code`);
  if (!colourCode) throw new Error(`Ralawise row ${skuCode || '(missing SKU)'} has no Colour Code`);
  if (!skuCode) throw new Error('Ralawise catalogue row has no Sku Code');

  return {
    style_code: styleCode,
    manufacturer_style_code: canonicalCode(row['Manufacturer Style Code']),
    brand: text(row.Brand),
    style_name: text(row['Style Name']),
    specification: text(row.Specification),
    retail_description: text(row['Retail Description']),
    product_feature_1: text(row['Product Feature 1']),
    product_feature_2: text(row['Product Feature 2']),
    product_feature_3: text(row['Product Feature 3']),
    size_range: text(row['Size Range']),
    sizing_to_fit: text(row['Sizing To Fit']),
    size_exclusions: text(row['Size Exclusions']),
    washing_instructions: text(row['Washing Instructions']),
    jacket_length: text(row['Jacket Length']),
    leg_length: text(row['Leg Length']),
    fabric: text(row.Fabric),
    weight_gsm: text(row['Weight (GSM)']),
    bag_capacity: text(row['Bag Capacity']),
    print_area: text(row['Print Area']),
    embroidery_information: text(row['Embroidery Information']),
    bag_dimensions: text(row['Bag Dimensions']),
    product_type: text(row['Product Type']),
    gender: text(row.Gender),
    age_group: text(row['Age Group']),
    accreditations: text(row.Accreditations),
    tag: text(row.Tag),
    sustainable_organic: text(row['Sustainable/Organic']),
    plus_sizes: text(row['Plus Sizes']),
    categorisation: text(row.Categorisation),
    size_guide_url: text(row['Size Guide']),
    spec_sheet_url: text(row['Spec Sheet']),
    is_new_product: booleanFlag(row['New Product']),
    style_metadata: {},

    colour_code: colourCode,
    colour_name: text(row['Colour Name']),
    primary_colour: text(row['Primary Colour']),
    colour_shade: text(row['Colour Shade']),
    pantone: text(row.Pantone),
    rgb: text(row.RGB),
    cmyk: text(row.CMYK),
    colour_image_url: colourImageUrl,
    colour_image_filename: text(row['Colour Image File Name']),
    is_new_colour: booleanFlag(row['New Colour']),
    colour_metadata: {},

    sku_code: skuCode,
    alpha_sku_code: canonicalCode(row['Alpha Sku Code']),
    size_code: canonicalCode(row['Size Code']),
    size_name: text(row['Size Name']),
    carton_quantity: integer(row['Carton Quantity']),
    pack_quantity: integer(row['Pack Quantity']),
    carton_price: nonNegativeDecimalString(row['Carton Price']),
    pack_price: nonNegativeDecimalString(row['Pack Price']),
    single_price: nonNegativeDecimalString(row['Single Price']),
    vat_status: text(row['Vat Status']),
    commodity_code: text(row['Commodity Code']),
    item_weight_kg: nullableWeight(row['Item Weight in KG']),
    country_of_origin: text(row['Country of Origin']),
    sku_status: skuStatus,
    is_new_sku: booleanFlag(row['New SKU']),
    ean: text(row['EAN Code']),
    primary_image_url: primaryImageUrl,
    primary_image_filename: text(row['Primary Product Image File Name']),
    primary_image_licence_expiry_date: text(row['Primary Image Licence Expiry Date']),
    variant_metadata: {},
    is_active: isLiveStatus(skuStatus),
    import_source: importSource,
  };
}

function validateHeaders(headers) {
  const missing = EXPECTED_HEADERS.filter((header) => !headers.includes(header));
  const unexpected = headers.filter((header) => !EXPECTED_HEADERS.includes(header));
  if (missing.length || unexpected.length || headers.length !== EXPECTED_HEADERS.length) {
    throw new Error(
      `Unexpected Ralawise CSV headers. Missing: ${missing.join(', ') || 'none'}. ` +
      `Unexpected: ${unexpected.join(', ') || 'none'}.`
    );
  }
  return headers;
}

function createStyleIndexRow(row) {
  return {
    styleCode: row.style_code,
    manufacturerStyleCode: row.manufacturer_style_code,
    styleName: row.style_name,
    variants: [],
    exactPairs: new Map(),
    loosePairs: new Map(),
    legacyPairs: new Map(),
    primaryImages: new Set(),
  };
}

function addMapArray(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  if (!map.get(key).includes(value)) map.get(key).push(value);
}

function finalizeStyleIndex(style) {
  for (const variant of style.variants) {
    addMapArray(
      style.exactPairs,
      pairKey(variant.colourName, variant.sizeName, normalizeVariantExact),
      variant
    );
    addMapArray(
      style.loosePairs,
      pairKey(variant.colourName, variant.sizeName, normalizeVariantLoose),
      variant
    );
    addMapArray(style.legacyPairs, legacyPairKey(variant.colourName, variant.sizeName), variant);
    addMapArray(style.legacyPairs, legacyPairKey(variant.colourName, variant.sizeCode), variant);
  }
}

async function auditCatalogueFile({
  filePath,
  batchSize = 1000,
  onBatch = null,
  onProgress = null,
  collectIndex = true,
}) {
  const styles = new Map();
  const skuMap = new Map();
  const combinationCounts = new Map();
  const colours = new Set();
  const images = new Set();
  const hash = crypto.createHash('sha256');
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  const parser = parse({
    bom: true,
    columns: validateHeaders,
    skip_empty_lines: true,
    relax_column_count: false,
    // The supplier export contains a small number of literal inch marks inside
    // otherwise quoted fields (for example, bag dimensions). Keep full CSV
    // record parsing while accepting those vendor-authored quote characters.
    relax_quotes: true,
  });
  const records = fs.createReadStream(filePath).pipe(hashingStream).pipe(parser);
  const batch = [];
  const audit = {
    rows: 0,
    live: 0,
    discontinued: 0,
    otherStatus: 0,
    blankSizeCodeWithName: 0,
    blankAllPrices: 0,
    duplicateSkuCount: 0,
  };

  for await (const sourceRow of records) {
    const row = mapCsvRow(sourceRow, filePath);
    audit.rows += 1;
    if (row.is_active) audit.live += 1;
    else if (normalizeVariantExact(row.sku_status) === 'discontinued') audit.discontinued += 1;
    else audit.otherStatus += 1;
    if (!row.size_code && row.size_name) audit.blankSizeCodeWithName += 1;
    if (!row.carton_price && !row.pack_price && !row.single_price) audit.blankAllPrices += 1;

    if (skuMap.has(row.sku_code)) audit.duplicateSkuCount += 1;
    else skuMap.set(row.sku_code, {
      skuCode: row.sku_code,
      styleCode: row.style_code,
      colourCode: row.colour_code,
      colourName: row.colour_name,
      sizeCode: row.size_code,
      sizeName: row.size_name,
      status: row.sku_status,
      isLive: row.is_active,
      cartonPrice: row.carton_price,
    });

    const combinationKey = [row.style_code, row.colour_code, row.size_code || ''].join('\u0000');
    combinationCounts.set(combinationKey, (combinationCounts.get(combinationKey) || 0) + 1);
    colours.add(`${row.style_code}\u0000${row.colour_code}`);

    if (row.primary_image_url) {
      const key = imageSourceKey(row.style_code, null, 'primary', row.primary_image_url);
      images.add(key);
    }
    if (row.colour_image_url) {
      images.add(imageSourceKey(row.style_code, row.colour_code, 'colour', row.colour_image_url));
    }

    if (collectIndex) {
      if (!styles.has(row.style_code)) styles.set(row.style_code, createStyleIndexRow(row));
      const style = styles.get(row.style_code);
      if (row.primary_image_url) style.primaryImages.add(row.primary_image_url);
      style.variants.push(skuMap.get(row.sku_code));
    }

    if (onBatch) {
      batch.push(row);
      if (batch.length >= batchSize) {
        await onBatch(batch.splice(0, batch.length), audit.rows);
      }
    }

    if (onProgress && audit.rows % 10000 === 0) onProgress(audit.rows);
  }

  if (onBatch && batch.length) await onBatch(batch.splice(0, batch.length), audit.rows);
  if (audit.duplicateSkuCount) {
    throw new Error(`Sku Code must be unique; found ${audit.duplicateSkuCount} duplicate row(s)`);
  }

  for (const style of styles.values()) finalizeStyleIndex(style);
  const duplicateCombinationSizes = Array.from(combinationCounts.values()).filter((count) => count > 1);
  audit.styles = styles.size;
  audit.colours = colours.size;
  audit.images = images.size;
  audit.variants = skuMap.size;
  audit.duplicateCombinationGroups = duplicateCombinationSizes.length;
  audit.duplicateCombinationRows = duplicateCombinationSizes.reduce((sum, count) => sum + count, 0);
  audit.stylesWithMultiplePrimaryImages = Array.from(styles.values())
    .filter((style) => style.primaryImages.size > 1).length;
  audit.sha256 = hash.digest('hex');
  audit.bytes = fs.statSync(filePath).size;

  return { audit, styles, skuMap, colourKeys: colours, imageKeys: images };
}

function catalogueStyleLookup(styles) {
  const lookup = new Map();
  for (const style of styles.values()) {
    for (const code of [style.styleCode, style.manufacturerStyleCode]) {
      const normalized = normalizeParentCode(code);
      if (!normalized) continue;
      if (!lookup.has(normalized)) lookup.set(normalized, new Set());
      lookup.get(normalized).add(style.styleCode);
    }
  }
  return lookup;
}

function chooseVariant(candidates) {
  if (!candidates.length) return { status: 'unmatched' };
  if (candidates.length === 1) return { status: 'matched', variant: candidates[0] };
  const live = candidates.filter((candidate) => candidate.isLive);
  if (live.length === 1) return { status: 'matched', variant: live[0], preferredLive: true };
  return { status: 'ambiguous', candidates };
}

function inferRalawiseSupplierCode(products) {
  const counts = new Map();
  for (const product of products) {
    if (normalizeVariantExact(product.supplier_name) !== 'ralawise') continue;
    const code = text(product.supplier_code);
    if (code) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null;
}

function overrideValue(overrides, key) {
  if (overrides instanceof Map) return overrides.get(key) ?? overrides.get(String(key));
  return overrides?.[key] ?? overrides?.[String(key)];
}

function matchExistingProducts(catalogue, products, {
  existingCatalogueSkus = new Set(),
  parentMatchOverrides = RALAWISE_PARENT_MATCH_OVERRIDES,
  parentMatchRejections = RALAWISE_PARENT_MATCH_REJECTIONS,
  styleAssignmentOverrides = RALAWISE_STYLE_ASSIGNMENT_OVERRIDES,
} = {}) {
  const styleLookup = catalogueStyleLookup(catalogue.styles);
  const parentGroups = new Map();
  for (const product of products) {
    const key = product.style_id === null || product.style_id === undefined
      ? `product:${product.source_product_id}`
      : `style:${product.style_id}`;
    if (!parentGroups.has(key)) parentGroups.set(key, []);
    parentGroups.get(key).push(product);
  }

  const report = {
    existingProducts: products.length,
    existingParentStyles: parentGroups.size,
    parentMatched: 0,
    parentAmbiguous: 0,
    parentAmbiguousProducts: 0,
    parentUnmatched: 0,
    matched: [],
    matchedLive: 0,
    matchedDiscontinued: 0,
    preferredLive: 0,
    ambiguous: 0,
    variantAmbiguousProducts: 0,
    unmatched: 0,
    costUnchanged: 0,
    costChanged: 0,
    costMissingPrice: 0,
    ambiguousParents: [],
    ambiguousSamples: [],
    unmatchedSamples: [],
    parentOverridesApplied: [],
    parentRejectionsApplied: [],
    styleAssignments: [],
    styleAssignmentOverridesApplied: [],
    catalogueStyleAssignmentAmbiguities: [],
    supplierCodeConvention: inferRalawiseSupplierCode(products),
  };
  const styleMatches = new Map();
  const matchedSkuSet = new Set();

  for (const [parentKey, group] of parentGroups) {
    const parentCodes = new Set();
    for (const product of group) {
      for (const value of [product.style_code, product.alt_style_code]) {
        const normalized = normalizeParentCode(value);
        if (normalized) parentCodes.add(normalized);
      }
    }
    const candidates = new Set();
    for (const code of parentCodes) {
      for (const styleCode of styleLookup.get(code) || []) candidates.add(styleCode);
    }

    const existingStyleId = group[0]?.style_id === null || group[0]?.style_id === undefined
      ? null
      : Number(group[0].style_id);
    const parentRejection = existingStyleId === null
      ? null
      : text(overrideValue(parentMatchRejections, existingStyleId));
    if (parentRejection) {
      report.parentUnmatched += 1;
      report.unmatched += group.length;
      report.parentRejectionsApplied.push({
        styleId: existingStyleId,
        reason: parentRejection,
        productCount: group.length,
      });
      if (report.unmatchedSamples.length < 100) {
        report.unmatchedSamples.push({
          sourceProductId: group[0]?.source_product_id,
          styleId: group[0]?.style_id,
          styleCode: group[0]?.style_code,
          reason: 'parent_rejected',
        });
      }
      continue;
    }
    const parentOverride = existingStyleId === null
      ? null
      : canonicalCode(overrideValue(parentMatchOverrides, existingStyleId));
    if (parentOverride) {
      if (!catalogue.styles.has(parentOverride)) {
        throw new Error(
          `Configured Ralawise parent override ${existingStyleId} -> ${parentOverride} does not exist in the catalogue`
        );
      }
      candidates.clear();
      candidates.add(parentOverride);
      report.parentOverridesApplied.push({
        styleId: existingStyleId,
        styleCode: parentOverride,
      });
    }

    if (candidates.size !== 1) {
      if (candidates.size > 1) {
        report.parentAmbiguous += 1;
        report.parentAmbiguousProducts += group.length;
        report.ambiguous += group.length;
        report.ambiguousParents.push({
          parentKey,
          styleId: group[0]?.style_id ?? null,
          existingCodes: Array.from(parentCodes),
          candidateStyleCodes: Array.from(candidates).sort(),
          productCount: group.length,
        });
      } else {
        report.parentUnmatched += 1;
        report.unmatched += group.length;
        if (report.unmatchedSamples.length < 100) {
          report.unmatchedSamples.push({
            sourceProductId: group[0]?.source_product_id,
            styleId: group[0]?.style_id,
            styleCode: group[0]?.style_code,
            reason: 'parent_unmatched',
          });
        }
      }
      continue;
    }

    report.parentMatched += 1;
    const styleCode = Array.from(candidates)[0];
    const style = catalogue.styles.get(styleCode);
    if (!styleMatches.has(styleCode)) styleMatches.set(styleCode, new Set());
    if (group[0]?.style_id !== null && group[0]?.style_id !== undefined) {
      styleMatches.get(styleCode).add(Number(group[0].style_id));
    }

    for (const product of group) {
      const exactKey = pairKey(product.colour, product.size, normalizeVariantExact);
      const exact = style.exactPairs.get(exactKey) || [];
      const loose = exact.length
        ? []
        : (style.loosePairs.get(pairKey(product.colour, product.size, normalizeVariantLoose)) || []);
      const reviewedAlias = exact.length || loose.length || !parentOverride
        ? []
        : (style.legacyPairs.get(legacyPairKey(product.colour, product.size)) || []);
      const candidatesForVariant = exact.length ? exact : (loose.length ? loose : reviewedAlias);
      const variantMatchMethod = exact.length
        ? 'exact'
        : (loose.length ? 'normalized' : (reviewedAlias.length ? 'reviewed_alias' : 'unmatched'));
      const selected = chooseVariant(candidatesForVariant);

      if (selected.status === 'ambiguous') {
        report.ambiguous += 1;
        report.variantAmbiguousProducts += 1;
        if (report.ambiguousSamples.length < 500) {
          report.ambiguousSamples.push({
            sourceProductId: product.source_product_id,
            styleId: product.style_id,
            styleCode,
            colour: product.colour,
            size: product.size,
            candidateSkus: selected.candidates.map((candidate) => candidate.skuCode),
            reason: 'variant_ambiguous',
          });
        }
        continue;
      }
      if (selected.status === 'unmatched') {
        report.unmatched += 1;
        if (report.unmatchedSamples.length < 100) {
          report.unmatchedSamples.push({
            sourceProductId: product.source_product_id,
            styleId: product.style_id,
            styleCode,
            colour: product.colour,
            size: product.size,
            reason: 'variant_unmatched',
          });
        }
        continue;
      }

      const variant = selected.variant;
      report.matched.push({
        sourceProductId: Number(product.source_product_id),
        skuCode: variant.skuCode,
        parentStyleCode: styleCode,
        parentMatchMethod: parentOverride ? 'reviewed_override' : 'direct_code',
        variantMatchMethod,
      });
      matchedSkuSet.add(variant.skuCode);
      if (variant.isLive) report.matchedLive += 1;
      else report.matchedDiscontinued += 1;
      if (selected.preferredLive) report.preferredLive += 1;
      if (!variant.cartonPrice) report.costMissingPrice += 1;
      else if (decimalEqual(product.unit_cost, variant.cartonPrice)) report.costUnchanged += 1;
      else report.costChanged += 1;
    }
  }

  for (const [styleCode, styleIds] of styleMatches) {
    const assignmentOverride = Number(overrideValue(styleAssignmentOverrides, styleCode));
    if (Number.isInteger(assignmentOverride) && styleIds.has(assignmentOverride)) {
      report.styleAssignments.push({ styleCode, styleId: assignmentOverride });
      report.styleAssignmentOverridesApplied.push({
        styleCode,
        styleId: assignmentOverride,
        equivalentExistingStyleIds: Array.from(styleIds).sort((a, b) => a - b),
      });
    } else if (styleIds.size === 1) {
      report.styleAssignments.push({ styleCode, styleId: Array.from(styleIds)[0] });
    } else if (styleIds.size > 1) {
      report.catalogueStyleAssignmentAmbiguities.push({
        styleCode,
        existingStyleIds: Array.from(styleIds).sort((a, b) => a - b),
      });
    }
  }

  report.matchedCount = report.matched.length;
  report.catalogueProductCandidates = catalogue.audit.variants - matchedSkuSet.size;
  report.catalogueProductsToInsert = 0;
  report.catalogueProductsAlreadyPresent = 0;
  report.catalogueProductsToInsertLive = 0;
  report.catalogueProductsToInsertDiscontinued = 0;
  report.catalogueProductsAlreadyPresentLive = 0;
  report.catalogueProductsAlreadyPresentDiscontinued = 0;
  report.matchedUniqueLiveSkus = 0;
  report.matchedUniqueDiscontinuedSkus = 0;
  for (const [skuCode, variant] of catalogue.skuMap) {
    if (matchedSkuSet.has(skuCode)) {
      if (variant.isLive) report.matchedUniqueLiveSkus += 1;
      else report.matchedUniqueDiscontinuedSkus += 1;
      continue;
    }
    if (existingCatalogueSkus.has(skuCode)) {
      report.catalogueProductsAlreadyPresent += 1;
      if (variant.isLive) report.catalogueProductsAlreadyPresentLive += 1;
      else report.catalogueProductsAlreadyPresentDiscontinued += 1;
    } else {
      report.catalogueProductsToInsert += 1;
      if (variant.isLive) report.catalogueProductsToInsertLive += 1;
      else report.catalogueProductsToInsertDiscontinued += 1;
    }
  }
  report.matchedUniqueSkus = matchedSkuSet.size;
  return report;
}

function allocateStableNegativeIds(keys, persisted = new Map(), minimumExisting = 0) {
  const allocated = new Map(persisted);
  let next = Math.min(0, Number(minimumExisting) || 0) - 1;
  for (const key of Array.from(keys).sort()) {
    if (allocated.has(key)) continue;
    allocated.set(key, next);
    next -= 1;
  }
  return allocated;
}

module.exports = {
  EXPECTED_HEADERS,
  RALAWISE_PARENT_MATCH_OVERRIDES,
  RALAWISE_PARENT_MATCH_REJECTIONS,
  RALAWISE_STYLE_ASSIGNMENT_OVERRIDES,
  allocateStableNegativeIds,
  auditCatalogueFile,
  canonicalCode,
  decimalEqual,
  decimalString,
  imageSourceKey,
  isLiveStatus,
  mapCsvRow,
  matchExistingProducts,
  normalizeParentCode,
  normalizeLegacyColour,
  normalizeLegacySize,
  normalizeVariantExact,
  normalizeVariantLoose,
  nullableWeight,
  validateHeaders,
};
