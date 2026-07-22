const assert = require('node:assert/strict');
const test = require('node:test');

test('Invoice Required can be changed from No to Yes and clears a stale no-invoice closure', async () => {
  const result = await exerciseInvoiceRequiredUpdate('yes');

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.job.invoice_required, true);
  assert.equal(result.response.body.job.closed_without_invoice, false);
  assert.deepEqual(result.update.values, [8001, true]);
  assert.match(result.update.text, /closed_without_invoice = CASE/);
  assert.match(result.update.text, /invoice_required = \$2/);
  assert.doesNotMatch(result.update.text, /invoice_no IS NULL/);
});

test('Invoice Required can be changed to No before an invoice is generated', async () => {
  const result = await exerciseInvoiceRequiredUpdate(false);

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.job.invoice_required, false);
  assert.deepEqual(result.update.values, [8001, false]);
  assert.match(result.update.text, /invoice_no IS NULL/);
  assert.match(result.update.text, /invoice_printed IS NOT TRUE/);
});

test('Invoice Required cannot be changed to No after an invoice is generated', async () => {
  const result = await exerciseInvoiceRequiredUpdate('no', { generatedInvoice: true });

  assert.equal(result.response.statusCode, 409);
  assert.match(result.response.body.error, /cannot be changed to No after an invoice has been generated/i);
  assert.match(result.update.text, /invoice_no IS NULL/);
});

test('Invoice Required rejects unsupported values', async () => {
  const result = await exerciseInvoiceRequiredUpdate('sometimes');

  assert.equal(result.response.statusCode, 400);
  assert.match(result.response.body.error, /must be Yes or No/i);
  assert.equal(result.update, null);
});

async function exerciseInvoiceRequiredUpdate(invoiceRequired, options = {}) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  let update = null;
  const fakePool = {
    async query(sql, values = []) {
      const text = typeof sql === 'string' ? sql : sql.text;
      queries.push({ text, values });
      if (/SELECT source_order_id, order_no\s+FROM database_jobs/.test(text)) {
        return { rowCount: 1, rows: [{ source_order_id: 8001, order_no: 8101 }] };
      }
      if (/UPDATE database_jobs\s+SET/.test(text)) {
        update = { text, values };
        if (options.generatedInvoice) return { rowCount: 0, rows: [] };
        const requested = values[1];
        return {
          rowCount: 1,
          rows: [{
            source_order_id: 8001,
            order_no: 8101,
            invoice_required: requested,
            invoice_no: null,
            invoice_printed: false,
            closed_without_invoice: false,
          }],
        };
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
    const route = router.stack.find(layer => (
      layer.route?.path === '/api/database/jobs/:id'
      && layer.route?.methods?.put
    ));
    assert.ok(route, 'database job update route is registered');
    const response = createResponse();
    await route.route.stack[0].handle({
      params: { id: '8001' },
      body: { invoice_required: invoiceRequired },
    }, response);
    return { response, queries, update };
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
