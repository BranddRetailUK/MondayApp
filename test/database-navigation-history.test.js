const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, '../public/database.js'), 'utf8');
function setup() {
  const state = { currentRoute: { view: 'home' }, viewHistory: [], viewForwardHistory: [], navigatingHistory: false };
  const buttons = { 'db-history-back': {}, 'db-history-forward': {} };
  const context = vm.createContext({ state, document: { getElementById: id => buttons[id] }, restoringDatabaseRoute: false, console,
    flushOrderAutosaves: async () => {},
    applyStoredDatabaseRoute: async route => { state.currentRoute = route; },
    persistDatabaseRoute: () => {},
  });
  vm.runInContext(script.slice(script.indexOf('  function databaseRouteIdentity('), script.indexOf('  function titleForView(')), context);
  return { state, buttons, context };
}
test('history restores specific records and tabs, supports forward and clears a branched path', async () => {
  const { state, buttons, context: c } = setup();
  c.rememberDatabaseRoute({ view: 'customer', customerKey: 'id:42', customerTab: 'orders' });
  c.rememberDatabaseRoute({ view: 'order', orderId: 101, orderTab: 'details' });
  c.rememberDatabaseRoute({ view: 'order', orderId: 101, orderTab: 'items' });
  assert.equal(state.viewHistory.length, 2);
  await c.navigateDatabaseHistory(-1);
  assert.equal(state.currentRoute.customerKey, 'id:42');
  assert.equal(buttons['db-history-forward'].disabled, false);
  await c.navigateDatabaseHistory(1);
  assert.equal(state.currentRoute.orderId, 101);
  assert.equal(state.currentRoute.orderTab, 'items');
  assert.equal(buttons['db-history-forward'].disabled, true);
  c.rememberDatabaseRoute({ view: 'order', orderId: 102 });
  await c.navigateDatabaseHistory(-1);
  assert.equal(state.currentRoute.orderId, 101);
  c.rememberDatabaseRoute({ view: 'customers' });
  assert.equal(state.viewForwardHistory.length, 0);
});
test('initial restoration does not create history and failed navigation retains retry destination', async () => {
  const { state, buttons, context: c } = setup();
  c.restoringDatabaseRoute = true;
  c.rememberDatabaseRoute({ view: 'customer', customerKey: 'id:42' });
  assert.equal(state.viewHistory.length, 0);
  assert.equal(buttons['db-history-back'].disabled, true);
  c.restoringDatabaseRoute = false;
  c.rememberDatabaseRoute({ view: 'order', orderId: 101 });
  c.applyStoredDatabaseRoute = async route => { if (route.view === 'customer') throw new Error('Unavailable'); };
  c.console = { warn() {} };
  await c.navigateDatabaseHistory(-1);
  assert.equal(state.currentRoute.orderId, 101);
  assert.equal(state.viewHistory.length, 1);
  assert.equal(state.viewForwardHistory.length, 0);
  assert.equal(state.navigatingHistory, false);
});
