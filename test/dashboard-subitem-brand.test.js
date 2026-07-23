const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildSubitem,
} = require('../src/routes/test-dashboard');
const {
  TEST_DASHBOARD_SUBITEM_COLUMNS,
} = require('../src/services/testDashboardDefaults');

test('dashboard subitems expose resolved product brand alongside existing values', () => {
  const subitem = buildSubitem({
    source_order_item_id: 123,
    line_description: 'Heavy cotton T-shirt',
    product_brand: 'Gildan',
    style_code: 'GD005',
    colour: 'Black',
    size: 'XL',
    quantity: 12,
  }, TEST_DASHBOARD_SUBITEM_COLUMNS);

  assert.equal(subitem.brand, 'Gildan');
  assert.equal(subitem.name, 'Heavy cotton T-shirt');
  assert.equal(
    subitem.column_values.find(value => value.id === 'text_mkvdj3cd')?.text,
    'GD005'
  );
});

test('dashboard line query resolves brand through catalogue and legacy style links', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'test-dashboard.js'),
    'utf8'
  );

  assert.match(source, /catalog_style\.brand[\s\S]*legacy_style\.brand[\s\S]*AS product_brand/);
  assert.match(source, /catalog_variant\.id = COALESCE\([\s\S]*li\.ralawise_catalog_variant_id,[\s\S]*product\.ralawise_catalog_variant_id/);
  assert.match(source, /legacy_style\.database_product_style_id = COALESCE\(li\.style_id, product\.style_id\)/);
});
