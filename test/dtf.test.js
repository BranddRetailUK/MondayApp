const assert = require('node:assert/strict');
const test = require('node:test');
const { PDFDocument } = require('pdf-lib');
const {
  TARGET_HEIGHT_POINTS,
  TARGET_WIDTH_POINTS,
  calculateDtfPrice,
  deriveDtfJobStatus,
  formatDtfJobNumber,
  isExpectedPdfPage,
} = require('../src/services/dtf');
const { hasFullHubAccess, requireHubFullApiAccess } = require('../src/middleware/hubAuth');
const { ensureDtfTables } = require('../src/db/dtfSchema');
const { expectedPublicId } = require('../src/services/dtfCloudinary');
const { defaultArtworkSize, intersects, proportionalArtworkSize, repack } = require('../public/dtf-layout');

test('DTF pricing uses £14 net per sheet and 20% VAT in integer pence', () => {
  assert.deepEqual(calculateDtfPrice(3), {
    sheetQuantity: 3,
    unitPricePence: 1400,
    subtotalPence: 4200,
    vatRate: 0.2,
    vatPence: 840,
    totalPence: 5040,
  });
});

test('DTF status is derived from every file upload status', () => {
  assert.equal(deriveDtfJobStatus(['PENDING', 'UPLOADED']), 'UPLOADING');
  assert.equal(deriveDtfJobStatus(['UPLOADED', 'UPLOADED']), 'RECEIVED');
  assert.equal(deriveDtfJobStatus(['UPLOADED', 'FAILED']), 'FAILED');
});

test('DTF job numbers and Cloudinary public ids are stable and scoped', () => {
  assert.equal(formatDtfJobNumber(12), 'DTF-000012');
  assert.equal(expectedPublicId({ userId: 3, jobId: 7, fileId: 9 }), 'ultimate-hub/dtf/3/7/9');
});

test('strict DTF page metadata allows only one 550 x 1000mm page', () => {
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS, height: TARGET_HEIGHT_POINTS }), true);
  assert.equal(isExpectedPdfPage({ pages: 2, width: TARGET_WIDTH_POINTS, height: TARGET_HEIGHT_POINTS }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_HEIGHT_POINTS, height: TARGET_WIDTH_POINTS }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS + 4, height: TARGET_HEIGHT_POINTS }), false);
});

test('pdf-lib creates an exact one-page 550 x 1000mm document', async () => {
  const document = await PDFDocument.create();
  document.addPage([TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS]);
  const loaded = await PDFDocument.load(await document.save());
  assert.equal(loaded.getPageCount(), 1);
  const page = loaded.getPage(0);
  assert.ok(Math.abs(page.getWidth() - TARGET_WIDTH_POINTS) < 0.001);
  assert.ok(Math.abs(page.getHeight() - TARGET_HEIGHT_POINTS) < 0.001);
});

test('DTF layout keeps aspect ratio, packs groups, and refuses an impossible layout', () => {
  assert.deepEqual(defaultArtworkSize(1000, 500), { widthMm: 170, heightMm: 85 });
  assert.deepEqual(proportionalArtworkSize(1000, 500, 0, 'width', 200), { widthMm: 200, heightMm: 100 });
  assert.deepEqual(proportionalArtworkSize(1000, 500, 90, 'height', 200), { widthMm: 100, heightMm: 200 });
  const packed = repack([
    { id: 'a', groupId: 'a', widthMm: 200, heightMm: 200 },
    { id: 'b', groupId: 'b', widthMm: 200, heightMm: 200 },
  ], 10);
  assert.ok(packed);
  assert.equal(intersects(packed[0], packed[1], 10), false);
  assert.equal(repack([
    { id: 'a', groupId: 'a', widthMm: 550, heightMm: 1000 },
    { id: 'b', groupId: 'b', widthMm: 1, heightMm: 1 },
  ], 0), null);
});

test('DTF-only users fail the full dashboard API middleware', () => {
  assert.equal(hasFullHubAccess({ access_scope: 'full' }), true);
  assert.equal(hasFullHubAccess({ access_scope: 'dtf_only' }), false);
  const response = fakeResponse();
  let nextCalled = false;
  requireHubFullApiAccess({ hubUser: { access_scope: 'dtf_only' } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'Full dashboard access required' });
});

test('DTF schema bootstrap is idempotent and includes access and job storage', async () => {
  const statements = [];
  await ensureDtfTables({ query: async (sql) => { statements.push(String(sql)); return { rows: [] }; } });
  const sql = statements.join('\n');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS access_scope/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS dtf_jobs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS dtf_job_files/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS dtf_rate_limit_buckets/);
});

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
