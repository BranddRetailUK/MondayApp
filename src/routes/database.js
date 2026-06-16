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

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

module.exports = router;
