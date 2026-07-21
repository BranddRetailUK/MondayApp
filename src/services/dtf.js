const UNIT_PRICE_PENCE = 1400;
const VAT_RATE = 0.2;
const MAX_JOB_FILES = 40;
const MAX_FILE_QUANTITY = 99;
const MAX_FILE_BYTES = 250 * 1024 * 1024;
const TARGET_WIDTH_MM = 550;
const TARGET_HEIGHT_MM = 1000;
const MM_TO_POINTS = 72 / 25.4;
const TARGET_WIDTH_POINTS = TARGET_WIDTH_MM * MM_TO_POINTS;
const TARGET_HEIGHT_POINTS = TARGET_HEIGHT_MM * MM_TO_POINTS;
const PAGE_TOLERANCE_POINTS = 3;
const ADMIN_STATUSES = new Set(['RECEIVED', 'IN_PRODUCTION', 'COMPLETED', 'FAILED']);

function calculateDtfPrice(sheetQuantity) {
  const quantity = Math.max(0, Math.floor(Number(sheetQuantity) || 0));
  const subtotalPence = quantity * UNIT_PRICE_PENCE;
  const vatPence = Math.round(subtotalPence * VAT_RATE);
  return {
    sheetQuantity: quantity,
    unitPricePence: UNIT_PRICE_PENCE,
    subtotalPence,
    vatRate: VAT_RATE,
    vatPence,
    totalPence: subtotalPence + vatPence,
  };
}

function deriveDtfJobStatus(fileStatuses) {
  const statuses = Array.isArray(fileStatuses) ? fileStatuses.map(String) : [];
  if (statuses.some((status) => status === 'FAILED')) return 'FAILED';
  if (statuses.length && statuses.every((status) => status === 'UPLOADED')) return 'RECEIVED';
  return 'UPLOADING';
}

function formatDtfJobNumber(value) {
  const numeric = Number.parseInt(String(value), 10);
  return `DTF-${String(Number.isFinite(numeric) && numeric > 0 ? numeric : 0).padStart(6, '0')}`;
}

function isExpectedPdfPage(resource) {
  const pages = Number(resource?.pages);
  const width = Number(resource?.width);
  const height = Number(resource?.height);
  return pages === 1
    && Number.isFinite(width)
    && Number.isFinite(height)
    && Math.abs(width - TARGET_WIDTH_POINTS) <= PAGE_TOLERANCE_POINTS
    && Math.abs(height - TARGET_HEIGHT_POINTS) <= PAGE_TOLERANCE_POINTS;
}

function safeDtfFilename(value) {
  const clean = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .trim()
    .slice(0, 200);
  return clean || 'gang-sheet.pdf';
}

module.exports = {
  ADMIN_STATUSES,
  MAX_FILE_BYTES,
  MAX_FILE_QUANTITY,
  MAX_JOB_FILES,
  PAGE_TOLERANCE_POINTS,
  TARGET_HEIGHT_MM,
  TARGET_HEIGHT_POINTS,
  TARGET_WIDTH_MM,
  TARGET_WIDTH_POINTS,
  UNIT_PRICE_PENCE,
  VAT_RATE,
  calculateDtfPrice,
  deriveDtfJobStatus,
  formatDtfJobNumber,
  isExpectedPdfPage,
  safeDtfFilename,
};
