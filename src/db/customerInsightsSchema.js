async function ensureCustomerInsightsTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS customer_insight_notes (
    id BIGSERIAL PRIMARY KEY,
    customer_key TEXT NOT NULL,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
    request_id UUID NOT NULL UNIQUE,
    created_by_user_id INTEGER REFERENCES hub_users(id) ON DELETE SET NULL,
    created_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS customer_insight_note_documents (
    customer_key TEXT PRIMARY KEY,
    body TEXT NOT NULL CHECK (length(body) <= 20000),
    version INTEGER NOT NULL DEFAULT 1,
    updated_by_user_id INTEGER REFERENCES hub_users(id) ON DELETE SET NULL,
    updated_by_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS customer_insight_notes_customer_date_idx ON customer_insight_notes(customer_key, created_at DESC, id DESC)');
}
module.exports = { ensureCustomerInsightsTables };
