const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  DASHBOARD_COMPLETION_BLOCK_EMAILS,
  DASHBOARD_COMPLETION_BLOCK_NAMES,
  DASHBOARD_COMPLETION_BLOCK_MESSAGE,
  isDashboardCompletionBlocked,
} = require('../src/services/dashboardCompletionGuard');

test('only Melvyn and Ultimate Production are blocked from dashboard COMPLETED', () => {
  assert.equal(DASHBOARD_COMPLETION_BLOCK_EMAILS.has('melvyn@ultimatepromotions.co.uk'), true);
  assert.equal(DASHBOARD_COMPLETION_BLOCK_NAMES.has('ultimate production'), true);
  assert.equal(DASHBOARD_COMPLETION_BLOCK_MESSAGE, 'LEAVE IT ALONE MELVYN');
  assert.equal(isDashboardCompletionBlocked({
    user: { email: ' Melvyn@UltimatePromotions.co.uk ' },
    columnTitle: 'Status',
    label: 'Completed',
  }), true);
  assert.equal(isDashboardCompletionBlocked({
    user: { full_name: ' Ultimate   Production ' },
    columnTitle: 'Status',
    label: 'Completed',
  }), true);
  assert.equal(isDashboardCompletionBlocked({
    user: { first_name: 'Ultimate', last_name: 'Production' },
    columnTitle: 'Status',
    label: 'Completed',
  }), true);
  assert.equal(isDashboardCompletionBlocked({
    user: { email: 'someone@example.test' },
    columnTitle: 'Status',
    label: 'Completed',
  }), false);
  assert.equal(isDashboardCompletionBlocked({
    user: { email: 'melvyn@ultimatepromotions.co.uk' },
    columnTitle: 'Priority',
    label: 'Completed',
  }), false);
  assert.equal(isDashboardCompletionBlocked({
    user: { email: 'melvyn@ultimatepromotions.co.uk' },
    columnTitle: 'Status',
    label: 'In Production',
  }), false);
});

test('dashboard UI blocks before confirmation and shows a dismissible Okay popup', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'test-dashboard.js'), 'utf8');

  assert.match(script, /if \(shouldBlockDashboardCompletion\(state, option\)\)[\s\S]+DASHBOARD_COMPLETION_BLOCK_MESSAGE[\s\S]+return;/);
  assert.match(script, /data-test-dashboard-approval-ok="true">Okay<\/button>/);
  assert.match(script, /DASHBOARD_COMPLETION_BLOCK_NAMES = new Set\(\['ultimate production'\]\)/);
  assert.match(script, /test-dashboard-completion-block-warning-modal/);
  assert.match(styles, /\.test-dashboard-completion-block-warning-modal \.test-dashboard-complete-confirm-shell\s*\{[\s\S]+width:50vw;[\s\S]+min-height:50vh;/);
  assert.match(route, /isDashboardCompletionBlocked\(\{[\s\S]+user: req\.hubUser/);
  assert.match(route, /code: 'dashboard_completed_status_blocked'/);
});
