const {
  TEST_DASHBOARD_COLUMN_IDS,
  normalizeColumnTitle,
} = require('./testDashboardDefaults');

const VISUAL_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const VISUAL_UPLOAD_ERROR = 'Unsupported file type. The VISUAL column only accepts PDF, JPEG, and PNG files.';
const ALLOWED_VISUAL_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const ALLOWED_VISUAL_FORMATS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

function isVisualProofColumn(column) {
  if (!column) return false;
  if (String(column.id || '') === TEST_DASHBOARD_COLUMN_IDS.PROOF) return true;
  const compactTitle = normalizeColumnTitle(column.title || column.column_title || '')
    .replace(/[^A-Z0-9]/g, '');
  return compactTitle === 'PROOF' || compactTitle === 'VISUAL';
}

function visualFileExtension(filename) {
  const match = String(filename || '').trim().match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isAllowedVisualUploadFilename(filename) {
  return ALLOWED_VISUAL_EXTENSIONS.has(visualFileExtension(filename));
}

function isAllowedVisualUploadMetadata({ filename, format } = {}) {
  if (!isAllowedVisualUploadFilename(filename)) return false;
  return ALLOWED_VISUAL_FORMATS.has(String(format || '').trim().toLowerCase());
}

module.exports = {
  VISUAL_UPLOAD_ACCEPT,
  VISUAL_UPLOAD_ERROR,
  isVisualProofColumn,
  isAllowedVisualUploadFilename,
  isAllowedVisualUploadMetadata,
};
