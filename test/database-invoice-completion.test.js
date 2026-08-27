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
  const activityIndex = result.queries.findIndex(query => (
    query.text.includes('INSERT INTO database_job_status_updates')
  ));
  const commitIndex = result.queries.findIndex(query => query.text === 'COMMIT');
  assert.notEqual(completionIndex, -1);
  assert.notEqual(invoiceIndex, -1);
  assert.notEqual(activityIndex, -1);
  assert.ok(completionIndex < invoiceIndex, 'completion must be checked before invoice allocation');
  assert.ok(invoiceIndex < activityIndex, 'the invoiced event must follow the invoice update');
  assert.ok(activityIndex < commitIndex, 'the invoice and event must commit together');
  assert.match(result.queries[activityIndex].text, /'invoiced'/);
  assert.match(result.queries[activityIndex].text, /'INVOICED'/);
});

test('pre-completion invoice bypasses completion without changing dashboard status', async () => {
  const result = await exerciseInvoiceRoute('READY TO PRINT', {}, {
    mark_invoiced: true,
    pre_completion_invoice: true,
  });

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.job.invoice_no, 52002);
  assert.equal(result.response.body.job.invoice_printed, true);
  assert.equal(result.response.body.job.dashboard_status, 'READY TO PRINT');
  const invoiceUpdate = result.queries.find(query => query.text.includes('WITH next_invoice AS'));
  assert.ok(invoiceUpdate, 'expected invoice allocation');
  assert.doesNotMatch(invoiceUpdate.text, /dashboard_status\s*=/);
  assert.ok(result.queries.some(query => query.text === 'COMMIT'));
});

test('repeat invoice clicks do not create duplicate invoiced activity', async () => {
  const result = await exerciseInvoiceRoute('COMPLETED', {
    invoice_no: 52001,
    invoice_printed: true,
  });

  assert.equal(result.response.statusCode, 200);
  assert.equal(
    result.queries.some(query => query.text.includes('INSERT INTO database_job_status_updates')),
    false
  );
  assert.ok(result.queries.some(query => query.text === 'COMMIT'));
});

test('first invoice click records activity when a legacy invoice number already exists', async () => {
  const result = await exerciseInvoiceRoute('COMPLETED', {
    invoice_no: 52001,
    invoice_printed: false,
  });

  assert.equal(result.response.statusCode, 200);
  assert.ok(
    result.queries.some(query => query.text.includes('INSERT INTO database_job_status_updates'))
  );
});

test('invoice generation allows a Business Gift job before dashboard completion', async () => {
  const result = await exerciseInvoiceRoute('', {
    order_type: 'Business Gifts',
    order_type_abbr: '',
  });

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.job.invoice_no, 52002);
  assert.equal(result.response.body.job.invoice_printed, true);
  assert.ok(result.queries.some(query => query.text.includes('WITH next_invoice AS')));
  assert.ok(result.queries.some(query => query.text === 'COMMIT'));
});

test('invoice generation recognizes the legacy Business Gift abbreviation', async () => {
  const result = await exerciseInvoiceRoute('AWAITING APPROVAL', {
    order_type: '',
    order_type_abbr: ' g ',
  });

  assert.equal(result.response.statusCode, 200);
  assert.ok(result.queries.some(query => query.text.includes('WITH next_invoice AS')));
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
    /documentType === 'invoice'[\s\S]+&& !preCompletionInvoice[\s\S]+&& !existingInvoicePreview[\s\S]+&& !isJobInvoiceStatusEligible\(state\.selectedJob\)/
  );
  assert.ok(
    flow.indexOf('isJobInvoiceStatusEligible') < flow.indexOf('markSelectedJobInvoiced'),
    'the UI guard must run before the invoice request'
  );
  assert.ok(
    flow.indexOf('isJobInvoiceStatusEligible') < flow.indexOf('ensureOrderAckModal'),
    'the UI guard must run before the invoice PDF modal'
  );
  assert.match(
    database,
    /function isJobInvoiceStatusEligible\(job\) \{\s+return categoryForJob\(job\) === 'gifts'\s+\|\| normalizeDashboardStatusLabel\(job\?\.dashboard_status\) === 'COMPLETED';\s+\}/
  );
  assert.match(database, /This job is not yet completed/);
  assert.match(database, /data-db-invoice-completion-okay>Okay<\/button>/);
});

test('order info exposes a separate pre-completion invoice action', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const database = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');

  assert.match(
    html,
    /data-db-document="invoice">Invoice<\/button>\s*<button[^>]+data-db-pre-completion-invoice="true">Pre-Completion<br>Invoice<\/button>/
  );
  assert.match(database, /openDatabaseDocument\('invoice', \{ preCompletionInvoice: true \}\)/);
  assert.match(database, /payload\.pre_completion_invoice = true/);
  assert.match(database, /invoiceGenerated\(job\)[\s\S]+isJobInvoiceStatusEligible\(job\)/);
});

test('pre-completion invoice remains on dashboard until ordinary completion', () => {
  const dashboardRoute = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'test-dashboard.js'),
    'utf8'
  );
  const visibilityRule = sourceFunction(
    dashboardRoute,
    'function shouldRenderDashboardJob',
    'function isDashboardJobFinalized'
  );

  assert.match(
    visibilityRule,
    /\(statusText === 'INVOICED' \|\| statusText === 'COMPLETED'\)[\s\S]+&& isDashboardJobCompleted\(job, statusText\)[\s\S]+&& isDashboardJobFinalized\(job\)/
  );
});

test('invoice UI opens an existing legacy invoice without requiring a dashboard completion state', () => {
  const database = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'database.js'),
    'utf8'
  );
  const flow = sourceFunction(database, 'async function openDatabaseDocument', 'function openOutstandingReportDocument');

  assert.match(
    flow,
    /const existingInvoicePreview = documentType === 'invoice' && state\.selectedJob\?\.invoice_no;/
  );
  assert.match(
    flow,
    /documentType === 'invoice'[\s\S]+&& !preCompletionInvoice[\s\S]+&& !existingInvoicePreview[\s\S]+&& !isJobInvoiceStatusEligible/
  );
  assert.match(
    flow,
    /if \(existingInvoicePreview\)[\s\S]*state\.selectedJob\?\.invoice_date[\s\S]*state\.selectedJob\?\.complete_date/
  );
});

test('invoice UI immediately removes invoiced Business Gifts from Open Orders', () => {
  const database = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'database.js'),
    'utf8'
  );
  const removalRule = sourceFunction(
    database,
    'function shouldRemoveFromOpenOrders',
    'function selectedManualInvoiceDate'
  );

  assert.match(
    removalRule,
    /categoryForJob\(job\) === 'gifts' && truthy\(job\.invoice_printed\)/
  );
});

async function exerciseInvoiceRoute(
  dashboardStatus,
  jobOverrides = {},
  requestBody = { mark_invoiced: true }
) {
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
          rows: [{
            dashboard_status: dashboardStatus,
            order_type: 'Printing',
            order_type_abbr: 'P',
            ...jobOverrides,
          }],
        };
      }
      if (text.includes('WITH next_invoice AS')) {
        return {
          rowCount: 1,
          rows: [{
            source_order_id: 8001,
            order_no: 8101,
            dashboard_status: dashboardStatus,
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
      body: requestBody,
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
