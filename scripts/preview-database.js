// Local styling review with fictional sample records. No database connection.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { STATUS_SETTINGS, normalizeColumnTitle } = require('../src/services/testDashboardDefaults');
const app = express();
const root = path.resolve(__dirname, '../public');
const user = { id: 0, first_name: 'Local preview', last_name: '· Sample data', access_scope: 'full', can_manage_users: true };
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(403).json({ error: 'Read-only design preview. Changes are not saved.' });
  req.hubUser = user;
  next();
});
app.get('/api/auth/me', (_req, res) => res.json({ user }));
app.get('/api/print-exports/settings', (_req, res) => res.json({ enabled: false, canToggle: false }));
// Empty local supplier list; no supplier calls or audit-table initialization.
app.get('/api/database/stock-ordering', (_req, res) => res.json({ jobs: [] }));
const names = ['Northbank Studio', 'Fieldwork Coffee', 'Westgate Athletics', 'The Workshop', 'Harbour Collective', 'Orchard School'];
const titles = ['Team workwear', 'Autumn staff polos', 'Training kit', 'Event T-shirts', 'Crew jackets', 'School leavers hoodies'];
const statuses = ['AWAITING APPROVAL', 'READY TO PRINT', 'IN PRODUCTION', 'STOCK ORDERED'];
const colors = Object.fromEntries(Object.entries(STATUS_SETTINGS.labels).map(([index, label]) => [
  normalizeColumnTitle(label), STATUS_SETTINGS.labels_colors[index].color,
]));
const jobs = Array.from({ length: 24 }, (_, i) => ({
  source_order_id: 90024 - i, order_no: 90024 - i, customer_id: i % 6 + 1,
  customer_name: names[i % 6], customer_code: `DEMO0${i % 6 + 1}`,
  job_title: titles[i % 6], order_type: i % 3 ? 'Embroidery' : 'Printing',
  order_type_abbr: i % 3 ? 'E' : 'P', order_taken_by: 'Alex', order_owner_name: 'Alex',
  order_date: '2026-10-16', delivery_date: '2026-10-28', customer_date_required: i % 4 === 0,
  dashboard_status: statuses[i % 4], proof_approved: i % 4 !== 0,
  contact_name: 'Sam Taylor', contact_email: 'sample@example.com',
  invoice_required: true, is_complete: false, line_item_count: 2, total_quantity: 48,
  comments: 'Sample order for local styling review.', customer_ref: 'AUTUMN-26',
}));
const customers = names.map((name, i) => ({
  customer_id: i + 1, business_name: name, customer_name: name, customer_code: `DEMO0${i + 1}`,
  customer_key: String(i + 1), contact_name: 'Sam Taylor', order_count: 4,
  latest_source_order_id: jobs[i].source_order_id, latest_order_no: jobs[i].order_no,
  latest_job_title: titles[i], latest_order_date: '2026-10-16',
}));
const overview = { order_count: 4, open_jobs: 4, spend_12_months: 2480, average_order_value: 620, activity_3_months: 4, top_order_types: [], top_products: [], last_order_date: '2026-10-16' };
app.get('/api/database/outstanding-counts', (_req, res) => res.json({ printing: 8, embroidery: 16, business_gifts: 0, total: 24 }));
app.get('/api/database/status-updates', (_req, res) => res.json({ updates: jobs.slice(0, 8).map((job, i) => ({ ...job, id: i + 1, event_type: 'status', status: job.dashboard_status, statusColor: colors[job.dashboard_status], changed_at: '2026-10-20T10:30:00Z' })) }));
app.get('/api/database/job-options', (_req, res) => res.json({ jobs }));
app.get('/api/database/jobs', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const selected = jobs.filter(job => JSON.stringify(job).toLowerCase().includes(q));
  res.json({ jobs: selected, total: selected.length, hasMore: false, limit: 100, offset: 0, dashboardStatusColors: colors });
});
app.get('/api/database/jobs/:id', (req, res) => {
  const job = jobs.find(job => String(job.source_order_id) === req.params.id);
  if (!job) return res.status(404).json({ error: 'Sample order not found.' });
  res.json({ job, lineItems: [
    { source_line_item_id: 1, source_order_line_id: 1, source_order_id: job.source_order_id, style_code: 'RX101', style_name: 'Pro polo', line_description: 'Pro polo', colour: 'Navy', size: 'M', quantity: 24, unit_cost: 5.70, unit_price: 12.50, vat_rate: 20 },
    { source_line_item_id: 2, source_order_line_id: 2, source_order_id: job.source_order_id, style_code: 'RX101', style_name: 'Pro polo', line_description: 'Pro polo', colour: 'Navy', size: 'L', quantity: 24, unit_cost: 5.70, unit_price: 12.50, vat_rate: 20 },
  ], positions: [], proofFiles: [], files: [], customerOverview: overview });
});
app.get('/api/database/customers/search', (_req, res) => res.json({ customers }));
app.get('/api/database/customers', (_req, res) => res.json({ customers }));
app.get('/api/database/customers/:key', (req, res) => {
  const customer = customers.find(customer => String(customer.customer_id) === req.params.key.replace(/^id:/, '')) || customers[0];
  res.json({ customer, orders: jobs.filter(job => job.customer_id === customer.customer_id), contacts: [], addresses: [], designNumbers: [], customerOverview: overview });
});
app.get('/api/database/users', (_req, res) => res.json({ users: [{ id: 1, first_name: 'Alex', last_name: 'Morgan', email: 'sample@example.com' }], signupRequests: [], canManageUsers: true }));
app.get('/api/database/visuals', (_req, res) => res.json({ visuals: [], total: 0, hasMore: false }));
app.get('/api/database/products/styles', (_req, res) => res.json({ styles: [], total: 0, hasMore: false }));
app.get('/api/dtf/admin/jobs', (_req, res) => res.json({ jobs: [], total: 0 }));
app.get('/api/database/reports', (_req, res) => {
  const summary = { grossSales: 7200, netSales: 6000, vat: 1200, costOfGoods: 2800, grossProfit: 3200, orderCount: 10 };
  res.json({
    range: 'monthly', rangeLabel: 'Sample October 2026', rangeDescription: 'Fictional design-review figures',
    grain: 'day', periodStart: '2026-10-01', periodEnd: '2026-10-31', availableYears: [2026], summary,
    series: [1, 5, 10, 15, 20].map((day, i) => ({ bucketStart: `2026-10-${String(day).padStart(2, '0')}`, grossSales: 960 + i * 240, netSales: 800 + i * 200, vat: 160 + i * 40, costOfGoods: 400 + i * 80, grossProfit: 400 + i * 120, orderCount: 2 })),
    topCustomers: [], orderTypes: [], orders: [], topOrder: null, basis: 'Fictional sample data for local styling review',
  });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'This local preview supports DATABASE browsing only.' }));
app.get(['/', '/index.html'], (req, res) => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<title>Ultimate Hub · Dashboard</title>', '<title>DATABASE · Local design review · Sample data</title>');
  if (req.query.original === '1') html = html.replace('  <link rel="stylesheet" href="database-retro.css">\n', '').replace(/^\s*<img class="db-home-logo"[^>]+>\n/m, '');
  res.type('html').send(html);
});
app.get('/vendor/pdf-lib.min.js', (_req, res) => res.sendFile(require.resolve('pdf-lib/dist/pdf-lib.min.js')));
app.use('/file-viewer-renderer', express.static(path.resolve(root, '../node_modules/pdfjs-dist/build')));
app.use(express.static(root));
app.listen(3112, '127.0.0.1', () => console.log('DATABASE design review: http://127.0.0.1:3112/?tab=database'));
