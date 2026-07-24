const {
  TEST_DASHBOARD_COLUMN_IDS,
  TEST_DASHBOARD_GROUP_IDS,
  normalizeColumnTitle,
} = require('./testDashboardDefaults');
const {
  deriveJobCategory,
  getColumnText,
} = require('./dashboardAutomation');
const { checkboxIsChecked } = require('./testDashboardDbFields');

const DASHBOARD_SPLIT_STATE_KEY = '__split_job';
const DASHBOARD_SPLIT_VERSION = 1;
const DASHBOARD_SPLIT_BRANCHES = Object.freeze(['print', 'embroidery']);
const DASHBOARD_SPLIT_READY_STATUS = 'READY TO PRINT';
const DASHBOARD_SPLIT_COMPLETED_STATUS = 'COMPLETED';

const DASHBOARD_SPLIT_BRANCH_CONFIG = Object.freeze({
  print: Object.freeze({
    groupId: TEST_DASHBOARD_GROUP_IDS.PRINT,
    itemSuffix: '__split_print',
  }),
  embroidery: Object.freeze({
    groupId: TEST_DASHBOARD_GROUP_IDS.EMBROIDERY,
    itemSuffix: '__split_embroidery',
  }),
});

function clean(value) {
  return String(value || '').trim();
}

function splitDashboardItemId(sourceOrderId, branch) {
  const config = DASHBOARD_SPLIT_BRANCH_CONFIG[branch];
  if (!config) return String(sourceOrderId || '');
  return `${sourceOrderId}${config.itemSuffix}`;
}

function parseSplitDashboardItemId(value) {
  const match = clean(value).match(/^(\d+)__split_(print|embroidery)$/);
  if (!match) return null;
  const sourceOrderId = Number.parseInt(match[1], 10);
  if (!Number.isFinite(sourceOrderId)) return null;
  return {
    sourceOrderId,
    branch: match[2],
  };
}

function defaultDashboardSplitState() {
  return {
    version: DASHBOARD_SPLIT_VERSION,
    active: true,
    branches: {
      print: { status: DASHBOARD_SPLIT_READY_STATUS },
      embroidery: { status: DASHBOARD_SPLIT_READY_STATUS },
    },
  };
}

function normalizeDashboardSplitState(value) {
  if (!value || typeof value !== 'object' || value.active !== true) return null;
  const branches = {};
  for (const branch of DASHBOARD_SPLIT_BRANCHES) {
    const status = clean(value.branches?.[branch]?.status) || DASHBOARD_SPLIT_READY_STATUS;
    branches[branch] = { status };
  }
  return {
    version: DASHBOARD_SPLIT_VERSION,
    active: true,
    branches,
  };
}

function effectiveDashboardCheckboxChecked(value, fallback = false) {
  const saved = checkboxIsChecked(value);
  return saved === null ? Boolean(fallback) : saved;
}

function dashboardSplitActivationReady(job, columnValues = {}) {
  if (deriveJobCategory(job) !== 'print_embroidery') return false;
  const status = normalizeColumnTitle(
    job?.dashboard_status || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS])
  );
  if (status !== DASHBOARD_SPLIT_READY_STATUS) return false;

  const transferChecked = effectiveDashboardCheckboxChecked(
    columnValues[TEST_DASHBOARD_COLUMN_IDS.TRANS],
    false
  );
  const jaqChecked = effectiveDashboardCheckboxChecked(
    columnValues[TEST_DASHBOARD_COLUMN_IDS.JAQ],
    Boolean(job?.has_screens || clean(job?.screen_numbers))
  );
  return transferChecked && jaqChecked;
}

function resolveDashboardSplitState(job, columnValues = {}) {
  if (deriveJobCategory(job) !== 'print_embroidery') return null;
  const totalStatus = normalizeColumnTitle(
    job?.dashboard_status || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS])
  );
  if (totalStatus === DASHBOARD_SPLIT_COMPLETED_STATUS) return null;

  const saved = normalizeDashboardSplitState(columnValues[DASHBOARD_SPLIT_STATE_KEY]);
  if (saved) return saved;
  return dashboardSplitActivationReady(job, columnValues)
    ? defaultDashboardSplitState()
    : null;
}

function transitionDashboardSplitBranchStatus(splitState, branch, status) {
  const current = normalizeDashboardSplitState(splitState);
  if (!current || !DASHBOARD_SPLIT_BRANCH_CONFIG[branch]) return null;

  const nextStatus = clean(status) || DASHBOARD_SPLIT_READY_STATUS;
  const next = {
    ...current,
    branches: {
      print: { ...current.branches.print },
      embroidery: { ...current.branches.embroidery },
    },
  };
  next.branches[branch].status = nextStatus;

  const allCompleted = DASHBOARD_SPLIT_BRANCHES.every(candidate => (
    normalizeColumnTitle(next.branches[candidate].status) === DASHBOARD_SPLIT_COMPLETED_STATUS
  ));
  return {
    splitState: allCompleted ? null : next,
    branchCompleted: normalizeColumnTitle(nextStatus) === DASHBOARD_SPLIT_COMPLETED_STATUS,
    allCompleted,
    aggregateStatus: allCompleted
      ? DASHBOARD_SPLIT_COMPLETED_STATUS
      : DASHBOARD_SPLIT_READY_STATUS,
  };
}

function dashboardSplitBranchStatus(splitState, branch) {
  const normalized = normalizeDashboardSplitState(splitState);
  return clean(normalized?.branches?.[branch]?.status) || DASHBOARD_SPLIT_READY_STATUS;
}

function dashboardSplitBranchCompleted(splitState, branch) {
  return normalizeColumnTitle(dashboardSplitBranchStatus(splitState, branch)) ===
    DASHBOARD_SPLIT_COMPLETED_STATUS;
}

function dashboardSplitBranchGroupId(branch) {
  return DASHBOARD_SPLIT_BRANCH_CONFIG[branch]?.groupId || '';
}

module.exports = {
  DASHBOARD_SPLIT_STATE_KEY,
  DASHBOARD_SPLIT_BRANCHES,
  DASHBOARD_SPLIT_READY_STATUS,
  DASHBOARD_SPLIT_COMPLETED_STATUS,
  dashboardSplitActivationReady,
  dashboardSplitBranchCompleted,
  dashboardSplitBranchGroupId,
  dashboardSplitBranchStatus,
  defaultDashboardSplitState,
  normalizeDashboardSplitState,
  parseSplitDashboardItemId,
  resolveDashboardSplitState,
  splitDashboardItemId,
  transitionDashboardSplitBranchStatus,
};
