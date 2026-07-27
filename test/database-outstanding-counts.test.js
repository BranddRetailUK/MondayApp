const assert = require('node:assert/strict');
const test = require('node:test');

test('home outstanding counts exclude dashboard-completed jobs before invoicing', async () => {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const fakePool = {
    async query(sql, values = []) {
      queries.push({ text: sql, values });
      return {
        rows: [{
          printing: 2,
          embroidery: 1,
          business_gifts: 0,
          total: 3,
        }],
      };
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
    const route = router.stack.find(layer => (
      layer.route?.path === '/api/database/outstanding-counts'
      && layer.route?.methods?.get
    ));
    assert.ok(route, 'outstanding-counts route is registered');

    const response = createResponse();
    await route.route.stack[0].handle({}, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      printing: 2,
      embroidery: 1,
      business_gifts: 0,
      total: 3,
    });
    assert.equal(queries.length, 1);
    assert.match(
      queries[0].text,
      /COALESCE\(UPPER\(TRIM\(dashboard_status\)\), ''\) <> 'COMPLETED'/
    );
    assert.doesNotMatch(queries[0].text, /invoice_printed|pf_invoice_printed|closed_without_invoice/);
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
});

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
