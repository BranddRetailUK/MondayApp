// Idempotent DB bootstrap (mirrors your current schema)
const pool = require('./pool');
const { VERBOSE_SQL } = require('../config/env');
const { ensureDatabaseTables } = require('./databaseSchema');

async function initDb() {
  const run = async (sql) => {
    if (VERBOSE_SQL) console.log('[SQL]', sql.replace(/\s+/g,' ').trim().slice(0,200) + '...');
    await pool.query(sql);
  };

  // Scanner tables
  await run(`
    CREATE TABLE IF NOT EXISTS job_scans (
      id SERIAL PRIMARY KEY,
      item_id VARCHAR(64) NOT NULL UNIQUE,
      job_title TEXT,
      customer_name TEXT,
      order_number TEXT,
      scan_count INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      last_scanned_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS job_scan_events (
      id SERIAL PRIMARY KEY,
      item_id VARCHAR(64) NOT NULL,
      scan_number INT NOT NULL,
      new_status TEXT NOT NULL,
      scanned_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Denormalized Access/MDB import tables for the dashboard DATABASE tab.
  await ensureDatabaseTables(pool);
}

module.exports = { initDb };
