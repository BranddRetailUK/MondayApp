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

test('visual modal jobs follow dashboard group order and exclude completed status or group rows', async () => {
  const baseJob = {
    customer_name: 'Open Customer',
    order_type: 'Printing',
    order_type_abbr: 'P',
    is_complete: false,
    dashboard_type: 'PRINT',
    invoice_printed: false,
    pf_invoice_printed: false,
    invoice_required: true,
    closed_without_invoice: false,
    dashboard_column_values: {},
    dashboard_archived: false,
  };
  const jobs = [
    {
      ...baseJob,
      source_order_id: 7005,
      order_no: 52005,
      job_title: 'Completed Status',
      dashboard_status: 'COMPLETED',
      proof_approved: true,
      dashboard_group_id: 'new_group43041',
    },
    {
      ...baseJob,
      source_order_id: 7004,
      order_no: 52004,
      job_title: 'Completed Group',
      dashboard_status: 'IN PRODUCTION',
      proof_approved: true,
      dashboard_group_id: 'new_group43041',
    },
    {
      ...baseJob,
      source_order_id: 7003,
      order_no: 52003,
      job_title: 'Pre-production Job',
      dashboard_status: 'NO STOCK',
      proof_approved: true,
      dashboard_group_id: 'new_group56764__1',
    },
    {
      ...baseJob,
      source_order_id: 7002,
      order_no: 52002,
      job_title: 'Office Job',
      dashboard_status: 'AWAITING APPROVAL',
      proof_approved: false,
      dashboard_group_id: 'new_group_mkmdezbp',
    },
    {
      ...baseJob,
      source_order_id: 7001,
      order_no: 52001,
      job_title: 'Hold Job',
      dashboard_status: 'HOLD',
      proof_approved: false,
      dashboard_group_id: 'group_mkv26kq5',
    },
  ];
  const groups = [
    { id: 'group_mkv26kq5', title: 'HOLD', color: '#bb3354', sort_order: 1 },
    { id: 'new_group_mkmdezbp', title: 'OFFICE', color: '#df2f4a', sort_order: 2 },
    { id: 'new_group56764__1', title: 'PRE-PRODUCTION', color: '#0471f7', sort_order: 3 },
    { id: 'new_group43041', title: 'COMPLETED', color: '#00c875', sort_order: 4 },
  ];
  const { router, calls, restore } = loadDatabaseRouter({
    async query(sql) {
      if (sql.includes('FROM database_jobs job') && sql.includes('ORDER BY job.order_no DESC')) {
        return { rowCount: jobs.length, rows: jobs };
      }
      if (sql.includes('FROM test_dashboard_groups')) {
        return { rowCount: groups.length, rows: groups };
      }
      return { rowCount: 0, rows: [] };
    },
  });

  try {
    const route = findRoute(router, '/api/database/visuals/open-jobs', 'get');
    const response = createResponse();
    await route.route.stack[0].handle({}, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.body.jobs.map((job) => [job.source_order_id, job.group_title, job.group_color]),
      [
        [7001, 'HOLD', '#bb3354'],
        [7002, 'OFFICE', '#df2f4a'],
        [7003, 'PRE-PRODUCTION', '#0471f7'],
      ]
    );
    const query = calls.find(({ text }) => text.includes('ORDER BY job.order_no DESC'));
    assert.ok(query);
    assert.match(query.text, /job\.is_complete IS NOT TRUE/);
    assert.match(query.text, /LEFT JOIN test_dashboard_job_state state/);
    assert.match(query.text, /IN \('P', 'E', 'PE', 'EP'\)/);
    assert.match(query.text, /NOT LIKE '%gift%'/);
    assert.match(query.text, /job\.closed_without_invoice IS TRUE/);
    const groupQuery = calls.find(({ text }) => text.includes('FROM test_dashboard_groups'));
    assert.match(groupQuery.text, /COALESCE\(sort_order, 999999\)/);
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
  assert.match(script, /databaseVisualGroupTint/);
  assert.match(script, /<optgroup/);
  assert.match(
    script,
    /finally\s*\{\s*state\.visualOpenJobsLoading = false;\s*renderDatabaseVisualJobOptions\(\{ error: loadFailed \}\);/
  );
  assert.match(styles, /\.db-visuals-grid\s*\{[\s\S]*grid-template-columns:repeat\(5,/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.db-visuals-grid\s*\{[\s\S]*grid-template-columns:repeat\(2,/);
  assert.match(styles, /\.db-visual-modal\s*\{[\s\S]*position:fixed;[\s\S]*inset:0;/);
  assert.match(styles, /\.db-visual-modal-job-control option\s*\{/);
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
