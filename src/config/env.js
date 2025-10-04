// Centralized env & defaults
require('dotenv').config();

function int(v, d) { const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; }
function bool(v, d=false) {
  const s = String(v ?? '').toLowerCase();
  return s === '1' || s === 'true' || (s === '' ? d : d);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int(process.env.PORT, 3000),

  // Monday
  MONDAY_CLIENT_ID: (process.env.MONDAY_CLIENT_ID || '').trim(),
  MONDAY_CLIENT_SECRET: (process.env.MONDAY_CLIENT_SECRET || '').trim(),
  MONDAY_REDIRECT_URI: (process.env.MONDAY_REDIRECT_URI || 'http://localhost:3000/callback').trim(),
  MONDAY_SCOPES: (process.env.MONDAY_SCOPES || '').trim(),
  MONDAY_API_TOKEN: (process.env.MONDAY_API_TOKEN || '').trim(),
  BOARD_ID: (process.env.BOARD_ID || '').trim(),

  // Scanner
  SCAN_SECRET: (process.env.SCAN_SECRET || 'change-me').trim(),
  STATUS_COLUMN_ID: (process.env.STATUS_COLUMN_ID || '').trim(),
  CHECKED_IN_COLUMN_ID: (process.env.CHECKED_IN_COLUMN_ID || '').trim(),
  STEP1_STATUS_LABEL: (process.env.STEP1_STATUS_LABEL || 'Checked In').trim(),
  STEP2_STATUS_LABEL: (process.env.STEP2_STATUS_LABEL || 'In Production').trim(),
  STEP3_STATUS_LABEL: (process.env.STEP3_STATUS_LABEL || 'Completed').trim(),

  // Board paging/cache
  BOARD_PAGE_LIMIT: int(process.env.BOARD_PAGE_LIMIT, 50),
  BOARD_MAX_PAGES: int(process.env.BOARD_MAX_PAGES, 2),
  BOARD_CACHE_MS: int(process.env.BOARD_CACHE_MS, 300000),

  // DB
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSLMODE: process.env.PGSSLMODE || 'require',

  // Flags
  VERBOSE_SQL: bool(process.env.VERBOSE_SQL, false)
};
