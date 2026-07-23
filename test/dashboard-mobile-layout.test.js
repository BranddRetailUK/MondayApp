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

test('Ultimate Packing gets a leftmost desktop LABEL column while mobile starts with job number', () => {
  const sandbox = loadDashboardFrontend();
  const result = vm.runInContext(`
    (() => {
      window.ultimateHubUser = { full_name: 'Ultimate Packing' };
      const grid = buildDashboardGridSpec([
        { id: 'status', title: 'STATUS', type: 'status' }
      ], {
        nameWidth: 560,
        mobileNameWidth: 240
      });
      const mobile = buildMobileGridSpecForGroup(grid, 'PRINT');
      return {
        desktopKinds: grid.columns.map(column => column.kind),
        desktopTitles: grid.columns.map(column => column.title),
        desktopTemplate: grid.template,
        mobileKinds: mobile.columns.map(column => column.kind),
        mobileTemplate: mobile.template
      };
    })()
  `, sandbox);

  assert.deepEqual(Array.from(result.desktopKinds), ['print', 'jobNumber', 'name', 'column']);
  assert.deepEqual(Array.from(result.desktopTitles), ['LABEL', '', 'JOB TITLE', 'STATUS']);
  assert.equal(result.desktopTemplate, '82px 64px 560px 168px');
  assert.deepEqual(Array.from(result.mobileKinds), ['jobNumber', 'name', 'column']);
  assert.equal(result.mobileTemplate, '72px 240px 168px');
});

test('dashboard subitems start with CODE, BRAND, and Subitem without duplicating CODE', () => {
  const sandbox = loadDashboardFrontend();
  const result = vm.runInContext(`
    (() => {
      const code = { id: 'code', title: 'CODE', type: 'text' };
      const grid = buildDashboardGridSpec([
        { id: 'size', title: 'SIZE', type: 'text' },
        { id: 'qty', title: 'QTY', type: 'text' },
        code,
        { id: 'colour', title: 'COLOUR', type: 'text' }
      ], {
        subitem: true,
        brandWidth: 126,
        nameWidth: 240,
        widthOverrides: new Map([['code', 84]])
      });
      return {
        kinds: grid.columns.map(column => column.kind),
        titles: grid.columns.map(column => column.title),
        columnIds: grid.columns.map(column => column.column?.id || null),
        template: grid.template
      };
    })()
  `, sandbox);

  assert.deepEqual(
    Array.from(result.kinds),
    ['column', 'brand', 'name', 'column', 'column', 'column']
  );
  assert.deepEqual(
    Array.from(result.titles),
    ['CODE', 'BRAND', 'Subitem', 'SIZE', 'QTY', 'COLOUR']
  );
  assert.deepEqual(
    Array.from(result.columnIds),
    ['code', null, null, 'size', 'qty', 'colour']
  );
  assert.equal(result.template, '84px 126px 240px 220px 80px 158px');
});

test('dashboard job title and customer eyebrow use explicit database values without separators', () => {
  const sandbox = loadDashboardFrontend();
  const values = vm.runInContext(`
    (() => {
      const item = {
        name: '51179 - Example Customer - Combined fallback title',
        database_job: {
          customer_name: 'Actual Customer',
          job_title: 'Actual job title'
        }
      };
      return {
        customer: getDashboardItemCustomerName(item),
        title: getDashboardItemJobTitle(item)
      };
    })()
  `, sandbox);

  assert.equal(values.customer, 'Actual Customer');
  assert.equal(values.title, 'Actual job title');
});

test('dashboard customer eyebrow is smaller and inherits the group accent', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.job-customer-eyebrow\s*\{[^}]*color:var\(--group-accent, var\(--accent\)\)/s);
  assert.match(styles, /\.job-customer-eyebrow\s*\{[^}]*font-size:12px/s);
  assert.match(styles, /\.job-title,\s*\.subitem-title\s*\{[^}]*font-size:14px/s);
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

test('sidebar uses the subtle icon-based Sign out control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const authSession = fs.readFileSync(path.join(__dirname, '..', 'public', 'auth-session.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(html, /id="logoutButton"[^>]*aria-label="Sign out"/);
  assert.match(html, /class="sidebar-logout-icon"/);
  assert.match(html, /data-logout-label>Sign out</);
  assert.match(authSession, /logoutLabel\.textContent = 'Signing out…'/);
  assert.match(authSession, /logoutLabel\.textContent = 'Sign out'/);
  assert.doesNotMatch(styles, /\.sidebar-logout-button\s*\{[^}]*background:#c62828/s);
  assert.match(styles, /\.sidebar-logout-icon\s*\{/);
});

test('VISUAL upload validation blocks unsupported browser files and keeps FILES unrestricted', () => {
  const sandbox = loadDashboardFrontend();
  const result = vm.runInContext(`
    (() => {
      const visual = { id: TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF, title: 'PROOF' };
      const files = { id: 'files_1', title: 'FILES' };
      const candidates = [
        { name: 'proof.pdf', type: 'application/pdf' },
        { name: 'photo.jpeg', type: 'image/jpeg' },
        { name: 'preview.png', type: 'image/png' },
        { name: 'artwork.eps', type: 'application/postscript' },
        { name: 'transfer.pxf', type: 'application/octet-stream' }
      ];
      return {
        accept: TEST_DASHBOARD_VISUAL_UPLOAD_ACCEPT,
        visualRejected: getUnsupportedTestDashboardVisualFiles(visual, candidates).map(file => file.name),
        filesRejected: getUnsupportedTestDashboardVisualFiles(files, candidates).map(file => file.name)
      };
    })()
  `, sandbox);

  assert.equal(result.accept, '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
  assert.deepEqual(Array.from(result.visualRejected), ['artwork.eps', 'transfer.pxf']);
  assert.deepEqual(Array.from(result.filesRejected), []);
});

test('row menu exposes the destructive REMOVE VISUAL action', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');

  assert.match(
    source,
    /class="test-row-action-button danger"[^>]*data-test-row-remove-proof="true">REMOVE VISUAL<\/button>/
  );
});
