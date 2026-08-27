const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('customer saved-address schema supports unlimited customer-owned rows and independent defaults', () => {
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'db', 'databaseSchema.js'),
    'utf8'
  );

  assert.match(schema, /CREATE TABLE IF NOT EXISTS database_customer_saved_addresses/);
  assert.match(schema, /use_for_invoice BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(schema, /use_for_delivery BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(schema, /is_default_invoice BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(schema, /is_default_delivery BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.doesNotMatch(schema, /UNIQUE\s*\(\s*customer_id\s*\)/);
});

test('Add Address stores a second customer address and clears only the matching prior default', async () => {
  const result = await exerciseSavedAddressRoute();

  assert.equal(result.response.statusCode, 201);
  assert.equal(result.response.body.address.address_line1, 'Second Site');
  assert.equal(result.response.body.address.address_type, 'Invoice / Delivery');
  assert.equal(result.response.body.address.is_default_invoice, true);
  assert.equal(result.response.body.address.is_default_delivery, false);

  const insert = result.queries.find(({ text }) => text.includes('INSERT INTO database_customer_saved_addresses'));
  assert.ok(insert, 'expected saved address insert');
  assert.equal(insert.values[0], 501);
  assert.equal(insert.values[1], 73);
  assert.equal(insert.values[2], 'Address Update Ltd');
  assert.equal(insert.values[3], true);
  assert.equal(insert.values[4], true);
  assert.equal(insert.values[5], true);
  assert.equal(insert.values[6], false);

  const defaultClears = result.queries.filter(({ text }) => (
    text.includes('UPDATE database_customer_saved_addresses')
    && text.includes('id <> $1')
  ));
  assert.equal(defaultClears.length, 1);
  assert.match(defaultClears[0].text, /is_default_invoice = FALSE/);
  assert.doesNotMatch(defaultClears[0].text, /is_default_delivery = FALSE/);
});

async function exerciseSavedAddressRoute() {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const text = typeof sql === 'string' ? sql : sql.text;
      queries.push({ text, values });
      if (text.includes('FROM database_customer_profiles') && text.includes('LIMIT 1')) {
        return {
          rowCount: 1,
          rows: [{ id: 73, customer_id: 501, customer_name: 'Address Update Ltd' }],
        };
      }
      if (text.includes('INSERT INTO database_customer_saved_addresses')) {
        return {
          rowCount: 1,
          rows: [{
            id: 92,
            customer_id: values[0],
            profile_id: values[1],
            customer_name: values[2],
            use_for_invoice: values[3],
            use_for_delivery: values[4],
            is_default_invoice: values[5],
            is_default_delivery: values[6],
            address_line1: values[7],
            address_line2: values[8],
            address_line3: values[9],
            address_line4: values[10],
            address_line5: values[11],
            postcode: values[12],
            phone: values[13],
            fax: values[14],
            created_at_source: '2026-08-27T10:00:00.000Z',
            updated_at_source: '2026-08-27T10:00:00.000Z',
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const fakePool = {
    async connect() {
      return client;
    },
    async query(sql, values) {
      return client.query(sql, values);
    },
  };

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: fakePool,
  };
  delete require.cache[routePath];

  try {
    const router = require('../src/routes/database');
    const route = router.stack.find((layer) => (
      layer.route?.path === '/api/database/customers/:key/addresses'
      && layer.route?.methods?.post
    ));
    assert.ok(route, 'Add Address route is registered');
    const response = createResponse();
    await route.route.stack[0].handle({
      params: { key: 'profile:73' },
      body: {
        address_line1: 'Second Site',
        address_line2: '18 New Road',
        address_line3: 'London',
        postcode: 'sw1a1aa',
        phone: '020 7000 1234',
        fax: '',
        use_for_invoice: true,
        use_for_delivery: true,
        is_default_invoice: true,
        is_default_delivery: false,
      },
      hubUser: { id: 42, first_name: 'Address', last_name: 'Tester' },
    }, response);
    return { response, queries };
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
