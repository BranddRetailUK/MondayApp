const assert = require('node:assert/strict');
const test = require('node:test');

test('DTF job creation snapshots the Hub user and calculates price server-side', async () => {
  const calls = [];
  const job = jobRow({ id: 8, job_number: 'DTF-000008', sheet_quantity: 2, subtotal_pence: 2800, vat_pence: 560, total_pence: 3360 });
  const client = {
    async query(sql, values = []) {
      const text = String(sql);
      calls.push({ text, values });
      if (text.includes('INSERT INTO dtf_jobs')) return { rowCount: 1, rows: [job] };
      if (text.includes('INSERT INTO dtf_job_files')) {
        return { rowCount: 1, rows: [{ id: 19, client_id: values[1], original_name: values[2], quantity: values[4], upload_status: 'PENDING' }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const fakePool = {
    async query(sql) {
      if (String(sql).includes('dtf_rate_limit_buckets')) return rateBucket();
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() { return client; },
  };

  await withDtfRouter(fakePool, cloudStub(), async (router) => {
    const handler = routeHandler(router, '/api/dtf/jobs', 'post');
    const response = fakeResponse();
    await handler({
      hubUser: { id: 4, email: 'lami@example.test', first_name: 'Lami', last_name: 'User' },
      body: { files: [{ clientId: 'client-1', name: 'sheet.pdf', size: 1234, type: 'application/pdf', quantity: 2 }] },
    }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.job.jobNumber, 'DTF-000008');
    assert.equal(response.body.pricing.totalPence, 3360);
    const insert = calls.find((call) => call.text.includes('INSERT INTO dtf_jobs'));
    assert.equal(insert.values[1], 'Lami User');
    assert.equal(insert.values[2], 'lami@example.test');
    assert.deepEqual(insert.values.slice(3), [1, 2, 1400, 2800, 0.2, 560, 3360]);
  });
});

test('DTF finalization marks the job failed when authoritative asset validation fails', async () => {
  const calls = [];
  const fakePool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('dtf_rate_limit_buckets')) return rateBucket();
      if (text.includes('FROM dtf_job_files file') && text.includes('job.user_id')) {
        return { rowCount: 1, rows: [{ id: 19, job_id: 8, original_name: 'sheet.pdf', upload_status: 'UPLOADING', user_id: 4 }] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, values = []) {
          const text = String(sql);
          calls.push({ text, values });
          if (text.includes('SELECT upload_status')) return { rows: [{ upload_status: 'FAILED' }] };
          if (text.includes('UPDATE dtf_jobs')) return { rowCount: 1, rows: [jobRow({ status: 'FAILED' })] };
          return { rowCount: 1, rows: [] };
        },
        release() {},
      };
    },
  };
  const cloud = cloudStub({
    verifyDtfUpload: async () => ({ ok: false, publicId: 'ultimate-hub/dtf/4/8/19', error: 'PDFs must contain one page no wider than 550mm and between 900mm and 1100mm long.' }),
  });

  await withDtfRouter(fakePool, cloud, async (router) => {
    const response = fakeResponse();
    await routeHandler(router, '/api/dtf/uploads/finalize', 'post')({
      hubUser: { id: 4, email: 'lami@example.test' },
      body: { jobId: 8, fileId: 19, success: true, publicId: 'ultimate-hub/dtf/4/8/19' },
    }, response);
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.job.status, 'FAILED');
    const fileUpdate = calls.find((call) => call.text.includes('UPDATE dtf_job_files'));
    assert.equal(fileUpdate.values[1], 'FAILED');
    assert.match(fileUpdate.values[9], /no wider than 550mm.*900mm and 1100mm long/);
  });
});

test('signup acceptance persists the selected DTF-only access scope', async () => {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPool = require.cache[poolPath];
  const insertCalls = [];
  const client = {
    async query(sql, values = []) {
      const text = String(sql);
      if (text.includes('FROM hub_signup_requests') && text.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ id: 5, email: 'dtf@example.test', first_name: 'DTF', last_name: 'Only', password_hash: 'hash' }] };
      }
      if (text.includes('INSERT INTO hub_users')) {
        insertCalls.push(values);
        return { rowCount: 1, rows: [{ id: 22, email: values[0], first_name: values[1], last_name: values[2], can_manage_users: false, access_scope: values[4], created_at: new Date() }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { connect: async () => client, query: (...args) => client.query(...args) } };
  delete require.cache[routePath];
  try {
    const router = require('../src/routes/database');
    const response = fakeResponse();
    await routeHandler(router, '/api/database/signup-requests/:id/accept', 'post')({
      params: { id: '5' },
      body: { accessScope: 'dtf_only' },
      hubUser: { id: 1, email: 'admin@example.test', first_name: 'Admin', last_name: 'User', can_manage_users: true },
    }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(insertCalls[0][4], 'dtf_only');
    assert.equal(response.body.user.access_scope, 'dtf_only');
  } finally {
    delete require.cache[routePath];
    if (originalPool) require.cache[poolPath] = originalPool;
    else delete require.cache[poolPath];
  }
});

test('verified DTF files support an authorized attachment download redirect', async () => {
  const signedCalls = [];
  const fakePool = {
    async query(sql) {
      if (String(sql).includes('FROM dtf_job_files file')) {
        return {
          rowCount: 1,
          rows: [{
            original_name: 'generated-gang-sheet.pdf',
            cloudinary_public_id: 'ultimate-hub/dtf/4/8/19',
            upload_status: 'UPLOADED',
            user_id: 4,
          }],
        };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
  };
  const cloud = cloudStub({
    signedDtfDownloadUrl: (...args) => {
      signedCalls.push(args);
      return 'https://example.test/signed-download.pdf';
    },
  });

  await withDtfRouter(fakePool, cloud, async (router) => {
    const response = fakeResponse();
    await routeHandler(router, '/api/dtf/files/:fileId', 'get')({
      params: { fileId: '19' },
      query: { download: '1' },
      hubUser: { id: 4, access_scope: 'dtf_only' },
    }, response);
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, 'https://example.test/signed-download.pdf');
    assert.deepEqual(signedCalls[0], [
      'ultimate-hub/dtf/4/8/19',
      'generated-gang-sheet.pdf',
      { attachment: true },
    ]);
  });
});

async function withDtfRouter(fakePool, fakeCloud, callback) {
  const poolPath = require.resolve('../src/db/pool');
  const cloudPath = require.resolve('../src/services/dtfCloudinary');
  const routePath = require.resolve('../src/routes/dtf');
  const originals = [poolPath, cloudPath, routePath].map((path) => [path, require.cache[path]]);
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: fakePool };
  require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: fakeCloud };
  delete require.cache[routePath];
  try {
    await callback(require('../src/routes/dtf'));
  } finally {
    delete require.cache[routePath];
    for (const [path, cached] of originals) {
      if (cached) require.cache[path] = cached;
      else delete require.cache[path];
    }
  }
}

function routeHandler(router, path, method) {
  const layer = router.stack.find((candidate) => candidate.route?.path === path && candidate.route?.methods?.[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route is registered`);
  return layer.route.stack.at(-1).handle;
}

function cloudStub(overrides = {}) {
  return {
    createEpsPng: async () => Buffer.from('png'),
    destroyDtfAsset: async () => undefined,
    expectedPublicId: ({ userId, jobId, fileId }) => `ultimate-hub/dtf/${userId}/${jobId}/${fileId}`,
    signDtfUpload: () => ({}),
    signedDtfDownloadUrl: () => 'https://example.test/file.pdf',
    verifyDtfUpload: async () => ({ ok: true }),
    ...overrides,
  };
}

function rateBucket() {
  return { rowCount: 1, rows: [{ request_count: 1, window_started_at: new Date() }] };
}

function jobRow(overrides = {}) {
  return {
    id: 8,
    job_number: 'DTF-000008',
    customer_name: 'Lami User',
    customer_email: 'lami@example.test',
    status: 'UPLOADING',
    unique_file_count: 1,
    sheet_quantity: 1,
    unit_price_pence: 1400,
    subtotal_pence: 1400,
    vat_rate: 0.2,
    vat_pence: 280,
    total_pence: 1680,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    redirect(code, location) { this.statusCode = code; this.headers.location = location; return this; },
    type() { return this; },
  };
}
