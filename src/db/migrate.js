// Idempotent DB bootstrap (mirrors your current schema)
const pool = require('./pool');
const { VERBOSE_SQL } = require('../config/env');

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

  // Customers
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      business_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      mobile TEXT,
      inv_line1 TEXT, inv_line2 TEXT, inv_city TEXT, inv_region TEXT, inv_postcode TEXT, inv_country TEXT,
      ship_line1 TEXT, ship_line2 TEXT, ship_city TEXT, ship_region TEXT, ship_postcode TEXT, ship_country TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'customers_touch_updated_at') THEN
        CREATE OR REPLACE FUNCTION customers_touch_updated_at()
        RETURNS TRIGGER AS $BODY$
        BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
        $BODY$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customers_set_updated_at') THEN
        CREATE TRIGGER customers_set_updated_at
        BEFORE UPDATE ON customers
        FOR EACH ROW
        EXECUTE FUNCTION customers_touch_updated_at();
      END IF;
    END $$;
  `);

  // Orders
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      job_title TEXT,
      product_code TEXT,
      garment_type TEXT,
      product_title TEXT,
      colour TEXT,
      size TEXT,
      status TEXT DEFAULT 'Draft',
      notes TEXT,
      total TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Ensure columns exist for older DBs
  const ensureCol = async (col, type, defaultSql='') => {
    await run(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='orders' AND column_name='${col}'
        ) THEN
          EXECUTE 'ALTER TABLE orders ADD COLUMN ${col} ${type} ${defaultSql}';
        END IF;
      END $$;
    `);
  };
  await ensureCol('job_title', 'TEXT');
  await ensureCol('product_code', 'TEXT');
  await ensureCol('garment_type', 'TEXT');
  await ensureCol('product_title', 'TEXT');
  await ensureCol('colour', 'TEXT');
  await ensureCol('size', 'TEXT');
  await ensureCol('status', 'TEXT', "DEFAULT ''");
  await ensureCol('notes', 'TEXT');
  await ensureCol('total', 'TEXT');

  // Order items & files
  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      line_no INTEGER,
      product_code TEXT,
      garment_type TEXT,
      product_title TEXT,
      colour TEXT,
      size TEXT,
      quantity INTEGER DEFAULT 1
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS order_files (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      path TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

module.exports = { initDb };
