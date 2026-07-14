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

  // Scanner
  SCAN_SECRET: (process.env.SCAN_SECRET || 'change-me').trim(),
  STEP1_STATUS_LABEL: (process.env.STEP1_STATUS_LABEL || 'Checked In').trim(),
  STEP2_STATUS_LABEL: (process.env.STEP2_STATUS_LABEL || 'In Production').trim(),
  STEP3_STATUS_LABEL: (process.env.STEP3_STATUS_LABEL || 'Completed').trim(),

  // DB
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSLMODE: process.env.PGSSLMODE || 'require',

  // Flags
  VERBOSE_SQL: bool(process.env.VERBOSE_SQL, false),
};
