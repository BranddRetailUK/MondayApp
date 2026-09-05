const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('dashboard extracts every attached visual and keeps its individual file id', () => {
  const sandbox = loadDashboardFrontend();
  const result = vm.runInContext(`
    (() => {
      const item = {
        id: '7001',
        column_values: [{
          id: TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF,
          type: 'file',
          value: JSON.stringify({
            files: [
              {
                dashboardFileId: 41,
                name: 'front.pdf',
                url: 'https://res.cloudinary.com/example/image/upload/front.pdf'
              },
              {
                dashboardFileId: 42,
                name: 'back.png',
                url: 'https://res.cloudinary.com/example/image/upload/back.png'
              }
            ]
          })
        }]
      };
      window.__latestTestBoardPayload = {
        boards: [{
          columns: [{ id: TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF, title: 'PROOF' }]
        }]
      };
      const files = getTestDashboardVisualFiles(item);
      return {
        count: files.length,
        ids: files.map(testDashboardVisualFileId),
        names: files.map(file => file.name)
      };
    })()
  `, sandbox);

  assert.equal(result.count, 2);
  assert.deepEqual(Array.from(result.ids), ['41', '42']);
  assert.deepEqual(Array.from(result.names), ['front.pdf', 'back.png']);
});

test('multiple visuals use the removal picker and attachment success has a visible confirmation', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const database = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');
  const styles = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'dashboard-visual-removal.css'),
    'utf8'
  );

  assert.match(html, /href="dashboard-visual-removal\.css"/);
  assert.match(dashboard, /state\.visualFiles\?\.length > 1/);
  assert.match(dashboard, /openTestVisualRemovalModal\(state\)/);
  assert.match(dashboard, /data-test-visual-remove-file/);
  assert.match(dashboard, /ENDPOINTS\.testFile\(state\.itemId, normalizedFileId\)/);
  assert.match(styles, /\.test-visual-removal-grid\s*\{[\s\S]*grid-template-columns:repeat\(3,/);
  assert.match(styles, /\.test-visual-removal-x\s*\{[\s\S]*color:#ff3f4d/);
  assert.match(database, /`✓ Visual added to order \$\{job\?\.order_no \|\| targetId\}`/);
  assert.match(styles, /\.db-visual-modal-feedback\.is-success\s*\{/);
});

test('individual file deletion removes one visual from a private dashboard job', async () => {
  const privateJobId = 'private_11111111-1111-4111-8111-111111111111';
  const removedFileId = '22222222-2222-4222-8222-222222222222';
  const retainedFileId = '33333333-3333-4333-8333-333333333333';
  const proofColumnId = 'file_mky43tg9';
  const removedFile = {
    dashboardPrivateFileId: removedFileId,
    publicId: 'ultimate-hub/test-dashboard/proof/private/removed',
    resourceType: 'image',
    name: 'removed.pdf',
    url: 'https://res.cloudinary.com/example/image/upload/removed.pdf',
  };
  const retainedFile = {
    dashboardPrivateFileId: retainedFileId,
    publicId: 'ultimate-hub/test-dashboard/proof/private/retained',
    resourceType: 'image',
    name: 'retained.png',
    url: 'https://res.cloudinary.com/example/image/upload/retained.png',
  };
  const job = {
    id: privateJobId,
    group_id: 'office',
    item_name: 'Private visual job',
    archived: false,
    column_values: {
      [proofColumnId]: fileValue(proofColumnId, [removedFile, retainedFile]),
    },
  };
  let savedColumnValues = null;
  const destroyed = [];
  const { router, restore } = loadTestDashboardRouter({
    async query(sql, values = []) {
      if (sql.includes('FROM test_dashboard_private_jobs') && sql.includes('WHERE id = $1')) {
        return { rowCount: 1, rows: [job] };
      }
      if (sql.includes('UPDATE test_dashboard_private_jobs')) {
        savedColumnValues = values[3];
        return { rowCount: 1, rows: [{ ...job, column_values: savedColumnValues }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  }, {
    async destroyAsset(publicId, resourceType) {
      destroyed.push({ publicId, resourceType });
    },
  });

  try {
    const route = findRoute(
      router,
      '/api/test-dashboard/items/:jobId/files/:fileId',
      'delete'
    );
    const response = createResponse();
    await route.route.stack[0].handle({
      params: { jobId: privateJobId, fileId: removedFileId },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.fileId, removedFileId);
    const remaining = JSON.parse(savedColumnValues[proofColumnId].value).files;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].dashboardPrivateFileId, retainedFileId);
    assert.deepEqual(destroyed, [{
      publicId: removedFile.publicId,
      resourceType: removedFile.resourceType,
    }]);
  } finally {
    restore();
  }
});

test('individual file deletion removes the exact database-order visual and cleans its unreferenced asset', async () => {
  const sourceOrderId = 8801;
  const fileId = 91;
  const deletedFile = {
    id: fileId,
    source_order_id: sourceOrderId,
    public_id: 'ultimate-hub/test-dashboard/proof/58801/gift-visual',
    resource_type: 'image',
    original_filename: 'gift-visual.pdf',
  };
  const queries = [];
  const destroyed = [];
  const { router, restore } = loadTestDashboardRouter({
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes('DELETE FROM test_dashboard_files')) {
        return { rowCount: 1, rows: [deletedFile] };
      }
      if (sql.includes('SELECT DISTINCT public_id')) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  }, {
    async destroyAsset(publicId, resourceType) {
      destroyed.push({ publicId, resourceType });
    },
  });

  try {
    const route = findRoute(
      router,
      '/api/test-dashboard/items/:jobId/files/:fileId',
      'delete'
    );
    const response = createResponse();
    await route.route.stack[0].handle({
      params: { jobId: String(sourceOrderId), fileId: String(fileId) },
    }, response);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { ok: true, fileId });
    const deletion = queries.find(({ sql }) => sql.includes('DELETE FROM test_dashboard_files'));
    assert.deepEqual(deletion.values, [fileId, sourceOrderId]);
    assert.deepEqual(destroyed, [{
      publicId: deletedFile.public_id,
      resourceType: deletedFile.resource_type,
    }]);
  } finally {
    restore();
  }
});

function loadDashboardFrontend() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const mediaQuery = {
    matches: true,
    addEventListener() {},
    addListener() {},
  };
  const sandbox = {
    CSS: { escape: String },
    URLSearchParams,
    clearInterval() {},
    console,
    document: {
      addEventListener() {},
    },
    fetch: async () => {
      throw new Error('Unexpected fetch');
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    setInterval() { return 1; },
    window: {
      addEventListener() {},
      location: { origin: 'https://example.test', hash: '', search: '' },
      matchMedia() { return mediaQuery; },
      ultimateHubUser: null,
    },
  };
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

function fileValue(columnId, files) {
  return {
    id: columnId,
    text: files.map(file => file.name).join(', '),
    type: 'file',
    value: JSON.stringify({ files }),
  };
}

function loadTestDashboardRouter(fakePool, cloudinaryOverrides = {}) {
  const poolPath = require.resolve('../src/db/pool');
  const cloudinaryPath = require.resolve('../src/services/cloudinaryDashboard');
  const routePath = require.resolve('../src/routes/test-dashboard');
  const originalPoolModule = require.cache[poolPath];
  const originalCloudinaryModule = require.cache[cloudinaryPath];
  const cloudinary = require(cloudinaryPath);

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: fakePool,
  };
  require.cache[cloudinaryPath] = {
    id: cloudinaryPath,
    filename: cloudinaryPath,
    loaded: true,
    exports: { ...cloudinary, ...cloudinaryOverrides },
  };
  delete require.cache[routePath];

  return {
    router: require('../src/routes/test-dashboard').protectedRouter,
    restore() {
      delete require.cache[routePath];
      if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
      else delete require.cache[poolPath];
      if (originalCloudinaryModule) require.cache[cloudinaryPath] = originalCloudinaryModule;
      else delete require.cache[cloudinaryPath];
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
