const { createStockOrderingBasketTables } = require('./stockOrderingBasketSchema');

async function ensureDatabaseTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS database_jobs (
      id SERIAL PRIMARY KEY,
      source_order_id INTEGER NOT NULL UNIQUE,
      order_no INTEGER NOT NULL,
      source_year INTEGER,
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
      invoice_date TIMESTAMP,
      trace_staff_id INTEGER,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      invoice_required BOOLEAN,
      invoice_printed BOOLEAN,
      pf_invoice_printed BOOLEAN,
      closed_without_invoice BOOLEAN NOT NULL DEFAULT FALSE,
      pf_invoice_date TIMESTAMP,
      dashboard_status TEXT,
      dashboard_priority TEXT,
      dashboard_type TEXT,
      proof_approved BOOLEAN,
      proof_approved_at TIMESTAMP,
      dashboard_status_updated_at TIMESTAMP,
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
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS dashboard_status TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS dashboard_priority TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS dashboard_type TEXT;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS proof_approved BOOLEAN;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS proof_approved_at TIMESTAMP;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS dashboard_status_updated_at TIMESTAMP;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMP;');
  await db.query('ALTER TABLE database_jobs ADD COLUMN IF NOT EXISTS closed_without_invoice BOOLEAN NOT NULL DEFAULT FALSE;');
  await db.query('ALTER TABLE database_jobs ALTER COLUMN source_year DROP NOT NULL;');
  await db.query('ALTER TABLE database_jobs DROP CONSTRAINT IF EXISTS database_jobs_source_year_check;');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_customer_profiles (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_code TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      contact_mobile TEXT,
      contact_email TEXT,
      marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      invoice_address TEXT,
      invoice_address_line1 TEXT,
      invoice_address_line2 TEXT,
      invoice_address_line3 TEXT,
      invoice_address_line4 TEXT,
      invoice_address_line5 TEXT,
      invoice_postcode TEXT,
      invoice_phone TEXT,
      invoice_fax TEXT,
      delivery_address TEXT,
      delivery_address_line1 TEXT,
      delivery_address_line2 TEXT,
      delivery_address_line3 TEXT,
      delivery_address_line4 TEXT,
      delivery_address_line5 TEXT,
      delivery_postcode TEXT,
      delivery_phone TEXT,
      delivery_fax TEXT,
      account_manager_user_id INTEGER,
      account_manager_name TEXT,
      created_by_user_id INTEGER,
      created_by_name TEXT,
      updated_by_user_id INTEGER,
      updated_by_name TEXT,
      created_at_source TIMESTAMP,
      updated_at_source TIMESTAMP,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS customer_id INTEGER;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS customer_name TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS customer_code TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS contact_name TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS contact_phone TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS contact_mobile TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS contact_email TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_address TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_address_line1 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_address_line2 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_address_line3 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_address_line4 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_address_line5 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_postcode TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_phone TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS invoice_fax TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_address TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_address_line1 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_address_line2 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_address_line3 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_address_line4 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_address_line5 TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_postcode TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_phone TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS delivery_fax TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS account_manager_user_id INTEGER;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS account_manager_name TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS created_by_name TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS updated_by_name TEXT;');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS created_at_source TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS updated_at_source TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE database_customer_profiles ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP NOT NULL DEFAULT NOW();');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_customer_contacts (
      id SERIAL PRIMARY KEY,
      source_contact_id INTEGER,
      customer_id INTEGER,
      profile_id INTEGER,
      customer_name TEXT NOT NULL,
      address_id INTEGER,
      contact_title TEXT,
      contact_first_name TEXT,
      contact_last_name TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      contact_fax TEXT,
      contact_mobile TEXT,
      contact_email TEXT,
      contact_address TEXT,
      trace_staff_id INTEGER,
      created_by_user_id INTEGER,
      created_by_name TEXT,
      updated_by_user_id INTEGER,
      updated_by_name TEXT,
      created_at_source TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at_source TIMESTAMP NOT NULL DEFAULT NOW(),
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS source_contact_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS customer_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS profile_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS customer_name TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS address_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_title TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_first_name TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_last_name TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_name TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_phone TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_fax TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_mobile TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_email TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS contact_address TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS trace_staff_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS created_by_name TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS updated_by_name TEXT;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS created_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS updated_at_source TIMESTAMP;');
  await db.query('ALTER TABLE database_customer_contacts ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE database_customer_contacts ALTER COLUMN created_at_source DROP NOT NULL;');
  await db.query('ALTER TABLE database_customer_contacts ALTER COLUMN updated_at_source DROP NOT NULL;');

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
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS legacy_source_product_id INTEGER;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS ralawise_catalog_variant_id BIGINT;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS ralawise_sku TEXT;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS supplier_style_code TEXT;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS supplier_colour_code TEXT;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS supplier_size_code TEXT;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS catalogue_status TEXT;');
  await db.query('ALTER TABLE database_job_line_items ADD COLUMN IF NOT EXISTS catalogue_synced_at TIMESTAMP;');

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
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS catalog_source TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_sku TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS ralawise_sku TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_alpha_sku TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_style_code TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_colour_code TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_size_code TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS ralawise_catalog_variant_id BIGINT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS catalogue_status TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS catalogue_synced_at TIMESTAMP;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS primary_image_url TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS colour_image_url TEXT;');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_carton_price NUMERIC(15, 4);');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_pack_price NUMERIC(15, 4);');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS supplier_single_price NUMERIC(15, 4);');
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS ralawise_match_method TEXT;');
  await db.query("ALTER TABLE database_products ADD COLUMN IF NOT EXISTS ralawise_match_details JSONB NOT NULL DEFAULT '{}'::jsonb;");
  await db.query('ALTER TABLE database_products ADD COLUMN IF NOT EXISTS ralawise_matched_at TIMESTAMP;');

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_catalog_styles (
      id BIGSERIAL PRIMARY KEY,
      style_code TEXT NOT NULL UNIQUE,
      database_product_style_id INTEGER UNIQUE,
      manufacturer_style_code TEXT,
      brand TEXT,
      style_name TEXT,
      specification TEXT,
      retail_description TEXT,
      product_feature_1 TEXT,
      product_feature_2 TEXT,
      product_feature_3 TEXT,
      size_range TEXT,
      sizing_to_fit TEXT,
      size_exclusions TEXT,
      washing_instructions TEXT,
      jacket_length TEXT,
      leg_length TEXT,
      fabric TEXT,
      weight_gsm TEXT,
      bag_capacity TEXT,
      print_area TEXT,
      embroidery_information TEXT,
      bag_dimensions TEXT,
      product_type TEXT,
      gender TEXT,
      age_group TEXT,
      accreditations TEXT,
      tag TEXT,
      sustainable_organic TEXT,
      plus_sizes TEXT,
      categorisation TEXT,
      size_guide_url TEXT,
      spec_sheet_url TEXT,
      is_new_product BOOLEAN,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      import_source TEXT,
      source_imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_catalog_colours (
      id BIGSERIAL PRIMARY KEY,
      style_id BIGINT NOT NULL REFERENCES database_ralawise_catalog_styles(id),
      colour_code TEXT NOT NULL,
      colour_name TEXT,
      primary_colour TEXT,
      colour_shade TEXT,
      pantone TEXT,
      rgb TEXT,
      cmyk TEXT,
      colour_image_url TEXT,
      colour_image_filename TEXT,
      is_new_colour BOOLEAN,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      import_source TEXT,
      source_imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (style_id, colour_code)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_catalog_variants (
      id BIGSERIAL PRIMARY KEY,
      sku_code TEXT NOT NULL UNIQUE,
      database_product_source_id INTEGER UNIQUE,
      alpha_sku_code TEXT,
      style_id BIGINT NOT NULL REFERENCES database_ralawise_catalog_styles(id),
      colour_id BIGINT NOT NULL REFERENCES database_ralawise_catalog_colours(id),
      size_code TEXT,
      size_name TEXT,
      carton_quantity INTEGER,
      pack_quantity INTEGER,
      carton_price NUMERIC(15, 4),
      pack_price NUMERIC(15, 4),
      single_price NUMERIC(15, 4),
      vat_status TEXT,
      commodity_code TEXT,
      item_weight_kg NUMERIC(15, 6),
      country_of_origin TEXT,
      sku_status TEXT NOT NULL,
      is_new_sku BOOLEAN,
      ean TEXT,
      primary_image_url TEXT,
      colour_image_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      import_source TEXT,
      source_imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_catalog_images (
      id BIGSERIAL PRIMARY KEY,
      style_id BIGINT NOT NULL REFERENCES database_ralawise_catalog_styles(id),
      colour_id BIGINT REFERENCES database_ralawise_catalog_colours(id),
      image_type TEXT NOT NULL CHECK (image_type IN ('primary', 'colour')),
      source_url TEXT NOT NULL,
      filename TEXT,
      licence_expiry_date DATE,
      source_key TEXT NOT NULL UNIQUE,
      import_source TEXT,
      source_imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (style_id, colour_id, image_type, source_url)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_ralawise_catalog_imports (
      id BIGSERIAL PRIMARY KEY,
      source_file TEXT NOT NULL,
      source_sha256 TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      row_count INTEGER NOT NULL DEFAULT 0,
      style_count INTEGER NOT NULL DEFAULT 0,
      colour_count INTEGER NOT NULL DEFAULT 0,
      variant_count INTEGER NOT NULL DEFAULT 0,
      live_count INTEGER NOT NULL DEFAULT 0,
      discontinued_count INTEGER NOT NULL DEFAULT 0,
      report JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP
    );
  `);

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'database_products_ralawise_variant_fk'
      ) THEN
        ALTER TABLE database_products
          ADD CONSTRAINT database_products_ralawise_variant_fk
          FOREIGN KEY (ralawise_catalog_variant_id)
          REFERENCES database_ralawise_catalog_variants(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'database_line_items_ralawise_variant_fk'
      ) THEN
        ALTER TABLE database_job_line_items
          ADD CONSTRAINT database_line_items_ralawise_variant_fk
          FOREIGN KEY (ralawise_catalog_variant_id)
          REFERENCES database_ralawise_catalog_variants(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS database_job_positions (
      id SERIAL PRIMARY KEY,
      source_order_position_id INTEGER NOT NULL UNIQUE,
      source_order_id INTEGER NOT NULL REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
      position_sort_order INTEGER,
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
  await db.query('ALTER TABLE database_job_positions ADD COLUMN IF NOT EXISTS position_sort_order INTEGER;');
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
      source_years TEXT NOT NULL DEFAULT 'all',
      job_count INTEGER NOT NULL DEFAULT 0,
      line_item_count INTEGER NOT NULL DEFAULT 0,
      position_count INTEGER NOT NULL DEFAULT 0,
      address_count INTEGER NOT NULL DEFAULT 0,
      contact_count INTEGER NOT NULL DEFAULT 0,
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
  await db.query('CREATE INDEX IF NOT EXISTS database_jobs_dashboard_status_idx ON database_jobs(dashboard_status);');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_profiles_name_idx ON database_customer_profiles(LOWER(customer_name));');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_profiles_code_idx ON database_customer_profiles(LOWER(customer_code));');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_customer_contacts_source_contact_idx ON database_customer_contacts(source_contact_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_contacts_customer_idx ON database_customer_contacts(customer_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_contacts_profile_idx ON database_customer_contacts(profile_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_contacts_name_idx ON database_customer_contacts(LOWER(customer_name));');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_customer_addresses_source_address_idx ON database_customer_addresses(source_address_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_customer_addresses_customer_idx ON database_customer_addresses(customer_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_order_idx ON database_job_line_items(source_order_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_sort_idx ON database_job_line_items(source_order_id, line_sort_order);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_ralawise_variant_idx ON database_job_line_items(ralawise_catalog_variant_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_line_items_ralawise_sku_idx ON database_job_line_items(ralawise_sku);');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_products_source_product_idx ON database_products(source_product_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_style_code_idx ON database_products(style_code);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_colour_idx ON database_products(colour);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_size_idx ON database_products(size);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_active_idx ON database_products(is_product_active);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_catalog_source_idx ON database_products(catalog_source);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_supplier_sku_idx ON database_products(supplier_sku);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_ralawise_sku_idx ON database_products(ralawise_sku);');
  await db.query('CREATE INDEX IF NOT EXISTS database_products_ralawise_variant_idx ON database_products(ralawise_catalog_variant_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_ralawise_styles_manufacturer_idx ON database_ralawise_catalog_styles(manufacturer_style_code);');
  await db.query('CREATE INDEX IF NOT EXISTS database_ralawise_colours_style_idx ON database_ralawise_catalog_colours(style_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_ralawise_variants_style_idx ON database_ralawise_catalog_variants(style_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_ralawise_variants_colour_idx ON database_ralawise_catalog_variants(colour_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_ralawise_variants_status_idx ON database_ralawise_catalog_variants(sku_status);');
  await db.query('CREATE INDEX IF NOT EXISTS database_ralawise_images_style_idx ON database_ralawise_catalog_images(style_id);');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS database_job_positions_source_position_idx ON database_job_positions(source_order_position_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_positions_order_idx ON database_job_positions(source_order_id);');
  await db.query('CREATE INDEX IF NOT EXISTS database_job_positions_sort_idx ON database_job_positions(source_order_id, position_sort_order);');
  await db.query('ALTER TABLE database_import_runs ADD COLUMN IF NOT EXISTS address_count INTEGER NOT NULL DEFAULT 0;');
  await db.query('ALTER TABLE database_import_runs ADD COLUMN IF NOT EXISTS contact_count INTEGER NOT NULL DEFAULT 0;');
  await db.query('ALTER TABLE database_import_runs ADD COLUMN IF NOT EXISTS product_count INTEGER NOT NULL DEFAULT 0;');
  await db.query("ALTER TABLE database_import_runs ALTER COLUMN source_years SET DEFAULT 'all';");

  await createStockOrderingBasketTables(db);
  await ensureTestDashboardTables(db);
}

async function ensureTestDashboardTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS test_dashboard_groups (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      color TEXT,
      position NUMERIC,
      sort_order INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS test_dashboard_columns (
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      settings_str TEXT,
      is_subitem BOOLEAN NOT NULL DEFAULT FALSE,
      position INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, is_subitem)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS test_dashboard_job_state (
      source_order_id INTEGER PRIMARY KEY REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
      group_id TEXT REFERENCES test_dashboard_groups(id) ON DELETE SET NULL,
      item_name TEXT,
      column_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS test_dashboard_files (
      id SERIAL PRIMARY KEY,
      source_order_id INTEGER NOT NULL REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
      column_id TEXT NOT NULL,
      column_title TEXT NOT NULL,
      public_id TEXT NOT NULL,
      secure_url TEXT NOT NULL,
      resource_type TEXT,
      format TEXT,
      original_filename TEXT,
      bytes INTEGER,
      width INTEGER,
      height INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id INTEGER,
      created_by_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS test_dashboard_private_jobs (
      id TEXT PRIMARY KEY,
      group_id TEXT REFERENCES test_dashboard_groups(id) ON DELETE SET NULL,
      item_name TEXT NOT NULL DEFAULT '',
      column_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id INTEGER,
      created_by_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query('ALTER TABLE test_dashboard_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_columns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_columns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_job_state ADD COLUMN IF NOT EXISTS item_name TEXT;');
  await db.query("ALTER TABLE test_dashboard_job_state ADD COLUMN IF NOT EXISTS column_values JSONB NOT NULL DEFAULT '{}'::jsonb;");
  await db.query('ALTER TABLE test_dashboard_job_state ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;');
  await db.query('ALTER TABLE test_dashboard_job_state ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_job_state ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS resource_type TEXT;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS format TEXT;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS original_filename TEXT;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS bytes INTEGER;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS width INTEGER;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS height INTEGER;');
  await db.query("ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;");
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS created_by_name TEXT;');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES test_dashboard_groups(id) ON DELETE SET NULL;');
  await db.query("ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS item_name TEXT NOT NULL DEFAULT '';");
  await db.query("ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS column_values JSONB NOT NULL DEFAULT '{}'::jsonb;");
  await db.query('ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;');
  await db.query('ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;');
  await db.query('ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS created_by_name TEXT;');
  await db.query('ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();');
  await db.query('ALTER TABLE test_dashboard_private_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();');

  await db.query('CREATE INDEX IF NOT EXISTS test_dashboard_columns_position_idx ON test_dashboard_columns(is_subitem, position);');
  await db.query('CREATE INDEX IF NOT EXISTS test_dashboard_job_state_group_idx ON test_dashboard_job_state(group_id);');
  await db.query('CREATE INDEX IF NOT EXISTS test_dashboard_files_job_column_idx ON test_dashboard_files(source_order_id, column_id);');
  await db.query('CREATE INDEX IF NOT EXISTS test_dashboard_files_column_created_idx ON test_dashboard_files(column_id, created_at DESC, id DESC);');
  await db.query("CREATE INDEX IF NOT EXISTS test_dashboard_files_title_created_idx ON test_dashboard_files(UPPER(BTRIM(column_title)), created_at DESC, id DESC);");
  await db.query('DROP INDEX IF EXISTS test_dashboard_files_public_id_idx;');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS test_dashboard_files_job_public_id_idx ON test_dashboard_files(source_order_id, public_id);');
  await db.query('CREATE INDEX IF NOT EXISTS test_dashboard_private_jobs_group_idx ON test_dashboard_private_jobs(group_id);');
}

module.exports = { ensureDatabaseTables, ensureTestDashboardTables };
