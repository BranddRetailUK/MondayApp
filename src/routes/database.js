const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/api/database/summary', async (_req, res) => {
  try {
    const [jobs, lineItems, positions, byYear, byType, latestRun] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM database_jobs'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_line_items'),
      pool.query('SELECT COUNT(*)::int AS count FROM database_job_positions'),
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
               position_count, started_at, finished_at, status, message
        FROM database_import_runs
        ORDER BY started_at DESC
        LIMIT 1
      `),
    ]);

    res.json({
      jobs: jobs.rows[0].count,
      lineItems: lineItems.rows[0].count,
      positions: positions.rows[0].count,
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
        cleanNullable(payload.order_taken_by),
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
      pool.query(
        `SELECT *
         FROM database_job_line_items
         WHERE source_order_id = $1
         ORDER BY source_order_item_id`,
        [sourceOrderId]
      ),
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
      lineItems: lineItems.rows,
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

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || cleanQuery(value).toLowerCase() === 'true';
}

module.exports = router;
