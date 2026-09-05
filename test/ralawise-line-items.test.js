const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyBackfill,
  parseArgs,
} = require('../scripts/backfill-ralawise-line-items');

test('line-item backfill requires an explicit safe mode', () => {
  assert.throws(() => parseArgs([]), /exactly one mode/i);
  assert.throws(() => parseArgs(['--apply']), /confirm-write/i);
  assert.deepEqual(parseArgs(['--dry-run']), {
    help: false,
    dryRun: true,
    apply: false,
  });
});

test('line-item backfill writes canonical identity without replacing historical fields', async () => {
  let sql = '';
  const client = {
    async query(value) {
      sql = String(value);
      return { rowCount: 12, rows: [] };
    },
  };

  const updated = await applyBackfill(client);
  assert.equal(updated, 12);
  const setClause = sql.match(/SET([\s\S]+?)FROM database_products/i)?.[1] || '';
  assert.match(setClause, /ralawise_catalog_variant_id/);
  assert.match(setClause, /ralawise_sku/);
  assert.doesNotMatch(setClause, /source_product_id\s*=/);
  assert.doesNotMatch(setClause, /line_description\s*=/);
  assert.doesNotMatch(setClause, /unit_cost\s*=/);
  assert.doesNotMatch(setClause, /unit_price\s*=/);
  assert.doesNotMatch(setClause, /colour\s*=/);
  assert.doesNotMatch(setClause, /size\s*=/);
  assert.doesNotMatch(setClause, /imported_at\s*=/);
});
