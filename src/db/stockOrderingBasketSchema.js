let ensurePromise = null;

async function createStockOrderingBasketTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_basket_jobs (
      id BIGSERIAL PRIMARY KEY,
      source_order_id INTEGER NOT NULL UNIQUE,
      order_no TEXT,
      line_reference TEXT,
      status TEXT NOT NULL DEFAULT 'adding',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      line_count INTEGER NOT NULL DEFAULT 0,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      basket_url TEXT,
      stock_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      request_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
      response_snapshot JSONB,
      placed_order_snapshot JSONB,
      ralawise_order_number TEXT,
      order_url TEXT,
      last_error TEXT,
      adding_started_at TIMESTAMPTZ,
      basketed_at TIMESTAMPTZ,
      ordered_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      basket_sync_status TEXT NOT NULL DEFAULT 'in_sync',
      basket_sync_error TEXT,
      basket_sync_started_at TIMESTAMPTZ,
      basket_updated_at TIMESTAMPTZ,
      basket_revision INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT database_ralawise_basket_jobs_status_check
        CHECK (status IN ('adding', 'basketed', 'ordered', 'failed'))
    )
  `);
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS line_reference TEXT;');
  await db.query(`
    UPDATE database_ralawise_basket_jobs
    SET line_reference = LEFT(BTRIM(order_no), 15)
    WHERE NULLIF(BTRIM(line_reference), '') IS NULL
      AND NULLIF(BTRIM(order_no), '') IS NOT NULL
  `);
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS placed_order_snapshot JSONB;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS ralawise_order_number TEXT;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS order_url TEXT;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;');
  await db.query("ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS basket_sync_status TEXT NOT NULL DEFAULT 'in_sync';");
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS basket_sync_error TEXT;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS basket_sync_started_at TIMESTAMPTZ;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS basket_updated_at TIMESTAMPTZ;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs ADD COLUMN IF NOT EXISTS basket_revision INTEGER NOT NULL DEFAULT 1;');
  await db.query('ALTER TABLE database_ralawise_basket_jobs DROP CONSTRAINT IF EXISTS database_ralawise_basket_jobs_status_check;');
  await db.query(`
    ALTER TABLE database_ralawise_basket_jobs
    ADD CONSTRAINT database_ralawise_basket_jobs_status_check
    CHECK (status IN ('adding', 'basketed', 'ordered', 'failed'))
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_basket_lines (
      id BIGSERIAL PRIMARY KEY,
      source_order_item_id INTEGER NOT NULL UNIQUE,
      source_order_id INTEGER NOT NULL,
      order_no TEXT,
      line_reference TEXT,
      ralawise_sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'adding',
      stock_warning JSONB,
      ralawise_order_number TEXT,
      supplier_order_line TEXT,
      supplier_unit_price NUMERIC(15, 2),
      supplier_line_total NUMERIC(15, 2),
      basketed_at TIMESTAMPTZ,
      ordered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT database_ralawise_basket_lines_quantity_check CHECK (quantity > 0),
      CONSTRAINT database_ralawise_basket_lines_status_check
        CHECK (status IN ('adding', 'basketed', 'ordered', 'failed'))
    )
  `);
  await db.query('ALTER TABLE database_ralawise_basket_lines ADD COLUMN IF NOT EXISTS line_reference TEXT;');
  await db.query(`
    UPDATE database_ralawise_basket_lines
    SET line_reference = LEFT(BTRIM(order_no), 15)
    WHERE NULLIF(BTRIM(line_reference), '') IS NULL
      AND NULLIF(BTRIM(order_no), '') IS NOT NULL
  `);
  await db.query('ALTER TABLE database_ralawise_basket_lines ADD COLUMN IF NOT EXISTS ralawise_order_number TEXT;');
  await db.query('ALTER TABLE database_ralawise_basket_lines ADD COLUMN IF NOT EXISTS supplier_order_line TEXT;');
  await db.query('ALTER TABLE database_ralawise_basket_lines ADD COLUMN IF NOT EXISTS supplier_unit_price NUMERIC(15, 2);');
  await db.query('ALTER TABLE database_ralawise_basket_lines ADD COLUMN IF NOT EXISTS supplier_line_total NUMERIC(15, 2);');
  await db.query('ALTER TABLE database_ralawise_basket_lines ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;');
  await db.query('ALTER TABLE database_ralawise_basket_lines DROP CONSTRAINT IF EXISTS database_ralawise_basket_lines_status_check;');
  await db.query(`
    ALTER TABLE database_ralawise_basket_lines
    ADD CONSTRAINT database_ralawise_basket_lines_status_check
    CHECK (status IN ('adding', 'basketed', 'ordered', 'failed'))
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS database_ralawise_basket_lines_order_idx
    ON database_ralawise_basket_lines(source_order_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS database_ralawise_basket_lines_status_idx
    ON database_ralawise_basket_lines(status)
  `);
}

async function ensureStockOrderingBasketTables(db) {
  if (!ensurePromise) {
    ensurePromise = createStockOrderingBasketTables(db).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

module.exports = {
  createStockOrderingBasketTables,
  ensureStockOrderingBasketTables,
};
