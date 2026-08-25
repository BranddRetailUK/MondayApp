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
        rows: [{
          id: 41,
          source_order_id: 8001,
          previous_status: 'CHECKED IN',
          status: 'COMPLETED',
          changed_at: '2026-08-25T09:30:00.000Z',
          order_no: 8101,
          customer_name: 'Example Customer',
          job_title: 'Team Hoodies',
        }],
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
    assert.equal(response.body.updates.length, 1);
    assert.equal(response.body.updates[0].statusColor, '#00c875');
    assert.deepEqual(queries[0].values, [25]);
    assert.match(queries[0].text, /ORDER BY activity\.changed_at DESC, activity\.id DESC/);
    assert.match(queries[0].text, /JOIN database_jobs job/);
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
});

test('database schema records only real status transitions and preserves import history', () => {
  const schema = fs.readFileSync(path.join(root, 'src', 'db', 'databaseSchema.js'), 'utf8');
  const importer = fs.readFileSync(path.join(root, 'scripts', 'import-database-mdb.js'), 'utf8');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS database_job_status_updates/);
  assert.match(schema, /AFTER UPDATE OF dashboard_status ON database_jobs/);
  assert.match(schema, /WHEN \(NEW\.dashboard_status IS DISTINCT FROM OLD\.dashboard_status\)/);
  assert.match(schema, /current_setting\('ultimate_hub\.skip_status_activity', TRUE\) IS DISTINCT FROM 'on'/);
  assert.match(schema, /ON CONFLICT \(source_order_id, status, changed_at\) DO NOTHING/);
  assert.match(schema, /NOT EXISTS \([\s\S]*activity\.source_order_id = j\.source_order_id/);
  assert.match(importer, /set_config\('ultimate_hub\.skip_status_activity', 'on', true\)/);
  assert.match(
    sourceBetween(schema, 'CREATE TABLE IF NOT EXISTS database_job_status_updates', 'CREATE OR REPLACE FUNCTION'),
    /REFERENCES database_jobs\(source_order_id\) ON DELETE CASCADE/
  );
  assert.match(importer, /CREATE TEMP TABLE database_job_status_updates_import_snapshot/);
  assert.match(importer, /FROM database_job_status_updates_import_snapshot snapshot/);
});

test('database home renders a retro scrollable newest-first status feed', () => {
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const database = fs.readFileSync(path.join(root, 'public', 'database.js'), 'utf8');
  const openOrders = index.indexOf('class="db-outstanding-actions"');
  const statusFeed = index.indexOf('class="db-status-updates"');
  const rightMenu = index.indexOf('class="db-menu-column db-menu-right"');

  assert.ok(openOrders < statusFeed && statusFeed < rightMenu);
  assert.match(styles, /\.db-status-updates\{[\s\S]*top:228px;[\s\S]*width:360px;[\s\S]*height:167px;[\s\S]*background:#fff;/);
  assert.match(styles, /\.db-status-updates-list\{[\s\S]*overflow-y:auto;[\s\S]*background:#fff;/);
  assert.match(styles, /\.db-status-update-job\{[\s\S]*color:#000;[\s\S]*font-weight:700;/);
  assert.match(styles, /\.db-status-update-connector\{[\s\S]*color:#000;[\s\S]*font-weight:400;/);
  assert.match(database, /const identity = \[customer, jobTitle\]\.filter\(Boolean\)\.join\(' — '\)/);
  assert.match(database, /const checkedIn = normalizedStatus === 'CHECKED IN';/);
  assert.match(database, /const connector = checkedIn \? 'has been' : 'is now';/);
  assert.match(database, /DATABASE_STATUS_UPDATES_POLL_MS = 5000/);
  assert.match(database, /\/api\/database\/status-updates\?limit=/);
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
