const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PDFDocument } = require('pdf-lib');
const {
  MAX_UPLOAD_HEIGHT_POINTS,
  MIN_UPLOAD_HEIGHT_POINTS,
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
const {
  epsBoundingBox,
  intersects,
  physicalArtworkSize,
  pngResolution,
  proportionalArtworkSize,
  repack,
  uploadRanges,
} = require('../public/dtf-layout');

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

test('DTF page metadata allows one page up to 550mm wide and 900-1100mm long', () => {
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS, height: TARGET_HEIGHT_POINTS }), true);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS / 2, height: TARGET_HEIGHT_POINTS }), true);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS, height: MIN_UPLOAD_HEIGHT_POINTS }), true);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS, height: MAX_UPLOAD_HEIGHT_POINTS }), true);
  assert.equal(isExpectedPdfPage({ pages: 2, width: TARGET_WIDTH_POINTS, height: TARGET_HEIGHT_POINTS }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_HEIGHT_POINTS, height: TARGET_WIDTH_POINTS }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: 0, height: TARGET_HEIGHT_POINTS }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS + 4, height: TARGET_HEIGHT_POINTS }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS, height: MIN_UPLOAD_HEIGHT_POINTS - 4 }), false);
  assert.equal(isExpectedPdfPage({ pages: 1, width: TARGET_WIDTH_POINTS, height: MAX_UPLOAD_HEIGHT_POINTS + 4 }), false);
});

test('browser DTF upload validation mirrors the flexible server page-size rule', () => {
  const uploader = fs.readFileSync(path.join(__dirname, '..', 'public', 'dtf-uploader.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(uploader, /const MIN_UPLOAD_HEIGHT_MM = HEIGHT_MM - 100/);
  assert.match(uploader, /const MAX_UPLOAD_HEIGHT_MM = HEIGHT_MM \+ 100/);
  assert.match(uploader, /viewport\.width <= WIDTH_MM \* MM_TO_POINTS \+ PAGE_TOLERANCE_POINTS/);
  assert.match(uploader, /viewport\.height >= MIN_UPLOAD_HEIGHT_MM \* MM_TO_POINTS - PAGE_TOLERANCE_POINTS/);
  assert.match(uploader, /viewport\.height <= MAX_UPLOAD_HEIGHT_MM \* MM_TO_POINTS \+ PAGE_TOLERANCE_POINTS/);
  assert.match(html, /id="dtf-sheet-input"[^>]*accept="application\/pdf,.pdf"/);
});

test('DTF uploader keeps its simplified upload and layout presentation', () => {
  const uploader = fs.readFileSync(path.join(__dirname, '..', 'public', 'dtf-uploader.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const dtfCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'dtf-uploader.css'), 'utf8');
  const sharedCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(html, /data-dtf-mode="upload">Upload Gang<\/button>/);
  assert.match(html, /data-dtf-mode="layout">Create Gang<\/button>/);
  assert.doesNotMatch(html, /Drop one-page PDFs/);
  assert.doesNotMatch(html, /dtf-upload-card">\s*<span class="dtf-upload-icon"/);
  assert.doesNotMatch(html, /id="dtf-preview-title"/);
  assert.doesNotMatch(uploader, /previewTitle/);
  assert.doesNotMatch(uploader, /One page · up to 550mm wide/);
  assert.doesNotMatch(uploader, /dtf-sheet-meta/);
  assert.match(uploader, /dtf-sheet-name[^]*dtf-sheet-actions/);
  assert.match(uploader, /totalLargeValue\.textContent = money\(subtotal\)/);
  assert.match(uploader, /entry\.validation === 'valid' \? '' : `<div class="dtf-validation/);
  assert.match(html, /dtf-layout-settings-row[\s\S]*Background[\s\S]*dtf-layout-settings-divider[\s\S]*Artwork gap/);
  assert.match(html, />\s*Upload PNG, EPS or PDF\s*<\/button>/);
  assert.doesNotMatch(html, /dtf-layout-preview-head|Template preview|550mm × 1000mm/);
  assert.match(dtfCss, /\.dtf-layout-settings-divider\{[^}]*background:rgba\(126,0,255,.5\)/);
  assert.match(dtfCss, /data-dtf-background="GREY"\]\{background:#808080[^}]*color:#000/);
  assert.match(dtfCss, /data-dtf-background="DARK"\]\{background:#171717[^}]*color:#fff/);
  assert.match(dtfCss, /\.dtf-pdf-preview\{min-height:660px[^}]*overflow:hidden/);
  assert.doesNotMatch(dtfCss, /\.dtf-pdf-preview\{[^}]*overflow:auto/);
  assert.match(dtfCss, /\.dtf-total-vat\{font-size:14px;color:var\(--dtf-purple\)/);
  assert.match(dtfCss, /\.dtf-price-card dl>div\{[^}]*color:#000/);
  assert.match(dtfCss, /\.dtf-gap-stepper\{[^}]*width:134px/);
  assert.match(dtfCss, /\.dtf-gap-value\{[^}]*display:flex/);
  assert.match(sharedCss, /\.sidebar-sub\{color:#a6a8ad;font-size:14\.4px;font-weight:700/);
  assert.match(dtfCss, /\.hub-access-dtf-only \.sidebar-top\{border-bottom-color:#7e00ff\}/);
  assert.doesNotMatch(dtfCss, /\.hub-access-dtf-only \.sidebar-sub/);
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

test('DTF copies fill each row from left to right before wrapping down', () => {
  const parent = { id: 'parent', groupId: 'parent', widthMm: 170, heightMm: 86 };
  const packed = repack([
    parent,
    ...Array.from({ length: 5 }, (_, index) => ({
      ...parent,
      id: `copy-${index + 1}`,
    })),
  ], 10);

  assert.deepEqual(
    packed.map(({ xMm, yMm }) => ({ xMm, yMm })),
    [
      { xMm: 0, yMm: 0 },
      { xMm: 180, yMm: 0 },
      { xMm: 360, yMm: 0 },
      { xMm: 0, yMm: 96 },
      { xMm: 180, yMm: 96 },
      { xMm: 360, yMm: 96 },
    ],
  );
});

test('large DTF files are divided into contiguous Cloudinary upload ranges', () => {
  const ranges = uploadRanges(249 * 1024 * 1024, 20 * 1024 * 1024);
  assert.equal(ranges.length, 13);
  assert.deepEqual(ranges[0], { start: 0, endExclusive: 20 * 1024 * 1024, end: 20 * 1024 * 1024 - 1 });
  assert.equal(ranges.at(-1).endExclusive, 249 * 1024 * 1024);
  for (let index = 1; index < ranges.length; index += 1) {
    assert.equal(ranges[index].start, ranges[index - 1].endExclusive);
  }
});

test('DTF artwork starts at source physical size instead of a normalized width', () => {
  assert.deepEqual(physicalArtworkSize({ widthPx: 800, heightPx: 400, dpiX: 254, dpiY: 254 }), {
    widthMm: 80,
    heightMm: 40,
  });
  assert.deepEqual(physicalArtworkSize({ widthPx: 2000, heightPx: 1000, widthMm: 80, heightMm: 40 }), {
    widthMm: 80,
    heightMm: 40,
  });
});

test('DTF reads PNG resolution and EPS physical bounds', () => {
  const png = Buffer.alloc(8 + 4 + 4 + 9 + 4);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(9, 8);
  png.write('pHYs', 12, 'ascii');
  png.writeUInt32BE(10000, 16);
  png.writeUInt32BE(10000, 20);
  png[24] = 1;
  const resolution = pngResolution(png);
  assert.ok(Math.abs(resolution.dpiX - 254) < 0.001);
  assert.ok(Math.abs(resolution.dpiY - 254) < 0.001);
  assert.deepEqual(epsBoundingBox('%%BoundingBox: 0 0 226.7717 113.3858'), {
    widthPoints: 226.7717,
    heightPoints: 113.3858,
  });
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
