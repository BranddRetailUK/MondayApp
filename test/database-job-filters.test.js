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

test('letter searches skip numeric job and invoice fields', () => {
  const filters = buildJobFilters({ q: 'PSG51981' });

  assert.deepEqual(filters.params, ['%PSG51981%']);
  assert.doesNotMatch(filters.whereSql, /CAST\(j\.source_order_id AS TEXT\)/);
  assert.doesNotMatch(filters.whereSql, /CAST\(j\.order_no AS TEXT\)/);
  assert.doesNotMatch(filters.whereSql, /CAST\(j\.invoice_no AS TEXT\)/);
  assert.match(filters.whereSql, /p_search\.design_ref ILIKE \$1/);
});

test('related-table searches build uncorrelated match sets', () => {
  const filters = buildJobFilters({ q: 'Hertford' });

  assert.match(filters.whereSql, /j\.source_order_id IN \(/);
  assert.match(filters.whereSql, /j\.customer_id IN \(/);
  assert.match(filters.whereSql, /LOWER\(j\.customer_name\) IN \(/);
  assert.doesNotMatch(filters.whereSql, /li_search\.source_order_id = j\.source_order_id/);
  assert.doesNotMatch(filters.whereSql, /a_search\.customer_id = j\.customer_id/);
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

test('To Invoice includes completed no-invoice jobs until they are explicitly closed', () => {
  const filters = buildJobFilters({ status: 'to-invoice' });

  assert.match(filters.whereSql, /dashboard_status/);
  assert.match(filters.whereSql, /j\.invoice_printed IS NOT TRUE/);
  assert.match(filters.whereSql, /j\.pf_invoice_printed IS NOT TRUE/);
  assert.match(
    filters.whereSql,
    /NOT \(j\.invoice_required IS FALSE AND j\.closed_without_invoice IS TRUE\)/
  );
  assert.doesNotMatch(filters.whereSql, /j\.invoice_required IS NOT FALSE/);
});

test('open jobs treat completed or invoiced no-invoice closures as finalized', () => {
  const filters = buildJobFilters({ status: 'open' });

  assert.match(
    filters.whereSql,
    /dashboard_status\)\), ''\) IN \('COMPLETED', 'INVOICED'\)/
  );
  assert.match(
    filters.whereSql,
    /j\.invoice_required IS FALSE AND j\.closed_without_invoice IS TRUE/
  );
});
