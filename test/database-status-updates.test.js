const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('status update API returns newest dashboard transitions with dashboard colors', async () => {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const fakePool = {
    async query(sql, values = []) {
      queries.push({ text: sql, values });
      return {
        rows: [
          {
            id: 43,
            source_order_id: 8001,
            event_type: 'invoiced',
            previous_status: null,
            status: 'INVOICED',
            changed_at: '2026-08-25T09:32:00.000Z',
            order_no: 8101,
            customer_name: 'Example Customer',
            job_title: 'Team Hoodies',
          },
          {
            id: 42,
            source_order_id: 8001,
            event_type: 'approved',
            previous_status: null,
            status: 'APPROVED',
            changed_at: '2026-08-25T09:31:00.000Z',
            order_no: 8101,
            customer_name: 'Example Customer',
            job_title: 'Team Hoodies',
          },
          {
            id: 41,
            source_order_id: 8001,
            event_type: 'status',
            previous_status: 'CHECKED IN',
            status: 'COMPLETED',
            changed_at: '2026-08-25T09:30:00.000Z',
            order_no: 8101,
            customer_name: 'Example Customer',
            job_title: 'Team Hoodies',
          },
        ],
      };
    },
  };

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: fakePool,
  };
  delete require.cache[routePath];

  try {
    const router = require('../src/routes/database');
    const route = router.stack.find(layer => (
      layer.route?.path === '/api/database/status-updates'
      && layer.route?.methods?.get
    ));
    assert.ok(route, 'status-updates route is registered');

    const response = createResponse();
    await route.route.stack[0].handle({ query: { limit: '25' } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.updates.length, 3);
    assert.deepEqual(
      response.body.updates.map(update => update.statusColor),
      ['#ff007f', '#00c875', '#00c875']
    );
    assert.deepEqual(queries[0].values, [25]);
    assert.match(queries[0].text, /ORDER BY activity\.changed_at DESC, activity\.id DESC/);
    assert.match(queries[0].text, /JOIN database_jobs job/);
    assert.match(queries[0].text, /job\.order_owner_user_id/);
    assert.match(queries[0].text, /job\.order_owner_name/);
    assert.match(queries[0].text, /job\.order_taken_by/);
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
});

test('database schema records status and approval events and preserves import history', () => {
  const schema = fs.readFileSync(path.join(root, 'src', 'db', 'databaseSchema.js'), 'utf8');
  const importer = fs.readFileSync(path.join(root, 'scripts', 'import-database-mdb.js'), 'utf8');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS database_job_status_updates/);
  assert.match(schema, /AFTER UPDATE OF dashboard_status, proof_approved ON database_jobs/);
  assert.match(schema, /NEW\.proof_approved IS TRUE AND OLD\.proof_approved IS NOT TRUE/);
  assert.match(schema, /'approved',[\s\S]*'APPROVED'/);
  assert.match(schema, /current_setting\('ultimate_hub\.skip_status_activity', TRUE\) IS DISTINCT FROM 'on'/);
  assert.match(schema, /ON CONFLICT \(source_order_id, event_type, status, changed_at\) DO NOTHING/);
  assert.match(schema, /NOT EXISTS \([\s\S]*activity\.source_order_id = j\.source_order_id/);
  assert.match(importer, /set_config\('ultimate_hub\.skip_status_activity', 'on', true\)/);
  assert.match(
    sourceBetween(schema, 'CREATE TABLE IF NOT EXISTS database_job_status_updates', 'CREATE OR REPLACE FUNCTION'),
    /REFERENCES database_jobs\(source_order_id\) ON DELETE CASCADE/
  );
  assert.match(importer, /CREATE TEMP TABLE database_job_status_updates_import_snapshot/);
  assert.match(importer, /FROM database_job_status_updates_import_snapshot snapshot/);
});

test('database home renders a compact retro scrollable newest-first status feed', () => {
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const database = fs.readFileSync(path.join(root, 'public', 'database.js'), 'utf8');
  const shadeRenderer = sourceBetween(database, 'function shadeHomeStatusUpdates', 'function renderHomeStatusUpdate');
  const renderer = sourceBetween(database, 'function renderHomeStatusUpdate', 'function showHome');
  const openOrders = index.indexOf('class="db-outstanding-actions"');
  const statusFeed = index.indexOf('class="db-status-updates"');
  const rightMenu = index.indexOf('class="db-menu-column db-menu-right"');

  assert.ok(openOrders < statusFeed && statusFeed < rightMenu);
  assert.doesNotMatch(index, /id="db-status-updates-title"/);
  assert.match(styles, /\.db-outstanding-actions\{[\s\S]*top:84px;/);
  assert.match(index, /data-db-action="toggle-home-logs"[\s\S]*aria-controls="db-status-updates-panel"[\s\S]*>Hide logs<\/button>/);
  assert.match(index, /id="db-status-updates-panel" class="db-status-updates"/);
  assert.match(styles, /\.db-home-logs-toggle\{[\s\S]*top:184px;[\s\S]*width:76px;[\s\S]*height:18px;[\s\S]*font:10px Arial/);
  assert.match(styles, /\.db-status-updates\[hidden\]\{[\s\S]*display:none;/);
  assert.match(styles, /\.db-status-updates\{[\s\S]*top:212px;[\s\S]*width:400px;[\s\S]*height:183px;[\s\S]*margin-left:-200px;/);
  assert.match(styles, /\.db-status-updates\{[\s\S]*background:#fff;[\s\S]*font:10px Arial/);
  assert.match(styles, /\.db-status-updates-list\{[\s\S]*overflow-y:auto;[\s\S]*background:#fff;/);
  assert.match(styles, /\.db-status-update\{[\s\S]*height:23px;[\s\S]*text-overflow:ellipsis;[\s\S]*white-space:nowrap;[\s\S]*cursor:pointer;/);
  assert.match(styles, /\.db-status-update\.is-light\{[\s\S]*background:#fff;/);
  assert.match(styles, /\.db-status-update\.is-dark\{[\s\S]*background:#f4f4f4;/);
  assert.doesNotMatch(styles, /\.db-status-updates-list\{[^}]*background-attachment:/s);
  assert.match(styles, /\.db-status-update:hover,[\s\S]*\.db-status-update:focus-visible\{[\s\S]*box-shadow:inset 0 0 0 1px #2f6f8f;/);
  assert.match(styles, /\.db-status-update-job-number\{[\s\S]*color:#2f6f8f;[\s\S]*font-weight:800;/);
  assert.match(styles, /\.db-status-update-job-title\{[\s\S]*color:#000;[\s\S]*font-weight:700;/);
  assert.match(styles, /\.db-status-update-connector\{[\s\S]*color:#000;[\s\S]*font-weight:400;/);
  assert.match(styles, /\.db-status-update-status\{[\s\S]*font-weight:900;/);
  assert.doesNotMatch(renderer, /customer_name/);
  assert.match(database, /homeStatusUpdateShades: new Map\(\)/);
  assert.match(shadeRenderer, /findIndex\(key => state\.homeStatusUpdateShades\.has\(key\)\)/);
  assert.match(shadeRenderer, /shades\[index\] = shades\[index \+ 1\] === 'dark' \? 'light' : 'dark';/);
  assert.match(shadeRenderer, /state\.homeStatusUpdateShades = new Map/);
  assert.match(renderer, /const jobNumber = String\(update\?\.order_no \|\| update\?\.source_order_id \|\| ''\)\.trim\(\);/);
  assert.match(renderer, /const identity = \[jobNumber, jobTitle\]\.filter\(Boolean\)\.join\(' '\)/);
  assert.match(renderer, /class="db-status-update is-\$\{shade === 'dark' \? 'dark' : 'light'\}" data-db-status-job="\$\{escapeAttr\(sourceOrderId\)\}" role="link" tabindex="0"/);
  assert.match(renderer, /class="db-status-update-job-number"/);
  assert.match(database, /const checkedIn = eventType === 'status' && normalizedStatus === 'CHECKED IN';/);
  assert.match(database, /let connector = completedAction \|\| checkedIn \? 'has been' : 'is now';/);
  assert.match(database, /normalizedStatus === 'AWAITING APPROVAL'\) connector = 'is';/);
  assert.match(database, /normalizedStatus === 'STOCK ORDERED'\) connector = 'has had';/);
  assert.match(database, /normalizedStatus === 'NO STOCK'\) connector = 'has';/);
  assert.match(database, /\(status \|\| 'UPDATED'\)\.toUpperCase\(\)/);
  assert.match(database, /DATABASE_STATUS_UPDATES_POLL_MS = 5000/);
  assert.match(database, /\/api\/database\/status-updates\?limit=/);
  assert.match(database, /homeStatusUpdates\?\.addEventListener\('click', handleHomeStatusUpdateClick\)/);
  assert.match(database, /homeStatusUpdates\?\.addEventListener\('keydown', handleHomeStatusUpdateKeydown\)/);
  assert.match(database, /homeLogsVisible: true/);
  assert.match(database, /function toggleHomeLogs\(\)/);
  assert.match(database, /els\.homeStatusPanel\.hidden = !visible/);
  assert.match(database, /visible \? 'Hide logs' : 'Show logs'/);
  assert.match(database, /openOrder\(sourceOrderId, 'details'\);/);
});

test('Logs button opens the larger restorable Logs activity table', () => {
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const database = fs.readFileSync(path.join(root, 'public', 'database.js'), 'utf8');
  const logsMarkup = sourceBetween(index, 'id="db-logs-view"', '</section>');
  const logsRenderer = sourceBetween(database, 'function renderLogsUpdate', 'function handleLogsRowClick');

  assert.match(index, /class="db-raised-button db-blue-link"[^>]*data-db-action="logs">Logs<\/button>/);
  assert.match(logsMarkup, /class="db-logs-heading">Logs/);
  assert.match(logsMarkup, /<th>Timestamp<\/th>[\s\S]*<th>Job number<\/th>[\s\S]*<th>Customer<\/th>[\s\S]*<th>Job title<\/th>[\s\S]*<th>Job owner<\/th>[\s\S]*<th>Update<\/th>/);
  assert.match(styles, /\.db-logs-table-frame\{[\s\S]*height:486px;[\s\S]*background:#fff;/);
  assert.match(styles, /#db-logs-table \.db-logs-row\.is-light,[\s\S]*background:#fff;/);
  assert.match(styles, /#db-logs-table \.db-logs-row\.is-dark,[\s\S]*background:#f4f4f4;/);
  assert.match(styles, /\.db-logs-status\{[\s\S]*font-weight:900;/);
  assert.match(database, /DATABASE_LOGS_LIMIT = 250/);
  assert.match(database, /if \(route\.view === 'logs'\)[\s\S]*showLogs\(\{ skipHistory: true, skipPersistence: true \}\)/);
  assert.match(database, /function showLogs\(options = \{\}\)[\s\S]*loadLogsUpdates\(\)/);
  assert.match(database, /state\.activeView === 'logs'\) loadLogsUpdates\(\)/);
  assert.match(logsRenderer, /class="db-logs-row is-\$\{shade === 'dark' \? 'dark' : 'light'\}" data-db-logs-job="\$\{escapeAttr\(sourceOrderId\)\}" role="link" tabindex="0"/);
  assert.match(logsRenderer, /class="db-logs-timestamp"/);
  assert.match(logsRenderer, /class="db-logs-job-number"/);
  assert.match(logsRenderer, /class="db-logs-customer"/);
  assert.match(logsRenderer, /class="db-logs-job-title"/);
  assert.match(logsRenderer, /class="db-logs-owner"/);
  assert.match(logsRenderer, /class="db-logs-status" style="color:/);
  assert.match(database, /logsBody\?\.addEventListener\('click', handleLogsRowClick\)/);
  assert.match(database, /logsBody\?\.addEventListener\('keydown', handleLogsRowKeydown\)/);
  assert.match(database, /row\?\.dataset\.dbLogsJob/);
});

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `${startMarker} should exist`);
  assert.notEqual(end, -1, `${endMarker} should exist`);
  return source.slice(start, end);
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
