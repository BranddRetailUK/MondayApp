const DAY = 86400000;
const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const todayLondon = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
function monthsBefore(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);
const money = value => Math.round(Number(value || 0) * 100) / 100;

// The SQL aggregates each job before joining customer identities, avoiding line/contact multiplication.
const JOBS_SQL = `SELECT j.source_order_id, j.order_no, j.customer_id, j.customer_name,
 j.order_date::date::text AS order_date, j.job_title, j.order_type,
 j.contact_name, j.contact_email, j.contact_phone, j.contact_mobile,
 COALESCE(l.net,0)::float8 AS net, COALESCE(l.missing,0)::int AS missing
 FROM database_jobs j LEFT JOIN (
 SELECT source_order_id, SUM(COALESCE(quantity,0)*COALESCE(unit_price,0)) AS net,
 COUNT(*) FILTER (WHERE quantity IS NULL OR unit_price IS NULL) AS missing
 FROM database_job_line_items WHERE is_internal IS NOT TRUE GROUP BY source_order_id
 ) l USING(source_order_id)`;
async function readSnapshot(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    const jobs = (await client.query(JOBS_SQL)).rows;
    const profiles = (await client.query('SELECT customer_id, customer_name, contact_name, contact_email, contact_phone, contact_mobile, marketing_opt_in, account_manager_name FROM database_customer_profiles')).rows;
    const contacts = (await client.query('SELECT customer_id, customer_name, contact_name, contact_email, contact_phone, contact_mobile FROM database_customer_contacts')).rows;
    const dtf = (await client.query("SELECT customer_name, customer_email, MAX(created_at AT TIME ZONE 'Europe/London')::date::text AS last_order FROM dtf_jobs WHERE status IN ('RECEIVED','IN_PRODUCTION','COMPLETED') GROUP BY customer_name, customer_email")).rows;
    await client.query('COMMIT');
    return { jobs, profiles, contacts, dtf, fetchedAt: new Date().toISOString() };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
function createSnapshotLoader(pool) {
  let cache, pending;
  return async () => {
    if (cache && Date.now() - cache.time < 5 * 60 * 1000) return cache.data;
    if (!pending) pending = readSnapshot(pool).then(data => { cache = { data, time: Date.now() }; return data; }).finally(() => { pending = null; });
    return pending;
  };
}
function buildCustomers(snapshot, { years = 3, today = todayLondon() } = {}) {
  const start = monthsBefore(today, years * 12), sixMonths = monthsBefore(today, 6);
  const parents = new Map();
  function find(k) { if (!parents.has(k)) parents.set(k, k); if (parents.get(k) !== k) parents.set(k, find(parents.get(k))); return parents.get(k); }
  const keys = row => [row.customer_id != null ? `id:${row.customer_id}` : '', normalize(row.customer_name) ? `name:${normalize(row.customer_name)}` : ''].filter(Boolean);
  for (const j of snapshot.jobs) { const k = keys(j); k.forEach(x => parents.set(find(x), find(k[0]))); }
  const identity = row => keys(row).map(k => parents.has(k) ? find(k) : null).find(Boolean);
  const groups = new Map(); let invalidDates = 0;
  for (const j of snapshot.jobs) {
    if (!j.order_date || j.order_date < '2000-01-01' || j.order_date > today) { invalidDates++; continue; }
    const key = identity(j); if (!key) continue;
    if (!groups.has(key)) groups.set(key, { jobs: [], profiles: [], contacts: [] });
    groups.get(key).jobs.push(j);
  }
  for (const kind of ['profiles', 'contacts']) for (const c of snapshot[kind] || []) groups.get(identity(c))?.[kind].push(c);
  const emailActivity = new Map(), domainActivity = new Map();
  const businessDomain = email => {
    const domain = email.split('@')[1] || '';
    return /^(gmail\.com|googlemail\.com|hotmail\.(com|co\.uk)|outlook\.(com|co\.uk)|live\.(com|co\.uk)|yahoo\.(com|co\.uk)|icloud\.com|aol\.com|btinternet\.com|btconnect\.com|sky\.com|me\.com|msn\.com|virginmedia\.com|ntlworld\.com|talktalk\.net)$/.test(domain) ? '' : domain;
  };
  for (const [key, group] of groups) for (const j of group.jobs) {
    const email = normalize(j.contact_email);
    if (email && j.order_date >= sixMonths) { if (!emailActivity.has(email)) emailActivity.set(email, new Set()); emailActivity.get(email).add(key); const domain=businessDomain(email);if(domain){if(!domainActivity.has(domain))domainActivity.set(domain,new Set());domainActivity.get(domain).add(key);} }
  }
  const customers = [];
  for (const [key, group] of groups) {
    const jobs = group.jobs.sort((a, b) => b.order_date.localeCompare(a.order_date) || b.source_order_id - a.source_order_id);
    const period = jobs.filter(j => j.order_date >= start);
    if (!period.length) continue;
    const last = jobs[0], sources = [...group.profiles, ...jobs, ...group.contacts];
    const primary = sources.find(c => normalize(c.contact_email)) || sources.find(c => c.contact_phone || c.contact_mobile) || sources[0];
    const emails = [...new Set(sources.map(c => normalize(c.contact_email)).filter(Boolean))];
    const names = [...new Set(jobs.map(j => normalize(j.customer_name)))];
    const dtfLast = (snapshot.dtf || []).filter(d => emails.includes(normalize(d.customer_email)) || names.includes(normalize(d.customer_name))).map(d => d.last_order).filter(d => d <= today).sort().at(-1);
    const lastActivity = dtfLast && dtfLast > last.order_date ? dtfLast : last.order_date;
    const uniqueDates = [...new Set(jobs.filter(j => j.order_date >= monthsBefore(last.order_date, 36)).map(j => j.order_date))];
    const gaps = uniqueDates.slice(1).map((d, i) => daysBetween(uniqueDates[i], d)).sort((a,b) => a-b);
    const cadence = gaps.length >= 3 ? Math.round((gaps[Math.floor((gaps.length-1)/2)] + gaps[Math.floor(gaps.length/2)]) / 2) : null;
    const lifetimeValue = money(jobs.reduce((s,j) => s + Number(j.net), 0));
    const periodValue = money(period.reduce((s,j) => s + Number(j.net), 0));
    const inactiveDays = daysBetween(today, lastActivity);
    const qualified = lifetimeValue >= 5000 || jobs.length >= 10;
    const lapsed = lastActivity < sixMonths;
    const sharedContact = emails.some(e => [...(emailActivity.get(e) || [])].some(k => k !== key));
    const sharedDomain = emails.some(e => [...(domainActivity.get(businessDomain(e)) || [])].some(k => k !== key));
    const seasonal = /school|leavers|marathon|\btour\b/i.test(`${last.customer_name} ${last.job_title}`);
    const notes = [];
    if (sharedContact) notes.push('Contact email also appears on another recently active account; check identity before outreach.');
    if (sharedDomain && !sharedContact) notes.push('Business email domain also appears on another recently active account; check whether this is an existing relationship.');
    if (seasonal) notes.push('Possible seasonal buying. Check the next event or annual reorder date.');
    if (dtfLast) notes.push(`Matched DTF activity: ${dtfLast}. DTF value is not included in the order totals.`);
    if (new Set(jobs.map(j => j.customer_id)).size > 1) notes.push('Identical customer names link multiple customer IDs.');
    const missing = jobs.reduce((s,j) => s + Number(j.missing || 0), 0);
    if (missing) notes.push(`${missing} historical lines lack a price or quantity; value may be understated.`);
    const candidate = qualified && lapsed && !sharedContact && !sharedDomain;
    const annual = Array.from({length: years}, (_, i) => {
      const from = monthsBefore(today, (years-i)*12), to = i === years-1 ? today : monthsBefore(today, (years-i-1)*12);
      const orders = jobs.filter(j => j.order_date >= from && (i === years-1 ? j.order_date <= to : j.order_date < to));
      return { from, to, endInclusive: i === years-1, value: money(orders.reduce((s,j) => s+Number(j.net),0)), orders: orders.length };
    });
    customers.push({ key, name: last.customer_name || 'Unnamed customer', customerIds: [...new Set(jobs.map(j => j.customer_id).filter(id => id != null))],
      periodValue, periodOrders: period.length, lifetimeValue, lifetimeOrders: jobs.length, averageOrder: money(periodValue / period.length),
      lastOrderDate: last.order_date, lastActivity, inactiveDays, cadence, candidate, qualified, sharedContact, sharedDomain, seasonal,
      contact: { name: primary?.contact_name || '', email: primary?.contact_email || '', phone: [primary?.contact_phone,primary?.contact_mobile].find(p => String(p || '').replace(/\D/g,'').length>=5) || '', source: group.profiles.includes(primary) ? 'Customer profile' : jobs.includes(primary) ? 'Order history' : 'Historical contact' },
      marketingOptIn: group.profiles.some(p => p.marketing_opt_in) ? 'Recorded' : 'Not recorded', accountManager: group.profiles.find(p => p.account_manager_name)?.account_manager_name || '',
      notes, annual, recentOrders: jobs.slice(0,3).map(j => ({ number:j.order_no, id:j.source_order_id, date:j.order_date, title:j.job_title, value:money(j.net) })),
      zeroValueOrders: jobs.filter(j => !Number(j.net)).length });
  }
  const maxValue = Math.max(1,...customers.map(c => c.periodValue)), maxOrders = Math.max(1,...customers.map(c => c.periodOrders));
  for (const c of customers) {
    // A transparent prioritisation heuristic, not a conversion probability.
    c.score = c.candidate ? Math.round(50*Math.log1p(Math.max(0,c.periodValue))/Math.log1p(maxValue) + 30*Math.log1p(c.periodOrders)/Math.log1p(maxOrders) + 20*Math.min(1,c.cadence ? c.inactiveDays/(2*c.cadence) : c.inactiveDays/365)) : 0;
    c.reason = c.sharedContact || c.sharedDomain ? 'Review account identity' : c.candidate ? `Valuable past customer · no orders for ${c.inactiveDays} days${c.cadence && c.inactiveDays > c.cadence*1.5 ? ` · beyond typical ${c.cadence}-day interval` : ''}` : !c.qualified ? 'Below the £5,000 / 10-order historical threshold' : 'Recently active';
  }
  return { customers, start, today, years, invalidDates, fetchedAt:snapshot.fetchedAt, latestOrder:snapshot.jobs.map(j=>j.order_date).filter(d=>d<=today).sort().at(-1) || null };
}
function selectCustomers(result, { preset='contact', search='', page=1, pageSize=24 }={}) {
  let rows = result.customers.filter(c => normalize(`${c.name} ${c.contact.name} ${c.contact.email}`).includes(normalize(search)));
  if (preset === 'contact') rows = rows.filter(c=>c.candidate);
  if (preset === 'lapsed') rows = rows.filter(c=>c.lastActivity < monthsBefore(result.today,6));
  if (preset === 'dormant') rows = rows.filter(c=>c.lastActivity < monthsBefore(result.today,12));
  rows.sort((a,b) => (preset==='orders' ? b.periodOrders-a.periodOrders : preset==='contact' ? b.score-a.score : b.periodValue-a.periodValue) || b.periodValue-a.periodValue || a.name.localeCompare(b.name));
  const total = rows.length, pages = Math.max(1,Math.ceil(total/pageSize));page=Math.min(page,pages);
  return { ...result, customers: rows.slice((page-1)*pageSize,page*pageSize), total, page, pages, pageSize,
    summary:{ value:money(rows.reduce((s,c)=>s+c.periodValue,0)),orders:rows.reduce((s,c)=>s+c.periodOrders,0),candidates:rows.filter(c=>c.candidate).length }, preset };
}
module.exports = { todayLondon, monthsBefore, JOBS_SQL, readSnapshot, createSnapshotLoader, buildCustomers, selectCustomers };
