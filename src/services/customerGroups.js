// Keep ID-backed accounts distinct, including different accounts with identical names.
// Name-only profiles and orders share one case-insensitive identity.
const CUSTOMERS_SQL = `WITH sources AS (
  SELECT customer_id, customer_name, created_at_source AS added_at, 0 AS priority FROM database_customer_profiles
  UNION ALL SELECT customer_id, customer_name, COALESCE(created_at_source,order_date) AS added_at, 1 AS priority FROM database_jobs
), names AS (
  SELECT lower(trim(customer_name)) AS name_key,
    CASE WHEN count(DISTINCT customer_id)=1 THEN min(customer_id) END AS resolved_id
  FROM sources GROUP BY lower(trim(customer_name))
), identities AS (
  SELECT CASE WHEN COALESCE(s.customer_id,n.resolved_id) IS NOT NULL
    THEN 'id:' || COALESCE(s.customer_id,n.resolved_id)::text
    ELSE 'name:' || n.name_key END AS key,
    trim(s.customer_name) AS name, s.priority, s.added_at,
    CASE WHEN n.resolved_id IS NOT NULL OR s.customer_id IS NULL THEN 'name:' || n.name_key END AS name_alias
  FROM sources s JOIN names n ON n.name_key=lower(trim(s.customer_name))
  WHERE NULLIF(trim(s.customer_name), '') IS NOT NULL
), customers AS (
  SELECT DISTINCT ON (key) key, name FROM identities ORDER BY key, priority, name
) , stats AS (
  SELECT key, min(added_at) AS added_at, count(*) FILTER (WHERE priority=1)::int AS order_count
  FROM identities GROUP BY key
), aliases AS (
  SELECT key, key AS alias FROM customers
  UNION SELECT key, name_alias FROM identities WHERE name_alias IS NOT NULL
) SELECT c.key, c.name, stats.added_at, stats.order_count, array_agg(DISTINCT a.alias) AS aliases,
  COALESCE(array_agg(DISTINCT m.group_id) FILTER (WHERE m.group_id IS NOT NULL), ARRAY[]::integer[]) AS groups
FROM customers c JOIN stats ON stats.key=c.key JOIN aliases a ON a.key=c.key
LEFT JOIN hub_customer_group_members m ON m.customer_key=a.alias
GROUP BY c.key,c.name,stats.added_at,stats.order_count ORDER BY lower(c.name),c.key`;
function groupInput(body) {
  if (!body || typeof body.title !== 'string' || typeof body.description !== 'string') return null;
  const title = body.title.trim(), description = body.description.trim();
  return title && title.length <= 100 && description.length <= 2000 ? { title, description } : null;
}
async function list(db) {
  const customers = (await db.query(CUSTOMERS_SQL)).rows;
  const groups = (await db.query('SELECT id,title,description FROM hub_customer_groups ORDER BY lower(title),id')).rows;
  return { customers, groups: groups.map(g => ({ ...g, count: customers.filter(c => c.groups.includes(g.id)).length })) };
}
module.exports = { CUSTOMERS_SQL, groupInput, list };
