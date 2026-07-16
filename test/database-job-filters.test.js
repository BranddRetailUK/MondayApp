const test = require('node:test');
const assert = require('node:assert/strict');

const { buildJobFilters } = require('../src/services/databaseJobFilters');

test('All Jobs search uses the real imported address columns', () => {
  const filters = buildJobFilters({ q: '51981' });

  assert.deepEqual(filters.params, ['%51981%']);
  assert.match(filters.whereSql, /CAST\(j\.invoice_no AS TEXT\) ILIKE \$1/);
  assert.match(filters.whereSql, /a_search\.address_line1 ILIKE \$1/);
  assert.match(filters.whereSql, /a_search\.address_line5 ILIKE \$1/);
  assert.match(filters.whereSql, /a_search\.postcode ILIKE \$1/);
  assert.doesNotMatch(filters.whereSql, /a_search\.address ILIKE/);
});

test('job filters keep parameter positions stable when filters are combined', () => {
  const filters = buildJobFilters({
    q: 'shirt',
    customer: 'Ultimate',
    type: 'Printing',
    year: '2026',
    status: 'open',
  });

  assert.deepEqual(filters.params, ['%shirt%', '%Ultimate%', 'Printing', 2026]);
  assert.match(filters.whereSql, /j\.customer_name ILIKE \$2/);
  assert.match(filters.whereSql, /j\.order_type ILIKE \$3/);
  assert.match(filters.whereSql, /j\.source_year = \$4/);
  assert.match(filters.whereSql, /j\.is_complete IS NOT TRUE/);
});
