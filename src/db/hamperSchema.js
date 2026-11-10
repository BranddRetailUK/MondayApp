async function ensureHamperTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS hamper_orders (
      id UUID PRIMARY KEY,
      request_hash TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode = 'sandbox'),
      status TEXT NOT NULL DEFAULT 'pending',
      snapshot JSONB NOT NULL,
      delivery JSONB NOT NULL,
      stripe_session_id TEXT UNIQUE,
      stripe_payment_intent TEXT,
      checkout_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hamper_payment_events (
      id TEXT PRIMARY KEY, order_id UUID REFERENCES hamper_orders(id),
      type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hamper_cleared_orders (
      id UUID PRIMARY KEY, cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hamper_checkout_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
  `);
}
module.exports = { ensureHamperTables };
