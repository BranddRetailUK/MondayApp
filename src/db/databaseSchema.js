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
      contact_name TEXT,
      contact_phone TEXT,
      contact_mobile TEXT,
      contact_email TEXT,
      job_title TEXT,
      client_order_no TEXT,
      delivery_method TEXT,
      payment_terms TEXT,
      order_taken_by TEXT,
      order_owner_user_id INTEGER,
      order_owner_name TEXT,
      invoice_address_id INTEGER,
      delivery_address_id INTEGER,
      delivery_address TEXT,
      invoice_address TEXT,
      is_manual_entry BOOLEAN NOT NULL DEFAULT FALSE,
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

  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS contact_name TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS contact_phone TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS contact_mobile TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS contact_email TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS delivery_method TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS payment_terms TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS order_taken_by TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS order_owner_user_id INTEGER;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS order_owner_name TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS invoice_address_id INTEGER;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS delivery_address_id INTEGER;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS delivery_address TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS invoice_address TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS is_manual_entry BOOLEAN NOT NULL DEFAULT FALSE;');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_customer_addresses (
      id SERIAL PRIMARY KEY,
      source_address_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER,
      address_type TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      address_line3 TEXT,
      address_line4 TEXT,
      address_line5 TEXT,
      postcode TEXT,
      phone TEXT,
      fax TEXT,
      mobile TEXT,
      trace_staff_id INTEGER,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS source_address_id INTEGER;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS customer_id INTEGER;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS address_type TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS address_line1 TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS address_line2 TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS address_line3 TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS address_line4 TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS address_line5 TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS postcode TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS phone TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS fax TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS mobile TEXT;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS trace_staff_id INTEGER;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS created_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS updated_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_customer_addresses ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP NOT NULL DEFAULT NOW();');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_job_line_items (
      id SERIAL PRIMARY KEY,
      source_order_item_id INTEGER NOT NULL UNIQUE,
      source_order_id INTEGER NOT NULL REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
      line_sort_order INTEGER,
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

  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS line_sort_order INTEGER;');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_products (
      id SERIAL PRIMARY KEY,
      source_product_id INTEGER NOT NULL UNIQUE,
      style_id INTEGER,
      style_colour_id INTEGER,
      style_size_id INTEGER,
      supplier_id INTEGER,
      supplier_name TEXT,
      supplier_code TEXT,
      product_type_id INTEGER,
      product_type TEXT,
      style_code TEXT,
      alt_style_code TEXT,
      style_name TEXT,
      colour_id INTEGER,
      colour TEXT,
      size_id INTEGER,
      size TEXT,
      unit_cost NUMERIC(15, 2),
      stock INTEGER,
      is_product_active BOOLEAN,
      trace_staff_id INTEGER,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS source_product_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS style_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS style_colour_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS style_size_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_name TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_code TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS product_type_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS product_type TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS style_code TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS alt_style_code TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS style_name TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS colour_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS colour TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS size_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS size TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15, 2);');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS stock INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS is_product_active BOOLEAN;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS trace_staff_id INTEGER;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS created_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS updated_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP NOT NULL DEFAULT NOW();');

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

  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS source_order_position_id INTEGER;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS source_order_id INTEGER;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS position_name TEXT;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS colour_notes TEXT;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS design_ref TEXT;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS trace_staff_id INTEGER;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS created_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS updated_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP NOT NULL DEFAULT NOW();');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_import_runs (
      id SERIAL PRIMARY KEY,
      source_file TEXT,
      source_years TEXT NOT NULL DEFAULT '2025,2026',
      job_count INTEGER NOT NULL DEFAULT 0,
      line_item_count INTEGER NOT NULL DEFAULT 0,
      position_count INTEGER NOT NULL DEFAULT 0,
      address_count INTEGER NOT NULL DEFAULT 0,
      product_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'running',
      message TEXT
    );
  `);

  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_order_no_idx ON database_jobs(order_no);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_source_year_idx ON database_jobs(source_year);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_customer_name_idx ON database_jobs(customer_name);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_invoice_address_idx ON database_jobs(invoice_address_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_delivery_address_idx ON database_jobs(delivery_address_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_order_date_idx ON database_jobs(order_date);');
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_complete_idx ON database_jobs(is_complete);');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_customer_addresses_source_address_idx ON database_customer_addresses(source_address_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_addresses_customer_idx ON database_customer_addresses(customer_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_order_idx ON database_job_line_items(source_order_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_sort_idx ON database_job_line_items(source_order_id, line_sort_order);');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_products_source_product_idx ON database_products(source_product_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_style_code_idx ON database_products(style_code);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_colour_idx ON database_products(colour);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_size_idx ON database_products(size);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_active_idx ON database_products(is_product_active);');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_job_positions_source_position_idx ON database_job_positions(source_order_position_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_positions_order_idx ON database_job_positions(source_order_id);');
  await db.query('ALTER TABLE database_import_runs ADD COLUMN IF NOT EXISTS address_count INTEGER NOT NULL DEFAULT 0;');
  await db.query('ALTER TABLE database_import_runs ADD COLUMN IF NOT EXISTS product_count INTEGER NOT NULL DEFAULT 0;');
}

module.exports = { ensureDatabaseTables };
