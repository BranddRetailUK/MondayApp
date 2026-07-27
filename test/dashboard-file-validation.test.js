const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  VISUAL_UPLOAD_ACCEPT,
  VISUAL_UPLOAD_ERROR,
  isVisualProofColumn,
  isAllowedVisualUploadFilename,
  isAllowedVisualUploadMetadata,
} = require('../src/services/testDashboardFileValidation');

test('VISUAL identifies the underlying PROOF column and advertises only supported formats', () => {
  assert.equal(isVisualProofColumn({ id: 'file_mky43tg9', title: 'PROOF' }), true);
  assert.equal(isVisualProofColumn({ id: 'other', title: 'VISUAL' }), true);
  assert.equal(isVisualProofColumn({ id: 'files_1', title: 'FILES' }), false);
  assert.equal(VISUAL_UPLOAD_ACCEPT, '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
  assert.match(VISUAL_UPLOAD_ERROR, /only accepts PDF, JPEG, and PNG/);
});

test('VISUAL accepts PDF, JPEG, and PNG filenames only', () => {
  for (const filename of ['proof.pdf', 'proof.PDF', 'mockup.jpg', 'mockup.JPEG', 'preview.png']) {
    assert.equal(isAllowedVisualUploadFilename(filename), true, filename);
  }

  for (const filename of [
    'artwork.eps',
    'transfer.pxf',
    'design.ai',
    'vector.svg',
    'archive.zip',
    'fake.pdf.exe',
    'no-extension',
  ]) {
    assert.equal(isAllowedVisualUploadFilename(filename), false, filename);
  }
});

test('VISUAL metadata requires an allowed Cloudinary format as well as an allowed filename', () => {
  assert.equal(isAllowedVisualUploadMetadata({ filename: 'proof.pdf', format: 'pdf' }), true);
  assert.equal(isAllowedVisualUploadMetadata({ filename: 'photo.jpeg', format: 'jpg' }), true);
  assert.equal(isAllowedVisualUploadMetadata({ filename: 'preview.png', format: 'png' }), true);
  assert.equal(isAllowedVisualUploadMetadata({ filename: 'renamed.pdf', format: 'eps' }), false);
  assert.equal(isAllowedVisualUploadMetadata({ filename: 'proof.pdf', format: '' }), false);
  assert.equal(isAllowedVisualUploadMetadata({ filename: 'artwork.eps', format: 'eps' }), false);
});

test('VISUAL restrictions are applied before signing and before saving file metadata', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'test-dashboard.js'),
    'utf8'
  );

  assert.match(routeSource, /isAllowedVisualUploadFilename\(filename\)/);
  assert.match(routeSource, /isAllowedVisualUploadMetadata\(\{ filename: originalFilename, format: uploadFormat \}\)/);
});

test('shared VISUAL upload routes accept and store files for a Business Gifts database order', async () => {
  const giftJob = {
    source_order_id: 8801,
    order_no: 58801,
    order_type: 'Business Gifts',
    order_type_abbr: 'G',
  };
  const proofColumn = {
    id: 'file_mky43tg9',
    title: 'PROOF',
    type: 'file',
    settings_str: '',
  };
  const insertedFile = {
    id: 91,
    source_order_id: giftJob.source_order_id,
    column_id: proofColumn.id,
    column_title: proofColumn.title,
    public_id: 'ultimate-hub/test-dashboard/proof/58801/job-58801-gift-visual',
    secure_url: 'https://res.cloudinary.com/example/image/upload/gift-visual.pdf',
    resource_type: 'image',
    format: 'pdf',
    original_filename: 'gift-visual.pdf',
    bytes: 2048,
    width: 595,
    height: 842,
  };
  const calls = [];
  const { router, restore } = loadTestDashboardRouter({
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM database_jobs') && sql.includes('WHERE source_order_id = $1 OR order_no = $1')) {
        return { rowCount: 1, rows: [giftJob] };
      }
      if (
        sql.includes('FROM test_dashboard_columns')
        && sql.includes('WHERE id = $1 AND is_subitem IS FALSE')
      ) {
        return { rowCount: 1, rows: [proofColumn] };
      }
      if (sql.includes('INSERT INTO test_dashboard_files')) {
        return { rowCount: 1, rows: [insertedFile] };
      }
      return { rowCount: 0, rows: [] };
    },
  }, {
    requireCloudinaryConfig() {},
    folderForColumn(column, orderNo) {
      return `ultimate-hub/test-dashboard/proof/${orderNo}`;
    },
    publicIdForUpload() {
      return 'job-58801-gift-visual';
    },
    signUpload({ folder, publicId }) {
      return {
        apiKey: 'public-key',
        signature: 'signed',
        timestamp: 123,
        folder,
        publicId,
        uploadUrl: 'https://api.cloudinary.com/v1_1/example/auto/upload',
      };
    },
  });

  try {
    const signatureRoute = findRoute(router, '/api/test-dashboard/uploads/signature', 'post');
    const signatureResponse = createResponse();
    await signatureRoute.route.stack[0].handle({
      body: {
        jobId: giftJob.source_order_id,
        columnId: proofColumn.id,
        filename: 'gift-visual.pdf',
      },
    }, signatureResponse);

    assert.equal(signatureResponse.statusCode, 200);
    assert.equal(signatureResponse.body.folder, 'ultimate-hub/test-dashboard/proof/58801');

    const saveRoute = findRoute(router, '/api/test-dashboard/items/:jobId/files', 'post');
    const saveResponse = createResponse();
    await saveRoute.route.stack[0].handle({
      params: { jobId: String(giftJob.source_order_id) },
      body: {
        columnId: proofColumn.id,
        publicId: insertedFile.public_id,
        secureUrl: insertedFile.secure_url,
        resourceType: insertedFile.resource_type,
        format: insertedFile.format,
        originalFilename: insertedFile.original_filename,
        bytes: insertedFile.bytes,
        width: insertedFile.width,
        height: insertedFile.height,
        metadata: { upload_source: 'database_order_visual_tab' },
      },
      hubUser: { id: 7, first_name: 'Gift', last_name: 'Operator' },
    }, saveResponse);

    assert.equal(saveResponse.statusCode, 201);
    assert.equal(saveResponse.body.file.source_order_id, giftJob.source_order_id);
    assert.equal(saveResponse.body.file.original_filename, 'gift-visual.pdf');
    const insert = calls.find(({ sql }) => sql.includes('INSERT INTO test_dashboard_files'));
    assert.ok(insert);
    assert.equal(insert.values[0], giftJob.source_order_id);
    assert.equal(insert.values[12], 7);
    assert.equal(insert.values[13], 'Gift Operator');
    assert.equal(
      calls.some(({ sql }) => /(?:INSERT INTO|UPDATE)\s+test_dashboard_job_state/i.test(sql)),
      false,
      'storing a gift visual must not create Tuesday Dashboard job state'
    );
  } finally {
    restore();
  }
});

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
