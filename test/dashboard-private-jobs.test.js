const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  TEST_DASHBOARD_COLUMNS: columns,
  TEST_DASHBOARD_SUBITEM_COLUMNS: subitemColumns,
  TEST_DASHBOARD_COLUMN_IDS: ids,
  TEST_DASHBOARD_GROUP_IDS: groups,
  PRIVATE_DASHBOARD_TOTAL_COLUMN: totalColumn,
} = require('../src/services/testDashboardDefaults');
const { resolvePrivateDashboardGroupId } = require('../src/services/dashboardAutomation');
const { rememberPrivateDashboardSampling } = require('../src/services/dashboardSampling');

const privateId = 'private_00000000-0000-0000-0000-000000000001';

for (const [type, group] of [
  ['PRINT', groups.PRINT],
  ['EMB', groups.EMBROIDERY],
  ['PRINTED TRANSFER', groups.PRINT],
  ['UV PRINT', groups.PRINT],
  ['EMB / PRINT', groups.EMBROIDERY],
]) {
  test(`private ${type} jobs move into their production group when marked ready`, async () => {
    await withFixture({}, async fixture => {
      const typeResponse = await fixture.select(ids.TYPE, type);
      assert.equal(typeResponse.statusCode, 200);
      assert.equal(typeResponse.body.label, type);
      assert.equal(fixture.snapshot().column_values[ids.TYPE].text, type);
      assert.equal(fixture.snapshot().column_values[ids.STATUS].text, 'AWAITING APPROVAL');
      assert.equal(typeResponse.body.groupId, groups.OFFICE);

      const readyResponse = await fixture.select(ids.STATUS, 'READY TO PRINT');
      assert.equal(readyResponse.statusCode, 200);
      assert.equal(readyResponse.body.groupId, group);
      assert.equal(fixture.snapshot().group_id, group);
      assert.equal(resolvePrivateDashboardGroupId(fixture.snapshot()), group);
      assert.equal(fixture.databaseWrites(), 0);
    });
  });
}

test('setting or changing the type of an already-ready private job persists the new group', async () => {
  await withFixture({ status: 'READY TO PRINT' }, async fixture => {
    for (const [type, group] of [['PRINT', groups.PRINT], ['EMB', groups.EMBROIDERY], ['PRINT', groups.PRINT]]) {
      const response = await fixture.select(ids.TYPE, type);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.groupId, group);
      assert.equal(fixture.snapshot().group_id, group);
      assert.equal(fixture.snapshot().column_values[ids.STATUS].text, 'READY TO PRINT');
      assert.equal(resolvePrivateDashboardGroupId(fixture.snapshot()), group);
    }
    assert.equal(fixture.databaseWrites(), 0);
  });
});

test('private type changes preserve non-ready workflow state and other column values', async () => {
  for (const status of ['HOLD', 'TO SAMPLE', 'SAMPLED', 'IN PRODUCTION', 'COMPLETED']) {
    await withFixture({ status }, async fixture => {
      const before = fixture.snapshot();
      assert.equal((await fixture.select(ids.TYPE, 'PRINT')).statusCode, 200);
      const after = fixture.snapshot();
      delete after.column_values[ids.TYPE];
      assert.deepEqual(after, before);
      assert.equal(fixture.databaseWrites(), 0);
    });
  }
});

test('private jobs retain status moves, completion cleanup, and invoiced archiving', async () => {
  await withFixture({}, async fixture => {
    await fixture.select(ids.TYPE, 'PRINT');
    for (const [status, group] of [
      ['HOLD', groups.HOLD], ['TO SAMPLE', groups.TO_SAMPLE], ['SAMPLED', groups.OFFICE],
      ['NO STOCK', groups.PRE_PRODUCTION], ['READY TO PRINT', groups.PRINT], ['COMPLETED', groups.COMPLETED],
    ]) {
      const response = await fixture.select(ids.STATUS, status);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.groupId, group);
      assert.equal(fixture.snapshot().column_values[ids.STATUS].text, status);
    }
    for (const id of [ids.PRIORITY, ids.DATE, ids.TRANS, ids.JAQ]) {
      assert.equal(fixture.snapshot().column_values[id], undefined);
    }
    assert.equal((await fixture.select(ids.STATUS, 'INVOICED')).body.archived, true);
    assert.equal(fixture.databaseWrites(), 0);
  });
});

test('private TYPE validation rejects unconfigured values and clearing without changing the job', async () => {
  await withFixture({}, async fixture => {
    const before = fixture.snapshot();
    assert.equal((await fixture.select(ids.TYPE, 'Unknown')).statusCode, 400);
    assert.equal((await fixture.select(ids.TYPE, '', { clear: true })).statusCode, 400);
    assert.deepEqual(fixture.snapshot(), before);
  });
});

test('DATABASE jobs cannot override their source type through the dashboard API', async () => {
  await withFixture({ databaseJob: true }, async fixture => {
    const response = await fixture.select(ids.TYPE, 'EMB');
    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /TYPE is editable only for private dashboard jobs/);
    assert.equal(fixture.databaseWrites(), 0);
  });
});

test('TYPE renders as a picker only on private parent rows, with the configured type options', () => {
  const ui = loadFrontend();
  const column = columns.find(column => column.id === ids.TYPE);
  const privateJob = { id: privateId, dashboard_private_job: true, database_job: null };
  const databaseJob = { id: '50503', database_job: { source_order_id: 50503 } };
  const render = (entity, subitem = false) => {
    const cell = ui.document.createElement('div');
    ui.renderStatusValue(cell, null, column, '', { entity, subitem });
    return cell.children[0];
  };
  const badge = render(privateJob);
  assert.equal(badge.tagName, 'button');
  assert.equal(badge.attributes['aria-label'], 'Set job type');
  assert.equal(badge.attributes['aria-haspopup'], 'menu');
  assert.equal(typeof badge.events.click, 'function');
  assert.equal(render(databaseJob).tagName, 'span');
  assert.equal(render(privateJob, true).tagName, 'span');
  assert.equal(render({ ...privateJob, database_job: databaseJob.database_job }).tagName, 'span');
  assert.deepEqual(Array.from(ui.getStatusOptions(column), option => option.label),
    ['EMB', 'EMB / PRINT', 'HOLD', 'PRINT', 'PRINTED TRANSFER', 'UV PRINT']);
});

test('private TOTAL saves, survives status changes and board reloads, and can be cleared', async () => {
  await withFixture({}, async fixture => {
    for (const total of ['24', '0', '1250', '']) {
      const before = fixture.snapshot();
      const response = await fixture.saveTotal(total);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.value, total);
      const saved = fixture.snapshot();
      assert.equal(saved.column_values[totalColumn.id].text, total);
      delete saved.column_values[totalColumn.id];
      delete before.column_values[totalColumn.id];
      assert.deepEqual(saved, before);
      const item = await fixture.boardItem();
      assert.equal(item.column_values.find(value => value.id === totalColumn.id).text, total);
      assert.deepEqual(item.subitems, []);
    }
    await fixture.saveTotal('24');
    await fixture.select(ids.TYPE, 'PRINT');
    await fixture.select(ids.STATUS, 'READY TO PRINT');
    await fixture.select(ids.STATUS, 'COMPLETED');
    assert.equal(fixture.snapshot().column_values[totalColumn.id].text, '24');
    assert.equal(fixture.databaseWrites(), 0);
  });
});

test('invalid private totals and DATABASE total overrides are rejected without writes', async () => {
  await withFixture({}, async fixture => {
    const before = fixture.snapshot();
    for (const value of ['-1', '1.5', 'twelve', '1e3', '9007199254740992']) {
      assert.equal((await fixture.saveTotal(value)).statusCode, 400);
      assert.deepEqual(fixture.snapshot(), before);
    }
  });
  await withFixture({ databaseJob: true }, async fixture => {
    assert.equal((await fixture.saveTotal('24')).statusCode, 400);
    assert.equal(fixture.databaseWrites(), 0);
  });
});

test('private TOTAL is editable and displayed without subitems, while real totals are calculated', () => {
  const ui = loadFrontend();
  const privateJob = {
    id: privateId, dashboard_private_job: true, database_job: null,
    column_values: [{ id: totalColumn.id, text: '24' }], subitems: [],
  };
  assert.equal(ui.getDashboardParentTotalText(privateJob, null), '24');
  const input = ui.buildParentTotalCell(privateJob, {}).children[0];
  assert.equal(input.tagName, 'input');
  assert.equal(input.value, '24');
  assert.equal(input.inputMode, 'numeric');
  assert.equal(input.attributes['aria-label'], 'Set TOTAL');
  assert.equal(typeof input.events.blur, 'function');
  let blurred = false;
  input.blur = () => { blurred = true; };
  input.events.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(blurred, true);
  input.value = '99';
  input.events.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(input.value, '24');

  const databaseJob = {
    ...privateJob, id: '50503', dashboard_private_job: false, database_job: { source_order_id: 50503 },
    subitems: [{ column_values: [{ id: 'qty', text: '4' }] }, { column_values: [{ id: 'qty', text: '6' }] }],
  };
  const total = ui.buildParentTotalCell(databaseJob, { qtyColumn: { id: 'qty' } }).children[0];
  assert.equal(total.tagName, 'span');
  assert.equal(total.textContent, '10');
});

test('editing private TOTAL saves through the text endpoint and refreshes the board', async () => {
  const ui = loadFrontend();
  const item = { id: privateId, dashboard_private_job: true, column_values: [], subitems: [] };
  const input = ui.buildParentTotalCell(item, {}).children[0];
  input.value = '24';
  let refreshed = false;
  ui.fetch = async (url, options) => {
    assert.equal(url, `/api/test-dashboard/items/${privateId}/text-column`);
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { columnId: totalColumn.id, value: '24' });
    return { ok: true };
  };
  ui.loadTestBoard = async options => { refreshed = options.forceRefresh; };
  await ui.saveTestTextInput(input, item, totalColumn);
  assert.equal(refreshed, true);
  assert.equal(input.disabled, false);
});

async function withFixture(options, run) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/test-dashboard');
  const originals = [require.cache[poolPath], require.cache[routePath]];
  const value = (id, text) => ({ id, text, type: 'status', value: '{}' });
  let row = {
    id: privateId, item_name: 'Trudi - b-day t-shirts', group_id: groups.OFFICE, archived: false,
    column_values: {
      [ids.STATUS]: value(ids.STATUS, options.status || 'AWAITING APPROVAL'),
      [ids.PRIORITY]: value(ids.PRIORITY, 'High'),
      [ids.DATE]: { id: ids.DATE, text: '2026-09-30', type: 'date' },
      [ids.TRANS]: { id: ids.TRANS, text: 'v', type: 'checkbox' },
      [ids.JAQ]: { id: ids.JAQ, text: 'v', type: 'checkbox' },
    },
  };
  row = rememberPrivateDashboardSampling(row);
  const queries = [];
  const rows = data => ({ rows: structuredClone(data), rowCount: data.length });
  const pool = { async query(sql, values = []) {
    queries.push(sql);
    if (sql.includes('FROM test_dashboard_columns') && sql.trimStart().startsWith('SELECT')) return rows(values[0] ? subitemColumns : columns);
    if (sql.includes('FROM test_dashboard_private_jobs')) return rows([row]);
    if (sql.includes('FROM database_jobs')) return rows(options.databaseJob ? [{ source_order_id: 50503, order_type: 'Printing' }] : []);
    if (sql.includes('UPDATE test_dashboard_private_jobs')) {
      assert.equal(values[0], privateId);
      row = { ...row, group_id: values[1], item_name: values[2], column_values: structuredClone(values[3]), archived: values[4] };
      return rows([row]);
    }
    return rows([]);
  } };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: pool };
  delete require.cache[routePath];
  try {
    const { protectedRouter } = require('../src/routes/test-dashboard');
    async function request(endpoint, body, method = 'put') {
      const route = protectedRouter.stack.find(layer => layer.route?.path === endpoint && layer.route.methods[method]);
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
      await route.route.stack[0].handle({ params: { jobId: options.databaseJob ? '50503' : privateId }, body }, response);
      return response;
    }
    await run({
      snapshot: () => structuredClone(row),
      databaseWrites: () => queries.filter(sql => /(?:UPDATE|INSERT INTO|DELETE FROM) (?:database_jobs|test_dashboard_job_state)\b/.test(sql)).length,
      async select(columnId, label, extra = {}) {
        return request('/api/test-dashboard/items/:jobId/status-column', { columnId, label, ...extra });
      },
      async saveTotal(value) {
        return request('/api/test-dashboard/items/:jobId/text-column', { columnId: totalColumn.id, value });
      },
      async boardItem() {
        const response = await request('/api/test-dashboard/board', null, 'get');
        assert.equal(response.statusCode, 200);
        return response.body.boards[0].groups.flatMap(group => group.items_page.items).find(item => item.id === privateId);
      },
    });
  } finally {
    [poolPath, routePath].forEach((file, index) => {
      if (originals[index]) require.cache[file] = originals[index]; else delete require.cache[file];
    });
  }
}

function loadFrontend() {
  const ui = {
    CSS: { escape: String }, URLSearchParams, clearInterval() {}, setInterval() {}, console,
    document: {
      addEventListener() {},
      createElement(tagName) {
        return {
          tagName, attributes: {}, children: [], events: {}, style: {}, dataset: {}, classList: { add() {}, remove() {} },
          appendChild(child) { this.children.push(child); },
          setAttribute(name, value) { this.attributes[name] = value; },
          addEventListener(name, handler) { this.events[name] = handler; },
        };
      },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    window: {
      addEventListener() {}, location: { origin: 'https://example.test', hash: '', search: '' },
      matchMedia() { return { matches: false, addEventListener() {} }; },
    },
  };
  ui.window.localStorage = ui.localStorage;
  vm.createContext(ui);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8'), ui);
  return ui;
}
