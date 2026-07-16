function buildJobFilters(query = {}) {
  const params = [];
  const where = [];

  const search = cleanQuery(query.q);
  if (search) {
    params.push(`%${search}%`);
    const ref = `$${params.length}`;
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
      OR CAST(j.source_order_id AS TEXT) ILIKE ${ref}
      OR CAST(j.order_no AS TEXT) ILIKE ${ref}
      OR CAST(j.invoice_no AS TEXT) ILIKE ${ref}
      OR EXISTS (
        SELECT 1
        FROM database_job_line_items li_search
        WHERE li_search.source_order_id = j.source_order_id
          AND (
            li_search.line_description ILIKE ${ref}
            OR li_search.style_code ILIKE ${ref}
            OR li_search.alt_style_code ILIKE ${ref}
            OR li_search.style_name ILIKE ${ref}
            OR li_search.product_type ILIKE ${ref}
            OR li_search.supplier_name ILIKE ${ref}
            OR li_search.colour ILIKE ${ref}
            OR li_search.size ILIKE ${ref}
          )
      )
      OR EXISTS (
        SELECT 1
        FROM database_job_positions p_search
        WHERE p_search.source_order_id = j.source_order_id
          AND (
            p_search.position_name ILIKE ${ref}
            OR p_search.colour_notes ILIKE ${ref}
            OR p_search.design_ref ILIKE ${ref}
          )
      )
      OR EXISTS (
        SELECT 1
        FROM database_customer_addresses a_search
        WHERE (
            (j.customer_id IS NOT NULL AND a_search.customer_id = j.customer_id)
            OR a_search.source_address_id = j.invoice_address_id
            OR a_search.source_address_id = j.delivery_address_id
          )
          AND (
            a_search.address_line1 ILIKE ${ref}
            OR a_search.address_line2 ILIKE ${ref}
            OR a_search.address_line3 ILIKE ${ref}
            OR a_search.address_line4 ILIKE ${ref}
            OR a_search.address_line5 ILIKE ${ref}
            OR a_search.postcode ILIKE ${ref}
          )
      )
      OR EXISTS (
        SELECT 1
        FROM database_customer_contacts c_search
        WHERE (
            (j.customer_id IS NOT NULL AND c_search.customer_id = j.customer_id)
            OR LOWER(c_search.customer_name) = LOWER(j.customer_name)
          )
          AND (
            c_search.contact_name ILIKE ${ref}
            OR c_search.contact_first_name ILIKE ${ref}
            OR c_search.contact_last_name ILIKE ${ref}
            OR c_search.contact_email ILIKE ${ref}
            OR c_search.contact_phone ILIKE ${ref}
            OR c_search.contact_mobile ILIKE ${ref}
          )
      )
      OR EXISTS (
        SELECT 1
        FROM database_customer_profiles cp_search
        WHERE (
            (j.customer_id IS NOT NULL AND cp_search.customer_id = j.customer_id)
            OR LOWER(cp_search.customer_name) = LOWER(j.customer_name)
          )
          AND (
            cp_search.customer_name ILIKE ${ref}
            OR cp_search.customer_code ILIKE ${ref}
            OR cp_search.contact_name ILIKE ${ref}
            OR cp_search.contact_email ILIKE ${ref}
            OR cp_search.invoice_address ILIKE ${ref}
            OR cp_search.delivery_address ILIKE ${ref}
            OR cp_search.invoice_postcode ILIKE ${ref}
            OR cp_search.delivery_postcode ILIKE ${ref}
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
    where.push(`NOT (
      COALESCE(UPPER(TRIM(j.dashboard_status)), '') = 'COMPLETED'
      AND (j.invoice_printed IS TRUE OR j.pf_invoice_printed IS TRUE)
    )`);
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

module.exports = { buildJobFilters };
