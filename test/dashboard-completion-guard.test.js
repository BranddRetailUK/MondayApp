const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  DASHBOARD_COMPLETION_BLOCK_EMAILS,
  DASHBOARD_COMPLETION_BLOCK_MESSAGE,
  isDashboardCompletionBlocked,
} = require('../src/services/dashboardCompletionGuard');

test('Melvyn can set dashboard jobs to COMPLETED', () => {
  assert.equal(DASHBOARD_COMPLETION_BLOCK_EMAILS.has('melvyn@ultimatepromotions.co.uk'), false);
  assert.equal(DASHBOARD_COMPLETION_BLOCK_MESSAGE, 'LEAVE IT ALONE MELVYN');
  assert.equal(isDashboardCompletionBlocked({
    user: { email: ' Melvyn@UltimatePromotions.co.uk ' },
    columnTitle: 'Status',
    label: 'Completed',
  }), false);
  assert.equal(isDashboardCompletionBlocked({
    user: { full_name: ' Ultimate   Production ' },
    columnTitle: 'Status',
    label: 'Completed',
  }), false);
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

test('dashboard retains shared confirmation handling without an account block', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'test-dashboard.js'), 'utf8');

  assert.match(script, /const DASHBOARD_COMPLETION_BLOCK_EMAILS = new Set\(\)/);
  assert.match(script, /if \(shouldBlockDashboardCompletion\(state, option\)\)[\s\S]+DASHBOARD_COMPLETION_BLOCK_MESSAGE[\s\S]+return;/);
  assert.match(script, /data-test-dashboard-approval-ok="true">Okay<\/button>/);
  assert.doesNotMatch(script, /DASHBOARD_COMPLETION_BLOCK_NAMES/);
  assert.match(script, /test-dashboard-completion-block-warning-modal/);
  assert.match(styles, /\.test-dashboard-completion-block-warning-modal \.test-dashboard-complete-confirm-shell\s*\{[\s\S]+width:50vw;[\s\S]+min-height:50vh;/);
  assert.match(route, /isDashboardCompletionBlocked\(\{[\s\S]+user: req\.hubUser/);
  assert.match(route, /code: 'dashboard_completed_status_blocked'/);
});
