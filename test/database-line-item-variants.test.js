const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('saved stock rows hydrate full variants even when Order Items is hidden', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const preloadSource = script.match(
    /function preloadStockItemVariants\(\) \{[\s\S]*?\n  \}\n\n  async function loadStyleVariants/
  )?.[0] || '';

  assert.ok(preloadSource, 'stock variant preload function is present');
  assert.match(preloadSource, /sourceOrderId !== state\.selectedJob\?\.source_order_id/);
  assert.match(preloadSource, /renderItemsPanel\(\)/);
  assert.doesNotMatch(preloadSource, /activeOrderTab/);
});

test('saved stock dropdowns derive their options from the cached full style response', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');

  assert.match(
    script,
    /const variants = getCachedStyleVariants\(styleId\);[\s\S]*?stockVariantOptionsForLine\(item, variants, field\)/
  );
  assert.match(
    script,
    /params\.set\('sourceOrderId', String\(sourceOrderId\)\)[\s\S]*?\/products\/styles\/\$\{encodeURIComponent\(styleId\)\}\/variants/
  );
});

test('saved reviewed non-live variants are rehydrated only for their owning order', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'database.js'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const variantRoute = routes.match(
    /router\.get\('\/api\/database\/products\/styles\/:styleId\/variants'[\s\S]*?\n\}\);/
  )?.[0] || '';

  assert.match(variantRoute, /const sourceOrderId = nullableInt\(req\.query\.sourceOrderId\)/);
  assert.match(variantRoute, /v\.is_active IS TRUE[\s\S]*?line_items\.source_order_id = \$2/);
  assert.match(variantRoute, /line_items\.ralawise_catalog_variant_id = v\.id/);
  assert.match(variantRoute, /line_items\.ralawise_allow_non_live IS TRUE/);
  assert.match(script, /styleVariantCacheKey\(styleId, sourceOrderId\)/);
  assert.match(script, /numericSourceOrderId[\s\S]*?'catalogue'/);
});
