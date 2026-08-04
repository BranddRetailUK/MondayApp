const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CookieJar,
  applyReferences,
  buildStockWarnings,
  basketSnapshotsMatch,
  createRalawiseBasketClient,
  extractRequestVerificationToken,
  normalizeBasketItems,
  normalizedBasketSnapshot,
  parseRalawiseOrderDetailLines,
  splitSetCookieHeader,
} = require('../src/integrations/ralawiseBasket');

function response(body, options = {}) {
  return {
    ok: options.status ? options.status >= 200 && options.status < 300 : true,
    status: options.status || 200,
    headers: {
      getSetCookie: () => options.cookies || [],
    },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

test('extractRequestVerificationToken handles either HTML attribute order', () => {
  assert.equal(
    extractRequestVerificationToken('<input value="abc&amp;123" type="hidden" name="__RequestVerificationToken">'),
    'abc&123'
  );
});

test('CookieJar preserves multiple cookies including an Expires comma', () => {
  const jar = new CookieJar();
  const cookies = splitSetCookieHeader(
    'session=one; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, auth=two; Path=/'
  );
  jar.capture({ getSetCookie: () => cookies });
  assert.equal(jar.header(), 'session=one; auth=two');
});

test('normalizeBasketItems groups only matching code and reference pairs', () => {
  assert.deepEqual(normalizeBasketItems([
    { code: ' gd001blacl ', quantity: 2, reference: '12345' },
    { Code: 'GD001BLACL', Qty: 3, OrderLineRef: '12345' },
    { code: 'GD001BLACL', quantity: 1, reference: '67890' },
    { code: '', quantity: 4 },
  ]), [
    { Code: 'GD001BLACL', Qty: 5, SetQuantity: false, OrderLineRef: '12345' },
    { Code: 'GD001BLACL', Qty: 1, SetQuantity: false, OrderLineRef: '67890' },
  ]);
});

test('normalized basket snapshots compare exact SKU, reference, and aggregate quantity', () => {
  const raw = [
    { Code: 'one', Qty: 1, OLRef: 'JOB-10' },
    { Code: 'ONE', Qty: 2, OrderLineRef: 'JOB-10' },
    { Code: 'TWO', Qty: 4, OLRef: 'OTHER' },
  ];
  const expected = [{ code: 'ONE', quantity: 3, reference: 'JOB-10' }];

  assert.deepEqual(normalizedBasketSnapshot(raw, 'JOB-10'), [
    { code: 'ONE', quantity: 3, reference: 'JOB-10' },
  ]);
  assert.equal(basketSnapshotsMatch(raw, expected, 'JOB-10'), true);
  assert.equal(basketSnapshotsMatch(raw, [
    { code: 'ONE', quantity: 2, reference: 'JOB-10' },
  ], 'JOB-10'), false);
});

test('applyReferences does not attach a job reference to an existing unreferenced basket line', () => {
  const original = [{ Code: 'GD001BLACL', Qty: 1, OLRef: '' }];
  const current = [
    { Code: 'GD001BLACL', Qty: 1, OLRef: '' },
    { Code: 'GD001BLACL', Qty: 2, OLRef: '' },
  ];
  const result = applyReferences(current, [
    { Code: 'GD001BLACL', Qty: 2, OrderLineRef: 'JOB-10' },
  ], original);

  assert.equal(result.updated_count, 0);
  assert.equal(result.protected_unreferenced_count, 2);
  assert.equal(result.missing_reference_count, 1);
});

test('buildStockWarnings reports partial and zero allocations', () => {
  assert.deepEqual(buildStockWarnings({
    Items: [
      { Code: 'ONE', Quantity: 4, AllocatedQuantity: 2 },
      { Code: 'TWO', Quantity: 1, AllocatedQuantity: 0, Message: 'No stock' },
      { Code: 'THREE', Quantity: 2, AllocatedQuantity: 2 },
    ],
  }), [
    {
      code: 'ONE',
      requested_quantity: 4,
      allocated_quantity: 2,
      out_of_stock: false,
      message: '',
    },
    {
      code: 'TWO',
      requested_quantity: 1,
      allocated_quantity: 0,
      out_of_stock: true,
      message: 'No stock',
    },
  ]);
});

test('parseRalawiseOrderDetailLines reads placed-order references and discounted unit prices', () => {
  const lines = parseRalawiseOrderDetailLines(`
    <section>
      <div class="card-body order-summary-item">
        <input class="product-productcode" value="GD001">
        <input class="product-variantcode" value="GD001BLACL">
        <input class="product-productcolour" value="Black">
        <input class="product-productsize" value="L">
        <input class="product-orderqty" value="3">
        <input class="product-unitprice" value="2.17">
        <input class="product-orderline" value="1000">
        <input class="product-sageorder" value="W12345">
        <span>OL Ref 51160 Qty Alloc 3</span>
        <span>Line Total £6.51</span>
      </div>
    </section>
  `);

  assert.deepEqual(lines, [{
    line_index: 0,
    product_code: 'GD001',
    variant_code: 'GD001BLACL',
    code: 'GD001BLACL',
    colour: 'Black',
    size: 'L',
    quantity: 3,
    order_line: '1000',
    sage_order_number: 'W12345',
    unit_price: 2.17,
    line_total: 6.51,
    line_reference: '51160',
  }]);
});

test('getPlacedOrders searches order history and loads supplier order details', async () => {
  const calls = [];
  const queued = [
    response('<input name="__RequestVerificationToken" value="login-token">'),
    response({ Success: true }),
    response({
      Success: true,
      Data: {
        TotalRecord: 1,
        records: [{
          SageOrderNo: 'W12345',
          WebOrderNo: '53000001',
          CustomerOrderNo: '51160',
          FormattedTotalAmount: '£6.51',
          FormattedDateCreated: '16/07/2026 12:30:00',
        }],
      },
    }),
    response(`
      <section><div class="card-body order-summary-item">
        <input class="product-productcode" value="GD001">
        <input class="product-variantcode" value="GD001BLACL">
        <input class="product-orderqty" value="3">
        <input class="product-unitprice" value="2.17">
        <span>OL Ref 51160 Qty Alloc 3</span>
      </div></section>
    `),
  ];
  const client = createRalawiseBasketClient({
    config: {
      RALAWISE_SHOP_BASE_URL: 'https://shop.ralawise.com',
      RALAWISE_USER: 'buyer@example.test',
      RALAWISE_PASSWORD: 'secret',
      RALAWISE_REQUEST_TIMEOUT_MS: 5000,
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const next = queued.shift();
      assert.ok(next, `Unexpected fetch call to ${url}`);
      return next;
    },
  });

  const result = await client.getPlacedOrders({ keywords: ['51160'], maxPages: 1 });

  assert.equal(queued.length, 0);
  assert.equal(new URL(calls[2].url).pathname, '/services/orderhistoryservice/searchorders');
  assert.match(calls[2].options.body, /keyword=51160/);
  assert.equal(result.orders[0].ralawise_order_number, 'W12345');
  assert.equal(result.orders[0].lines[0].unit_price, 2.17);
  assert.equal(result.orders[0].lines[0].line_reference, '51160');
});

test('addItems signs in, adds grouped quantities, updates references, and returns warnings', async () => {
  const calls = [];
  const queued = [
    response('<input name="__RequestVerificationToken" value="login-token">', { cookies: ['anti=one; Path=/'] }),
    response({ Success: true }, { cookies: ['auth=two; Path=/'] }),
    response('<input name="__RequestVerificationToken" value="basket-token">'),
    response({ Success: true, Data: { OrderRef: 'BASKET-1', Items: [] } }),
    response({
      Success: true,
      Items: [{ Code: 'GD001BLACL', Quantity: 3, AllocatedQuantity: 2 }],
    }),
    response({
      Success: true,
      Data: {
        OrderRef: 'BASKET-1',
        Items: [{ Code: 'GD001BLACL', Qty: 3, OLRef: '' }],
      },
    }),
    response({ Success: true }),
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = queued.shift();
    assert.ok(next, `Unexpected fetch call to ${url}`);
    return next;
  };
  const client = createRalawiseBasketClient({
    config: {
      RALAWISE_SHOP_BASE_URL: 'https://shop.ralawise.com',
      RALAWISE_USER: 'buyer@example.test',
      RALAWISE_PASSWORD: 'secret',
      RALAWISE_REQUEST_TIMEOUT_MS: 5000,
    },
    fetchImpl,
  });

  const result = await client.addItems([
    { code: 'GD001BLACL', quantity: 1, reference: '12345' },
    { code: 'GD001BLACL', quantity: 2, reference: '12345' },
  ]);

  assert.equal(queued.length, 0);
  assert.equal(calls.length, 7);
  assert.equal(new URL(calls[1].url).pathname, '/Services/Authentication/SignIn');
  assert.match(calls[1].options.headers.Cookie, /anti=one/);
  assert.match(calls[2].options.headers.Cookie, /auth=two/);
  assert.equal(new URL(calls[4].url).pathname, '/services/cart/AddMultiItemsToCart');
  assert.deepEqual(JSON.parse(calls[4].options.body), [
    { Code: 'GD001BLACL', Qty: 3, SetQuantity: false, OrderLineRef: '12345' },
  ]);
  assert.equal(new URL(calls[6].url).pathname, '/services/cart/updateBasket');
  assert.equal(JSON.parse(calls[6].options.body).UpdateCartDtos[0].OLRef, '12345');
  assert.equal(result.total_quantity, 3);
  assert.equal(result.updated_reference_count, 1);
  assert.equal(result.stock_warnings[0].allocated_quantity, 2);
});

test('updateItems changes the quantity only after the live basket matches its audit', async () => {
  const calls = [];
  const queued = [
    response('<input name="__RequestVerificationToken" value="login-token">'),
    response({ Success: true }),
    response('<input name="__RequestVerificationToken" value="basket-token">'),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'ONE', Qty: 2, OLRef: 'JOB-10' }],
    } }),
    response({ Success: true }),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'ONE', Qty: 3, OLRef: 'JOB-10' }],
    } }),
  ];
  const client = createRalawiseBasketClient({
    config: {
      RALAWISE_SHOP_BASE_URL: 'https://shop.ralawise.com',
      RALAWISE_USER: 'buyer@example.test',
      RALAWISE_PASSWORD: 'secret',
      RALAWISE_REQUEST_TIMEOUT_MS: 5000,
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const next = queued.shift();
      assert.ok(next, `Unexpected fetch call to ${url}`);
      return next;
    },
  });

  const result = await client.updateItems(
    [{ code: 'ONE', quantity: 2, reference: 'JOB-10' }],
    [{ code: 'ONE', quantity: 3, reference: 'JOB-10' }],
    { reference: 'JOB-10' }
  );

  assert.equal(queued.length, 0);
  assert.equal(new URL(calls[4].url).pathname, '/services/cart/updateBasket');
  assert.equal(JSON.parse(calls[4].options.body).UpdateCartDtos[0].Qty, 3);
  assert.equal(result.total_quantity, 3);
});

test('updateItems replaces a SKU and reapplies the job reference', async () => {
  const calls = [];
  const queued = [
    response('<input name="__RequestVerificationToken" value="login-token">'),
    response({ Success: true }),
    response('<input name="__RequestVerificationToken" value="basket-token">'),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'OLD', Qty: 2, OLRef: 'JOB-10' }],
    } }),
    response({ Success: true }),
    response({ Success: true, Data: { OrderRef: 'BASKET-1', Items: [] } }),
    response({ Success: true, Items: [{ Code: 'NEW', Quantity: 2, AllocatedQuantity: 2 }] }),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'NEW', Qty: 2, OLRef: '' }],
    } }),
    response({ Success: true }),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'NEW', Qty: 2, OLRef: 'JOB-10' }],
    } }),
  ];
  const client = createRalawiseBasketClient({
    config: {
      RALAWISE_SHOP_BASE_URL: 'https://shop.ralawise.com',
      RALAWISE_USER: 'buyer@example.test',
      RALAWISE_PASSWORD: 'secret',
      RALAWISE_REQUEST_TIMEOUT_MS: 5000,
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const next = queued.shift();
      assert.ok(next, `Unexpected fetch call to ${url}`);
      return next;
    },
  });

  const result = await client.updateItems(
    [{ code: 'OLD', quantity: 2, reference: 'JOB-10' }],
    [{ code: 'NEW', quantity: 2, reference: 'JOB-10' }],
    { reference: 'JOB-10' }
  );

  assert.equal(queued.length, 0);
  assert.equal(new URL(calls[6].url).pathname, '/services/cart/AddMultiItemsToCart');
  assert.equal(new URL(calls[8].url).pathname, '/services/cart/updateBasket');
  assert.equal(JSON.parse(calls[8].options.body).UpdateCartDtos[0].OLRef, 'JOB-10');
  assert.deepEqual(result.items, [{ code: 'NEW', quantity: 2, reference: 'JOB-10' }]);
});

test('updateItems refuses to mutate a manually changed or already-ordered live basket', async () => {
  const calls = [];
  const queued = [
    response('<input name="__RequestVerificationToken" value="login-token">'),
    response({ Success: true }),
    response('<input name="__RequestVerificationToken" value="basket-token">'),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'MANUAL', Qty: 2, OLRef: 'JOB-10' }],
    } }),
  ];
  const client = createRalawiseBasketClient({
    config: {
      RALAWISE_SHOP_BASE_URL: 'https://shop.ralawise.com',
      RALAWISE_USER: 'buyer@example.test',
      RALAWISE_PASSWORD: 'secret',
      RALAWISE_REQUEST_TIMEOUT_MS: 5000,
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const next = queued.shift();
      assert.ok(next, `Unexpected fetch call to ${url}`);
      return next;
    },
  });

  await assert.rejects(client.updateItems(
    [{ code: 'OLD', quantity: 2, reference: 'JOB-10' }],
    [{ code: 'NEW', quantity: 2, reference: 'JOB-10' }],
    { reference: 'JOB-10' }
  ), (error) => error.code === 'basket_drift' && error.status === 409);
  assert.equal(queued.length, 0);
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
});

test('updateItems reports a potentially partial supplier mutation when replacement fails', async () => {
  const queued = [
    response('<input name="__RequestVerificationToken" value="login-token">'),
    response({ Success: true }),
    response('<input name="__RequestVerificationToken" value="basket-token">'),
    response({ Success: true, Data: {
      OrderRef: 'BASKET-1',
      Items: [{ Code: 'OLD', Qty: 2, OLRef: 'JOB-10' }],
    } }),
    response({ Success: true }),
    response({ Success: true, Data: { OrderRef: 'BASKET-1', Items: [] } }),
    response({ Success: false, Message: 'Replacement unavailable' }),
  ];
  const client = createRalawiseBasketClient({
    config: {
      RALAWISE_SHOP_BASE_URL: 'https://shop.ralawise.com',
      RALAWISE_USER: 'buyer@example.test',
      RALAWISE_PASSWORD: 'secret',
      RALAWISE_REQUEST_TIMEOUT_MS: 5000,
    },
    fetchImpl: async (url) => {
      const next = queued.shift();
      assert.ok(next, `Unexpected fetch call to ${url}`);
      return next;
    },
  });

  await assert.rejects(client.updateItems(
    [{ code: 'OLD', quantity: 2, reference: 'JOB-10' }],
    [{ code: 'NEW', quantity: 2, reference: 'JOB-10' }],
    { reference: 'JOB-10' }
  ), (error) => (
    error.code === 'basket_update_partial'
    && error.status === 409
    && /before checkout/i.test(error.message)
  ));
  assert.equal(queued.length, 0);
});
