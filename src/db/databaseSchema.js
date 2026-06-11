async function ensureDatabaseTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS database_jobs (
      id SERIAL PRIMARY KEY,
      source_order_id INTEGER NOT NULL UNIQUE,
      order_no INTEGER NOT NULL,
      source_year INTEGER NOT NULL CHECK (source_year IN (2025, 2026)),
      order_type_id INTEGER,
      order_type TEXT,
      order_type_abbr TEXT,
      customer_id INTEGER,
      customer_name TEXT,
      customer_code TEXT,
      contact_id INTEGER,
      job_title TEXT,
      client_order_no TEXT,
      order_date TIMESTAMP,
      customer_date_required BOOLEAN,
      complete_date TIMESTAMP,
      is_complete BOOLEAN,
      delivery_date TIMESTAMP,
      is_reorder BOOLEAN,
      is_bagged BOOLEAN,
      is_automatic BOOLEAN,
      screen_numbers TEXT,
      comments TEXT,
      has_artwork BOOLEAN,
      has_screens BOOLEAN,
      has_shirts BOOLEAN,
      is_printed BOOLEAN,
      customer_supplied BOOLEAN,
      delivery_note_date TIMESTAMP,
      invoice_no INTEGER,
      trace_staff_id INTEGER,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      invoice_required BOOLEAN,
      invoice_printed BOOLEAN,
      pf_invoice_printed BOOLEAN,
      pf_invoice_date TIMESTAMP,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_job_line_items (
      id SERIAL PRIMARY KEY,
      source_order_item_id INTEGER NOT NULL UNIQUE,
      source_order_id INTEGER NOT NULL REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
      source_product_id INTEGER,
      supplier_order_id INTEGER,
      line_description TEXT,
      quantity INTEGER,
      unit_price NUMERIC(15, 2),
      unit_cost NUMERIC(15, 2),
      vat_rate REAL,
      is_non_deliverable BOOLEAN,
      is_internal BOOLEAN,
      supplier_name TEXT,
      style_id INTEGER,
      style_code TEXT,
      alt_style_code TEXT,
      style_name TEXT,
      colour TEXT,
      size TEXT,
      product_type TEXT,
      stock INTEGER,
      is_product_active BOOLEAN,
      trace_staff_id INTEGER,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_job_positions (
      id SERIAL PRIMARY KEY,
      source_order_position_id INTEGER NOT NULL UNIQUE,
      source_order_id INTEGER NOT NULL REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
      position_name TEXT,
      colour_notes TEXT,
      design_ref TEXT,
      trace_staff_id INTEGER,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_import_runs (
      id SERIAL PRIMARY KEY,
      source_file TEXT,
      source_years TEXT NOT NULL DEFAULT '2025,2026',
      job_count INTEGER NOT NULL DEFAULT 0,
      line_item_count INTEGER NOT NULL DEFAULT 0,
      position_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'running',
      message TEXT
    );
  `);

  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_order_no_idx ON database_jobs(order_no);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_source_year_idx ON database_jobs(source_year);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_customer_name_idx ON database_jobs(customer_name);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_order_date_idx ON database_jobs(order_date);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_complete_idx ON database_jobs(is_complete);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_order_idx ON database_job_line_items(source_order_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_positions_order_idx ON database_job_positions(source_order_id);');
}

module.exports = { ensureDatabaseTables };
