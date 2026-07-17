const assert = require('node:assert/strict');
const test = require('node:test');

test('Close Order finalizes an invoice-not-required job without creating invoice data', async () => {
  const result = await exerciseCloseRoute(false);

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.job.closed_without_invoice, true);
  assert.equal(result.response.body.job.invoice_required, false);
  assert.equal(result.response.body.job.invoice_no, null);
  assert.equal(result.response.body.job.invoice_printed, false);

  const update = result.queries.find((query) => query.includes('SET closed_without_invoice = TRUE'));
  assert.ok(update, 'expected the dedicated no-invoice close update');
  assert.match(update, /invoice_required IS FALSE/);
  assert.doesNotMatch(update, /invoice_printed\s*=\s*TRUE/);
  assert.doesNotMatch(update, /invoice_no\s*=/);
  assert.doesNotMatch(update, /invoice_date\s*=/);
  assert.ok(result.queries.includes('COMMIT'));
});

test('Close Order rejects jobs that require an invoice', async () => {
  const result = await exerciseCloseRoute(true);

  assert.equal(result.response.statusCode, 400);
  assert.match(result.response.body.error, /only available when an invoice is not required/i);
  assert.ok(result.queries.includes('ROLLBACK'));
  assert.equal(result.queries.includes('COMMIT'), false);
});

async function exerciseCloseRoute(invoiceRequired) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const client = {
    async query(sql) {
      const text = typeof sql === 'string' ? sql : sql.text;
      queries.push(text);
      if (/SELECT source_order_id, order_no\s+FROM database_jobs/.test(text)) {
        return { rowCount: 1, rows: [{ source_order_id: 8001, order_no: 8101 }] };
      }
      if (text.includes('SET closed_without_invoice = TRUE')) {
        if (invoiceRequired) return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [{
            source_order_id: 8001,
            order_no: 8101,
            dashboard_status: 'COMPLETED',
            invoice_required: false,
            invoice_no: null,
            invoice_printed: false,
            pf_invoice_printed: false,
            closed_without_invoice: true,
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
    async query(sql) {
      return client.query(sql);
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
      layer.route?.path === '/api/database/jobs/:id/close-without-invoice'
      && layer.route?.methods?.post
    ));
    assert.ok(route, 'Close Order route is registered');
    const response = createResponse();
    await route.route.stack[0].handle({ params: { id: '8001' } }, response);
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
