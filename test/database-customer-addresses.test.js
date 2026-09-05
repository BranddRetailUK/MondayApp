const assert = require('node:assert/strict');
const test = require('node:test');

test('customer address edit updates invoice and delivery profile fields independently', async () => {
  const profile = baseProfile({ id: 73, customer_id: 501, customer_name: 'Address Update Ltd' });
  const result = await exerciseAddressRoute({
    customerKey: 'profile:73',
    profile,
    latestOrder: null,
  });

  assert.equal(result.response.statusCode, 200);
  const update = result.calls.find(({ text }) => text.includes('UPDATE database_customer_profiles'));
  assert.ok(update, 'expected the customer profile update');
  assert.deepEqual(update.values.slice(1, 10), invoiceValues());
  assert.deepEqual(update.values.slice(10, 19), deliveryValues());
  assertAddressResponse(result.response.body.addresses);
});

test('first imported-customer address edit creates a profile with both address roles', async () => {
  const result = await exerciseAddressRoute({
    customerKey: '501',
    profile: null,
    latestOrder: {
      source_order_id: 8001,
      customer_id: 501,
      customer_name: 'Imported Address Ltd',
      customer_code: 'IAL',
      contact_name: 'Alex Example',
      contact_phone: '020 6000 1000',
      contact_mobile: '07700 900123',
      contact_email: 'alex@example.test',
      order_owner_user_id: null,
      order_owner_name: null,
      order_taken_by: null,
    },
  });

  assert.equal(result.response.statusCode, 200);
  const insert = result.calls.find(({ text }) => text.includes('INSERT INTO database_customer_profiles'));
  assert.ok(insert, 'expected a manual customer profile insert');
  assert.deepEqual(insert.values.slice(7, 16), invoiceValues());
  assert.deepEqual(insert.values.slice(16, 25), deliveryValues());
  assertAddressResponse(result.response.body.addresses);
});

async function exerciseAddressRoute({ customerKey, profile, latestOrder }) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const calls = [];

  const fakePool = {
    async query(sql, values = []) {
      const text = typeof sql === 'string' ? sql : sql.text;
      calls.push({ text, values });

      if (text.includes('FROM database_customer_profiles') && text.includes('LIMIT 1')) {
        return { rowCount: profile ? 1 : 0, rows: profile ? [profile] : [] };
      }
      if (text.includes('FROM database_jobs') && text.includes('LIMIT 1')) {
        return { rowCount: latestOrder ? 1 : 0, rows: latestOrder ? [latestOrder] : [] };
      }
      if (text.includes('FROM hub_users')) {
        return {
          rowCount: 1,
          rows: [{ id: 42, first_name: 'Address', last_name: 'Tester' }],
        };
      }
      if (text.includes('UPDATE database_customer_profiles')) {
        return { rowCount: 1, rows: [profileFromUpdate(values, profile)] };
      }
      if (text.includes('INSERT INTO database_customer_profiles')) {
        return { rowCount: 1, rows: [profileFromInsert(values)] };
      }
      return { rowCount: 0, rows: [] };
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
      && layer.route?.methods?.put
    ));
    assert.ok(route, 'customer address update route is registered');
    const response = createResponse();
    await route.route.stack[0].handle({
      params: { key: customerKey },
      body: addressPayload(),
      hubUser: { id: 42, first_name: 'Address', last_name: 'Tester' },
    }, response);
    return { response, calls };
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
}

function addressPayload() {
  return {
    invoice_address_line1: '17 Market Street',
    invoice_address_line2: 'Suite 4',
    invoice_address_line3: 'London',
    invoice_address_line4: '',
    invoice_address_line5: '',
    invoice_postcode: 'sw1a1aa',
    invoice_phone: '020 7000 1111',
    invoice_fax: '020 7000 1112',
    delivery_address_line1: 'Warehouse Two',
    delivery_address_line2: '9 Delivery Road',
    delivery_address_line3: 'Croydon',
    delivery_address_line4: '',
    delivery_address_line5: '',
    delivery_postcode: 'cr01aa',
    delivery_phone: '020 8000 2222',
    delivery_fax: '020 8000 2223',
  };
}

function invoiceValues() {
  return [
    '17 Market Street, Suite 4, London, SW1A 1AA',
    '17 Market Street',
    'Suite 4',
    'London',
    null,
    null,
    'SW1A 1AA',
    '020 7000 1111',
    '020 7000 1112',
  ];
}

function deliveryValues() {
  return [
    'Warehouse Two, 9 Delivery Road, Croydon, CR0 1AA',
    'Warehouse Two',
    '9 Delivery Road',
    'Croydon',
    null,
    null,
    'CR0 1AA',
    '020 8000 2222',
    '020 8000 2223',
  ];
}

function profileFromUpdate(values, profile) {
  return baseProfile({
    ...profile,
    invoice_address: values[1],
    invoice_address_line1: values[2],
    invoice_address_line2: values[3],
    invoice_address_line3: values[4],
    invoice_address_line4: values[5],
    invoice_address_line5: values[6],
    invoice_postcode: values[7],
    invoice_phone: values[8],
    invoice_fax: values[9],
    delivery_address: values[10],
    delivery_address_line1: values[11],
    delivery_address_line2: values[12],
    delivery_address_line3: values[13],
    delivery_address_line4: values[14],
    delivery_address_line5: values[15],
    delivery_postcode: values[16],
    delivery_phone: values[17],
    delivery_fax: values[18],
    updated_by_user_id: values[19],
    updated_by_name: values[20],
  });
}

function profileFromInsert(values) {
  return baseProfile({
    id: 91,
    customer_id: values[0],
    customer_name: values[1],
    customer_code: values[2],
    contact_name: values[3],
    contact_phone: values[4],
    contact_mobile: values[5],
    contact_email: values[6],
    invoice_address: values[7],
    invoice_address_line1: values[8],
    invoice_address_line2: values[9],
    invoice_address_line3: values[10],
    invoice_address_line4: values[11],
    invoice_address_line5: values[12],
    invoice_postcode: values[13],
    invoice_phone: values[14],
    invoice_fax: values[15],
    delivery_address: values[16],
    delivery_address_line1: values[17],
    delivery_address_line2: values[18],
    delivery_address_line3: values[19],
    delivery_address_line4: values[20],
    delivery_address_line5: values[21],
    delivery_postcode: values[22],
    delivery_phone: values[23],
    delivery_fax: values[24],
    account_manager_user_id: values[25],
    account_manager_name: values[26],
    updated_by_user_id: values[29],
    updated_by_name: values[30],
  });
}

function baseProfile(overrides = {}) {
  return {
    id: 1,
    customer_id: null,
    customer_name: 'Address Customer',
    customer_code: null,
    contact_name: null,
    contact_phone: null,
    contact_mobile: null,
    contact_email: null,
    marketing_opt_in: false,
    invoice_address: null,
    delivery_address: null,
    account_manager_user_id: null,
    account_manager_name: null,
    created_at_source: '2026-07-21T09:00:00.000Z',
    updated_at_source: '2026-07-21T10:00:00.000Z',
    updated_by_name: 'Address Tester',
    ...overrides,
  };
}

function assertAddressResponse(addresses) {
  assert.equal(addresses.length, 2);
  const invoice = addresses.find((address) => address.address_type === 'Invoice');
  const delivery = addresses.find((address) => address.address_type === 'Delivery');
  assert.equal(invoice.address_line1, '17 Market Street');
  assert.equal(invoice.postcode, 'SW1A 1AA');
  assert.equal(delivery.address_line1, 'Warehouse Two');
  assert.equal(delivery.postcode, 'CR0 1AA');
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
