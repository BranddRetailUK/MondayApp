async function ensurePrintExportTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS print_export_settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query('INSERT INTO print_export_settings(id,enabled) VALUES(1,FALSE) ON CONFLICT(id) DO NOTHING');
  // Deliberately independent of MDB replacement cascades: retain export audit/history.
  await db.query(`CREATE TABLE IF NOT EXISTS print_export_jobs (
    id UUID PRIMARY KEY,
    source_order_id INTEGER NOT NULL,
    design_number TEXT NOT NULL CHECK (design_number ~ '^[0-9]+$' AND design_number::numeric >= 28300),
    approval_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','awaiting_review','exported','needs_attention','cancelled')),
    attempt INTEGER NOT NULL DEFAULT 0,
    claim_token UUID,
    worker_id TEXT,
    lease_until TIMESTAMPTZ,
    message TEXT NOT NULL DEFAULT '',
    outputs JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_order_id, design_number, approval_id)
  )`);
  await db.query('ALTER TABLE print_export_jobs ADD COLUMN IF NOT EXISTS manual_requested BOOLEAN NOT NULL DEFAULT FALSE');
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS print_export_active_design_idx
    ON print_export_jobs(source_order_id, design_number)
    WHERE status IN ('queued','processing','awaiting_review')`);
  await db.query(`CREATE INDEX IF NOT EXISTS print_export_queue_idx ON print_export_jobs(status, created_at)`);
}
module.exports = { ensurePrintExportTables };
