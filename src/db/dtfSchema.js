async function ensureDtfTables(pool) {
  await pool.query(`
    ALTER TABLE hub_users
    ADD COLUMN IF NOT EXISTS access_scope TEXT;
  `);
  await pool.query(`
    UPDATE hub_users
    SET access_scope = 'full'
    WHERE access_scope IS NULL
       OR access_scope NOT IN ('full', 'dtf_only');
  `);
  await pool.query(`
    ALTER TABLE hub_users
    ALTER COLUMN access_scope SET DEFAULT 'full';
  `);
  await pool.query(`
    ALTER TABLE hub_users
    ALTER COLUMN access_scope SET NOT NULL;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'hub_users_access_scope_check'
      ) THEN
        ALTER TABLE hub_users
        ADD CONSTRAINT hub_users_access_scope_check
        CHECK (access_scope IN ('full', 'dtf_only'));
      END IF;
    END $$;
  `);

  await pool.query('CREATE SEQUENCE IF NOT EXISTS dtf_job_number_seq START WITH 1;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dtf_jobs (
      id BIGSERIAL PRIMARY KEY,
      job_number TEXT NOT NULL UNIQUE
        DEFAULT ('DTF-' || LPAD(nextval('dtf_job_number_seq')::TEXT, 6, '0')),
      user_id INTEGER REFERENCES hub_users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UPLOADING',
      unique_file_count INTEGER NOT NULL,
      sheet_quantity INTEGER NOT NULL,
      unit_price_pence INTEGER NOT NULL,
      subtotal_pence INTEGER NOT NULL,
      vat_rate NUMERIC(5, 4) NOT NULL,
      vat_pence INTEGER NOT NULL,
      total_pence INTEGER NOT NULL,
      status_updated_by_user_id INTEGER REFERENCES hub_users(id) ON DELETE SET NULL,
      status_updated_by_name TEXT,
      status_updated_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dtf_jobs_status_check
        CHECK (status IN ('UPLOADING', 'RECEIVED', 'IN_PRODUCTION', 'COMPLETED', 'FAILED')),
      CONSTRAINT dtf_jobs_counts_check
        CHECK (unique_file_count BETWEEN 1 AND 40 AND sheet_quantity >= unique_file_count),
      CONSTRAINT dtf_jobs_price_check
        CHECK (unit_price_pence >= 0 AND subtotal_pence >= 0 AND vat_pence >= 0 AND total_pence >= 0)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS dtf_jobs_user_created_idx ON dtf_jobs(user_id, created_at DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS dtf_jobs_status_created_idx ON dtf_jobs(status, created_at DESC);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dtf_job_files (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES dtf_jobs(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      declared_bytes BIGINT NOT NULL,
      verified_bytes BIGINT,
      quantity INTEGER NOT NULL DEFAULT 1,
      upload_status TEXT NOT NULL DEFAULT 'PENDING',
      cloudinary_asset_id TEXT,
      cloudinary_public_id TEXT UNIQUE,
      cloudinary_version BIGINT,
      page_count INTEGER,
      page_width INTEGER,
      page_height INTEGER,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dtf_job_files_quantity_check CHECK (quantity BETWEEN 1 AND 99),
      CONSTRAINT dtf_job_files_bytes_check CHECK (declared_bytes BETWEEN 1 AND 262144000),
      CONSTRAINT dtf_job_files_status_check
        CHECK (upload_status IN ('PENDING', 'UPLOADING', 'UPLOADED', 'FAILED')),
      CONSTRAINT dtf_job_files_client_unique UNIQUE (job_id, client_id)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS dtf_job_files_job_idx ON dtf_job_files(job_id, id);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dtf_rate_limit_buckets (
      scope TEXT NOT NULL,
      identifier TEXT NOT NULL,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope, identifier)
    );
  `);
}

module.exports = { ensureDtfTables };
