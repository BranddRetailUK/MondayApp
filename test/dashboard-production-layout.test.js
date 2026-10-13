const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadDashboardFrontend() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const mediaQuery = {
    matches: true,
    addEventListener() {},
    addListener() {},
  };
  const sandbox = {
    CSS: { escape: String },
    URLSearchParams,
    clearInterval() {},
    console,
    document: {
      addEventListener() {},
    },
    fetch: async () => {
      throw new Error('Unexpected fetch');
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    setInterval() { return 1; },
    window: {
      addEventListener() {},
      location: { origin: 'https://example.test', hash: '', search: '' },
      matchMedia() { return mediaQuery; },
      ultimateHubUser: null,
    },
  };
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

test('linked children follow their parent while other groups and ordinary jobs retain order', () => {
  const ui = loadDashboardFrontend();
  const p = { id: 'parent', dashboard_production_parent: true };
  const q = { id: 'other-parent', dashboard_production_parent: true };
  const child = id => ({ id, dashboard_production_parent_id: 'parent' });
  const ordinary = { id: 'ordinary' };
  const other = { id: 'other-child', dashboard_production_parent_id: 'other-parent' };
  const rows = [child('a'), ordinary, other, p, child('b'), q];
  assert.deepEqual(Array.from(ui.groupProductionChildren(rows), x => x.id),
    ['ordinary', 'parent', 'a', 'b', 'other-parent', 'other-child']);
  // A completed child in a different group must stay in that group.
  assert.deepEqual(Array.from(ui.groupProductionChildren([child('completed'), ordinary]), x => x.id),
    ['completed', 'ordinary']);
  assert.equal(rows.length, 6);
});

test('parent collapse hides full child rows and their open stock panels without losing panel state', () => {
  const ui = loadDashboardFrontend();
  const rows = [new Set(), new Set(), new Set(['hidden'])];
  ui.document.querySelectorAll = selector => {
    assert.equal(selector, '[data-production-parent="parent"]');
    return rows.map(classes => ({ classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
    }}));
  };
  ui.toggleProductionRows('parent', false);
  assert.ok(rows.every(classes => classes.has('production-collapsed')));
  ui.toggleProductionRows('parent', true);
  assert.ok(rows.every(classes => !classes.has('production-collapsed')));
  assert.equal(rows[1].has('hidden'), false);
  assert.equal(rows[2].has('hidden'), true);
});

test('each group sorts by earliest due date regardless of priority, with undated jobs last', () => {
  const ui = loadDashboardFrontend();
  const columns = [
    { id: 'priority', title: 'PRIORITY', type: 'status' },
    { id: 'date', title: 'DATE', type: 'date' },
  ];
  const job = (id, date, priority = '') => ({ id, column_values: [
    { id: 'date', text: date, value: date ? JSON.stringify({ date }) : '' },
    { id: 'priority', text: priority },
  ] });
  const plan = ui.getBoardSortPlan(columns);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].column.id, 'date');
  const first = [job('late', '2026-10-30', 'Critical'), job('empty', ''),
    job('soon', '2026-10-14', 'Low'), job('overdue', '2026-10-01'), job('same', '2026-10-14')];
  const second = [job('other-late', '2026-11-01'), job('other-soon', '2026-10-15')];
  assert.deepEqual(Array.from(ui.sortItemsForBoard(first, plan), row => row.id),
    ['overdue', 'soon', 'same', 'late', 'empty']);
  assert.deepEqual(Array.from(ui.sortItemsForBoard(second, plan), row => row.id),
    ['other-soon', 'other-late']);
  assert.equal(first[0].id, 'late');
});

test('notes widths shrink after clearing parent notes and exclude collapsed children across groups', () => {
  const ui = loadDashboardFrontend();
  const column = { id: 'notes', title: 'NOTES', type: 'text' };
  const parent = { id: 'parent', dashboard_production_parent: true,
    column_values: [{ id: 'notes', text: 'Long parent note '.repeat(30) }] };
  const child = { id: 'child', dashboard_production_parent_id: 'parent',
    column_values: [{ id: 'notes', text: 'Long child note '.repeat(20) }] };
  const ordinary = { id: 'ordinary', column_values: [{ id: 'notes', text: 'Short note' }] };
  const state = { productionParentIds: new Set(['parent']), openSubitems: new Set() };
  const width = rows => ui.buildBoardColumnWidthOverrides([column], rows, state).get('notes');
  const before = width([parent, child, ordinary]);
  parent.column_values[0].text = '';
  assert.ok(width([parent, child, ordinary]) < before);
  assert.equal(width([parent, child, ordinary]), width([ordinary]));
  assert.equal(width([child, ordinary]), width([ordinary]));
  state.openSubitems.add('parent');
  assert.ok(width([child, ordinary]) > width([ordinary]));
  state.openSubitems.clear();
  assert.equal(width([child, ordinary]), width([ordinary]));
  state.productionParentIds.clear();
  assert.ok(width([child, ordinary]) > width([ordinary]));
});
