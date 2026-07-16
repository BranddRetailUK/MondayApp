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

  await run(`
    CREATE TABLE IF NOT EXISTS hub_users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      can_manage_users BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMP
    );
  `);
  await run('ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN;');
  await run('UPDATE hub_users SET can_manage_users = TRUE WHERE can_manage_users IS NULL;');
  await run('ALTER TABLE hub_users ALTER COLUMN can_manage_users SET DEFAULT FALSE;');
  await run('ALTER TABLE hub_users ALTER COLUMN can_manage_users SET NOT NULL;');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS hub_users_email_lower_idx ON hub_users (LOWER(email));');
  await run(`
    CREATE TABLE IF NOT EXISTS hub_signup_requests (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMP,
      reviewed_by_user_id INTEGER REFERENCES hub_users(id) ON DELETE SET NULL,
      reviewed_by_name TEXT,
      CONSTRAINT hub_signup_requests_status_check
        CHECK (status IN ('pending', 'accepted', 'rejected'))
    );
  `);
  await run('CREATE UNIQUE INDEX IF NOT EXISTS hub_signup_requests_email_lower_idx ON hub_signup_requests (LOWER(email));');
  await run('CREATE INDEX IF NOT EXISTS hub_signup_requests_status_requested_idx ON hub_signup_requests(status, requested_at);');
  await run(`
    CREATE TABLE IF NOT EXISTS hub_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await run('CREATE INDEX IF NOT EXISTS hub_sessions_user_idx ON hub_sessions(user_id);');
  await run('CREATE INDEX IF NOT EXISTS hub_sessions_expires_idx ON hub_sessions(expires_at);');

  // Denormalized Access/MDB import tables for the dashboard DATABASE tab.
  await ensureDatabaseTables(pool);
}

module.exports = { initDb };
