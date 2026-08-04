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
    /fetchJson\(`\/api\/database\/products\/styles\/\$\{encodeURIComponent\(styleId\)\}\/variants`\)/
  );
});
