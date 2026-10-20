const test = require('node:test');
const assert = require('node:assert/strict');
const { coalesceReads } = require('../src/services/dashboardReads');

test('concurrent board reads share work, fresh reads bypass it, and completed/error results are never cached', async () => {
  let count = 0, release;
  const read = coalesceReads(async () => { const n = ++count; if (n === 1) await new Promise(r => release = r); return n; });
  const a = read(), b = read();
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(await read(true), 2);
  release();
  assert.equal(await a, 1);
  assert.equal(await read(), 3);
  let failures = 0;
  const retry = coalesceReads(async () => { if (++failures === 1) throw Error('temporary'); return 'fresh'; });
  await assert.rejects(retry(), /temporary/);
  assert.equal(await retry(), 'fresh');
});

test('board GET is read-only; unchanged responses are 304 and validators isolate permissions', async () => {
  const pool = require('../src/db/pool');
  const original = pool.query;
  const queries = [];
  let title = 'Office';
  pool.query = async sql => {
    sql = typeof sql === 'string' ? sql : sql.text;
    queries.push(sql);
    assert.match(sql.trim(), /^SELECT|^WITH/);
    return { rows: sql.includes('FROM test_dashboard_groups') ? [{ id: 'office', title, position: 1 }] : [], rowCount: 0 };
  };
  const express = require('express');
  const app = express();
  app.use((req, res, next) => { req.hubUser = {email: req.get('X-Test-Production') ? 'production@ultimatepromotions.co.uk' : 'ordinary@example.com', access_scope:'full'}; next(); });
  app.use(require('../src/routes/test-dashboard').protectedRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/test-dashboard/board`;
  try {
    const first = await fetch(url); assert.equal(first.status, 200);
    const tag = first.headers.get('etag'); assert.ok(tag);
    const ordinary = await first.json();
    const same = await fetch(url, {headers:{'If-None-Match':tag}});
    assert.equal(same.status, 304); assert.equal(await same.text(), '');
    const compressed = await fetch(url, {headers:{'If-None-Match':`"older", W/${tag}`,'Cache-Control':'no-cache'}});
    assert.equal(compressed.status, 304); assert.equal(await compressed.text(), '');
    const privileged = await fetch(url,{headers:{'If-None-Match':tag,'X-Test-Production':'1'}});
    assert.equal(privileged.status,200);
    assert.notEqual(privileged.headers.get('etag'),tag);
    assert.equal((await privileged.json()).boards[0].columns.length, ordinary.boards[0].columns.length + 1);
    title = 'Changed title';
    const changed = await fetch(url,{headers:{'If-None-Match':tag}});
    assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),tag);
    assert.ok(queries.length > 0);
  } finally { pool.query = original; server.closeAllConnections(); await new Promise(r => server.close(r)); }
});

test('public assets bypass session SQL, protected pages and APIs still enforce auth', async () => {
  const pool = require('../src/db/pool');
  const original = pool.query;
  let lookups = 0;
  pool.query = async () => { lookups++; return {rows:[],rowCount:0}; };
  const app = require('../src/app');
  const server = app.listen(0,'127.0.0.1');
  await new Promise(r => server.once('listening',r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = {Cookie:'uh_session=expired-test-session'};
  try {
    for (const asset of ['/script.js','/database.js','/styles.css']) {
      assert.equal((await fetch(url+asset,{headers})).status,200);
    }
    assert.equal(lookups,0);
    const page = await fetch(url+'/',{headers,redirect:'manual'});
    assert.equal(page.status,302);assert.match(page.headers.get('location'),/^\/login/);
    assert.equal((await fetch(url+'/api/database/jobs',{headers})).status,401);
    assert.equal((await fetch(url+'/database-job.html',{headers,redirect:'manual'})).status,302);
    assert.equal((await fetch(url+'/vendor/pdf-lib.min.js',{headers,redirect:'manual'})).status,302);
    assert.ok(lookups >= 4);
  } finally { pool.query=original;server.closeAllConnections();await new Promise(r=>server.close(r)); }
});

test('default migration is recorded once and startup repairs never run on board reads', async () => {
  const pool = require('../src/db/pool');
  const query = pool.query, connect = pool.connect;
  const applied = new Set(); let writes = 0, reorders = 0;
  const client = {release(){},async query(sql) {
    if(sql.startsWith('SELECT version')) { const exists = applied.has(sql.match(/version = '([^']+)'/)[1]); return {rows:exists?[{}]:[],rowCount:exists?1:0}; }
    if(sql.startsWith('INSERT INTO hub_data_migrations')) applied.add(sql.match(/VALUES \('([^']+)'\)/)[1]);
    if(sql.includes('SET position = ordered.new_position')) reorders++;
    if(/INSERT INTO test_dashboard_(groups|columns)/.test(sql)) writes++;
    return {rows:[],rowCount:0};
  }};
  pool.connect=async()=>client;
  pool.query=async()=>({rows:[],rowCount:0});
  try {
    const {initializeDashboardData}=require('../src/routes/test-dashboard');
    await initializeDashboardData();assert.equal(writes,32);assert.equal(reorders,1);
    await initializeDashboardData();assert.equal(writes,32);assert.equal(reorders,1);
  } finally {pool.query=query;pool.connect=connect;}
});

test('existing dashboard columns move Files after Visual once, preserving subitems', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  const pool = require('../src/db/pool');
  const originalQuery = pool.query, originalConnect = pool.connect;
  await db.exec(`CREATE TABLE hub_data_migrations (version TEXT PRIMARY KEY);
    INSERT INTO hub_data_migrations VALUES ('dashboard-defaults-v1');
    CREATE TABLE test_dashboard_columns (id TEXT, is_subitem BOOLEAN, position INTEGER, updated_at TIMESTAMPTZ);
    INSERT INTO test_dashboard_columns VALUES
      ('file_mky43tg9', FALSE, 8, NULL), ('label__1', FALSE, 9, NULL),
      ('text9', FALSE, 12, NULL), ('files_1', FALSE, 13, NULL), ('image', FALSE, 14, NULL),
      ('files_1', TRUE, 7, NULL);`);
  pool.connect = async () => ({ release() {}, async query(sql, values) {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.rows.length };
  }});
  pool.query = async () => ({ rows: [], rowCount: 0 });
  try {
    const { initializeDashboardData } = require('../src/routes/test-dashboard');
    await initializeDashboardData();
    const rows = (await db.query('SELECT id FROM test_dashboard_columns WHERE is_subitem = FALSE ORDER BY position')).rows;
    assert.deepEqual(rows.map(row => row.id), ['file_mky43tg9', 'files_1', 'label__1', 'text9', 'image']);
    assert.equal((await db.query('SELECT position FROM test_dashboard_columns WHERE is_subitem = TRUE')).rows[0].position, 7);
    await initializeDashboardData();
    assert.deepEqual((await db.query('SELECT id FROM test_dashboard_columns WHERE is_subitem = FALSE ORDER BY position')).rows, rows);
    const { TEST_DASHBOARD_COLUMNS } = require('../src/services/testDashboardDefaults');
    assert.equal(TEST_DASHBOARD_COLUMNS.find(c => c.id === 'files_1').position,
      TEST_DASHBOARD_COLUMNS.find(c => c.id === 'file_mky43tg9').position + 1);
  } finally { pool.query = originalQuery; pool.connect = originalConnect; await db.close(); }
});
