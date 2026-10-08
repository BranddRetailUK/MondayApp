async function ensureProofGeneratorTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS proof_generated_garment_views (
    cache_key TEXT PRIMARY KEY,
    style_code TEXT NOT NULL,
    colour TEXT NOT NULL,
    view TEXT NOT NULL CHECK (view IN ('front','back','left','right')),
    source_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    image_png BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS proof_design_jobs (
    id UUID PRIMARY KEY, customer TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL DEFAULT '',
    design_number BIGINT UNIQUE, folder_name TEXT, status TEXT NOT NULL DEFAULT 'awaiting_folder',
    revision INTEGER NOT NULL DEFAULT 0, saved_revision INTEGER NOT NULL DEFAULT 0,
    save_key UUID, pdf BYTEA, pdf_hash TEXT, claim_token UUID, worker_id TEXT, lease_until TIMESTAMPTZ,
    message TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query("ALTER TABLE proof_design_jobs ADD COLUMN IF NOT EXISTS artworks JSONB NOT NULL DEFAULT '[]'::jsonb");
}
module.exports = { ensureProofGeneratorTables };
