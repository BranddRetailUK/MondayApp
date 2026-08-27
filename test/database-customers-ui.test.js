const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('customer orders have a customer-scoped bottom search and latest orders open directly', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(
    html,
    /id="db-customer-orders-panel"[\s\S]+id="db-customer-orders-search"[\s\S]+Search this customer's orders/
  );
  assert.match(script, /customerOrderMatchesSearch\(order, query\)/);
  assert.match(script, /order\.source_order_id,[\s\S]+order\.order_no,[\s\S]+order\.invoice_no,[\s\S]+order\.job_title/);
  assert.match(script, /data-db-customer-order-open=/);
  assert.match(script, /openOrder\(orderButton\.dataset\.dbCustomerOrderOpen, 'details'\)/);
  assert.match(script, /--db-customers-latest-order-width/);
  assert.match(styles, /#db-customers-table th:nth-child\(3\)\s*\{[\s\S]+--db-customers-latest-order-width/);
  assert.match(styles, /#db-customer-orders-panel\.active\s*\{[\s\S]+flex-direction:column/);
  assert.doesNotMatch(
    html.match(/id="db-customer-orders-table"[\s\S]*?<\/table>/)?.[0] || '',
    /Taken by:/
  );
  assert.match(styles, /#db-customer-orders-table th:nth-child\(3\)\{width:58px\}/);
  assert.match(styles, /\.db-customer-job-title-cell\{\s*min-width:220px;/);
  assert.match(script, /formatDate\(order\.invoice_date \|\| order\.complete_date, 'long'\)/);
  assert.match(script, /function orderContactSelect[\s\S]*state\.orderCustomerDetail\?\.contacts/);
  assert.match(script, /data-db-contact-select/);
  assert.match(script, /function renderCustomerAddressColumn/);
  assert.match(script, />Add Address<\/button>/);
  assert.match(script, /data-customer-address-default/);
});
