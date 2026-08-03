const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('DELETE job removes the order and all order-owned database records', async () => {
  const result = await exerciseDeleteRoute({ invoice_no: null, invoice_printed: false });

  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(result.response.body, {
    deleted: { source_order_id: 8001, order_no: 8101 },
  });

  const requiredDeletes = [
    'database_ralawise_basket_lines',
    'database_ralawise_basket_jobs',
    'job_scan_events',
    'job_scans',
    'test_dashboard_files',
    'test_dashboard_job_state',
    'database_job_positions',
    'database_job_line_items',
    'database_jobs',
  ];
  requiredDeletes.forEach((table) => {
    assert.ok(
      result.queries.some((query) => query.text.includes(`DELETE FROM ${table}`)),
      `expected ${table} records to be deleted`
    );
  });

  const scanDelete = result.queries.find((query) => query.text.includes('DELETE FROM job_scans'));
  assert.deepEqual(scanDelete.values[0], [
    '8001',
    '8001__split_print',
    '8001__split_embroidery',
  ]);
  assert.ok(result.queries.some((query) => query.text === 'COMMIT'));
});

test('DELETE job rejects an order with an allocated invoice number', async () => {
  const result = await exerciseDeleteRoute({ invoice_no: 52014, invoice_printed: false });

  assert.equal(result.response.statusCode, 409);
  assert.deepEqual(result.response.body, {
    error: 'Invoiced orders cannot be deleted',
    code: 'job_already_invoiced',
  });
  assert.equal(result.queries.some((query) => query.text.includes('DELETE FROM')), false);
  assert.ok(result.queries.some((query) => query.text === 'ROLLBACK'));
});

test('DELETE job rejects an order marked invoice-printed even without a number', async () => {
  const result = await exerciseDeleteRoute({ invoice_no: null, invoice_printed: true });

  assert.equal(result.response.statusCode, 409);
  assert.equal(result.response.body.code, 'job_already_invoiced');
  assert.equal(result.queries.some((query) => query.text.includes('DELETE FROM')), false);
});

test('order details expose a guarded dark-red delete button and confirmation flow', () => {
  const database = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const buttonRenderer = sourceFunction(
    database,
    'function orderDeleteButton',
    'function renderOrderApprovedMark'
  );
  const deleteFlow = sourceFunction(
    database,
    'function openOrderDeleteConfirmation',
    'async function loadDatabaseCustomers'
  );

  assert.match(buttonRenderer, /const locked = invoiceGenerated\(job\)/);
  assert.match(buttonRenderer, /data-db-delete-order="true"/);
  assert.match(buttonRenderer, /\$\{locked \? 'disabled' : ''\}/);
  assert.match(deleteFlow, /Are you sure\?/);
  assert.match(deleteFlow, /line items, design numbers and dashboard data/);
  assert.match(
    deleteFlow,
    /fetchJson\(`\/api\/database\/jobs\/\$\{encodeURIComponent\(target\.sourceOrderId\)\}`,[\s\S]*method: 'DELETE'/
  );
  assert.match(styles, /\.db-order-delete-button\{[\s\S]*background:#650b0b;[\s\S]*color:#fff;/);
  assert.match(
    styles,
    /\.db-order-delete-button:disabled\{[\s\S]*background:#777;[\s\S]*cursor:not-allowed;/
  );
});

async function exerciseDeleteRoute(jobOverrides) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const text = typeof sql === 'string' ? sql : sql.text;
      queries.push({ text, values });
      if (text.includes('SELECT source_order_id, order_no, invoice_no, invoice_printed')) {
        return {
          rowCount: 1,
          rows: [{
            source_order_id: 8001,
            order_no: 8101,
            invoice_no: null,
            invoice_printed: false,
            ...jobOverrides,
          }],
        };
      }
      if (text.includes('DELETE FROM database_jobs')) {
        return {
          rowCount: 1,
          rows: [{ source_order_id: 8001, order_no: 8101 }],
        };
      }
      return { rowCount: 1, rows: [] };
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
      layer.route?.path === '/api/database/jobs/:id'
      && layer.route?.methods?.delete
    ));
    assert.ok(route, 'database job DELETE route is registered');
    const response = createResponse();
    await route.route.stack[0].handle({ params: { id: '8001' } }, response);
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
