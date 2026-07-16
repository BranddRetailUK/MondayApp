const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CookieJar,
  applyReferences,
  buildStockWarnings,
  createRalawiseBasketClient,
  extractRequestVerificationToken,
  normalizeBasketItems,
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
