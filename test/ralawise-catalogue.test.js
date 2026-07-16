const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EXPECTED_HEADERS,
  RALAWISE_PARENT_MATCH_OVERRIDES,
  RALAWISE_STYLE_ASSIGNMENT_OVERRIDES,
  allocateStableNegativeIds,
  auditCatalogueFile,
  mapCsvRow,
  matchExistingProducts,
} = require('../src/services/ralawiseCatalogue');
const { run } = require('../scripts/import-ralawise-catalogue');

function sourceRow(overrides = {}) {
  return {
    'Sku Code': 'AA001BLACS',
    'Alpha Sku Code': 'AA001BLAC0',
    'Style Code': 'AA001',
    'Manufacturer Style Code': 'M-AA001',
    Brand: 'Example Brand',
    'Style Name': 'Example style',
    'Colour Code': 'BLAC',
    'Colour Name': 'Black',
    'Size Code': 'S',
    'Size Name': 'Small',
    Specification: 'Specification',
    'Retail Description': 'Description',
    'Product Feature 1': '',
    'Product Feature 2': '',
    'Product Feature 3': '',
    'Size Range': 'S-XL',
    'Sizing To Fit': '',
    'Size Exclusions': '',
    'Washing Instructions': '',
    'Jacket Length': '',
    'Leg Length': '',
    Fabric: 'Cotton',
    'Weight (GSM)': '180gsm',
    'Bag Capacity': '',
    'Print Area': '',
    'Embroidery Information': '',
    'Bag Dimensions': '',
    'Product Type': 'T-Shirts',
    Gender: 'Unisex',
    'Age Group': 'Adult',
    Accreditations: '',
    Tag: '',
    'Sustainable/Organic': 'No',
    'Plus Sizes': 'No',
    Categorisation: 'T-Shirts',
    'Primary Colour': 'Black',
    'Colour Shade': 'Black',
    Pantone: 'Black',
    RGB: '0 0 0',
    CMYK: '0 0 0 100',
    'Carton Quantity': '24',
    'Pack Quantity': '6',
    'Vat Status': 'Vatable in UK',
    'Carton Price': '2.50',
    'Pack Price': '2.75',
    'Single Price': '3.00',
    'Commodity Code': '6109100010',
    'Item Weight in KG': '0.20',
    'Country of Origin': 'BD',
    'Sku Status': 'Live',
    'Primary Product Image URL': 'https://example.test/AA001-primary.jpg',
    'Primary Product Image File Name': 'AA001-primary.jpg',
    'Primary Image Licence Expiry Date': '2030-01-01 00:00:00',
    'Colour Image': 'https://example.test/AA001-black.jpg',
    'Colour Image File Name': 'AA001-black.jpg',
    'New SKU': '0',
    'New Product': '0',
    'New Colour': '0',
    'Size Guide': 'https://example.test/AA001-size.pdf',
    'Spec Sheet': 'https://example.test/AA001-spec.pdf',
    'EAN Code': '1234567890123',
    ...overrides,
  };
}

function csvCell(value) {
  const string = String(value ?? '');
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function fixture(t, rows) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ralawise-catalogue-'));
  const filePath = path.join(directory, 'catalogue.csv');
  const lines = [
    EXPECTED_HEADERS.map(csvCell).join(','),
    ...rows.map((row) => EXPECTED_HEADERS.map((header) => csvCell(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `\ufeff${lines.join('\r\n')}\r\n`, 'utf8');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return filePath;
}

async function catalogue(t, rows) {
  return auditCatalogueFile({ filePath: fixture(t, rows) });
}

function existingProduct(overrides = {}) {
  return {
    source_product_id: 101,
    style_id: 10,
    supplier_name: 'Any supplier label',
    supplier_code: 'RAL',
    style_code: 'AA001',
    alt_style_code: null,
    colour: 'Black',
    size: 'Small',
    unit_cost: '2.50',
    ...overrides,
  };
}

test('streaming parser handles a UTF-8 BOM, quoted commas, and embedded newlines', async (t) => {
  const parsed = await catalogue(t, [sourceRow({
    'Retail Description': 'First line, with comma\nSecond "quoted" line',
  })]);
  assert.equal(parsed.audit.rows, 1);
  assert.equal(parsed.audit.variants, 1);
  assert.equal(parsed.styles.get('AA001').variants[0].skuCode, 'AA001BLACS');
});

test('Sku Code is enforced as the unique canonical variant identity', async (t) => {
  const filePath = fixture(t, [
    sourceRow(),
    sourceRow({ 'Size Code': 'M', 'Size Name': 'Medium' }),
  ]);
  await assert.rejects(
    () => auditCatalogueFile({ filePath }),
    /Sku Code must be unique/
  );
});

test('duplicate style/colour/size combinations and blank Size Code are audited', async (t) => {
  const parsed = await catalogue(t, [
    sourceRow(),
    sourceRow({ 'Sku Code': 'AA001BLACS-OLD', 'Sku Status': 'Discontinued' }),
    sourceRow({
      'Sku Code': 'AA001BLACONESIZE',
      'Size Code': '',
      'Size Name': 'One Size',
    }),
  ]);
  assert.equal(parsed.audit.duplicateCombinationGroups, 1);
  assert.equal(parsed.audit.duplicateCombinationRows, 2);
  assert.equal(parsed.audit.blankSizeCodeWithName, 1);
});

test('a single Live variant is preferred over a duplicate Discontinued SKU', async (t) => {
  const parsed = await catalogue(t, [
    sourceRow({ 'Sku Code': 'AA001BLACS-OLD', 'Sku Status': 'Discontinued' }),
    sourceRow({ 'Sku Code': 'AA001BLACS-LIVE', 'Sku Status': 'Live' }),
  ]);
  const report = matchExistingProducts(parsed, [existingProduct()]);
  assert.equal(report.matchedCount, 1);
  assert.equal(report.matched[0].skuCode, 'AA001BLACS-LIVE');
  assert.equal(report.preferredLive, 1);
});

test('ambiguous parent and multiple-Live variant candidates are never guessed', async (t) => {
  const parentAmbiguous = await catalogue(t, [
    sourceRow({ 'Style Code': 'AA001', 'Manufacturer Style Code': 'SHARED' }),
    sourceRow({
      'Sku Code': 'BB001BLACS',
      'Style Code': 'BB001',
      'Manufacturer Style Code': 'SHARED',
    }),
  ]);
  const parentReport = matchExistingProducts(parentAmbiguous, [existingProduct({
    style_code: 'SHARED',
  })]);
  assert.equal(parentReport.parentAmbiguous, 1);
  assert.equal(parentReport.ambiguous, 1);
  assert.equal(parentReport.matchedCount, 0);

  const variantAmbiguous = await catalogue(t, [
    sourceRow({ 'Sku Code': 'AA001BLACS-1' }),
    sourceRow({ 'Sku Code': 'AA001BLACS-2' }),
  ]);
  const variantReport = matchExistingProducts(variantAmbiguous, [existingProduct()]);
  assert.equal(variantReport.ambiguous, 1);
  assert.equal(variantReport.matchedCount, 0);
});

test('approved parent overrides can map duplicate Access parents to one canonical catalogue style', async (t) => {
  assert.equal(RALAWISE_PARENT_MATCH_OVERRIDES[959], 'GD005');
  assert.equal(RALAWISE_PARENT_MATCH_OVERRIDES[1179], 'PR150');
  assert.equal(RALAWISE_PARENT_MATCH_OVERRIDES[1372], 'GD005');
  assert.equal(RALAWISE_STYLE_ASSIGNMENT_OVERRIDES.GD005, 959);

  const parsed = await catalogue(t, [
    sourceRow({ 'Style Code': 'AA001', 'Manufacturer Style Code': 'SHARED' }),
    sourceRow({
      'Sku Code': 'BB001BLACS',
      'Style Code': 'BB001',
      'Manufacturer Style Code': 'SHARED',
    }),
  ]);
  const report = matchExistingProducts(parsed, [
    existingProduct({ source_product_id: 101, style_id: 10, style_code: 'SHARED' }),
    existingProduct({ source_product_id: 102, style_id: 11, style_code: 'SHARED' }),
  ], {
    parentMatchOverrides: new Map([[10, 'AA001'], [11, 'AA001']]),
    styleAssignmentOverrides: new Map([['AA001', 10]]),
  });

  assert.equal(report.parentAmbiguous, 0);
  assert.equal(report.matchedCount, 2);
  assert.equal(report.matchedUniqueSkus, 1);
  assert.deepEqual(report.styleAssignments, [{ styleCode: 'AA001', styleId: 10 }]);
  assert.deepEqual(report.styleAssignmentOverridesApplied, [{
    styleCode: 'AA001',
    styleId: 10,
    equivalentExistingStyleIds: [10, 11],
  }]);
});

test('cost planning compares decimals and uses Carton Price only', async (t) => {
  const parsed = await catalogue(t, [sourceRow({
    'Carton Price': '4.20',
    'Pack Price': '1.00',
    'Single Price': '1.00',
  })]);
  const changed = matchExistingProducts(parsed, [existingProduct({ unit_cost: '1.00' })]);
  assert.equal(changed.costChanged, 1);
  assert.equal(changed.costUnchanged, 0);

  const unchanged = matchExistingProducts(parsed, [existingProduct({ unit_cost: '4.2000' })]);
  assert.equal(unchanged.costUnchanged, 1);
  assert.equal(unchanged.costChanged, 0);
});

test('blank Carton Price is reported and preserves the existing cost plan', async (t) => {
  const parsed = await catalogue(t, [sourceRow({
    'Carton Price': '',
    'Pack Price': '',
    'Single Price': '',
  })]);
  const report = matchExistingProducts(parsed, [existingProduct({ unit_cost: '7.25' })]);
  assert.equal(report.costMissingPrice, 1);
  assert.equal(report.costChanged, 0);
  assert.equal(report.costUnchanged, 0);
  assert.equal(parsed.audit.blankAllPrices, 1);
});

test('stable negative allocations are reused and new identities do not collide', () => {
  const first = allocateStableNegativeIds(['SKU-B', 'SKU-A']);
  assert.deepEqual(Array.from(first.entries()), [['SKU-A', -1], ['SKU-B', -2]]);

  const repeated = allocateStableNegativeIds(['SKU-C', 'SKU-B', 'SKU-A'], first, -2);
  assert.equal(repeated.get('SKU-A'), -1);
  assert.equal(repeated.get('SKU-B'), -2);
  assert.equal(repeated.get('SKU-C'), -3);
});

test('repeat planning is idempotent and unmatched existing products are untouched', async (t) => {
  const parsed = await catalogue(t, [sourceRow()]);
  const unmatched = existingProduct({
    source_product_id: 999,
    style_id: 999,
    style_code: 'NO-MATCH',
    unit_cost: '9.99',
  });
  const first = matchExistingProducts(parsed, [unmatched]);
  assert.equal(first.unmatched, 1);
  assert.equal(first.matchedCount, 0);
  assert.equal(first.catalogueProductsToInsert, 1);

  const repeated = matchExistingProducts(parsed, [unmatched], {
    existingCatalogueSkus: new Set(['AA001BLACS']),
  });
  assert.equal(repeated.catalogueProductsToInsert, 0);
  assert.equal(repeated.catalogueProductsAlreadyPresent, 1);
  assert.equal(unmatched.unit_cost, '9.99');
});

test('multiple primary images and colour images are all preserved by source key', async (t) => {
  const parsed = await catalogue(t, [
    sourceRow(),
    sourceRow({
      'Sku Code': 'AA001NAVYM',
      'Colour Code': 'NAVY',
      'Colour Name': 'Navy',
      'Size Code': 'M',
      'Size Name': 'Medium',
      'Primary Product Image URL': 'https://example.test/AA001-primary-2.jpg',
      'Primary Product Image File Name': 'AA001-primary-2.jpg',
      'Colour Image': 'https://example.test/AA001-navy.jpg',
      'Colour Image File Name': 'AA001-navy.jpg',
    }),
  ]);
  assert.equal(parsed.audit.stylesWithMultiplePrimaryImages, 1);
  assert.equal(parsed.audit.images, 4);
});

test('zero item weight is normalized to unknown', () => {
  assert.equal(mapCsvRow(sourceRow({ 'Item Weight in KG': '.00' })).item_weight_kg, null);
  assert.equal(mapCsvRow(sourceRow({ 'Item Weight in KG': '0.2500' })).item_weight_kg, '0.25');
});

test('dry-run performs only read queries and never invokes schema/data writes', async (t) => {
  const filePath = fixture(t, [sourceRow()]);
  const queries = [];
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      assert.match(normalized, /^SELECT /i);
      return { rows: [{ table_name: null }], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async end() {},
  };

  const report = await run({
    filePath,
    dryRun: true,
    apply: false,
    batchSize: 100,
  }, {
    connectionString: 'postgres://example.test/test',
    pool,
  });
  assert.equal(report.source.records, 1);
  assert.equal(queries.length, 1);
});
