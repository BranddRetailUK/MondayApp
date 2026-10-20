const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require.resolve('../public/script.js'), 'utf8');

function navigation(email, href, { access_scope = 'full', storageBlocked = false } = {}) {
  let url = new URL(href), selected = '';
  const storage = new Map();
  const window = {
    ultimateHubUser: { email, access_scope },
    location: url,
    history: { state: { retained: true }, replaceState(state, _title, next) {
      assert.equal(state.retained, true);
      url = new URL(next); window.location = url;
    } },
    localStorage: { getItem: key => storage.get(key), setItem(key, value) {
      if (storageBlocked) throw Error('Storage blocked');
      storage.set(key, value);
    } },
  };
  const context = vm.createContext({ window, URL, URLSearchParams,
    DASHBOARD_TAB_STORAGE_KEY: 'active-tab',
    DASHBOARD_TAB_NAMES: ['database', 'test-dashboard', 'holiday-board', 'dtf-uploader', 'proof-generator', 'file-viewer', 'digitising-studio'],
    document: { getElementById: () => ({}), querySelectorAll: selector => selector === '.nav-tabs li' ? [] : ['database', 'test-dashboard', 'holiday-board', 'dtf-uploader', 'proof-generator'].map(name => ({ id: `tab-${name}`, classList: { toggle(_name, active) { if (active) selected = name; } } })) },
    isProductionArtworkUser: user => user.email === 'production@ultimatepromotions.co.uk',
    loadTestBoard() {}, closeTestDashboardMobileJobOverview() {}, closeMobileNav() {},
  });
  vm.runInContext(source.slice(source.indexOf('function activateDashboardTab(target)'), source.indexOf('function isPdfFile(')), context);
  return { context, window, selected: () => selected };
}

for (const email of ['production@ultimatepromotions.co.uk', 'charlie@ultimatepromotions.co.uk', 'office@ultimatepromotions.co.uk']) {
  test(`reload follows current page instead of stale proof links for ${email}`, () => {
    for (const link of ['https://www.ultimatehub.co.uk/?test=1#proof-generator', 'https://www.ultimatehub.co.uk/?tab=proof-generator#proof-generator']) {
      const ui = navigation(email, link);
      ui.context.activateDashboardTab('database');
      assert.equal(ui.context.getExplicitDashboardTab(), 'database');
      ui.context.activateDashboardTab(ui.context.getExplicitDashboardTab() || ui.context.getStoredDashboardTab());
      assert.equal(ui.selected(), 'database');
      ui.context.activateDashboardTab('holiday-board');
      assert.equal(ui.context.getExplicitDashboardTab(), 'holiday-board');
    }
  });
}

test('initial deep links and unrelated URL state survive navigation even with storage blocked', () => {
  const ui = navigation('production@ultimatepromotions.co.uk', 'https://www.ultimatehub.co.uk/?tab=proof-generator&test=1#custom-anchor', { storageBlocked: true });
  assert.equal(ui.context.getExplicitDashboardTab(), 'proof-generator');
  ui.context.activateDashboardTab('database');
  assert.equal(ui.context.getExplicitDashboardTab(), 'database');
  assert.equal(ui.window.location.hash, '#custom-anchor');
  assert.equal(ui.window.location.searchParams.get('test'), '1');
});

test('URL persistence respects uploader-only and proof access restrictions', () => {
  const uploader = navigation('customer@example.com', 'https://www.ultimatehub.co.uk/#database', { access_scope: 'dtf_only' });
  uploader.context.activateDashboardTab('database');
  assert.equal(uploader.context.getExplicitDashboardTab(), 'dtf-uploader');
  const office = navigation('office@ultimatepromotions.co.uk', 'https://www.ultimatehub.co.uk/#proof-generator');
  office.context.activateDashboardTab('proof-generator');
  assert.equal(office.context.getExplicitDashboardTab(), 'test-dashboard');
});
