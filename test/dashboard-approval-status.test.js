const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHECKED_IN_LABEL,
  NO_STOCK_LABEL,
  STOCK_ORDERED_LABEL,
  statusLabelForApprovedPreProduction,
  statusLabelForMoveGroup,
} = require('../src/services/dashboardAutomation');
const {
  TEST_DASHBOARD_GROUP_IDS,
} = require('../src/services/testDashboardDefaults');

test('preserves CHECKED IN when approval moves a job to pre-production', () => {
  assert.equal(statusLabelForApprovedPreProduction(CHECKED_IN_LABEL), CHECKED_IN_LABEL);
});

test('keeps the existing approval status rules for other jobs', () => {
  assert.equal(statusLabelForApprovedPreProduction(STOCK_ORDERED_LABEL), STOCK_ORDERED_LABEL);
  assert.equal(statusLabelForApprovedPreProduction('AWAITING APPROVAL'), NO_STOCK_LABEL);
});

test('preserves CHECKED IN on a direct move to pre-production', () => {
  assert.equal(
    statusLabelForMoveGroup(TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION, CHECKED_IN_LABEL),
    CHECKED_IN_LABEL
  );
  assert.equal(
    statusLabelForMoveGroup(TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION, 'AWAITING APPROVAL'),
    NO_STOCK_LABEL
  );
});
