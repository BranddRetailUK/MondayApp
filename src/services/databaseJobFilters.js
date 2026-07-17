function buildJobFilters(query = {}) {
  const params = [];
  const where = [];

  const search = cleanQuery(query.q);
  if (search) {
    params.push(`%${search}%`);
    const ref = `$${params.length}`;
    const numericIdSearchSql = /^\d+$/.test(search)
      ? `
      OR CAST(j.source_order_id AS TEXT) ILIKE ${ref}
      OR CAST(j.order_no AS TEXT) ILIKE ${ref}
      OR CAST(j.invoice_no AS TEXT) ILIKE ${ref}`
      : '';
    const lineItemSearchSql = `(
      li_search.line_description ILIKE ${ref}
      OR li_search.style_code ILIKE ${ref}
      OR li_search.alt_style_code ILIKE ${ref}
      OR li_search.style_name ILIKE ${ref}
      OR li_search.product_type ILIKE ${ref}
      OR li_search.supplier_name ILIKE ${ref}
      OR li_search.colour ILIKE ${ref}
      OR li_search.size ILIKE ${ref}
    )`;
    const positionSearchSql = `(
      p_search.position_name ILIKE ${ref}
      OR p_search.colour_notes ILIKE ${ref}
      OR p_search.design_ref ILIKE ${ref}
    )`;
    const addressSearchSql = `(
      a_search.address_line1 ILIKE ${ref}
      OR a_search.address_line2 ILIKE ${ref}
      OR a_search.address_line3 ILIKE ${ref}
      OR a_search.address_line4 ILIKE ${ref}
      OR a_search.address_line5 ILIKE ${ref}
      OR a_search.postcode ILIKE ${ref}
    )`;
    const contactSearchSql = `(
      c_search.contact_name ILIKE ${ref}
      OR c_search.contact_first_name ILIKE ${ref}
      OR c_search.contact_last_name ILIKE ${ref}
      OR c_search.contact_email ILIKE ${ref}
      OR c_search.contact_phone ILIKE ${ref}
      OR c_search.contact_mobile ILIKE ${ref}
    )`;
    const profileSearchSql = `(
      cp_search.customer_name ILIKE ${ref}
      OR cp_search.customer_code ILIKE ${ref}
      OR cp_search.contact_name ILIKE ${ref}
      OR cp_search.contact_email ILIKE ${ref}
      OR cp_search.invoice_address ILIKE ${ref}
      OR cp_search.delivery_address ILIKE ${ref}
      OR cp_search.invoice_postcode ILIKE ${ref}
      OR cp_search.delivery_postcode ILIKE ${ref}
    )`;
    where.push(`(
      j.customer_name ILIKE ${ref}
      OR j.customer_code ILIKE ${ref}
      OR j.job_title ILIKE ${ref}
      OR j.contact_name ILIKE ${ref}
      OR j.contact_email ILIKE ${ref}
      OR j.client_order_no ILIKE ${ref}
      OR j.delivery_address ILIKE ${ref}
      OR j.invoice_address ILIKE ${ref}
      OR j.delivery_method ILIKE ${ref}
      OR j.screen_numbers ILIKE ${ref}
      OR j.comments ILIKE ${ref}
      ${numericIdSearchSql}
      OR j.source_order_id IN (
        SELECT li_search.source_order_id
        FROM database_job_line_items li_search
        WHERE ${lineItemSearchSql}
      )
      OR j.source_order_id IN (
        SELECT p_search.source_order_id
        FROM database_job_positions p_search
        WHERE ${positionSearchSql}
      )
      OR j.customer_id IN (
        SELECT a_search.customer_id
        FROM database_customer_addresses a_search
        WHERE a_search.customer_id IS NOT NULL
          AND ${addressSearchSql}
      )
      OR j.invoice_address_id IN (
        SELECT a_search.source_address_id
        FROM database_customer_addresses a_search
        WHERE a_search.source_address_id IS NOT NULL
          AND ${addressSearchSql}
      )
      OR j.delivery_address_id IN (
        SELECT a_search.source_address_id
        FROM database_customer_addresses a_search
        WHERE a_search.source_address_id IS NOT NULL
          AND ${addressSearchSql}
      )
      OR j.customer_id IN (
        SELECT c_search.customer_id
        FROM database_customer_contacts c_search
        WHERE c_search.customer_id IS NOT NULL
          AND ${contactSearchSql}
      )
      OR LOWER(j.customer_name) IN (
        SELECT LOWER(c_search.customer_name)
        FROM database_customer_contacts c_search
        WHERE NULLIF(BTRIM(c_search.customer_name), '') IS NOT NULL
          AND ${contactSearchSql}
      )
      OR j.customer_id IN (
        SELECT cp_search.customer_id
        FROM database_customer_profiles cp_search
        WHERE cp_search.customer_id IS NOT NULL
          AND ${profileSearchSql}
      )
      OR LOWER(j.customer_name) IN (
        SELECT LOWER(cp_search.customer_name)
        FROM database_customer_profiles cp_search
        WHERE NULLIF(BTRIM(cp_search.customer_name), '') IS NOT NULL
          AND ${profileSearchSql}
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
    where.push(`NOT (
      COALESCE(UPPER(TRIM(j.dashboard_status)), '') = 'COMPLETED'
      AND (
        j.invoice_printed IS TRUE
        OR j.pf_invoice_printed IS TRUE
        OR (j.invoice_required IS FALSE AND j.closed_without_invoice IS TRUE)
      )
    )`);
  } else if (status === 'complete' || status === 'completed') {
    where.push('j.is_complete IS TRUE');
  } else if (status === 'to-invoice') {
    where.push(`COALESCE(UPPER(TRIM(j.dashboard_status)), '') = 'COMPLETED'`);
    where.push('j.is_complete IS NOT TRUE');
    where.push('j.invoice_printed IS NOT TRUE');
    where.push('j.pf_invoice_printed IS NOT TRUE');
    where.push('NOT (j.invoice_required IS FALSE AND j.closed_without_invoice IS TRUE)');
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

module.exports = { buildJobFilters };
