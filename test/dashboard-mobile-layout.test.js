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

test('dashboard grid inserts compact JOB NO and mobile retains STATUS for print groups', () => {
  const sandbox = loadDashboardFrontend();
  const result = vm.runInContext(`
    (() => {
      const grid = buildDashboardGridSpec([
        { id: 'status', title: 'STATUS', type: 'status' },
        { id: 'type', title: 'TYPE', type: 'status' }
      ], {
        nameWidth: 560,
        mobileNameWidth: 240
      });
      const mobile = buildMobileGridSpecForGroup(grid, 'PRINT');
      return {
        desktopTemplate: grid.template,
        mobileTemplate: mobile.template,
        mobileTitles: mobile.columns.map(column => column.title)
      };
    })()
  `, sandbox);

  assert.equal(result.desktopTemplate, '64px 560px 168px 88px');
  assert.equal(result.mobileTemplate, '64px 240px 168px');
  assert.deepEqual(Array.from(result.mobileTitles), ['JOB NO', 'JOB TITLE', 'STATUS']);
});

test('dashboard job title uses the explicit database title without separators', () => {
  const sandbox = loadDashboardFrontend();
  const title = vm.runInContext(`
    getDashboardItemJobTitle({
      name: '51179 - Example Customer - Combined fallback title',
      database_job: { job_title: 'Actual job title' }
    })
  `, sandbox);

  assert.equal(title, 'Actual job title');
});
