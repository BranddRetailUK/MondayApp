const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('DATABASE visuals gallery is paginated and searches job, customer, filename, and design metadata', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => visualRow(index + 1));
  const { router, calls, restore } = loadDatabaseRouter({
    async query(sql) {
      if (sql.includes('WITH selected_visuals AS MATERIALIZED')) {
        return { rowCount: rows.length, rows };
      }
      return { rowCount: 0, rows: [] };
    },
  });

  try {
    const route = findRoute(router, '/api/database/visuals', 'get');
    const response = createResponse();
    await route.route.stack[0].handle({
      query: { q: 'Acme 12345', limit: '30', offset: '0' },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.visuals.length, 30);
    assert.equal(response.body.hasMore, true);
    assert.equal(response.body.nextOffset, 30);
    assert.equal(response.body.visuals[0].order_no, 51001);
    assert.equal(response.body.visuals[0].design_numbers, 'DES-1001');

    const galleryQuery = calls.find(({ text }) => text.includes('WITH selected_visuals AS MATERIALIZED'));
    assert.ok(galleryQuery);
    assert.match(galleryQuery.text, /CAST\(j\.order_no AS TEXT\) ILIKE/);
    assert.match(galleryQuery.text, /j\.customer_name/);
    assert.match(galleryQuery.text, /file\.original_filename/);
    assert.match(galleryQuery.text, /database_job_positions position/);
    assert.deepEqual(galleryQuery.values.slice(1), ['%Acme 12345%', 31, 0]);
  } finally {
    restore();
  }
});

test('attaching a gallery visual reuses its Cloudinary metadata on an eligible open job', async () => {
  const calls = [];
  const source = visualRow(44);
  const target = {
    source_order_id: 7002,
    order_no: 52002,
    customer_name: 'Target Customer',
    job_title: 'Target Job',
    order_type: 'Print + Emb',
    order_type_abbr: 'PE',
    is_complete: false,
    dashboard_status: 'AWAITING APPROVAL',
    invoice_printed: false,
    pf_invoice_printed: false,
    invoice_required: true,
    closed_without_invoice: false,
  };
  const inserted = { ...source, id: 99, source_order_id: target.source_order_id };
  const client = {
    async query(sql, values = []) {
      calls.push({ text: sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FROM test_dashboard_files') && sql.includes('FOR SHARE')) {
        return { rowCount: 1, rows: [source] };
      }
      if (sql.includes('FROM database_jobs') && sql.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [target] };
      }
      if (sql.includes('INSERT INTO test_dashboard_files')) {
        return { rowCount: 1, rows: [inserted] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const { router, restore } = loadDatabaseRouter({
    async query() {
      return { rowCount: 0, rows: [] };
    },
    async connect() {
      return client;
    },
  });

  try {
    const route = findRoute(router, '/api/database/visuals/:fileId/attach', 'post');
    const response = createResponse();
    await route.route.stack[0].handle({
      params: { fileId: String(source.id) },
      body: { source_order_id: target.source_order_id },
      hubUser: { id: 8, first_name: 'Visual', last_name: 'Tester' },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.attached, true);
    assert.equal(response.body.visual.source_order_id, target.source_order_id);
    assert.equal(response.body.visual.public_id, source.public_id);
    assert.equal(response.body.visual.secure_url, source.secure_url);

    const insert = calls.find(({ text }) => text.includes('INSERT INTO test_dashboard_files'));
    assert.ok(insert);
    assert.equal(insert.values[0], target.source_order_id);
    assert.equal(insert.values[2], source.public_id);
    assert.equal(insert.values[3], source.secure_url);
    assert.equal(insert.values[11], 8);
    assert.equal(insert.values[12], 'Visual Tester');
  } finally {
    restore();
  }
});

test('visual modal jobs endpoint is limited to open print and embroidery work', async () => {
  const jobs = [{
    source_order_id: 7002,
    order_no: 52002,
    customer_name: 'Open Customer',
    job_title: 'Open Print Job',
    order_type: 'Printing',
    order_type_abbr: 'P',
  }];
  const { router, calls, restore } = loadDatabaseRouter({
    async query(sql) {
      if (sql.includes('FROM database_jobs') && sql.includes('ORDER BY order_no DESC')) {
        return { rowCount: jobs.length, rows: jobs };
      }
      return { rowCount: 0, rows: [] };
    },
  });

  try {
    const route = findRoute(router, '/api/database/visuals/open-jobs', 'get');
    const response = createResponse();
    await route.route.stack[0].handle({}, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.jobs, jobs);
    const query = calls.find(({ text }) => text.includes('ORDER BY order_no DESC'));
    assert.ok(query);
    assert.match(query.text, /is_complete IS NOT TRUE/);
    assert.match(query.text, /IN \('P', 'E', 'PE', 'EP'\)/);
    assert.match(query.text, /NOT LIKE '%gift%'/);
    assert.match(query.text, /closed_without_invoice IS TRUE/);
  } finally {
    restore();
  }
});

test('DATABASE Visuals UI uses active navigation, five/two-column grids, lazy previews, and an exclusive job dropdown', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(
    html,
    /class="db-raised-button db-blue-link"[^>]+data-db-action="visuals"[^>]*>Visuals<\/button>/
  );
  assert.doesNotMatch(html, />Configuration<\/button>/);
  assert.match(html, /id="db-visuals-search"[\s\S]+Search by previous job number, customer or design number/);
  assert.match(html, /id="db-visual-modal-job"/);
  assert.match(script, /const DATABASE_VISUAL_PAGE_LIMIT = 30/);
  assert.match(script, /loading="lazy"/);
  assert.match(script, /new window\.IntersectionObserver/);
  assert.match(script, /f_jpg,q_auto:eco,c_limit,w_420,h_420,pg_1/);
  assert.match(styles, /\.db-visuals-grid\s*\{[\s\S]*grid-template-columns:repeat\(5,/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.db-visuals-grid\s*\{[\s\S]*grid-template-columns:repeat\(2,/);
  assert.match(styles, /\.db-visual-modal\s*\{[\s\S]*position:fixed;[\s\S]*inset:0;/);
});

function visualRow(id) {
  return {
    id,
    source_order_id: 6000 + id,
    column_id: 'proof',
    column_title: 'PROOF',
    public_id: `ultimate-hub/test-dashboard/proof/${id}/visual-${id}`,
    secure_url: `https://res.cloudinary.com/example/image/upload/v1/visual-${id}.pdf`,
    resource_type: 'image',
    format: 'pdf',
    original_filename: `visual-${id}.pdf`,
    bytes: 1024,
    width: 595,
    height: 842,
    metadata: {},
    order_no: 51000 + id,
    customer_name: `Customer ${id}`,
    job_title: `Job ${id}`,
    order_type: 'Printing',
    order_type_abbr: 'P',
    design_numbers: `DES-${1000 + id}`,
    created_at: '2026-07-23T10:00:00.000Z',
    updated_at: '2026-07-23T10:00:00.000Z',
  };
}

function loadDatabaseRouter(fakePool) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const calls = [];
  const wrappedPool = {
    ...fakePool,
    async query(sql, values = []) {
      calls.push({ text: sql, values });
      return fakePool.query(sql, values);
    },
  };

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: wrappedPool,
  };
  delete require.cache[routePath];

  return {
    router: require('../src/routes/database'),
    calls,
    restore() {
      delete require.cache[routePath];
      if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
      else delete require.cache[poolPath];
    },
  };
}

function findRoute(router, routePath, method) {
  const route = router.stack.find((layer) => (
    layer.route?.path === routePath
    && layer.route?.methods?.[method]
  ));
  assert.ok(route, `${method.toUpperCase()} ${routePath} is registered`);
  return route;
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
