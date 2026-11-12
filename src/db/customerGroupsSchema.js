async function ensureCustomerGroupsTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS hub_customer_groups (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS hub_customer_groups_title_idx ON hub_customer_groups (lower(trim(title)))');
  await db.query(`CREATE TABLE IF NOT EXISTS hub_customer_group_members (
    group_id INTEGER NOT NULL REFERENCES hub_customer_groups(id) ON DELETE CASCADE,
    customer_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, customer_key)
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS hub_customer_group_members_customer_idx ON hub_customer_group_members(customer_key)');
}
module.exports = { ensureCustomerGroupsTables };
