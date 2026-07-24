const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('invoice generation rejects a job that is not dashboard-completed before allocating a number', async () => {
  const result = await exerciseInvoiceRoute('READY TO PRINT');

  assert.equal(result.response.statusCode, 409);
  assert.deepEqual(result.response.body, {
    error: 'This job is not yet completed',
    code: 'job_not_completed',
  });
  assert.ok(result.queries.some(query => query.text === 'ROLLBACK'));
  assert.equal(result.queries.some(query => query.text.includes('WITH next_invoice AS')), false);
  assert.equal(result.queries.some(query => query.text === 'COMMIT'), false);
});

test('invoice generation proceeds after the job is dashboard-completed', async () => {
  const result = await exerciseInvoiceRoute(' completed ');

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.job.invoice_no, 52002);
  assert.equal(result.response.body.job.invoice_printed, true);

  const completionIndex = result.queries.findIndex(query => (
    query.text.includes('SELECT dashboard_status')
  ));
  const invoiceIndex = result.queries.findIndex(query => (
    query.text.includes('WITH next_invoice AS')
  ));
  assert.notEqual(completionIndex, -1);
  assert.notEqual(invoiceIndex, -1);
  assert.ok(completionIndex < invoiceIndex, 'completion must be checked before invoice allocation');
  assert.ok(result.queries.some(query => query.text === 'COMMIT'));
});

test('invoice UI blocks the request and PDF modal behind the requested Okay message', () => {
  const database = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'database.js'),
    'utf8'
  );
  const flow = sourceFunction(database, 'async function openDatabaseDocument', 'function openOutstandingReportDocument');

  assert.match(
    flow,
    /if \(documentType === 'invoice' && !isJobCompletedForInvoice\(state\.selectedJob\)\) \{\s+openInvoiceCompletionModal\(\);\s+return;\s+\}/
  );
  assert.ok(
    flow.indexOf('isJobCompletedForInvoice') < flow.indexOf('markSelectedJobInvoiced'),
    'the UI guard must run before the invoice request'
  );
  assert.ok(
    flow.indexOf('isJobCompletedForInvoice') < flow.indexOf('ensureOrderAckModal'),
    'the UI guard must run before the invoice PDF modal'
  );
  assert.match(database, /This job is not yet completed/);
  assert.match(database, /data-db-invoice-completion-okay>Okay<\/button>/);
});

async function exerciseInvoiceRoute(dashboardStatus) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const text = typeof sql === 'string' ? sql : sql.text;
      queries.push({ text, values });

      if (/SELECT source_order_id, order_no\s+FROM database_jobs/.test(text)) {
        return { rowCount: 1, rows: [{ source_order_id: 8001, order_no: 8101 }] };
      }
      if (text.includes('SELECT dashboard_status')) {
        return {
          rowCount: 1,
          rows: [{ dashboard_status: dashboardStatus }],
        };
      }
      if (text.includes('WITH next_invoice AS')) {
        return {
          rowCount: 1,
          rows: [{
            source_order_id: 8001,
            order_no: 8101,
            dashboard_status: 'COMPLETED',
            invoice_no: 52002,
            invoice_printed: true,
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
    const route = router.stack.find(layer => (
      layer.route?.path === '/api/database/jobs/:id'
      && layer.route?.methods?.put
    ));
    assert.ok(route, 'database job update route is registered');

    const response = createResponse();
    await route.route.stack[0].handle({
      params: { id: '8001' },
      body: { mark_invoiced: true },
    }, response);
    return { response, queries };
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
}

function sourceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
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
