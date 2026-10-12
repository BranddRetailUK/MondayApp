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
