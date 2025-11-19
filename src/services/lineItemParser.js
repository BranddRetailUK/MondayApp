// src/services/lineItemParser.js
const path = require('path');
const XLSX = require('xlsx');

const NORMALIZE_REGEX = /[^a-z0-9]/gi;
const REQUIRED_KEYS = ['productid', 'sstylecode', 'sstyle', 'scolour', 'ssize', 'lngqty'];

function normalizeKey(key = '') {
  return String(key).trim().toLowerCase().replace(NORMALIZE_REGEX, '');
}

function normalizeRow(row = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key) continue;
    normalized[normalizeKey(key)] = typeof value === 'string' ? value.trim() : value;
  }
  return normalized;
}

function coerceNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildLineItem(row, idx) {
  const normalized = normalizeRow(row);
  const missing = REQUIRED_KEYS.filter(key => !normalized[key] && normalized[key] !== 0);
  if (missing.length > 0) {
    return {
      ok: false,
      rowNumber: idx + 2, // +2 accounts for zero index + header row
      reason: `Missing columns: ${missing.join(', ')}`,
      raw: row,
    };
  }

  return {
    ok: true,
    rowNumber: idx + 2,
    data: {
      productId: String(normalized.productid || '').trim(),
      styleCode: String(normalized.sstylecode || '').trim(),
      styleName: String(normalized.sstyle || '').trim(),
      colour: String(normalized.scolour || '').trim(),
      size: String(normalized.ssize || '').trim(),
      qty: coerceNumber(normalized.lngqty, 0),
    },
  };
}

function parseWorksheet(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const items = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const parsed = buildLineItem(row, idx);
    if (!parsed.ok) {
      errors.push({ rowNumber: parsed.rowNumber, reason: parsed.reason });
      return;
    }
    items.push(parsed.data);
  });

  return { items, errors, rowsParsed: rows.length };
}

function readWorkbookFromFile(filePath) {
  return XLSX.readFile(filePath, { cellStyles: false });
}

function readWorkbookFromBuffer(buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellStyles: false });
}

function parseLineItemsFromWorkbook(workbook) {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook contains no sheets');
  }
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  return parseWorksheet(worksheet);
}

function parseLineItemsFromFile(filePath) {
  const workbook = readWorkbookFromFile(filePath);
  const result = parseLineItemsFromWorkbook(workbook);
  const jobNumberMatch = path.basename(filePath).match(/\b(\d{5})\b/);
  return { ...result, jobNumber: jobNumberMatch ? jobNumberMatch[1] : null };
}

function parseLineItemsFromBuffer(buffer, filename = 'upload.xlsx') {
  const workbook = readWorkbookFromBuffer(buffer);
  const result = parseLineItemsFromWorkbook(workbook);
  const jobNumberMatch = filename.match(/\b(\d{5})\b/);
  return { ...result, jobNumber: jobNumberMatch ? jobNumberMatch[1] : null };
}

module.exports = {
  parseLineItemsFromFile,
  parseLineItemsFromBuffer,
  parseLineItemsFromWorkbook,
};
