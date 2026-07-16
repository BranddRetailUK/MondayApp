// Centralized env & defaults
require('dotenv').config();

function int(v, d) { const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; }
function str(v, d = '') { return String(v ?? d).trim(); }
function bool(v, d=false) {
  const s = String(v ?? '').toLowerCase();
  return s === '1' || s === 'true' || (s === '' ? d : d);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int(process.env.PORT, 3000),

  // Scanner
  SCAN_SECRET: (process.env.SCAN_SECRET || 'change-me').trim(),
  STEP1_STATUS_LABEL: (process.env.STEP1_STATUS_LABEL || 'Checked In').trim(),
  STEP2_STATUS_LABEL: (process.env.STEP2_STATUS_LABEL || 'In Production').trim(),
  STEP3_STATUS_LABEL: (process.env.STEP3_STATUS_LABEL || 'Completed').trim(),

  // DB
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSLMODE: process.env.PGSSLMODE || 'require',

  // Supplier APIs
  PENCARRIE_ENV: str(process.env.PENCARRIE_ENV, 'live').toLowerCase(),
  PENCARRIE_GATEWAY_URL: str(process.env.PENCARRIE_GATEWAY_URL),
  PENCARRIE_CUSTOMER_CODE: str(process.env.PENCARRIE_CUSTOMER_CODE),
  PENCARRIE_STATIC_IP: str(process.env.PENCARRIE_STATIC_IP),
  PENCARRIE_HTTP_TIMEOUT_MS: int(process.env.PENCARRIE_HTTP_TIMEOUT_MS, 20000),
  PENCARRIE_RETRY_ATTEMPTS: int(process.env.PENCARRIE_RETRY_ATTEMPTS, 3),
  RALAWISE_API_BASE_URL: str(process.env.RALAWISE_API_BASE_URL, 'https://api.ralawise.com'),
  RALAWISE_SHOP_BASE_URL: str(process.env.RALAWISE_SHOP_BASE_URL, 'https://shop.ralawise.com'),
  RALAWISE_USER: str(process.env.RALAWISE_USER),
  RALAWISE_PASSWORD: String(process.env.RALAWISE_PASSWORD || ''),
  RALAWISE_HTTP_TIMEOUT_MS: int(process.env.RALAWISE_HTTP_TIMEOUT_MS, 20000),
  RALAWISE_REQUEST_TIMEOUT_MS: int(process.env.RALAWISE_REQUEST_TIMEOUT_MS, 20000),
  RALAWISE_RETRY_ATTEMPTS: int(process.env.RALAWISE_RETRY_ATTEMPTS, 2),

  // Flags
  VERBOSE_SQL: bool(process.env.VERBOSE_SQL, false),
};
