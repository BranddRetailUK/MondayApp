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
  await pool.query(`ALTER TABLE proof_design_jobs
    ADD COLUMN IF NOT EXISTS proof_pdf BYTEA,
    ADD COLUMN IF NOT EXISTS proof_ready BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source JSONB,
    ADD COLUMN IF NOT EXISTS garment_assets JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS source_artworks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS reference TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS preview_png BYTEA,
    ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS generation_message TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS generation_updated_at TIMESTAMPTZ`);
  await pool.query('ALTER TABLE proof_design_jobs ADD COLUMN IF NOT EXISTS active_source_order_id INTEGER, ADD COLUMN IF NOT EXISTS publish_source_order_id INTEGER');
  await pool.query('ALTER TABLE proof_design_jobs ADD COLUMN IF NOT EXISTS saved_proof_pdf BYTEA, ADD COLUMN IF NOT EXISTS saved_snapshot JSONB');
  await pool.query(`UPDATE proof_design_jobs SET saved_proof_pdf=proof_pdf,
    saved_snapshot=jsonb_build_object('source',source,'source_artworks',source_artworks,'garment_assets',garment_assets,'customer',customer,'job_title',job_title)
    WHERE status='saved' AND saved_revision>0 AND saved_proof_pdf IS NULL AND proof_ready`);
  // No MDB cascade: import replacements must not erase proof associations/history.
  await pool.query(`CREATE TABLE IF NOT EXISTS proof_job_links (
    source_order_id INTEGER PRIMARY KEY, proof_id UUID NOT NULL REFERENCES proof_design_jobs(id),
    saved_revision INTEGER NOT NULL DEFAULT 0, file_public_id TEXT,
    snapshot JSONB, linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE proof_job_links ADD COLUMN IF NOT EXISTS created_position_id INTEGER, ADD COLUMN IF NOT EXISTS order_no INTEGER');
  await pool.query('CREATE INDEX IF NOT EXISTS proof_job_links_proof_idx ON proof_job_links(proof_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS proof_design_jobs_history_idx ON proof_design_jobs(created_at DESC,id DESC)');
}
module.exports = { ensureProofGeneratorTables };
