async function ensureHamperTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS hamper_orders (
      id UUID PRIMARY KEY,
      request_hash TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('sandbox', 'live')),
      status TEXT NOT NULL DEFAULT 'pending',
      snapshot JSONB NOT NULL,
      delivery JSONB NOT NULL,
      stripe_session_id TEXT UNIQUE,
      stripe_payment_intent TEXT,
      checkout_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE hamper_orders DROP CONSTRAINT IF EXISTS hamper_orders_mode_check;
    ALTER TABLE hamper_orders ADD CONSTRAINT hamper_orders_mode_check CHECK (mode IN ('sandbox', 'live'));
    CREATE SEQUENCE IF NOT EXISTS hamper_po_sequence;
    ALTER TABLE hamper_orders ADD COLUMN IF NOT EXISTS po_number BIGINT;
    CREATE UNIQUE INDEX IF NOT EXISTS hamper_orders_po_unique ON hamper_orders(po_number);
    DO $$ DECLARE existing_order RECORD; BEGIN
      FOR existing_order IN SELECT id FROM hamper_orders WHERE po_number IS NULL ORDER BY created_at,id FOR UPDATE LOOP
        UPDATE hamper_orders SET po_number=nextval('hamper_po_sequence') WHERE id=existing_order.id AND po_number IS NULL;
      END LOOP;
    END $$;
    CREATE TABLE IF NOT EXISTS hamper_discount_redemptions (
      code_hash TEXT PRIMARY KEY, order_id UUID NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
