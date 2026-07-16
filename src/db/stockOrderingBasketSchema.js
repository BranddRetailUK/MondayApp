let ensurePromise = null;

async function createStockOrderingBasketTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_basket_jobs (
      id BIGSERIAL PRIMARY KEY,
      source_order_id INTEGER NOT NULL UNIQUE,
      order_no TEXT,
      status TEXT NOT NULL DEFAULT 'adding',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      line_count INTEGER NOT NULL DEFAULT 0,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      basket_url TEXT,
      stock_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      request_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
      response_snapshot JSONB,
      last_error TEXT,
      adding_started_at TIMESTAMPTZ,
      basketed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT database_ralawise_basket_jobs_status_check
        CHECK (status IN ('adding', 'basketed', 'failed'))
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_basket_lines (
      id BIGSERIAL PRIMARY KEY,
      source_order_item_id INTEGER NOT NULL UNIQUE,
      source_order_id INTEGER NOT NULL,
      order_no TEXT,
      ralawise_sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'adding',
      stock_warning JSONB,
      basketed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT database_ralawise_basket_lines_quantity_check CHECK (quantity > 0),
      CONSTRAINT database_ralawise_basket_lines_status_check
        CHECK (status IN ('adding', 'basketed', 'failed'))
    )
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
