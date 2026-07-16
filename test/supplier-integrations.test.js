const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PenCarrieApiError,
  createPenCarrieClient,
} = require('../src/integrations/pencarrie');
const {
  RalawiseApiError,
  createRalawiseClient,
} = require('../src/integrations/ralawise');

const noWait = async () => {};

test('PenCarrie stock requests use the documented POST form fields', async () => {
  const calls = [];
  const client = createPenCarrieClient({
    config: {
      PENCARRIE_ENV: 'live',
      PENCARRIE_GATEWAY_URL: 'https://pencarrie.com/gateway',
      PENCARRIE_CUSTOMER_CODE: 'ABCD',
      PENCARRIE_HTTP_TIMEOUT_MS: 1000,
      PENCARRIE_RETRY_ATTEMPTS: 1,
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('<stock leadtime="+1"><colours /></stock>', {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      });
    },
    sleepImpl: noWait,
  });

  const result = await client.getStock('JH001');
  assert.equal(result.rootElement, 'stock');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].url, 'https://pencarrie.com/gateway');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].options.body)), {
    function: 'pcgetstock',
    code: 'ABCD',
    'args[0]': 'JH001',
  });
});

test('PenCarrie does not retry an IP rejection or fall back to GET', async () => {
  const methods = [];
  const client = createPenCarrieClient({
    config: {
      PENCARRIE_ENV: 'live',
      PENCARRIE_GATEWAY_URL: 'https://pencarrie.com/gateway',
      PENCARRIE_CUSTOMER_CODE: 'ABCD',
      PENCARRIE_HTTP_TIMEOUT_MS: 1000,
      PENCARRIE_RETRY_ATTEMPTS: 3,
    },
    fetchImpl: async (_url, options) => {
      methods.push(options.method);
      return new Response('<html><body>Forbidden</body></html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      });
    },
    sleepImpl: noWait,
  });

  await assert.rejects(
    () => client.getStock('JH001'),
    (error) => error instanceof PenCarrieApiError && error.code === 'ip_not_authorized'
  );
  assert.deepEqual(methods, ['POST']);
});

test('Ralawise authenticates with top-level credentials and reuses the bearer token', async () => {
  const calls = [];
  const client = createRalawiseClient({
    config: {
      RALAWISE_API_BASE_URL: 'https://api.ralawise.com',
      RALAWISE_USER: 'api@example.com',
      RALAWISE_PASSWORD: 'secret-value',
      RALAWISE_HTTP_TIMEOUT_MS: 1000,
      RALAWISE_RETRY_ATTEMPTS: 1,
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/v1/login')) {
        return Response.json({ access_token: 'jwt-token', token_type: 'bearer', expires_in: 1199 });
      }
      return Response.json({ productGroup: { id: 'GD001', products: [] } });
    },
    sleepImpl: noWait,
    nowImpl: () => 1000,
  });

  await client.getInventory('GD001');
  await client.getInventory('GD001BLACL');

  assert.equal(calls.filter((call) => call.url.endsWith('/v1/login')).length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    user: 'api@example.com',
    password: 'secret-value',
  });
  assert.equal(calls[1].options.headers.Authorization, 'Bearer jwt-token');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer jwt-token');
});

test('Ralawise reports rejected login without exposing the password', async () => {
  const client = createRalawiseClient({
    config: {
      RALAWISE_API_BASE_URL: 'https://api.ralawise.com',
      RALAWISE_USER: 'api@example.com',
      RALAWISE_PASSWORD: 'secret-value',
      RALAWISE_HTTP_TIMEOUT_MS: 1000,
      RALAWISE_RETRY_ATTEMPTS: 1,
    },
    fetchImpl: async () => Response.json(
      { messages: [{ errorCode: 'BadRequest', errorMessage: 'Invalid credentials' }] },
      { status: 400 }
    ),
    sleepImpl: noWait,
  });

  await assert.rejects(
    () => client.login(),
    (error) => {
      assert.ok(error instanceof RalawiseApiError);
      assert.equal(error.code, 'authentication_failed');
      assert.equal(error.status, 400);
      assert.doesNotMatch(JSON.stringify(error.toJSON()), /secret-value/);
      return true;
    }
  );
});
