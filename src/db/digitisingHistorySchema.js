async function ensureDigitisingHistoryTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS digitising_studio_jobs (
    id UUID PRIMARY KEY,
    filename TEXT NOT NULL,
    garment TEXT NOT NULL,
    stats JSONB NOT NULL,
    threads JSONB NOT NULL,
    dst BYTEA NOT NULL,
    preview_png BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS digitising_studio_jobs_created_idx ON digitising_studio_jobs (created_at DESC, id DESC)');
}
module.exports = { ensureDigitisingHistoryTables };
