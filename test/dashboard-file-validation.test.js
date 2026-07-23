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
