const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { SAMPLE_REQUIRED_MESSAGE, JOB_APPROVAL_REQUIRED_MESSAGE } = require('../src/services/dashboardSampling');
const { TEST_DASHBOARD_COLUMNS, TEST_DASHBOARD_COLUMN_IDS: ids } = require('../src/services/testDashboardDefaults');

test('approval shows the sampling warning before optimistic changes or a request', async () => {
  const ui = loadFrontend({ blocked: true });
  await ui.updateTestDashboardCheckbox('50503', { id: ids.JOB, title: 'JOB ✔' }, true);
  assert.deepEqual(ui.warnings, [{ message: SAMPLE_REQUIRED_MESSAGE, title: undefined }]);
  assert.equal(ui.requests, 0);
});

test('READY TO PRINT shows the sampling warning before changing or sending status', async () => {
  const ui = loadFrontend({ blocked: true });
  await ui.selectStatusOption({ label: 'READY TO PRINT' });
  assert.deepEqual(ui.warnings, [{ message: SAMPLE_REQUIRED_MESSAGE, title: 'Status blocked' }]);
  assert.equal(ui.requests, 0);
});

test('sampled but unapproved jobs receive the JOB approval warning', async () => {
  const ui = loadFrontend({ required: true, sampled: true, blocked: false });
  await ui.selectStatusOption({ label: 'READY TO PRINT' });
  assert.equal(ui.warnings[0].message, JOB_APPROVAL_REQUIRED_MESSAGE);
  assert.equal(ui.requests, 0);
});

test('sampled jobs with proof and design pass approval checks and approved jobs pass readiness', () => {
  const ui = loadFrontend({ required: true, sampled: true, blocked: false }, true);
  assert.equal(ui.getTestDashboardApprovalReadiness('50503').ok, true);
  const state = { itemId: '50503', context: 'test-dashboard', columnTitle: 'STATUS' };
  assert.equal(ui.testDashboardReadyStatusBlockMessage(state, { label: 'READY TO PRINT' }), '');
  assert.equal(ui.testDashboardReadyStatusBlockMessage(state, { label: 'SAMPLED' }), '');
});

test('a stale browser still displays an API sampling rejection and refreshes the board', async () => {
  const ui = loadFrontend({ blocked: false });
  ui.fetch = async () => { ui.requests += 1; return { ok: false }; };
  ui.readApiError = async () => SAMPLE_REQUIRED_MESSAGE;
  ui.updateCachedBoardCheckboxValue = () => {};
  ui.rerenderBoardContext = () => {};
  let refreshes = 0;
  ui.loadTestBoard = async () => { refreshes += 1; };
  await ui.updateTestDashboardCheckbox('50503', { id: ids.JOB, title: 'JOB ✔' }, true);
  assert.equal(ui.requests, 1);
  assert.equal(refreshes, 1);
  assert.equal(ui.warnings[0].message, SAMPLE_REQUIRED_MESSAGE);
  assert.equal(vm.runInContext('__testCheckboxOptimisticValues.size', ui), 0);
});

function loadFrontend(sampling, approved = false) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const ui = {
    CSS: { escape: String }, URLSearchParams, clearInterval() {}, setInterval() {},
    console: { warn() {} }, document: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    warnings: [], requests: 0,
    window: {
      addEventListener() {}, location: { origin: 'https://example.test', hash: '', search: '' },
      matchMedia() { return { matches: false, addEventListener() {} }; },
    },
    fetch: async () => { ui.requests += 1; throw new Error('Unexpected request'); },
  };
  ui.window.localStorage = ui.localStorage;
  vm.createContext(ui);
  vm.runInContext(source, ui);
  ui.window.__latestTestBoardPayload = { boards: [{ columns: TEST_DASHBOARD_COLUMNS, groups: [{ items_page: { items: [{
    id: '50503', database_job: { source_order_id: 50503 }, dashboard_sampling: sampling,
    column_values: [
      { id: ids.JOB, text: approved ? 'v' : '', value: JSON.stringify({ checked: approved }) },
      { id: ids.DESIGN, text: '29079' }, { id: ids.PROOF, text: 'proof.pdf' },
    ],
  }] } }] }] };
  ui.showTestDashboardApprovalWarning = (message, title) => ui.warnings.push({ message, title });
  ui.closeStatusDropdown = () => {};
  vm.runInContext(`__statusDropdownState = { itemId: '50503', columnId: '${ids.STATUS}', columnTitle: 'STATUS', context: 'test-dashboard' }`, ui);
  return ui;
}
