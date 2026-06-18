const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { fullName } = require('../services/hubAuth');

router.get('/api/database/summary', async (_req, res) => {
  try {
    const [jobs, lineItems, positions, addresses, byYear, byType, latestRun] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM database_jobs'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_line_items'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_positions'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_customer_addresses'),
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
               position_count, address_count, started_at, finished_at, status, message
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
  const { whereSql, params } = buildJobFilters(req.query);

  try {
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM database_jobs j
       ${whereSql}`,
      params
    );

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
              j.comments,
              COALESCE(ls.line_item_count, 0)::int AS line_item_count,
              COALESCE(ls.total_quantity, 0)::int AS total_quantity,
              COALESCE(ps.position_count, 0)::int AS position_count
       FROM database_jobs j
       LEFT JOIN line_summary ls ON ls.source_order_id = j.source_order_id
       LEFT JOIN position_summary ps ON ps.source_order_id = j.source_order_id
       ${whereSql}
       ORDER BY COALESCE(j.order_date, j.created_at_source) DESC NULLS LAST,
                j.order_no DESC
       LIMIT $${limitParam}
       OFFSET $${offsetParam}`,
      listParams
    );

    res.json({
      jobs: jobs.rows,
      total: count.rows[0].total,
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
       )
       SELECT
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
           COALESCE(customer_id::text, LOWER(customer_name)) AS customer_key,
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
       SELECT customer_id,
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

  const where = customerKey.type === 'id'
    ? 'j.customer_id = $1'
    : 'LOWER(j.customer_name) = LOWER($1)';

  try {
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
      [customerKey.value]
    );

    const orders = result.rows;
    if (!orders.length) {
      return res.status(404).json({ error: 'Database customer not found' });
    }

    const customerId = customerKey.type === 'id'
      ? customerKey.value
      : firstFinite(orders, 'customer_id');
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

    res.json(buildCustomerDetail(customerKey, orders, addressRows));
  } catch (err) {
    console.error('GET /api/database/customers/:key', err);
    res.status(500).json({ error: 'Failed to fetch database customer detail' });
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

  if (!customerName || !orderType || !jobTitle || !orderDate || !deliveryDate) {
    return res.status(400).json({
      error: 'Customer, order type, job title, order date, and delivery date are required',
    });
  }

  if (!orderDate.valid || !deliveryDate.valid) {
    return res.status(400).json({ error: orderDate.error || deliveryDate.error });
  }

  if (orderDate.year !== 2025 && orderDate.year !== 2026) {
    return res.status(400).json({ error: 'Order date must be in 2025 or 2026 for the DATABASE snapshot' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71060216)');

    const next = await client.query(`
      SELECT
        (COALESCE(MAX(source_order_id), 0) + 1)::int AS source_order_id,
        (GREATEST(COALESCE(MAX(order_no), 50000), 50000) + 1)::int AS order_no
      FROM database_jobs
    `);

    const sourceOrderId = next.rows[0].source_order_id;
    const orderNo = next.rows[0].order_no;
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
         invoice_required,
         is_complete,
         is_manual_entry,
         created_at_source,
         updated_at_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
         $25, $26,
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
        invoiceRequiredValue(payload.invoice_required),
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

  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'job_title')) {
    return res.status(400).json({ error: 'No supported job fields supplied' });
  }

  const jobTitle = cleanNullable(req.body.job_title);

  try {
    const result = await pool.query(
      `UPDATE database_jobs
       SET job_title = $2,
           updated_at_source = NOW(),
           imported_at = NOW()
       WHERE source_order_id = $1 OR order_no = $1
       RETURNING *`,
      [id, jobTitle]
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

    for (const position of positions) {
      if (Number.isFinite(position.source_order_position_id)) {
        await client.query(
          `UPDATE database_job_positions
           SET position_name = $3,
               colour_notes = $4,
               design_ref = $5,
               updated_at_source = NOW(),
               imported_at = NOW()
           WHERE source_order_id = $1
             AND source_order_position_id = $2`,
          [
            sourceOrderId,
            position.source_order_position_id,
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
             position_name,
             colour_notes,
             design_ref,
             created_at_source,
             updated_at_source
           ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [
            nextSourcePositionId,
            sourceOrderId,
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
       ORDER BY source_order_position_id`,
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
         ORDER BY source_order_position_id`,
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
  if (year === 2025 || year === 2026) {
    params.push(year);
    where.push(`j.source_year = $${params.length}`);
  }

  const status = cleanQuery(query.status).toLowerCase();
  if (status === 'open') {
    where.push('j.is_complete IS NOT TRUE');
  } else if (status === 'complete' || status === 'completed') {
    where.push('j.is_complete IS TRUE');
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
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

  if (clean.toLowerCase().startsWith('name:')) {
    const name = clean.slice(5).trim();
    return name ? { type: 'name', value: name } : null;
  }

  if (/^\d+$/.test(clean)) {
    return { type: 'id', value: Number.parseInt(clean, 10) };
  }

  return { type: 'name', value: clean };
}

function buildCustomerDetail(customerKey, orders, addressRows = []) {
  const latest = orders[0] || {};
  const businessName = firstNonEmpty(orders, 'customer_name');
  const customerId = firstFinite(orders, 'customer_id');

  return {
    customer: {
      customer_key: customerKey.type === 'id' ? String(customerKey.value) : `name:${businessName || customerKey.value}`,
      customer_id: customerId,
      business_name: businessName,
      customer_code: firstNonEmpty(orders, 'customer_code'),
      account_manager: firstNonEmpty(orders, 'order_taken_by') || firstNonEmpty(orders, 'trace_staff_id'),
      created_at_source: earliestDate(orders, 'created_at_source'),
      updated_at_source: latestDate(orders, 'updated_at_source'),
      updated_by: latest.order_taken_by || latest.trace_staff_id || null,
      latest_source_order_id: latest.source_order_id || null,
      latest_order_no: latest.order_no || null,
      order_count: orders.length,
    },
    orders,
    contacts: groupedContacts(orders),
    addresses: groupedAddresses(orders, addressRows),
  };
}

function groupedContacts(orders) {
  const contacts = new Map();

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
      contact_name: order.contact_name || null,
      contact_phone: order.contact_phone || null,
      contact_mobile: order.contact_mobile || null,
      contact_email: order.contact_email || null,
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

    if (isLater(seenDate(order), existing.last_seen_at)) {
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

function groupedAddresses(orders, addressRows = []) {
  const addresses = new Map();

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
    phone: addressRow.phone || null,
    fax: addressRow.fax || null,
    mobile: addressRow.mobile || null,
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
  existing.phone = existing.phone || addressRow.phone || null;
  existing.fax = existing.fax || addressRow.fax || null;
  existing.mobile = existing.mobile || addressRow.mobile || null;
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
  const existing = addresses.get(key) || {
    address_type: addressType,
    address: cleanAddress,
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
