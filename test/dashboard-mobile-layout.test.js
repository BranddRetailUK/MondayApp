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

test('dashboard grid starts with compact unlabelled job number and mobile retains STATUS for print groups', () => {
  const sandbox = loadDashboardFrontend();
  const result = vm.runInContext(`
    (() => {
      const grid = buildDashboardGridSpec([
        { id: 'status', title: 'STATUS', type: 'status' },
        { id: 'type', title: 'TYPE', type: 'status' },
        { id: 'proof', title: 'PROOF', type: 'file' }
      ], {
        nameWidth: 560,
        mobileNameWidth: 240
      });
      const mobile = buildMobileGridSpecForGroup(grid, 'PRINT');
      return {
        desktopTemplate: grid.template,
        mobileTemplate: mobile.template,
        mobileTitles: mobile.columns.map(column => column.title),
        firstColumnKind: grid.columns[0]?.kind,
        hasActionColumn: grid.columns.some(column => column.kind === 'actions'),
        hasDuplicatedVisualColumn: grid.columns.some(column => column.kind === 'visual'),
        proofDisplayTitle: grid.columns.find(column => column.column?.id === 'proof')?.title,
        proofUnderlyingTitle: grid.columns.find(column => column.column?.id === 'proof')?.column?.title,
        proofUsesPreviewModal: isPreviewModalFileColumn(
          grid.columns.find(column => column.column?.id === 'proof')?.column
        )
      };
    })()
  `, sandbox);

  assert.equal(result.desktopTemplate, '64px 560px 168px 88px 100px');
  assert.equal(result.mobileTemplate, '72px 240px 168px 100px');
  assert.deepEqual(Array.from(result.mobileTitles), ['', 'JOB TITLE', 'STATUS', 'VISUAL']);
  assert.equal(result.firstColumnKind, 'jobNumber');
  assert.equal(result.hasActionColumn, false);
  assert.equal(result.hasDuplicatedVisualColumn, false);
  assert.equal(result.proofDisplayTitle, 'VISUAL');
  assert.equal(result.proofUnderlyingTitle, 'PROOF');
  assert.equal(result.proofUsesPreviewModal, true);
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

test('dashboard priority row highlights and their toggle remain disabled', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.doesNotMatch(script, /priority-due-(?:urgent|soon)/);
  assert.doesNotMatch(script, /setPriorityHighlightsEnabled|addPriorityHighlightUI/);
  assert.doesNotMatch(styles, /\.job-row\.priority-due-/);
  assert.doesNotMatch(styles, /\.priority-highlight-toggle/);
});

test('parent dashboard grids end at the final file column', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(script, /grid\.style\.width = `\$\{groupGridSpec\.minWidth\}px`/);
  assert.match(styles, /\.board-grid\s*>\s*\.grid-row\s*>\s*\.grid-cell:last-child\s*\{[^}]*border-right:1px solid #55565a/s);
  assert.match(styles, /width:var\(--mobile-board-min-width\)!important/);
});
