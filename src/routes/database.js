const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { fullName } = require('../services/hubAuth');

router.get('/api/database/summary', async (_req, res) => {
  try {
    const [jobs, lineItems, positions, addresses, contacts, products, byYear, byType, latestRun] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM database_jobs'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_line_items'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_positions'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_customer_addresses'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_customer_contacts'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_products'),
      pool.query(`
        SELECT source_year, COUNT(*)::int AS count
        FROM database_jobs
        GROUP BY source_year
        ORDER BY source_year
      `),
      pool.query(`
        SELECT COALESCE(order_type, 'Unknown') AS order_type, COUNT(*)::int AS count
        FROM database_jobs
        GROUP BY COALESCE(order_type, 'Unknown')
        ORDER BY count DESC, order_type
      `),
      pool.query(`
        SELECT id, source_file, source_years, job_count, line_item_count,
               position_count, address_count, contact_count, product_count,
               started_at, finished_at, status, message
        FROM database_import_runs
        ORDER BY started_at DESC
        LIMIT 1
      `),
    ]);

    res.json({
      jobs: jobs.rows[0].count,
      lineItems: lineItems.rows[0].count,
      positions: positions.rows[0].count,
      customerAddresses: addresses.rows[0].count,
      customerContacts: contacts.rows[0].count,
      products: products.rows[0].count,
      byYear: byYear.rows,
      byType: byType.rows,
      latestRun: latestRun.rows[0] || null,
    });
  } catch (err) {
    console.error('GET /api/database/summary', err);
    res.status(500).json({ error: 'Failed to fetch database summary' });
  }
});

router.get('/api/database/jobs', async (req, res) => {
  const limit = clampInt(req.query.limit, 100, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const includeTotal = cleanQuery(req.query.includeTotal).toLowerCase() !== 'false';
  const { whereSql, params, orderSql } = buildJobFilters(req.query);

  try {
    const count = includeTotal
      ? await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM database_jobs j
         ${whereSql}`,
        params
      )
      : null;

    const listParams = [...params, limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const jobs = await pool.query(
      `WITH line_summary AS (
         SELECT source_order_id,
                COUNT(*)::int AS line_item_count,
                COALESCE(SUM(quantity), 0)::int AS total_quantity
         FROM database_job_line_items
         GROUP BY source_order_id
       ),
       position_summary AS (
         SELECT source_order_id, COUNT(*)::int AS position_count
         FROM database_job_positions
         GROUP BY source_order_id
       )
       SELECT j.source_order_id,
              j.order_no,
              j.source_year,
              j.order_type,
              j.order_type_abbr,
              j.customer_name,
              j.customer_code,
              j.contact_name,
              j.job_title,
              j.client_order_no,
              j.delivery_method,
              j.payment_terms,
              j.order_taken_by,
              j.order_owner_user_id,
              j.order_owner_name,
              j.delivery_address,
              j.invoice_address,
              j.is_manual_entry,
              j.order_date,
              j.delivery_date,
              j.complete_date,
              j.is_complete,
              j.customer_date_required,
              j.is_reorder,
              j.is_bagged,
              j.is_automatic,
              j.screen_numbers,
              j.has_artwork,
              j.has_screens,
              j.has_shirts,
              j.is_printed,
              j.customer_supplied,
              j.delivery_note_date,
              j.invoice_no,
              j.trace_staff_id,
              j.created_at_source,
              j.updated_at_source,
              j.invoice_required,
              j.invoice_printed,
              j.pf_invoice_printed,
              j.pf_invoice_date,
              j.dashboard_status,
              j.dashboard_status_updated_at,
              j.proof_approved,
              j.comments,
              COALESCE(ls.line_item_count, 0)::int AS line_item_count,
              COALESCE(ls.total_quantity, 0)::int AS total_quantity,
              COALESCE(ps.position_count, 0)::int AS position_count
       FROM database_jobs j
       LEFT JOIN line_summary ls ON ls.source_order_id = j.source_order_id
       LEFT JOIN position_summary ps ON ps.source_order_id = j.source_order_id
       ${whereSql}
       ${orderSql}
       LIMIT $${limitParam}
       OFFSET $${offsetParam}`,
      listParams
    );

    res.json({
      jobs: jobs.rows,
      total: includeTotal ? count.rows[0].total : null,
      limit,
      offset,
    });
  } catch (err) {
    console.error('GET /api/database/jobs', err);
    res.status(500).json({ error: 'Failed to fetch database jobs' });
  }
});

router.get('/api/database/outstanding-counts', async (_req, res) => {
  try {
    const result = await pool.query(`
      WITH categorized AS (
        SELECT CASE
          WHEN LOWER(COALESCE(order_type, '') || ' ' || COALESCE(order_type_abbr, '')) LIKE '%gift%'
            OR LOWER(COALESCE(order_type_abbr, '')) = 'g'
            THEN 'gifts'
          WHEN LOWER(COALESCE(order_type, '') || ' ' || COALESCE(order_type_abbr, '')) LIKE '%embro%'
            OR LOWER(COALESCE(order_type_abbr, '')) = 'e'
            THEN 'embroidery'
          WHEN LOWER(COALESCE(order_type, '') || ' ' || COALESCE(order_type_abbr, '')) LIKE '%print%'
            OR LOWER(COALESCE(order_type_abbr, '')) = 'p'
            THEN 'print'
          ELSE 'other'
        END AS category
        FROM database_jobs
        WHERE is_complete IS NOT TRUE
      )
      SELECT
        (COUNT(*) FILTER (WHERE category = 'print'))::int AS printing,
        (COUNT(*) FILTER (WHERE category = 'embroidery'))::int AS embroidery,
        (COUNT(*) FILTER (WHERE category = 'gifts'))::int AS business_gifts,
        (COUNT(*))::int AS total
      FROM categorized
    `);

    res.json(result.rows[0] || {
      printing: 0,
      embroidery: 0,
      business_gifts: 0,
      total: 0,
    });
  } catch (err) {
    console.error('GET /api/database/outstanding-counts', err);
    res.status(500).json({ error: 'Failed to fetch outstanding action counts' });
  }
});

router.get('/api/database/users', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id,
             email,
             first_name,
             last_name,
             CONCAT_WS(' ', NULLIF(TRIM(first_name), ''), NULLIF(TRIM(last_name), '')) AS full_name
      FROM hub_users
      ORDER BY LOWER(first_name), LOWER(last_name), LOWER(email)
    `);

    res.json({ users: result.rows });
  } catch (err) {
    console.error('GET /api/database/users', err);
    res.status(500).json({ error: 'Failed to fetch database users' });
  }
});

router.get('/api/database/customers', async (req, res) => {
  const search = cleanQuery(req.query.q);
  const params = [];
  let searchSql = '';

  if (search) {
    params.push(`%${search}%`);
    const ref = `$${params.length}`;
    searchSql = `AND (
      customer_name ILIKE ${ref}
      OR customer_code ILIKE ${ref}
      OR contact_name ILIKE ${ref}
      OR contact_email ILIKE ${ref}
      OR CAST(order_no AS TEXT) ILIKE ${ref}
      OR job_title ILIKE ${ref}
    )`;
  }

  const profileSearchSql = search
    ? `AND (
      customer_name ILIKE $1
      OR customer_code ILIKE $1
      OR contact_name ILIKE $1
      OR contact_email ILIKE $1
    )`
    : '';

  try {
    const result = await pool.query(
      `WITH customer_jobs AS (
         SELECT
           COALESCE(customer_id::text, LOWER(customer_name)) AS customer_key,
           customer_id,
           customer_name AS business_name,
           customer_code,
           contact_name,
           contact_email,
           source_order_id,
           order_no,
           job_title,
           order_date,
           delivery_date,
           COALESCE(order_date, updated_at_source, created_at_source) AS last_seen_at,
           (COUNT(*) OVER (PARTITION BY COALESCE(customer_id::text, LOWER(customer_name))))::int AS order_count,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(customer_id::text, LOWER(customer_name))
             ORDER BY COALESCE(order_date, updated_at_source, created_at_source) DESC NULLS LAST,
                      order_no DESC NULLS LAST
           ) AS customer_rank
         FROM database_jobs
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           ${searchSql}
       ),
       job_customers AS (
         SELECT
           CASE
             WHEN customer_id IS NOT NULL THEN customer_id::text
             ELSE 'name:' || business_name
           END AS customer_key,
           NULL::integer AS profile_id,
           customer_id,
           business_name,
           customer_code,
           contact_name,
           contact_email,
           source_order_id AS latest_source_order_id,
           order_no AS latest_order_no,
           job_title AS latest_job_title,
           order_date AS latest_order_date,
           delivery_date AS latest_delivery_date,
           last_seen_at,
           order_count
         FROM customer_jobs
         WHERE customer_rank = 1
       ),
       profile_customers AS (
         SELECT
           'profile:' || id AS customer_key,
           id AS profile_id,
           customer_id,
           customer_name AS business_name,
           customer_code,
           contact_name,
           contact_email,
           NULL::integer AS latest_source_order_id,
           NULL::integer AS latest_order_no,
           NULL::text AS latest_job_title,
           NULL::timestamp AS latest_order_date,
           NULL::timestamp AS latest_delivery_date,
           COALESCE(updated_at_source, created_at_source) AS last_seen_at,
           0::int AS order_count
         FROM database_customer_profiles
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM database_jobs existing_job
             WHERE existing_job.customer_name IS NOT NULL
               AND existing_job.customer_name <> ''
               AND (
                 (
                   database_customer_profiles.customer_id IS NOT NULL
                   AND existing_job.customer_id = database_customer_profiles.customer_id
                 )
                 OR LOWER(existing_job.customer_name) = LOWER(database_customer_profiles.customer_name)
               )
           )
           ${profileSearchSql}
       )
       SELECT *
       FROM (
         SELECT * FROM job_customers
         UNION ALL
         SELECT * FROM profile_customers
       ) combined
       ORDER BY LOWER(business_name) ASC, business_name ASC
       LIMIT 5000`,
      params
    );

    res.json({ customers: result.rows });
  } catch (err) {
    console.error('GET /api/database/customers', err);
    res.status(500).json({ error: 'Failed to fetch database customers' });
  }
});

router.get('/api/database/customers/search', async (req, res) => {
  const search = cleanQuery(req.query.q);
  if (!search) return res.json([]);

  try {
    const result = await pool.query(
      `WITH candidates AS (
         SELECT
           CASE
             WHEN customer_id IS NOT NULL THEN customer_id::text
             ELSE 'name:' || customer_name
           END AS customer_key,
           NULL::integer AS profile_id,
           customer_id,
           customer_name AS business_name,
           customer_code,
           contact_id,
           contact_name,
           contact_phone,
           contact_mobile,
           contact_email,
           contact_email AS email,
           delivery_address,
           invoice_address,
           source_order_id,
           order_no,
           COALESCE(order_date, updated_at_source, created_at_source) AS last_seen_at,
           CASE
             WHEN LOWER(customer_name) = LOWER($2) THEN 0
             WHEN customer_name ILIKE $3 THEN 1
             WHEN customer_code ILIKE $3 THEN 2
             WHEN contact_name ILIKE $3 THEN 3
             WHEN contact_email ILIKE $3 THEN 4
             ELSE 5
           END AS match_rank
         FROM database_jobs
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           AND (
             customer_name ILIKE $1
             OR customer_code ILIKE $1
             OR contact_name ILIKE $1
             OR contact_email ILIKE $1
           )
         UNION ALL
         SELECT
           'profile:' || id AS customer_key,
           id AS profile_id,
           customer_id,
           customer_name AS business_name,
           customer_code,
           NULL::integer AS contact_id,
           contact_name,
           contact_phone,
           contact_mobile,
           contact_email,
           contact_email AS email,
           delivery_address,
           invoice_address,
           NULL::integer AS source_order_id,
           NULL::integer AS order_no,
           COALESCE(updated_at_source, created_at_source) AS last_seen_at,
           CASE
             WHEN LOWER(customer_name) = LOWER($2) THEN 0
             WHEN customer_name ILIKE $3 THEN 1
             WHEN customer_code ILIKE $3 THEN 2
             WHEN contact_name ILIKE $3 THEN 3
             WHEN contact_email ILIKE $3 THEN 4
             ELSE 5
           END AS match_rank
         FROM database_customer_profiles
         WHERE customer_name IS NOT NULL
           AND customer_name <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM database_jobs existing_job
             WHERE existing_job.customer_name IS NOT NULL
               AND existing_job.customer_name <> ''
               AND (
                 (
                   database_customer_profiles.customer_id IS NOT NULL
                   AND existing_job.customer_id = database_customer_profiles.customer_id
                 )
                 OR LOWER(existing_job.customer_name) = LOWER(database_customer_profiles.customer_name)
               )
           )
           AND (
             customer_name ILIKE $1
             OR customer_code ILIKE $1
             OR contact_name ILIKE $1
             OR contact_email ILIKE $1
           )
       ),
       ranked AS (
         SELECT *,
                ROW_NUMBER() OVER (
                  PARTITION BY customer_key
                  ORDER BY match_rank ASC,
                           last_seen_at DESC NULLS LAST,
                           order_no DESC NULLS LAST
                ) AS customer_rank
         FROM candidates
       )
       SELECT customer_key,
              profile_id,
              customer_id,
              business_name,
              customer_code,
              contact_id,
              contact_name,
              contact_phone,
              contact_mobile,
              contact_email,
              email,
              delivery_address,
              invoice_address,
              source_order_id AS latest_source_order_id,
              order_no AS latest_order_no
       FROM ranked
       WHERE customer_rank = 1
       ORDER BY match_rank ASC,
                LOWER(business_name) ASC,
                latest_order_no DESC NULLS LAST
       LIMIT 20`,
      [`%${search}%`, search, `${search}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/database/customers/search', err);
    res.status(500).json({ error: 'Failed to search database customers' });
  }
});

router.get('/api/database/customers/:key', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  try {
    let profile = null;
    let where = customerKey.type === 'id'
      ? 'j.customer_id = $1'
      : 'LOWER(j.customer_name) = LOWER($1)';
    let params = [customerKey.value];

    if (customerKey.type === 'profile') {
      const profileResult = await pool.query(
        `SELECT *
         FROM database_customer_profiles
         WHERE id = $1
         LIMIT 1`,
        [customerKey.value]
      );

      if (!profileResult.rowCount) {
        return res.status(404).json({ error: 'Database customer not found' });
      }

      profile = profileResult.rows[0];
      params = [profile.customer_name];
      where = 'LOWER(j.customer_name) = LOWER($1)';

      if (isFiniteDatabaseValue(profile.customer_id)) {
        params = [profile.customer_id, profile.customer_name];
        where = '(j.customer_id = $1 OR LOWER(j.customer_name) = LOWER($2))';
      }
    }

    const result = await pool.query(
      `WITH line_summary AS (
         SELECT source_order_id,
                COUNT(*)::int AS line_item_count,
                COALESCE(SUM(quantity), 0)::int AS total_quantity
         FROM database_job_line_items
         GROUP BY source_order_id
       ),
       position_summary AS (
         SELECT source_order_id, COUNT(*)::int AS position_count
         FROM database_job_positions
         GROUP BY source_order_id
       )
       SELECT j.*,
              COALESCE(ls.line_item_count, 0)::int AS line_item_count,
              COALESCE(ls.total_quantity, 0)::int AS total_quantity,
              COALESCE(ps.position_count, 0)::int AS position_count
       FROM database_jobs j
       LEFT JOIN line_summary ls ON ls.source_order_id = j.source_order_id
       LEFT JOIN position_summary ps ON ps.source_order_id = j.source_order_id
       WHERE ${where}
       ORDER BY COALESCE(j.order_date, j.updated_at_source, j.created_at_source) DESC NULLS LAST,
                j.order_no DESC NULLS LAST`,
      params
    );

    const orders = result.rows;
    if (!orders.length && !profile) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const customerId = customerKey.type === 'id'
      ? customerKey.value
      : (isFiniteDatabaseValue(profile?.customer_id) ? Number(profile.customer_id) : firstFinite(orders, 'customer_id'));
    let addressRows = [];

    if (isFiniteDatabaseValue(customerId)) {
      const addresses = await pool.query(
        `SELECT *
         FROM database_customer_addresses
         WHERE customer_id = $1
         ORDER BY COALESCE(updated_at_source, created_at_source) DESC NULLS LAST,
                  source_address_id DESC`,
        [customerId]
      );
      addressRows = addresses.rows;
    }

    const [manualContactRows, designNumberRows] = await Promise.all([
      fetchManualCustomerContacts(customerKey, profile, orders),
      fetchCustomerDesignNumbers(orders),
    ]);

    res.json(buildCustomerDetail(customerKey, orders, addressRows, profile, manualContactRows, designNumberRows));
  } catch (err) {
    console.error('GET /api/database/customers/:key', err);
    res.status(500).json({ error: 'Failed to fetch database customer detail' });
  }
});

router.put('/api/database/customers/:key/account-manager', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  const userId = nullableInt(req.body?.user_id);
  let accountManager = cleanNullable(req.body?.account_manager);
  let accountManagerUserId = null;

  try {
    const resolved = await resolveAccountManager(userId, accountManager);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    accountManagerUserId = resolved.userId;
    accountManager = resolved.name;

    if (!accountManager) {
      return res.status(400).json({ error: 'Account manager is required' });
    }

    if (customerKey.type === 'profile') {
      const updated = await pool.query(
        `UPDATE database_customer_profiles
         SET account_manager_user_id = $2,
             account_manager_name = $3,
             updated_by_user_id = $4,
             updated_by_name = $5,
             updated_at_source = NOW(),
             imported_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          customerKey.value,
          accountManagerUserId,
          accountManager,
          req.hubUser?.id || null,
          req.hubUser ? fullName(req.hubUser) : accountManager,
        ]
      );

      if (!updated.rowCount) {
        return res.status(404).json({ error: 'Database customer not found' });
      }

      return res.json({ customer: customerProfileToCustomer(updated.rows[0]) });
    }

    const where = customerKey.type === 'id'
      ? 'customer_id = $1'
      : 'LOWER(customer_name) = LOWER($1)';

    const updated = await pool.query(
      `UPDATE database_jobs
       SET order_owner_user_id = $2,
           order_owner_name = $3,
           updated_at_source = NOW()
       WHERE ${where}
       RETURNING source_order_id, updated_at_source`,
      [customerKey.value, accountManagerUserId, accountManager]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    res.json({
      customer: {
        customer_key: customerKey.type === 'id' ? String(customerKey.value) : `name:${customerKey.value}`,
        account_manager: accountManager,
        account_manager_user_id: accountManagerUserId,
        updated_at_source: latestDate(updated.rows, 'updated_at_source'),
        updated_by: req.hubUser ? fullName(req.hubUser) : accountManager,
      },
    });
  } catch (err) {
    console.error('PUT /api/database/customers/:key/account-manager', err);
    res.status(500).json({ error: 'Failed to update customer account manager' });
  }
});

router.post('/api/database/customers', async (req, res) => {
  const payload = req.body || {};
  const customerName = cleanNullable(payload.customer_name);
  const customerCode = cleanNullable(payload.customer_code);
  const contactName = contactNameFromPayload(payload);
  const invoiceAddress = normalizedCustomerAddress(payload, 'invoice');
  const deliveryAddress = normalizedCustomerAddress(payload, 'delivery');
  const userId = nullableInt(payload.account_manager_user_id || payload.user_id);

  if (!customerName) {
    return res.status(400).json({ error: 'Customer is required' });
  }

  try {
    const managerFallback = cleanNullable(payload.account_manager) || (req.hubUser ? fullName(req.hubUser) : null);
    const resolvedManager = await resolveAccountManager(userId || req.hubUser?.id, managerFallback);
    if (resolvedManager.error) return res.status(400).json({ error: resolvedManager.error });

    const actorName = req.hubUser ? fullName(req.hubUser) : null;
    const result = await pool.query(
      `INSERT INTO database_customer_profiles (
         customer_name,
         customer_code,
         contact_name,
         contact_phone,
         contact_mobile,
         contact_email,
         marketing_opt_in,
         invoice_address,
         invoice_address_line1,
         invoice_address_line2,
         invoice_address_line3,
         invoice_address_line4,
         invoice_address_line5,
         invoice_postcode,
         delivery_address,
         delivery_address_line1,
         delivery_address_line2,
         delivery_address_line3,
         delivery_address_line4,
         delivery_address_line5,
         delivery_postcode,
         account_manager_user_id,
         account_manager_name,
         created_by_user_id,
         created_by_name,
         updated_by_user_id,
         updated_by_name,
         created_at_source,
         updated_at_source,
         imported_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22,
         $23, $24, $25, $26, $27, NOW(), NOW(), NOW()
       )
       RETURNING *`,
      [
        customerName,
        customerCode,
        contactName,
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        toBoolean(payload.marketing_opt_in),
        invoiceAddress.address,
        invoiceAddress.line1,
        invoiceAddress.line2,
        invoiceAddress.line3,
        invoiceAddress.line4,
        invoiceAddress.line5,
        invoiceAddress.postcode,
        deliveryAddress.address,
        deliveryAddress.line1,
        deliveryAddress.line2,
        deliveryAddress.line3,
        deliveryAddress.line4,
        deliveryAddress.line5,
        deliveryAddress.postcode,
        resolvedManager.userId,
        resolvedManager.name,
        req.hubUser?.id || null,
        actorName,
        req.hubUser?.id || null,
        actorName,
      ]
    );

    res.status(201).json({ customer: customerProfileToCustomer(result.rows[0]) });
  } catch (err) {
    console.error('POST /api/database/customers', err);
    res.status(500).json({ error: 'Failed to create database customer' });
  }
});

router.post('/api/database/customers/:key/contacts', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  if (!customerKey) {
    return res.status(400).json({ error: 'Invalid customer key' });
  }

  const payload = req.body || {};
  const sourceContactId = nullableInt(payload.source_contact_id);
  const contactTitle = cleanNullable(payload.contact_title);
  const contactFirstName = cleanNullable(payload.contact_first_name);
  const contactLastName = cleanNullable(payload.contact_last_name);
  const contactName = contactNameFromParts(contactTitle, contactFirstName, contactLastName);

  if (!contactHasAnyValue(payload)) {
    return res.status(400).json({ error: 'Contact details are required' });
  }

  try {
    const context = await resolveCustomerContactContext(customerKey);
    if (!context) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const actorName = req.hubUser ? fullName(req.hubUser) : null;
    const result = await pool.query(
      `INSERT INTO database_customer_contacts (
         source_contact_id,
         customer_id,
         profile_id,
         customer_name,
         contact_title,
         contact_first_name,
         contact_last_name,
         contact_name,
         contact_phone,
         contact_fax,
         contact_mobile,
         contact_email,
         contact_address,
         created_by_user_id,
         created_by_name,
         updated_by_user_id,
         updated_by_name,
         created_at_source,
         updated_at_source,
         imported_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15,
         $16, $17, NOW(), NOW(), NOW()
       )
       ON CONFLICT (source_contact_id) DO UPDATE
       SET customer_id = EXCLUDED.customer_id,
           profile_id = EXCLUDED.profile_id,
           customer_name = EXCLUDED.customer_name,
           contact_title = EXCLUDED.contact_title,
           contact_first_name = EXCLUDED.contact_first_name,
           contact_last_name = EXCLUDED.contact_last_name,
           contact_name = EXCLUDED.contact_name,
           contact_phone = EXCLUDED.contact_phone,
           contact_fax = EXCLUDED.contact_fax,
           contact_mobile = EXCLUDED.contact_mobile,
           contact_email = EXCLUDED.contact_email,
           contact_address = EXCLUDED.contact_address,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at_source = NOW(),
           imported_at = NOW()
       RETURNING *`,
      [
        sourceContactId,
        context.customer_id,
        context.profile_id,
        context.customer_name,
        contactTitle,
        contactFirstName,
        contactLastName,
        contactName,
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_fax),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        cleanNullable(payload.contact_address),
        req.hubUser?.id || null,
        actorName,
        req.hubUser?.id || null,
        actorName,
      ]
    );

    res.status(201).json({ contact: manualContactToContact(result.rows[0]) });
  } catch (err) {
    console.error('POST /api/database/customers/:key/contacts', err);
    res.status(500).json({ error: 'Failed to create database customer contact' });
  }
});

router.put('/api/database/customers/:key/contacts/:contactId', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  const contactRowId = nullableInt(req.params.contactId);
  if (!customerKey || !contactRowId) {
    return res.status(400).json({ error: 'Invalid contact key' });
  }

  const payload = req.body || {};
  if (!contactHasAnyValue(payload)) {
    return res.status(400).json({ error: 'Contact details are required' });
  }

  try {
    const context = await resolveCustomerContactContext(customerKey);
    if (!context) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const scope = contactScopeClause(context, 13);
    if (!scope.clause) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    const contactTitle = cleanNullable(payload.contact_title);
    const contactFirstName = cleanNullable(payload.contact_first_name);
    const contactLastName = cleanNullable(payload.contact_last_name);
    const actorName = req.hubUser ? fullName(req.hubUser) : null;
    const result = await pool.query(
      `UPDATE database_customer_contacts
       SET contact_title = $2,
           contact_first_name = $3,
           contact_last_name = $4,
           contact_name = $5,
           contact_phone = $6,
           contact_fax = $7,
           contact_mobile = $8,
           contact_email = $9,
           contact_address = $10,
           updated_by_user_id = $11,
           updated_by_name = $12,
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE id = $1
         AND (${scope.clause})
       RETURNING *`,
      [
        contactRowId,
        contactTitle,
        contactFirstName,
        contactLastName,
        contactNameFromParts(contactTitle, contactFirstName, contactLastName),
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_fax),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        cleanNullable(payload.contact_address),
        req.hubUser?.id || null,
        actorName,
        ...scope.params,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    res.json({ contact: manualContactToContact(result.rows[0]) });
  } catch (err) {
    console.error('PUT /api/database/customers/:key/contacts/:contactId', err);
    res.status(500).json({ error: 'Failed to update database customer contact' });
  }
});

router.delete('/api/database/customers/:key/contacts/:contactId', async (req, res) => {
  const customerKey = parseCustomerKey(req.params.key);
  const contactRowId = nullableInt(req.params.contactId);
  if (!customerKey || !contactRowId) {
    return res.status(400).json({ error: 'Invalid contact key' });
  }

  try {
    const context = await resolveCustomerContactContext(customerKey);
    if (!context) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const scope = contactScopeClause(context, 2);
    if (!scope.clause) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    const result = await pool.query(
      `DELETE FROM database_customer_contacts
       WHERE id = $1
         AND (${scope.clause})
       RETURNING id`,
      [contactRowId, ...scope.params]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database customer contact not found' });
    }

    res.json({ ok: true, contact_id: contactRowId });
  } catch (err) {
    console.error('DELETE /api/database/customers/:key/contacts/:contactId', err);
    res.status(500).json({ error: 'Failed to delete database customer contact' });
  }
});

router.post('/api/database/jobs', async (req, res) => {
  const payload = req.body || {};
  const customerName = cleanNullable(payload.customer_name);
  const contactName = cleanNullable(payload.contact_name);
  const customerId = nullableInt(payload.customer_id);
  const contactId = nullableInt(payload.contact_id);
  const orderType = cleanNullable(payload.order_type);
  const jobTitle = cleanNullable(payload.job_title);
  const orderDate = parseDatabaseDate(payload.order_date, 'Order date');
  const deliveryDate = parseDatabaseDate(payload.delivery_date, 'Delivery date');
  const orderOwnerName = req.hubUser ? fullName(req.hubUser) : cleanNullable(payload.order_taken_by);
  const orderTakenBy = orderOwnerName || cleanNullable(payload.order_taken_by);
  const invoiceRequired = invoiceRequiredValue(payload.invoice_required);

  if (!customerName || !orderType || !jobTitle || !orderDate || !deliveryDate || invoiceRequired === null) {
    return res.status(400).json({
      error: 'Customer, order type, job title, order date, delivery date, and invoice required are required',
    });
  }

  if (!orderDate.valid || !deliveryDate.valid) {
    return res.status(400).json({ error: orderDate.error || deliveryDate.error });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060216)');

    const next = await client.query(`
      SELECT
        (COALESCE(MAX(source_order_id), 0) + 1)::int AS source_order_id,
        (GREATEST(COALESCE(MAX(order_no), 50000), 50000) + 1)::int AS order_no,
        CASE
          WHEN $1::boolean THEN (GREATEST(COALESCE(MAX(invoice_no), 50000), 50000) + 1)::int
          ELSE NULL::int
        END AS invoice_no
      FROM database_jobs
    `, [invoiceRequired]);

    const sourceOrderId = next.rows[0].source_order_id;
    const orderNo = next.rows[0].order_no;
    const invoiceNo = next.rows[0].invoice_no;
    const orderTypeAbbr = orderTypeAbbreviation(orderType);

    const inserted = await client.query(
      `INSERT INTO database_jobs (
         source_order_id,
         order_no,
         source_year,
         order_type,
         order_type_abbr,
         customer_id,
         customer_name,
         customer_code,
         contact_id,
         contact_name,
         contact_phone,
         contact_mobile,
         contact_email,
         job_title,
         client_order_no,
         delivery_method,
         payment_terms,
         order_taken_by,
         order_owner_user_id,
         order_owner_name,
         delivery_address,
         invoice_address,
         order_date,
         delivery_date,
         customer_date_required,
         invoice_no,
         invoice_required,
         dashboard_status,
         dashboard_status_updated_at,
         is_complete,
         is_manual_entry,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
         $25, $26, $27,
         'PRE-PRODUCTION', NOW(),
         FALSE, TRUE, NOW(), NOW()
       )
       RETURNING *`,
      [
        sourceOrderId,
        orderNo,
        orderDate.year,
        orderType,
        orderTypeAbbr,
        customerId,
        customerName,
        cleanNullable(payload.customer_code),
        contactId,
        contactName,
        cleanNullable(payload.contact_phone),
        cleanNullable(payload.contact_mobile),
        cleanNullable(payload.contact_email),
        jobTitle,
        cleanNullable(payload.client_order_no),
        cleanNullable(payload.delivery_method),
        cleanNullable(payload.payment_terms),
        orderTakenBy,
        req.hubUser?.id || null,
        orderOwnerName,
        cleanNullable(payload.delivery_address),
        cleanNullable(payload.invoice_address),
        orderDate.iso,
        deliveryDate.iso,
        toBoolean(payload.customer_date_required),
        invoiceNo,
        invoiceRequired,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ job: inserted.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/jobs', err);
    res.status(500).json({ error: 'Failed to create database job' });
  } finally {
    client.release();
  }
});

router.put('/api/database/jobs/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const payload = req.body || {};
  const hasJobTitle = Object.prototype.hasOwnProperty.call(payload, 'job_title');
  const hasIsComplete = Object.prototype.hasOwnProperty.call(payload, 'is_complete');

  if (!hasJobTitle && !hasIsComplete) {
    return res.status(400).json({ error: 'No supported job fields supplied' });
  }

  const values = [id];
  const updates = [];
  if (hasJobTitle) {
    values.push(cleanNullable(payload.job_title));
    updates.push(`job_title = $${values.length}`);
  }
  if (hasIsComplete) {
    values.push(toBoolean(payload.is_complete));
    updates.push(`is_complete = $${values.length}`);
  }

  try {
    const result = await pool.query(
      `UPDATE database_jobs
       SET ${updates.join(', ')},
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE source_order_id = $1 OR order_no = $1
       RETURNING *`,
      values
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Database job not found' });
    }

    res.json({ job: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/database/jobs/:id', err);
    res.status(500).json({ error: 'Failed to save database job' });
  }
});

router.put('/api/database/jobs/:id/positions', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const positions = normalizePositionPayload(req.body?.positions);
  if (positions.length > 50) {
    return res.status(400).json({ error: 'Too many design position rows' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060217)');

    const job = await client.query(
      `SELECT source_order_id
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (!job.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.rows[0].source_order_id;
    const existingIds = positions
      .map((position) => position.source_order_position_id)
      .filter((positionId) => Number.isFinite(positionId));

    await client.query(
      `DELETE FROM database_job_positions
       WHERE source_order_id = $1
         AND NOT (source_order_position_id = ANY($2::int[]))`,
      [sourceOrderId, existingIds]
    );

    let nextSourcePositionId = null;
    if (positions.some((position) => !Number.isFinite(position.source_order_position_id))) {
      const next = await client.query(`
        SELECT (COALESCE(MAX(source_order_position_id), 0) + 1)::int AS next_id
        FROM database_job_positions
      `);
      nextSourcePositionId = next.rows[0].next_id;
    }

    for (const [index, position] of positions.entries()) {
      const positionSortOrder = index + 1;
      if (Number.isFinite(position.source_order_position_id)) {
        await client.query(
          `UPDATE database_job_positions
           SET position_sort_order = $3,
               position_name = $4,
               colour_notes = $5,
               design_ref = $6,
               updated_at_source = NOW(),
               imported_at = NOW()
           WHERE source_order_id = $1
             AND source_order_position_id = $2`,
          [
            sourceOrderId,
            position.source_order_position_id,
            positionSortOrder,
            position.position_name,
            position.colour_notes,
            position.design_ref,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO database_job_positions (
             source_order_position_id,
             source_order_id,
             position_sort_order,
             position_name,
             colour_notes,
             design_ref,
             created_at_source,
             updated_at_source
           ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            nextSourcePositionId,
            sourceOrderId,
            positionSortOrder,
            position.position_name,
            position.colour_notes,
            position.design_ref,
          ]
        );
        nextSourcePositionId += 1;
      }
    }

    const saved = await client.query(
      `SELECT *
       FROM database_job_positions
       WHERE source_order_id = $1
       ORDER BY COALESCE(position_sort_order, source_order_position_id), source_order_position_id`,
      [sourceOrderId]
    );

    await client.query('COMMIT');
    res.json({ positions: saved.rows });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/database/jobs/:id/positions', err);
    res.status(500).json({ error: 'Failed to save design positions' });
  } finally {
    client.release();
  }
});

router.get('/api/database/products/search', async (req, res) => {
  const search = cleanQuery(req.query.q);
  const field = cleanQuery(req.query.field).toLowerCase() === 'code' ? 'code' : 'style';
  const params = [];
  let whereSql = 'WHERE style_id IS NOT NULL';
  let rankSql = '2';

  if (search) {
    params.push(`%${search}%`, search, `${search}%`);
    if (field === 'code') {
      whereSql += `
        AND (
          style_code ILIKE $1
          OR alt_style_code ILIKE $1
        )`;
      rankSql = `
        CASE
          WHEN LOWER(COALESCE(style_code, '')) = LOWER($2) THEN 0
          WHEN LOWER(COALESCE(alt_style_code, '')) = LOWER($2) THEN 0
          WHEN style_code ILIKE $3 THEN 1
          WHEN alt_style_code ILIKE $3 THEN 1
          ELSE 2
        END`;
    } else {
      whereSql += `
        AND (
          style_name ILIKE $1
          OR style_code ILIKE $1
          OR alt_style_code ILIKE $1
        )`;
      rankSql = `
        CASE
          WHEN LOWER(COALESCE(style_name, '')) = LOWER($2) THEN 0
          WHEN style_name ILIKE $3 THEN 1
          WHEN style_code ILIKE $3 THEN 2
          WHEN alt_style_code ILIKE $3 THEN 3
          ELSE 4
        END`;
    }
  }

  try {
    const result = await pool.query(
      `WITH candidates AS (
         SELECT *,
                ${rankSql} AS match_rank
         FROM database_products
         ${whereSql}
       )
       SELECT style_id,
              MIN(source_product_id)::int AS sample_product_id,
              MIN(style_code) AS style_code,
              MIN(alt_style_code) AS alt_style_code,
              MIN(style_name) AS style_name,
              MIN(product_type) AS product_type,
              MIN(supplier_name) AS supplier_name,
              COUNT(*)::int AS variant_count,
              COUNT(DISTINCT colour)::int AS colour_count,
              COUNT(DISTINCT size)::int AS size_count,
              MIN(match_rank)::int AS match_rank
       FROM candidates
       GROUP BY style_id
       ORDER BY MIN(match_rank) ASC,
                LOWER(MIN(style_name)) ASC NULLS LAST,
                LOWER(MIN(style_code)) ASC NULLS LAST
       LIMIT 20`,
      params
    );

    res.json({ products: result.rows });
  } catch (err) {
    console.error('GET /api/database/products/search', err);
    res.status(500).json({ error: 'Failed to search database products' });
  }
});

router.get('/api/database/products/styles/:styleId/variants', async (req, res) => {
  const styleId = Number.parseInt(req.params.styleId, 10);
  if (!Number.isFinite(styleId)) {
    return res.status(400).json({ error: 'Invalid style id' });
  }

  try {
    const result = await pool.query(
      `SELECT *
       FROM database_products
       WHERE style_id = $1
       ORDER BY LOWER(COALESCE(colour, '')) ASC,
                colour_id ASC NULLS LAST,
                size_id ASC NULLS LAST,
                LOWER(COALESCE(size, '')) ASC,
                source_product_id ASC`,
      [styleId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product style not found' });
    }

    res.json({ products: result.rows });
  } catch (err) {
    console.error('GET /api/database/products/styles/:styleId/variants', err);
    res.status(500).json({ error: 'Failed to fetch product variants' });
  }
});

router.post('/api/database/jobs/:id/line-items', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const productId = nullableInt(req.body?.source_product_id);
  if (!productId) {
    return res.status(400).json({ error: 'Product is required' });
  }

  const quantity = nullableInt(req.body?.quantity) || 1;
  if (quantity < 1 || quantity > 100000) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 100000' });
  }

  const unitPrice = nullableNumber(req.body?.unit_price);
  const vatRate = nullableNumber(req.body?.vat_rate);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060218)');

    const job = await client.query(
      `SELECT source_order_id
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (!job.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const product = await client.query(
      `SELECT *
       FROM database_products
       WHERE source_product_id = $1
       LIMIT 1`,
      [productId]
    );

    if (!product.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found in referenced product table' });
    }

    const next = await client.query(`
      SELECT (COALESCE(MAX(source_order_item_id), 0) + 1)::int AS next_id
      FROM database_job_line_items
    `);

    const productRow = product.rows[0];
    const sourceOrderId = job.rows[0].source_order_id;
    const sourceOrderItemId = next.rows[0].next_id;
    const nextSort = await client.query(
      `SELECT (COALESCE(MAX(line_sort_order), COUNT(*)) + 1)::int AS next_sort_order
       FROM database_job_line_items
       WHERE source_order_id = $1`,
      [sourceOrderId]
    );

    await client.query(
      `INSERT INTO database_job_line_items (
         source_order_item_id,
         source_order_id,
         line_sort_order,
         source_product_id,
         line_description,
         quantity,
         unit_price,
         unit_cost,
         vat_rate,
         is_non_deliverable,
         is_internal,
         supplier_name,
         style_id,
         style_code,
         alt_style_code,
         style_name,
         colour,
         size,
         product_type,
         stock,
         is_product_active,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         FALSE, FALSE, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, NOW(), NOW()
       )`,
      [
        sourceOrderItemId,
        sourceOrderId,
        nextSort.rows[0].next_sort_order,
        productRow.source_product_id,
        productRow.style_name,
        quantity,
        unitPrice,
        productRow.unit_cost,
        vatRate,
        productRow.supplier_name,
        productRow.style_id,
        productRow.style_code,
        productRow.alt_style_code,
        productRow.style_name,
        productRow.colour,
        productRow.size,
        productRow.product_type,
        productRow.stock,
        productRow.is_product_active,
      ]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.status(201).json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/jobs/:id/line-items', err);
    res.status(500).json({ error: 'Failed to add database line item' });
  } finally {
    client.release();
  }
});

router.post('/api/database/jobs/:id/line-items/custom', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const lineType = normalizeCustomLineType(req.body?.line_type);
  if (!lineType) {
    return res.status(400).json({ error: 'Line type must be nonstock, nondelivery, or internal' });
  }

  const description = cleanNullable(req.body?.line_description);
  if (!description) {
    return res.status(400).json({ error: 'Line description is required' });
  }

  const quantity = nullableInt(req.body?.quantity) || 1;
  if (quantity < 1 || quantity > 100000) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 100000' });
  }

  const flags = customLineFlags(lineType);
  const unitCost = nullableNumber(req.body?.unit_cost);
  const unitPrice = nullableNumber(req.body?.unit_price);
  const vatRate = normalizeVatRate(req.body?.vat_rate);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060220)');

    const job = await client.query(
      `SELECT source_order_id
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (!job.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const next = await client.query(`
      SELECT (COALESCE(MAX(source_order_item_id), 0) + 1)::int AS next_id
      FROM database_job_line_items
    `);

    const sourceOrderId = job.rows[0].source_order_id;
    const sourceOrderItemId = next.rows[0].next_id;
    const nextSort = await client.query(
      `SELECT (COALESCE(MAX(line_sort_order), COUNT(*)) + 1)::int AS next_sort_order
       FROM database_job_line_items
       WHERE source_order_id = $1`,
      [sourceOrderId]
    );

    await client.query(
      `INSERT INTO database_job_line_items (
         source_order_item_id,
         source_order_id,
         line_sort_order,
         line_description,
         quantity,
         unit_price,
         unit_cost,
         vat_rate,
         is_non_deliverable,
         is_internal,
         supplier_name,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
       )`,
      [
        sourceOrderItemId,
        sourceOrderId,
        nextSort.rows[0].next_sort_order,
        description,
        quantity,
        unitPrice,
        unitCost,
        vatRate,
        flags.isNonDeliverable,
        flags.isInternal,
        cleanNullable(req.body?.supplier_name),
      ]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.status(201).json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/database/jobs/:id/line-items/custom', err);
    res.status(500).json({ error: 'Failed to add custom database line item' });
  } finally {
    client.release();
  }
});

router.put('/api/database/jobs/:id/line-items/order', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const orderedLineIds = normalizeLineOrderPayload(req.body?.line_item_ids);
  if (!orderedLineIds.length) {
    return res.status(400).json({ error: 'Line item order is required' });
  }

  if (orderedLineIds.length > 500) {
    return res.status(400).json({ error: 'Too many line items to reorder' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060219)');

    const job = await client.query(
      `SELECT source_order_id
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (!job.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.rows[0].source_order_id;
    const existing = await client.query(
      `SELECT source_order_item_id
       FROM database_job_line_items
       WHERE source_order_id = $1
         AND source_order_item_id = ANY($2::int[])`,
      [sourceOrderId, orderedLineIds]
    );

    if (existing.rowCount !== orderedLineIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Line item order contains rows outside this order' });
    }

    const values = [];
    const rowPlaceholders = orderedLineIds.map((lineId, index) => {
      values.push(lineId, index + 1);
      return `($${index * 2 + 1}::int, $${index * 2 + 2}::int)`;
    });

    await client.query(
      `UPDATE database_job_line_items AS line_items
       SET line_sort_order = updates.line_sort_order,
           updated_at_source = NOW(),
           imported_at = NOW()
       FROM (VALUES ${rowPlaceholders.join(', ')}) AS updates(source_order_item_id, line_sort_order)
       WHERE line_items.source_order_id = $${values.length + 1}
         AND line_items.source_order_item_id = updates.source_order_item_id`,
      [...values, sourceOrderId]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/database/jobs/:id/line-items/order', err);
    res.status(500).json({ error: 'Failed to save line item order' });
  } finally {
    client.release();
  }
});

router.put('/api/database/jobs/:id/line-items/:lineItemId', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const lineItemId = Number.parseInt(req.params.lineItemId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(lineItemId)) {
    return res.status(400).json({ error: 'Invalid job or line item id' });
  }

  const update = buildLineItemUpdate(req.body || {});
  if (update.error) {
    return res.status(400).json({ error: update.error });
  }
  if (!update.assignments.length) {
    return res.status(400).json({ error: 'No editable line item fields supplied' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060221)');

    const job = await client.query(
      `SELECT source_order_id
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (!job.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.rows[0].source_order_id;
    const existing = await client.query(
      `SELECT source_order_item_id
       FROM database_job_line_items
       WHERE source_order_id = $1
         AND source_order_item_id = $2
       FOR UPDATE`,
      [sourceOrderId, lineItemId]
    );

    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Line item not found for this order' });
    }

    const sourceOrderIndex = update.values.length + 1;
    const lineItemIndex = update.values.length + 2;
    await client.query(
      `UPDATE database_job_line_items
       SET ${update.assignments.join(', ')},
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE source_order_id = $${sourceOrderIndex}
         AND source_order_item_id = $${lineItemIndex}`,
      [...update.values, sourceOrderId, lineItemId]
    );

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/database/jobs/:id/line-items/:lineItemId', err);
    res.status(500).json({ error: 'Failed to save database line item' });
  } finally {
    client.release();
  }
});

router.delete('/api/database/jobs/:id/line-items/:lineItemId', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const lineItemId = Number.parseInt(req.params.lineItemId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(lineItemId)) {
    return res.status(400).json({ error: 'Invalid job or line item id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060222)');

    const job = await client.query(
      `SELECT source_order_id
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (!job.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Database job not found' });
    }

    const sourceOrderId = job.rows[0].source_order_id;
    const deleted = await client.query(
      `DELETE FROM database_job_line_items
       WHERE source_order_id = $1
         AND source_order_item_id = $2
       RETURNING source_order_item_id`,
      [sourceOrderId, lineItemId]
    );

    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Line item not found for this order' });
    }

    const lineItems = await fetchLineItems(client, sourceOrderId);

    await client.query('COMMIT');
    res.json({ lineItems });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DELETE /api/database/jobs/:id/line-items/:lineItemId', err);
    res.status(500).json({ error: 'Failed to delete database line item' });
  } finally {
    client.release();
  }
});

router.get('/api/database/jobs/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  try {
    const job = await pool.query(
      `SELECT *
       FROM database_jobs
       WHERE source_order_id = $1 OR order_no = $1
       ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [id]
    );

    if (!job.rowCount) return res.status(404).json({ error: 'Database job not found' });

    const sourceOrderId = job.rows[0].source_order_id;
    const [lineItems, positions] = await Promise.all([
      fetchLineItems(pool, sourceOrderId),
      pool.query(
        `SELECT *
         FROM database_job_positions
         WHERE source_order_id = $1
         ORDER BY COALESCE(position_sort_order, source_order_position_id), source_order_position_id`,
        [sourceOrderId]
      ),
    ]);

    res.json({
      job: job.rows[0],
      lineItems,
      positions: positions.rows,
    });
  } catch (err) {
    console.error('GET /api/database/jobs/:id', err);
    res.status(500).json({ error: 'Failed to fetch database job detail' });
  }
});

function buildJobFilters(query) {
  const params = [];
  const where = [];

  const search = cleanQuery(query.q);
  if (search) {
    params.push(`%${search}%`);
    const ref = `$${params.length}`;
    where.push(`(
      j.customer_name ILIKE ${ref}
      OR j.job_title ILIKE ${ref}
      OR j.contact_name ILIKE ${ref}
      OR j.contact_email ILIKE ${ref}
      OR j.client_order_no ILIKE ${ref}
      OR CAST(j.order_no AS TEXT) ILIKE ${ref}
      OR EXISTS (
        SELECT 1
        FROM database_job_line_items li_search
        WHERE li_search.source_order_id = j.source_order_id
          AND (
            li_search.line_description ILIKE ${ref}
            OR li_search.style_code ILIKE ${ref}
            OR li_search.alt_style_code ILIKE ${ref}
            OR li_search.style_name ILIKE ${ref}
            OR li_search.colour ILIKE ${ref}
            OR li_search.size ILIKE ${ref}
          )
      )
    )`);
  }

  const customer = cleanQuery(query.customer);
  if (customer) {
    params.push(`%${customer}%`);
    where.push(`j.customer_name ILIKE $${params.length}`);
  }

  const type = cleanQuery(query.type);
  if (type) {
    params.push(type);
    where.push(`j.order_type ILIKE $${params.length}`);
  }

  const year = Number.parseInt(query.year, 10);
  if (Number.isFinite(year)) {
    params.push(year);
    where.push(`j.source_year = $${params.length}`);
  }

  const status = cleanQuery(query.status).toLowerCase();
  let orderSql = `ORDER BY COALESCE(j.order_date, j.created_at_source) DESC NULLS LAST,
                         j.order_no DESC`;
  if (status === 'open') {
    where.push('j.is_complete IS NOT TRUE');
  } else if (status === 'complete' || status === 'completed') {
    where.push('j.is_complete IS TRUE');
  } else if (status === 'to-invoice') {
    where.push(`COALESCE(UPPER(TRIM(j.dashboard_status)), '') = 'COMPLETED'`);
    where.push('j.is_complete IS NOT TRUE');
    where.push('j.invoice_required IS NOT FALSE');
    where.push('j.invoice_printed IS NOT TRUE');
    where.push('j.pf_invoice_printed IS NOT TRUE');
    orderSql = `ORDER BY COALESCE(j.dashboard_status_updated_at, j.updated_at_source, j.order_date) DESC NULLS LAST,
                         j.order_no DESC`;
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    orderSql,
  };
}

function cleanQuery(value) {
  return String(value || '').trim();
}

function cleanNullable(value) {
  const clean = cleanQuery(value);
  return clean || null;
}

function normalizePositionPayload(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((position) => ({
      source_order_position_id: nullableInt(position?.source_order_position_id),
      position_name: cleanNullable(position?.position_name),
      colour_notes: cleanNullable(position?.colour_notes),
      design_ref: cleanNullable(position?.design_ref),
    }))
    .filter((position) => position.position_name || position.colour_notes || position.design_ref);
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function nullableInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLineOrderPayload(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];

  for (const item of value) {
    const id = nullableInt(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function buildLineItemUpdate(payload) {
  const assignments = [];
  const values = [];
  const addField = (column, value) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (hasOwn(payload, 'style_name')) {
    const styleName = cleanNullable(payload.style_name);
    addField('style_name', styleName);
    if (!hasOwn(payload, 'line_description')) addField('line_description', styleName);
  }

  const textFields = ['style_code', 'alt_style_code', 'colour', 'size', 'line_description'];
  for (const field of textFields) {
    if (hasOwn(payload, field)) addField(field, cleanNullable(payload[field]));
  }

  for (const field of ['unit_cost', 'unit_price']) {
    if (hasOwn(payload, field)) addField(field, nullableNumber(payload[field]));
  }

  if (hasOwn(payload, 'quantity')) {
    const quantity = nullableInt(payload.quantity);
    if (!quantity || quantity < 1 || quantity > 100000) {
      return { error: 'Quantity must be between 1 and 100000', assignments: [], values: [] };
    }
    addField('quantity', quantity);
  }

  if (hasOwn(payload, 'vat_rate')) {
    addField('vat_rate', normalizeVatRate(payload.vat_rate));
  }

  return { assignments, values };
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVatRate(value) {
  const parsed = nullableNumber(value);
  if (parsed === null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeCustomLineType(value) {
  const clean = cleanQuery(value).toLowerCase();
  if (clean === 'nonstock' || clean === 'non-stock') return 'nonstock';
  if (clean === 'nondelivery' || clean === 'non-delivery' || clean === 'non-deliverable') return 'nondelivery';
  if (clean === 'internal') return 'internal';
  return '';
}

function customLineFlags(lineType) {
  return {
    isNonDeliverable: lineType === 'nondelivery',
    isInternal: lineType === 'internal',
  };
}

async function fetchLineItems(db, sourceOrderId) {
  const result = await db.query(
    `SELECT *
     FROM database_job_line_items
     WHERE source_order_id = $1
     ORDER BY COALESCE(line_sort_order, source_order_item_id), source_order_item_id`,
    [sourceOrderId]
  );
  return result.rows;
}

function parseDatabaseDate(value, label) {
  const clean = cleanQuery(value);
  if (!clean) return null;

  let year;
  let month;
  let day;

  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    year = Number.parseInt(iso[1], 10);
    month = Number.parseInt(iso[2], 10);
    day = Number.parseInt(iso[3], 10);
  } else {
    const legacy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!legacy) {
      return { valid: false, error: `${label} must be DD/MM/YY or YYYY-MM-DD` };
    }
    day = Number.parseInt(legacy[1], 10);
    month = Number.parseInt(legacy[2], 10);
    year = Number.parseInt(legacy[3], 10);
    if (year < 100) year += 2000;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { valid: false, error: `${label} is not a valid date` };
  }

  return {
    valid: true,
    year,
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function orderTypeAbbreviation(orderType) {
  const normalized = cleanQuery(orderType).toLowerCase();
  const isPrint = normalized.includes('print');
  const isEmbroidery = normalized.includes('embro') || /\bemb\b/.test(normalized);
  if (isPrint && isEmbroidery) return 'PE';
  if (normalized.includes('embro')) return 'E';
  if (normalized.includes('gift')) return 'G';
  if (normalized.includes('print')) return 'P';
  return normalized.slice(0, 1).toUpperCase() || null;
}

function invoiceRequiredValue(value) {
  const clean = cleanQuery(value).toLowerCase();
  if (!clean) return null;
  if (clean === 'yes' || clean === 'true' || clean === '1') return true;
  if (clean === 'no' || clean === 'false' || clean === '0') return false;
  return null;
}

function parseCustomerKey(value) {
  const clean = cleanQuery(value);
  if (!clean) return null;

  if (clean.toLowerCase().startsWith('profile:')) {
    const id = Number.parseInt(clean.slice(8).trim(), 10);
    return Number.isFinite(id) ? { type: 'profile', value: id } : null;
  }

  if (clean.toLowerCase().startsWith('name:')) {
    const name = clean.slice(5).trim();
    return name ? { type: 'name', value: name } : null;
  }

  if (/^\d+$/.test(clean)) {
    return { type: 'id', value: Number.parseInt(clean, 10) };
  }

  return { type: 'name', value: clean };
}

function buildCustomerDetail(customerKey, orders, addressRows = [], profile = null, manualContactRows = [], designNumberRows = []) {
  const latest = orders[0] || {};
  const businessName = cleanNullable(profile?.customer_name) || firstNonEmpty(orders, 'customer_name');
  const customerId = isFiniteDatabaseValue(profile?.customer_id) ? Number(profile.customer_id) : firstFinite(orders, 'customer_id');
  const accountManager = customerAccountManagerFromProfile(profile) || customerAccountManagerFromOrders(orders);

  return {
    customer: {
      customer_key: profile ? `profile:${profile.id}` : (customerKey.type === 'id' ? String(customerKey.value) : `name:${businessName || customerKey.value}`),
      profile_id: profile?.id || null,
      customer_id: customerId,
      business_name: businessName,
      customer_code: cleanNullable(profile?.customer_code) || firstNonEmpty(orders, 'customer_code'),
      contact_name: cleanNullable(profile?.contact_name) || firstNonEmpty(orders, 'contact_name'),
      contact_phone: cleanNullable(profile?.contact_phone) || firstNonEmpty(orders, 'contact_phone'),
      contact_mobile: cleanNullable(profile?.contact_mobile) || firstNonEmpty(orders, 'contact_mobile'),
      contact_email: cleanNullable(profile?.contact_email) || firstNonEmpty(orders, 'contact_email'),
      marketing_opt_in: Boolean(profile?.marketing_opt_in),
      account_manager: accountManager.name,
      account_manager_user_id: accountManager.user_id,
      created_at_source: profile?.created_at_source || earliestDate(orders, 'created_at_source'),
      updated_at_source: profile?.updated_at_source || latestDate(orders, 'updated_at_source'),
      updated_by: profile?.updated_by_name || latest.order_taken_by || latest.trace_staff_id || null,
      latest_source_order_id: latest.source_order_id || null,
      latest_order_no: latest.order_no || null,
      order_count: orders.length,
    },
    orders,
    contacts: groupedContacts(orders, profile, manualContactRows),
    addresses: groupedAddresses(orders, addressRows, profile),
    designNumbers: designNumberRows,
  };
}

function customerAccountManagerFromProfile(profile) {
  if (!profile || !cleanQuery(profile.account_manager_name)) return null;
  return {
    name: profile.account_manager_name,
    user_id: isFiniteDatabaseValue(profile.account_manager_user_id) ? Number(profile.account_manager_user_id) : null,
  };
}

function customerAccountManagerFromOrders(orders) {
  const chronological = orders.slice().sort((a, b) => {
    const byCreated = dateTime(a.created_at_source || a.order_date) - dateTime(b.created_at_source || b.order_date);
    if (byCreated) return byCreated;
    return Number(a.order_no || 0) - Number(b.order_no || 0);
  });

  const owner = chronological.find((order) => cleanQuery(order.order_owner_name));
  if (owner) {
    return {
      name: owner.order_owner_name,
      user_id: isFiniteDatabaseValue(owner.order_owner_user_id) ? Number(owner.order_owner_user_id) : null,
    };
  }

  const takenBy = chronological.find((order) => cleanQuery(order.order_taken_by));
  if (takenBy) return { name: takenBy.order_taken_by, user_id: null };

  const legacyStaff = chronological.find((order) => cleanQuery(order.trace_staff_id));
  if (legacyStaff) return { name: String(legacyStaff.trace_staff_id), user_id: null };

  return { name: null, user_id: null };
}

async function fetchManualCustomerContacts(customerKey, profile, orders) {
  const clauses = [];
  const params = [];

  if (isFiniteDatabaseValue(profile?.id)) {
    params.push(Number(profile.id));
    clauses.push(`profile_id = $${params.length}`);
  }

  const customerId = isFiniteDatabaseValue(profile?.customer_id)
    ? Number(profile.customer_id)
    : firstFinite(orders, 'customer_id');
  if (isFiniteDatabaseValue(customerId)) {
    params.push(Number(customerId));
    clauses.push(`customer_id = $${params.length}`);
  }

  const customerName = cleanNullable(profile?.customer_name)
    || firstNonEmpty(orders, 'customer_name')
    || (customerKey.type === 'name' ? customerKey.value : null);
  if (customerName) {
    params.push(customerName);
    clauses.push(`LOWER(customer_name) = LOWER($${params.length})`);
  }

  if (!clauses.length) return [];

  const result = await pool.query(
    `SELECT *
     FROM database_customer_contacts
     WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}
     ORDER BY COALESCE(updated_at_source, created_at_source) DESC NULLS LAST,
              id DESC`,
    params
  );

  return result.rows;
}

async function fetchCustomerDesignNumbers(orders) {
  const sourceOrderIds = (orders || [])
    .map((order) => Number.parseInt(order.source_order_id, 10))
    .filter((orderId) => Number.isFinite(orderId));

  if (!sourceOrderIds.length) return [];

  const [designResult, referenceResult] = await Promise.all([
    pool.query(
      `SELECT design_ref,
              source_order_id,
              order_no,
              order_date,
              job_title
       FROM (
         SELECT DISTINCT ON (LOWER(BTRIM(p.design_ref)), j.source_order_id)
                BTRIM(p.design_ref) AS design_ref,
                j.source_order_id,
                j.order_no,
                j.order_date,
                j.job_title
         FROM database_job_positions p
         JOIN database_jobs j ON j.source_order_id = p.source_order_id
         WHERE p.source_order_id = ANY($1::int[])
           AND NULLIF(BTRIM(p.design_ref), '') IS NOT NULL
         ORDER BY LOWER(BTRIM(p.design_ref)),
                  j.source_order_id,
                  COALESCE(p.position_sort_order, p.source_order_position_id),
                  p.source_order_position_id
       ) design_numbers
       ORDER BY LOWER(design_ref), order_no NULLS LAST, source_order_id`,
      [sourceOrderIds]
    ),
    pool.query(
      `WITH position_text AS (
         SELECT source_order_id,
                STRING_AGG(CONCAT_WS(' ', position_name, colour_notes, design_ref), ' ') AS text_value
         FROM database_job_positions
         WHERE source_order_id = ANY($1::int[])
         GROUP BY source_order_id
       ),
       line_item_text AS (
         SELECT source_order_id,
                STRING_AGG(line_description, ' ') AS text_value
         FROM database_job_line_items
         WHERE source_order_id = ANY($1::int[])
         GROUP BY source_order_id
       )
       SELECT j.source_order_id,
              j.order_no,
              j.order_date,
              j.job_title,
              CONCAT_WS(' ',
                j.job_title,
                j.client_order_no,
                j.screen_numbers,
                j.comments,
                position_text.text_value,
                line_item_text.text_value
              ) AS reference_source_text
       FROM database_jobs j
       LEFT JOIN position_text ON position_text.source_order_id = j.source_order_id
       LEFT JOIN line_item_text ON line_item_text.source_order_id = j.source_order_id
       WHERE j.source_order_id = ANY($1::int[])`,
      [sourceOrderIds]
    ),
  ]);

  const referencesByOrder = new Map();
  const orderById = new Map();
  for (const row of referenceResult.rows) {
    const sourceOrderId = Number(row.source_order_id);
    if (!Number.isFinite(sourceOrderId)) continue;

    const references = extractOrderDesignReferences(row.reference_source_text).join(', ');
    referencesByOrder.set(sourceOrderId, references);
    orderById.set(sourceOrderId, {
      source_order_id: row.source_order_id,
      order_no: row.order_no,
      order_date: row.order_date,
      job_title: row.job_title,
    });
  }

  const rows = designResult.rows.map((row) => ({
    ...row,
    design_ref: displayDesignReference(row.design_ref),
    psg_numbers: referencesByOrder.get(Number(row.source_order_id)) || '',
  }));
  const designOrderIds = new Set(rows.map((row) => Number(row.source_order_id)));

  for (const [sourceOrderId, psgNumbers] of referencesByOrder.entries()) {
    if (!psgNumbers || designOrderIds.has(sourceOrderId)) continue;
    const order = orderById.get(sourceOrderId);
    if (!order) continue;
    rows.push({
      design_ref: '',
      psg_numbers: psgNumbers,
      ...order,
    });
  }

  return collapseCustomerDesignNumberRows(rows).sort(compareCustomerDesignNumberRows);
}

const STITCH_REFERENCE_LABEL = String.raw`(?:STITCH[\s._/-]*COUNT|STITCHES?|S[\s._/-]*T(?:[\s._/-]*(?:S|C))?)`;
const PSG_REFERENCE_PATTERN = new RegExp(
  String.raw`\bP[\s._/-]*S[\s._/-]*G(?:[\s:._#/-]*(?:NO\.?|NUM(?:BER)?)?[\s:._#/-]*)?(\d+\s*[A-Z]?)\b` +
    String.raw`(?:\s*(?:[,;/|+&-]\s*)?(?:${STITCH_REFERENCE_LABEL}[\s:._#/-]*(\d[\d,\s]*\d)|(\d[\d,\s]*\d)))?`,
  'gi'
);
const STITCH_REFERENCE_PATTERN = new RegExp(
  String.raw`\b${STITCH_REFERENCE_LABEL}(?:[\s:._#/-]*(?:NO\.?|NUM(?:BER)?)?[\s:._#/-]*)?(\d[\d,\s]*\d)\b`,
  'gi'
);

function extractOrderDesignReferences(value) {
  const psgReferences = [];
  const stitchReferences = [];
  const seen = new Set();
  const text = String(value || '');
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;

  let match;
  while ((match = PSG_REFERENCE_PATTERN.exec(text))) {
    addOrderDesignReference(psgReferences, seen, 'PSG', match[1]);
    addOrderDesignReference(stitchReferences, seen, 'ST', match[2] || match[3]);
  }

  while ((match = STITCH_REFERENCE_PATTERN.exec(text))) {
    addOrderDesignReference(stitchReferences, seen, 'ST', match[1]);
  }

  return [...psgReferences, ...stitchReferences];
}

function addOrderDesignReference(references, seen, prefix, rawValue) {
  const value = prefix === 'PSG'
    ? String(rawValue || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    : String(rawValue || '').replace(/\D/g, '');
  if (!value) return;

  const reference = `${prefix}${value}`;
  if (seen.has(reference)) return;
  seen.add(reference);
  references.push(reference);
}

function displayDesignReference(value) {
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;
  const withoutReferences = String(value || '')
    .replace(PSG_REFERENCE_PATTERN, ' ')
    .replace(STITCH_REFERENCE_PATTERN, ' ');
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;

  return withoutReferences
    .replace(/\s+/g, ' ')
    .replace(/^[,;:/|._\-\s]+|[,;:/|._\-\s]+$/g, '')
    .trim();
}

function collapseCustomerDesignNumberRows(rows) {
  const mergedByOrder = new Map();

  for (const row of rows || []) {
    const sourceOrderId = Number(row.source_order_id);
    const key = Number.isFinite(sourceOrderId) ? `source:${sourceOrderId}` : `order:${row.order_no || ''}`;
    const existing = mergedByOrder.get(key);

    if (!existing) {
      mergedByOrder.set(key, {
        ...row,
        design_ref: cleanMergedList(row.design_ref),
        psg_numbers: cleanMergedList(row.psg_numbers),
      });
      continue;
    }

    existing.design_ref = mergeReferenceLists(existing.design_ref, row.design_ref);
    existing.psg_numbers = mergeReferenceLists(existing.psg_numbers, row.psg_numbers);
    existing.order_no = existing.order_no || row.order_no;
    existing.order_date = existing.order_date || row.order_date;
    existing.job_title = existing.job_title || row.job_title;
  }

  return Array.from(mergedByOrder.values())
    .filter((row) => cleanQuery(row.design_ref) || cleanQuery(row.psg_numbers));
}

function mergeReferenceLists(left, right) {
  const values = [];
  const seen = new Set();

  for (const value of [...splitReferenceList(left), ...splitReferenceList(right)]) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }

  return values.join(', ');
}

function cleanMergedList(value) {
  return mergeReferenceLists('', value);
}

function splitReferenceList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function compareCustomerDesignNumberRows(a, b) {
  const designA = cleanQuery(a.design_ref);
  const designB = cleanQuery(b.design_ref);
  if (designA && !designB) return -1;
  if (!designA && designB) return 1;

  const byDesign = designA.localeCompare(designB, undefined, { sensitivity: 'base' });
  if (byDesign) return byDesign;

  const byOrder = Number(a.order_no || 0) - Number(b.order_no || 0);
  if (byOrder) return byOrder;

  return Number(a.source_order_id || 0) - Number(b.source_order_id || 0);
}

async function resolveCustomerContactContext(customerKey) {
  if (customerKey.type === 'profile') {
    const profile = await pool.query(
      `SELECT id, customer_id, customer_name
       FROM database_customer_profiles
       WHERE id = $1
       LIMIT 1`,
      [customerKey.value]
    );

    if (!profile.rowCount) return null;
    const row = profile.rows[0];
    return {
      profile_id: row.id,
      customer_id: isFiniteDatabaseValue(row.customer_id) ? Number(row.customer_id) : null,
      customer_name: row.customer_name,
    };
  }

  const where = customerKey.type === 'id'
    ? 'customer_id = $1'
    : 'LOWER(customer_name) = LOWER($1)';

  const result = await pool.query(
    `SELECT customer_id, customer_name
     FROM database_jobs
     WHERE ${where}
       AND customer_name IS NOT NULL
       AND customer_name <> ''
     ORDER BY COALESCE(order_date, updated_at_source, created_at_source) DESC NULLS LAST,
              order_no DESC NULLS LAST
     LIMIT 1`,
    [customerKey.value]
  );

  if (!result.rowCount) return null;

  return {
    profile_id: null,
    customer_id: isFiniteDatabaseValue(result.rows[0].customer_id) ? Number(result.rows[0].customer_id) : null,
    customer_name: result.rows[0].customer_name,
  };
}

function contactScopeClause(context, startIndex) {
  const clauses = [];
  const params = [];

  if (isFiniteDatabaseValue(context?.profile_id)) {
    params.push(Number(context.profile_id));
    clauses.push(`profile_id = $${startIndex + params.length - 1}`);
  }

  if (isFiniteDatabaseValue(context?.customer_id)) {
    params.push(Number(context.customer_id));
    clauses.push(`customer_id = $${startIndex + params.length - 1}`);
  }

  const customerName = cleanNullable(context?.customer_name);
  if (customerName) {
    params.push(customerName);
    clauses.push(`LOWER(customer_name) = LOWER($${startIndex + params.length - 1})`);
  }

  return {
    clause: clauses.join(' OR '),
    params,
  };
}

function manualContactToContact(contact) {
  return {
    contact_id: contact.source_contact_id || null,
    contact_row_id: contact.id || null,
    manual_contact_id: contact.id || null,
    contact_title: contact.contact_title || null,
    contact_first_name: contact.contact_first_name || null,
    contact_last_name: contact.contact_last_name || null,
    contact_name: contact.contact_name || contactNameFromParts(
      contact.contact_title,
      contact.contact_first_name,
      contact.contact_last_name
    ),
    contact_phone: contact.contact_phone || null,
    contact_fax: contact.contact_fax || null,
    contact_mobile: contact.contact_mobile || null,
    contact_email: contact.contact_email || null,
    contact_address: contact.contact_address || null,
    latest_order_no: null,
    latest_source_order_id: null,
    order_count: 0,
    first_seen_at: contact.created_at_source || null,
    last_seen_at: contact.updated_at_source || contact.created_at_source || null,
  };
}

function contactHasAnyValue(payload) {
  return [
    payload?.contact_title,
    payload?.contact_first_name,
    payload?.contact_last_name,
    payload?.contact_phone,
    payload?.contact_fax,
    payload?.contact_mobile,
    payload?.contact_email,
    payload?.contact_address,
  ].some((value) => cleanQuery(value));
}

function groupedContacts(orders, profile = null, manualContactRows = []) {
  const contacts = new Map();

  for (const contact of manualContactRows || []) {
    const normalizedContact = manualContactToContact(contact);
    const key = isFiniteDatabaseValue(normalizedContact.contact_id)
      ? `id:${normalizedContact.contact_id}`
      : `manual:${contact.id}`;
    contacts.set(key, normalizedContact);
  }

  if (
    profile &&
    (profile.contact_name || profile.contact_phone || profile.contact_mobile || profile.contact_email)
  ) {
    const key = [
      profile.contact_name,
      profile.contact_phone,
      profile.contact_mobile,
      profile.contact_email,
    ].map((value) => cleanQuery(value).toLowerCase()).join('|');

    contacts.set(key, {
      contact_id: null,
      contact_row_id: null,
      manual_contact_id: null,
      contact_title: null,
      contact_first_name: null,
      contact_last_name: null,
      contact_name: profile.contact_name || null,
      contact_phone: profile.contact_phone || null,
      contact_fax: null,
      contact_mobile: profile.contact_mobile || null,
      contact_email: profile.contact_email || null,
      contact_address: profile.invoice_address || null,
      latest_order_no: null,
      latest_source_order_id: null,
      order_count: 0,
      first_seen_at: profile.created_at_source || null,
      last_seen_at: profile.updated_at_source || profile.created_at_source || null,
    });
  }

  for (const order of orders) {
    if (!order.contact_name && !order.contact_phone && !order.contact_mobile && !order.contact_email) continue;

    const key = isFiniteDatabaseValue(order.contact_id)
      ? `id:${order.contact_id}`
      : [
          order.contact_name,
          order.contact_phone,
          order.contact_mobile,
          order.contact_email,
        ].map((value) => cleanQuery(value).toLowerCase()).join('|');

    const existing = contacts.get(key) || {
      contact_id: order.contact_id || null,
      contact_row_id: null,
      manual_contact_id: null,
      contact_title: null,
      contact_first_name: null,
      contact_last_name: null,
      contact_name: order.contact_name || null,
      contact_phone: order.contact_phone || null,
      contact_fax: null,
      contact_mobile: order.contact_mobile || null,
      contact_email: order.contact_email || null,
      contact_address: null,
      latest_order_no: order.order_no || null,
      latest_source_order_id: order.source_order_id || null,
      order_count: 0,
      first_seen_at: seenDate(order),
      last_seen_at: seenDate(order),
    };

    existing.contact_name = existing.contact_name || order.contact_name || null;
    existing.contact_phone = existing.contact_phone || order.contact_phone || null;
    existing.contact_mobile = existing.contact_mobile || order.contact_mobile || null;
    existing.contact_email = existing.contact_email || order.contact_email || null;
    existing.order_count += 1;

    if (!existing.latest_order_no || isLater(seenDate(order), existing.last_seen_at)) {
      existing.latest_order_no = order.order_no || null;
      existing.latest_source_order_id = order.source_order_id || null;
      existing.last_seen_at = seenDate(order);
    }

    if (isEarlier(seenDate(order), existing.first_seen_at)) {
      existing.first_seen_at = seenDate(order);
    }

    contacts.set(key, existing);
  }

  return Array.from(contacts.values()).sort((a, b) => {
    const byName = cleanQuery(a.contact_name).localeCompare(cleanQuery(b.contact_name), 'en', { sensitivity: 'base' });
    if (byName) return byName;
    return Number(b.latest_order_no || 0) - Number(a.latest_order_no || 0);
  });
}

function groupedAddresses(orders, addressRows = [], profile = null) {
  const addresses = new Map();

  if (profile) {
    addProfileAddress(addresses, profile, 'invoice');
    addProfileAddress(addresses, profile, 'delivery');
  }

  for (const address of addressRows) {
    addImportedAddress(addresses, address, orders);
  }

  for (const order of orders) {
    if (!order.invoice_address_id) {
      addAddress(addresses, order, 'Invoice', order.invoice_address);
    }
    if (!order.delivery_address_id) {
      addAddress(addresses, order, 'Delivery', order.delivery_address);
    }
  }

  return Array.from(addresses.values()).sort((a, b) => {
    const byDate = dateTime(b.last_seen_at) - dateTime(a.last_seen_at);
    if (byDate) return byDate;
    return a.address.localeCompare(b.address, 'en', { sensitivity: 'base' });
  });
}

function addProfileAddress(addresses, profile, role) {
  const fields = customerProfileAddressFields(profile, role);
  if (!fields.address) return;

  const key = normalizedAddressKey(fields.address);
  const addressType = role === 'invoice' ? 'Invoice' : 'Delivery';
  const existing = addresses.get(key) || {
    source_address_id: null,
    address_type: addressType,
    address: fields.address,
    address_line1: fields.line1,
    address_line2: fields.line2,
    address_line3: fields.line3,
    address_line4: fields.line4,
    address_line5: fields.line5,
    postcode: fields.postcode,
    phone: profile.contact_phone || null,
    fax: null,
    mobile: profile.contact_mobile || null,
    created_at_source: profile.created_at_source || null,
    updated_at_source: profile.updated_at_source || null,
    updated_by: profile.updated_by_name || null,
    latest_order_no: null,
    latest_source_order_id: null,
    order_count: 0,
    first_seen_at: profile.created_at_source || null,
    last_seen_at: profile.updated_at_source || profile.created_at_source || null,
  };

  existing.address_type = mergedAddressType(existing.address_type, [addressType]);
  existing.address_line1 = existing.address_line1 || fields.line1 || null;
  existing.address_line2 = existing.address_line2 || fields.line2 || null;
  existing.address_line3 = existing.address_line3 || fields.line3 || null;
  existing.address_line4 = existing.address_line4 || fields.line4 || null;
  existing.address_line5 = existing.address_line5 || fields.line5 || null;
  existing.postcode = existing.postcode || fields.postcode || null;
  existing.phone = existing.phone || profile.contact_phone || null;
  existing.mobile = existing.mobile || profile.contact_mobile || null;
  existing.updated_by = existing.updated_by || profile.updated_by_name || null;

  addresses.set(key, existing);
}

function addImportedAddress(addresses, addressRow, orders) {
  const address = formatImportedAddress(addressRow);
  if (!address) return;

  const sourceAddressId = Number(addressRow.source_address_id);
  const matchingOrders = orders.filter((order) => (
    Number(order.invoice_address_id) === sourceAddressId ||
    Number(order.delivery_address_id) === sourceAddressId
  ));
  const latestOrder = matchingOrders[0] || null;
  const roles = new Set(splitAddressRoles(addressRow.address_type));

  for (const order of matchingOrders) {
    if (Number(order.invoice_address_id) === sourceAddressId) roles.add('Invoice');
    if (Number(order.delivery_address_id) === sourceAddressId) roles.add('Delivery');
  }

  const key = normalizedAddressKey(address);
  const existing = addresses.get(key) || {
    source_address_id: addressRow.source_address_id || null,
    address_type: roles.size ? Array.from(roles).join(' / ') : 'Address',
    address,
    address_line1: addressRow.address_line1 || null,
    address_line2: addressRow.address_line2 || null,
    address_line3: addressRow.address_line3 || null,
    address_line4: addressRow.address_line4 || null,
    address_line5: addressRow.address_line5 || null,
    postcode: addressRow.postcode || null,
    phone: addressRow.phone || null,
    fax: addressRow.fax || null,
    mobile: addressRow.mobile || null,
    created_at_source: addressRow.created_at_source || null,
    updated_at_source: addressRow.updated_at_source || null,
    updated_by: addressRow.trace_staff_id || null,
    latest_order_no: latestOrder?.order_no || null,
    latest_source_order_id: latestOrder?.source_order_id || null,
    order_count: matchingOrders.length,
    first_seen_at: addressRow.created_at_source || latestOrder?.order_date || null,
    last_seen_at: addressRow.updated_at_source || addressRow.created_at_source || latestOrder?.order_date || null,
  };

  if (existing !== addresses.get(key)) {
    addresses.set(key, existing);
    return;
  }

  existing.address_type = mergedAddressType(existing.address_type, roles);
  existing.address_line1 = existing.address_line1 || addressRow.address_line1 || null;
  existing.address_line2 = existing.address_line2 || addressRow.address_line2 || null;
  existing.address_line3 = existing.address_line3 || addressRow.address_line3 || null;
  existing.address_line4 = existing.address_line4 || addressRow.address_line4 || null;
  existing.address_line5 = existing.address_line5 || addressRow.address_line5 || null;
  existing.postcode = existing.postcode || addressRow.postcode || null;
  existing.phone = existing.phone || addressRow.phone || null;
  existing.fax = existing.fax || addressRow.fax || null;
  existing.mobile = existing.mobile || addressRow.mobile || null;
  existing.created_at_source = existing.created_at_source || addressRow.created_at_source || null;
  existing.updated_at_source = existing.updated_at_source || addressRow.updated_at_source || null;
  existing.updated_by = existing.updated_by || addressRow.trace_staff_id || null;
  existing.order_count = Math.max(existing.order_count || 0, matchingOrders.length);

  if (latestOrder && isLater(seenDate(latestOrder), existing.last_seen_at)) {
    existing.latest_order_no = latestOrder.order_no || null;
    existing.latest_source_order_id = latestOrder.source_order_id || null;
    existing.last_seen_at = seenDate(latestOrder);
  }
}

function addAddress(addresses, order, addressType, address) {
  const cleanAddress = cleanQuery(address);
  if (!cleanAddress) return;

  const key = normalizedAddressKey(cleanAddress);
  const fields = splitAddressFields(cleanAddress);
  const existing = addresses.get(key) || {
    address_type: addressType,
    address: cleanAddress,
    ...fields,
    latest_order_no: order.order_no || null,
    latest_source_order_id: order.source_order_id || null,
    order_count: 0,
    first_seen_at: seenDate(order),
    last_seen_at: seenDate(order),
  };

  existing.address_type = mergedAddressType(existing.address_type, [addressType]);
  existing.order_count += 1;

  if (isLater(seenDate(order), existing.last_seen_at)) {
    existing.latest_order_no = order.order_no || null;
    existing.latest_source_order_id = order.source_order_id || null;
    existing.last_seen_at = seenDate(order);
  }

  if (isEarlier(seenDate(order), existing.first_seen_at)) {
    existing.first_seen_at = seenDate(order);
  }

  addresses.set(key, existing);
}

function formatImportedAddress(address) {
  return [
    address.address_line1,
    address.address_line2,
    address.address_line3,
    address.address_line4,
    address.address_line5,
    address.postcode,
  ].map(cleanQuery).filter(Boolean).join(', ');
}

function splitAddressFields(address) {
  const parts = cleanQuery(address)
    .split(/\r?\n|,\s*/)
    .map((part) => cleanQuery(part))
    .filter(Boolean);

  return {
    address_line1: parts[0] || null,
    address_line2: parts[1] || null,
    address_line3: parts[2] || null,
    address_line4: parts[3] || null,
    address_line5: parts[4] || null,
    postcode: parts[5] || null,
    phone: null,
    fax: null,
    mobile: null,
    created_at_source: null,
    updated_at_source: null,
    updated_by: null,
  };
}

function normalizedCustomerAddress(payload, prefix) {
  const fieldPrefix = prefix === 'delivery' ? 'delivery' : 'invoice';
  const lines = [1, 2, 3, 4, 5].map((index) => (
    cleanNullable(payload?.[`${fieldPrefix}_address_line${index}`])
  ));
  const postcode = cleanNullable(payload?.[`${fieldPrefix}_postcode`]);
  const suppliedAddress = cleanNullable(payload?.[`${fieldPrefix}_address`]);
  const address = suppliedAddress || [...lines, postcode].filter(Boolean).join(', ') || null;

  return {
    address,
    line1: lines[0],
    line2: lines[1],
    line3: lines[2],
    line4: lines[3],
    line5: lines[4],
    postcode,
  };
}

function customerProfileAddressFields(profile, role) {
  const prefix = role === 'delivery' ? 'delivery' : 'invoice';
  const lines = [1, 2, 3, 4, 5].map((index) => (
    cleanNullable(profile?.[`${prefix}_address_line${index}`])
  ));
  const postcode = cleanNullable(profile?.[`${prefix}_postcode`]);
  const address = cleanNullable(profile?.[`${prefix}_address`]) || [...lines, postcode].filter(Boolean).join(', ') || null;

  return {
    address,
    line1: lines[0],
    line2: lines[1],
    line3: lines[2],
    line4: lines[3],
    line5: lines[4],
    postcode,
  };
}

function contactNameFromPayload(payload) {
  const contactName = cleanNullable(payload?.contact_name);
  if (contactName) return contactName;

  const parts = [
    payload?.contact_title,
    payload?.contact_first_name,
    payload?.contact_last_name,
  ].map(cleanQuery).filter(Boolean);

  return parts.length ? parts.join(' ') : null;
}

function contactNameFromParts(title, firstName, lastName) {
  const parts = [firstName, lastName].map(cleanQuery).filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

async function resolveAccountManager(userId, fallbackName) {
  if (isFiniteDatabaseValue(userId)) {
    const user = await pool.query(
      `SELECT id, first_name, last_name
       FROM hub_users
       WHERE id = $1
       LIMIT 1`,
      [Number(userId)]
    );

    if (!user.rowCount) {
      return { error: 'Account manager user was not found' };
    }

    return {
      userId: user.rows[0].id,
      name: fullName(user.rows[0]),
    };
  }

  return {
    userId: null,
    name: cleanNullable(fallbackName),
  };
}

function customerProfileToCustomer(profile) {
  return {
    customer_key: `profile:${profile.id}`,
    profile_id: profile.id,
    customer_id: profile.customer_id || null,
    business_name: profile.customer_name || null,
    customer_code: profile.customer_code || null,
    contact_name: profile.contact_name || null,
    contact_phone: profile.contact_phone || null,
    contact_mobile: profile.contact_mobile || null,
    contact_email: profile.contact_email || null,
    marketing_opt_in: Boolean(profile.marketing_opt_in),
    account_manager: profile.account_manager_name || null,
    account_manager_user_id: profile.account_manager_user_id || null,
    created_at_source: profile.created_at_source || null,
    updated_at_source: profile.updated_at_source || null,
    updated_by: profile.updated_by_name || null,
    latest_source_order_id: null,
    latest_order_no: null,
    latest_job_title: null,
    latest_order_date: null,
    latest_delivery_date: null,
    last_seen_at: profile.updated_at_source || profile.created_at_source || null,
    order_count: 0,
  };
}

function normalizedAddressKey(address) {
  return cleanQuery(address).replace(/\s+/g, ' ').toLowerCase();
}

function splitAddressRoles(value) {
  return cleanQuery(value)
    .split('/')
    .map((role) => cleanQuery(role))
    .filter(Boolean);
}

function mergedAddressType(current, roles) {
  const merged = new Set(splitAddressRoles(current));
  for (const role of roles) {
    const cleanRole = cleanQuery(role);
    if (cleanRole) merged.add(cleanRole);
  }
  return merged.size ? Array.from(merged).join(' / ') : 'Address';
}

function firstNonEmpty(rows, field) {
  const row = rows.find((item) => cleanQuery(item[field]));
  return row ? row[field] : null;
}

function firstFinite(rows, field) {
  const row = rows.find((item) => isFiniteDatabaseValue(item[field]));
  return row ? Number(row[field]) : null;
}

function isFiniteDatabaseValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function earliestDate(rows, field) {
  return rows
    .map((row) => row[field])
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || null;
}

function latestDate(rows, field) {
  return rows
    .map((row) => row[field])
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

function seenDate(order) {
  return order.order_date || order.updated_at_source || order.created_at_source || null;
}

function dateTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isLater(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() > new Date(current).getTime();
}

function isEarlier(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() < new Date(current).getTime();
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || cleanQuery(value).toLowerCase() === 'true';
}

module.exports = router;
