const products = require('../../web/hamper-collection/products.json');

const catalogue = new Map(products.map(product => [product.sku, product]));

function brochureLineCost(item) {
  const product = catalogue.get(item.sku);
  if (!product || !Number.isSafeInteger(item.quantity) || item.quantity < 1) return null;
  const netPence = Math.round(product.brochurePriceExVat * 100) * item.quantity;
  const vatPence = Math.round(netPence * Math.round(product.vatPercent * 100) / 10000);
  return { netPence, vatPence, grossPence: netPence + vatPence };
}

async function listPaidHamperOrders(db, mode) {
  const { rows } = await db.query(`
    WITH orders AS (
      SELECT o.id,o.po_number,o.status,o.mode,o.snapshot,o.delivery,o.stripe_session_id,
             o.stripe_payment_intent,o.created_at,o.updated_at,e.status AS confirmation_email_status
      FROM hamper_orders o LEFT JOIN hamper_confirmation_emails e ON e.order_id=o.id
      WHERE o.mode=$1 AND o.status='paid'
      ORDER BY o.created_at DESC,o.id DESC LIMIT 200
    ), account_ids AS (
      SELECT customer_id FROM database_customer_profiles WHERE customer_id IS NOT NULL
      UNION
      SELECT customer_id FROM database_jobs WHERE customer_id IS NOT NULL
    ), customer_records AS (
      SELECT COALESCE(customer_id::text,'profile:'||id) AS key, customer_name, contact_name, contact_email, 1 AS priority
      FROM database_customer_profiles
      UNION ALL
      SELECT COALESCE(p.customer_id::text,c.customer_id::text,'profile:'||p.id),
             COALESCE(p.customer_name,c.customer_name),c.contact_name,c.contact_email,2
      FROM database_customer_contacts c
      LEFT JOIN database_customer_profiles p ON p.id=c.profile_id
      LEFT JOIN account_ids a ON a.customer_id=c.customer_id
      WHERE p.id IS NOT NULL OR a.customer_id IS NOT NULL
      UNION ALL
      SELECT COALESCE(customer_id::text,'name:'||trim(customer_name)),customer_name,contact_name,contact_email,3
      FROM database_jobs
    ), customers AS (
      SELECT *, trim(regexp_replace(lower(customer_name),'[^[:alnum:]]+',' ','g')) AS normalized_company,
                lower(trim(contact_name)) AS normalized_person
      FROM customer_records WHERE nullif(trim(customer_name),'') IS NOT NULL AND key IS NOT NULL
    ), delivery AS (
      SELECT id, nullif(lower(trim(delivery->>'email')),'') AS email,
                 nullif(lower(trim(delivery->>'name')),'') AS person,
                 nullif(trim(regexp_replace(lower(delivery->>'company'),'[^[:alnum:]]+',' ','g')),'') AS company
      FROM orders
    ), evidence AS (
      SELECT d.id,c.key,2 AS score
      FROM customers c CROSS JOIN LATERAL unnest(regexp_split_to_array(lower(c.contact_email),'[,;[:space:]<>]+')) e(email)
      JOIN delivery d ON d.email=e.email
      UNION ALL
      SELECT d.id,c.key,1
      FROM customers c JOIN delivery d ON d.person=c.normalized_person
      WHERE c.normalized_company<>'' AND (d.company=c.normalized_company OR starts_with(d.company,c.normalized_company||' '))
      UNION ALL
      SELECT d.id,c.key,1 FROM customers c JOIN delivery d ON d.person=lower(trim(c.customer_name))
      WHERE d.company IS NULL
    ), ranked AS (
      SELECT id,key,dense_rank() OVER (PARTITION BY id ORDER BY max(score) DESC) AS rank
      FROM evidence GROUP BY id,key
    ), matches AS (
      SELECT id,min(key) AS key FROM ranked WHERE rank=1 GROUP BY id HAVING count(*)=1
    )
    SELECT o.*, CASE WHEN c.key IS NOT NULL THEN jsonb_build_object('key',c.key,'name',c.customer_name) END AS matched_customer
    FROM orders o LEFT JOIN matches m USING (id)
    LEFT JOIN LATERAL (
      SELECT key,customer_name FROM customers WHERE key=m.key ORDER BY priority,customer_name LIMIT 1
    ) c ON true
    ORDER BY o.created_at DESC,o.id DESC
  `, [mode]);

  return rows.map(order => ({
    ...order,
    line_costs: (order.snapshot.items || [order.snapshot]).map(brochureLineCost)
  }));
}

module.exports = { listPaidHamperOrders };
