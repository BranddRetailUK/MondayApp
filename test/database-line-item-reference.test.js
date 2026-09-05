const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('stock line references are persisted and editable without becoming catalogue identity', () => {
  const schema = read('src/db/databaseSchema.js');
  const routes = read('src/routes/database.js');

  assert.match(schema, /ADD COLUMN IF NOT EXISTS item_reference TEXT/);
  assert.match(routes, /const itemReference = cleanNullable\(req\.body\?\.item_reference\)/);
  assert.match(routes, /catalogue_status,\s+item_reference,\s+catalogue_synced_at/);
  assert.match(routes, /'supplier_name',\s+'item_reference'/);
  assert.doesNotMatch(
    routes.match(/const canonicalLockedFields = \[[\s\S]*?\];/)?.[0] || '',
    /item_reference/
  );
});

test('Order Items renders Ref after VAT and reuses hover scrolling for clipped stock text', () => {
  const script = read('public/database.js');
  const styles = read('public/styles.css');

  assert.match(script, /<th>VAT:<\/th>\s*<th>Ref:<\/th>/);
  assert.match(
    script,
    /renderLineItemInput\(item, 'vatPercent',[\s\S]*?renderLineItemInput\(item, 'item_reference'/
  );
  assert.match(script, /data-line-input="itemReference"/);
  assert.match(script, /item_reference: String\(draft\.itemReference \|\| ''\)\.trim\(\) \|\| null/);
  assert.match(script, /field === 'item_reference'[\s\S]*?field === 'itemReference'/);
  assert.match(styles, /\.db-items-table th:nth-child\(11\)\{width:192px\}/);
  assert.match(styles, /\.db-items-table \.db-line-text-scrolling/);
});

test('local item references survive repeats and replace-mode MDB restoration', () => {
  const routes = read('src/routes/database.js');
  const importer = read('scripts/import-database-mdb.js');

  assert.match(routes, /item_reference,\s+catalogue_synced_at[\s\S]*?source_lines\.item_reference/);
  assert.match(importer, /'catalogue_synced_at',\s+'item_reference'/);
  assert.match(importer, /ralawise_catalog_variant_id IS NOT NULL\s+OR item_reference IS NOT NULL/);
  assert.match(importer, /item_reference = x\.item_reference/);
});

test('reviewed non-live Ralawise exceptions are scoped and survive MDB restoration', () => {
  const schema = read('src/db/databaseSchema.js');
  const routes = read('src/routes/database.js');
  const importer = read('scripts/import-database-mdb.js');

  assert.match(schema, /ralawise_allow_non_live BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(routes, /addLineItemUpdateField\(update, 'ralawise_allow_non_live', false\)/);
  assert.match(importer, /'item_reference',\s+'ralawise_allow_non_live'/);
  assert.match(importer, /ralawise_allow_non_live = x\.ralawise_allow_non_live/);
});
