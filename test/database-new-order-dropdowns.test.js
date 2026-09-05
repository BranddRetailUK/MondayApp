const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('new order dropdowns omit blank options and preselect only Account payment terms', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const form = html.match(/<form id="db-new-order-form"[\s\S]*?<\/form>/)?.[0];

  assert.ok(form, 'new order form exists');
  assert.doesNotMatch(form, /<option\s+value=""/);
  assert.match(form, /<option value="Account" selected>Account<\/option>/);
  assert.match(
    script,
    /document\.getElementById\('db-new-payment-terms'\)\.value = 'Account'/
  );
  assert.match(script, /NEW_ORDER_UNSELECTED_DROPDOWN_IDS\.forEach[\s\S]*?selectedIndex = -1/);
  assert.match(
    script,
    /function updateNewOrderTakenBy[\s\S]*?select\.selectedIndex = -1/
  );
  assert.match(script, /function populateContactSelect[\s\S]*?const options = \[\];/);
  assert.match(
    script,
    /function populateContactSelect[\s\S]*?else \{\s*select\.selectedIndex = -1;/
  );
  assert.match(script, /function populateAddressSelect[\s\S]*?const options = \[\];/);
  assert.match(
    script,
    /function populateAddressSelect[\s\S]*?else \{\s*select\.selectedIndex = -1;/
  );
});
