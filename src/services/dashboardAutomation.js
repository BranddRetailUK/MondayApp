const {
  TEST_DASHBOARD_COLUMN_IDS,
  TEST_DASHBOARD_GROUP_IDS,
  STATUS_SETTINGS,
  normalizeColumnTitle,
} = require('./testDashboardDefaults');
const { jobApprovedFromColumnValues } = require('./testDashboardDbFields');

const AWAITING_APPROVAL_LABEL = 'AWAITING APPROVAL';
const WAITING_APPROVAL_LABEL = 'WAITING APPROVAL';
const NO_STOCK_LABEL = 'NO STOCK';
const STOCK_ORDERED_LABEL = 'STOCK ORDERED';
const HOLD_LABEL = 'HOLD';
const PRE_PRODUCTION_LABEL = 'PRE-PRODUCTION';
const READY_TO_PRINT_LABEL = 'READY TO PRINT';
const CHECKED_IN_LABEL = 'CHECKED IN';
const COMPLETED_LABEL = 'COMPLETED';

const STATUS_INDEX_FALLBACKS = Object.freeze({
  [NO_STOCK_LABEL]: 0,
  [HOLD_LABEL]: 1,
  'IN PRODUCTION': 2,
  INVOICED: 3,
  [AWAITING_APPROVAL_LABEL]: 5,
  [WAITING_APPROVAL_LABEL]: 5,
  'TO SAMPLE': 6,
  SAMPLED: 7,
  [READY_TO_PRINT_LABEL]: 8,
  'TRANSFER PRINTING': 9,
  [STOCK_ORDERED_LABEL]: 10,
  'PART-STOCK': 11,
  [COMPLETED_LABEL]: 12,
  [CHECKED_IN_LABEL]: 13,
  'SUPPLIED CLOTHING': 14,
  'STOCK IN': 15,
});

function clean(value) {
  return String(value || '').trim();
}

function getColumnText(value) {
  return clean(value?.text || '');
}

function dashboardStatusIndex(label, fallbackIndex) {
  const normalizedLabel = normalizeColumnTitle(label);
  const entry = Object.entries(STATUS_SETTINGS?.labels || {})
    .find(([, optionLabel]) => normalizeColumnTitle(optionLabel) === normalizedLabel);
  const numeric = Number(entry?.[0]);
  if (Number.isFinite(numeric)) return numeric;
  return Number.isFinite(fallbackIndex) ? fallbackIndex : STATUS_INDEX_FALLBACKS[normalizedLabel];
}

function dashboardStatusValue(label, fallbackIndex) {
  return {
    id: TEST_DASHBOARD_COLUMN_IDS.STATUS,
    text: label,
    type: 'status',
    value: JSON.stringify({ index: dashboardStatusIndex(label, fallbackIndex) }),
  };
}

function awaitingApprovalStatusValue() {
  return dashboardStatusValue(AWAITING_APPROVAL_LABEL, STATUS_INDEX_FALLBACKS[AWAITING_APPROVAL_LABEL]);
}

function stockOrderedStatusValue() {
  return dashboardStatusValue(STOCK_ORDERED_LABEL, STATUS_INDEX_FALLBACKS[STOCK_ORDERED_LABEL]);
}

function statusLabelForApprovedPreProduction(currentStatus) {
  const normalizedStatus = normalizeColumnTitle(currentStatus);
  if (isStockOrderedStatus(normalizedStatus)) return STOCK_ORDERED_LABEL;
  if (normalizedStatus === CHECKED_IN_LABEL) return CHECKED_IN_LABEL;
  return NO_STOCK_LABEL;
}

function resolveJobApproved(job, stateValues = {}) {
  const columnValues = stateValues?.column_values || stateValues || {};
  const savedJobApproved = jobApprovedFromColumnValues(columnValues);
  return savedJobApproved === null ? job?.proof_approved === true : savedJobApproved;
}

function deriveTypeLabel(job) {
  const category = deriveJobCategory(job);
  if (category === 'print_embroidery') return 'EMB / PRINT';
  if (category === 'embroidery') return 'EMB';
  if (category === 'print') return 'PRINT';
  return '';
}

function deriveJobCategory(job = {}) {
  const raw = `${job.order_type || ''} ${job.order_type_abbr || ''}`.toLowerCase();
  const abbr = clean(job.order_type_abbr).toLowerCase();
  const isPrint = raw.includes('print') || abbr === 'p' || abbr === 'pe' || abbr === 'ep';
  const isEmbroidery = raw.includes('embro') || /\bemb\b/.test(raw) || abbr === 'e' || abbr === 'pe' || abbr === 'ep';
  if (raw.includes('gift') || abbr === 'g') return 'gifts';
  if (isPrint && isEmbroidery) return 'print_embroidery';
  if (isEmbroidery) return 'embroidery';
  if (isPrint) return 'print';
  return 'other';
}

function groupIdForStatusAndType(statusText, typeText) {
  if (statusText === AWAITING_APPROVAL_LABEL || statusText === WAITING_APPROVAL_LABEL) return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  if (statusText === COMPLETED_LABEL) return TEST_DASHBOARD_GROUP_IDS.COMPLETED;
  if (statusText === HOLD_LABEL) return TEST_DASHBOARD_GROUP_IDS.HOLD;
  if (statusText === 'TO SAMPLE') return TEST_DASHBOARD_GROUP_IDS.TO_SAMPLE;
  if (statusText === 'SAMPLED') return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  if (statusText === PRE_PRODUCTION_LABEL || statusText === NO_STOCK_LABEL) return TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION;
  if (statusText === READY_TO_PRINT_LABEL) {
    if (typeText.includes('EMB')) return TEST_DASHBOARD_GROUP_IDS.EMBROIDERY;
    if (typeText.includes('PRINT')) return TEST_DASHBOARD_GROUP_IDS.PRINT;
  }
  return '';
}

function sanitizeUnapprovedDashboardGroupId(groupId, jobApproved) {
  const fallback = groupId || TEST_DASHBOARD_GROUP_IDS.OFFICE;
  if (jobApproved) return fallback;
  if (
    fallback === TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION ||
    fallback === TEST_DASHBOARD_GROUP_IDS.PRINT ||
    fallback === TEST_DASHBOARD_GROUP_IDS.EMBROIDERY
  ) {
    return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  }
  return fallback;
}

function isStockOrderedStatus(value) {
  const normalized = normalizeColumnTitle(value);
  return normalized === STOCK_ORDERED_LABEL || normalized === 'ORDERED';
}

function isAllowedUnapprovedManualStatus(label) {
  const normalized = normalizeColumnTitle(label);
  return normalized === HOLD_LABEL ||
    isStockOrderedStatus(normalized) ||
    normalized === CHECKED_IN_LABEL ||
    normalized === COMPLETED_LABEL ||
    normalized === 'TO SAMPLE' ||
    normalized === 'SAMPLED';
}

function isManualStatusAutomationOverride(statusText) {
  return statusText === COMPLETED_LABEL ||
    statusText === 'TO SAMPLE' ||
    statusText === 'SAMPLED';
}

function currentDashboardGroupIdForStatusOnlyUpdate(job, currentState, typeText, jobApproved, defaultGroupId = TEST_DASHBOARD_GROUP_IDS.OFFICE) {
  const stateValues = currentState?.column_values || {};
  const currentStatusText = normalizeColumnTitle(
    job?.dashboard_status || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS])
  );
  const currentGroupId = currentState?.group_id ||
    groupIdForStatusAndType(currentStatusText, typeText) ||
    defaultGroupId;
  return sanitizeUnapprovedDashboardGroupId(currentGroupId, jobApproved);
}

function applyDashboardAutomations({
  job,
  currentState,
  column,
  columnValues,
  changedLabel,
  clearRequested,
  applyAwaitingApprovalColumnValues,
  formatJobName = formatDashboardJobName,
  defaultGroupId = TEST_DASHBOARD_GROUP_IDS.OFFICE,
}) {
  let groupId = currentState?.group_id || defaultGroupId;
  let archived = Boolean(currentState?.archived);
  const title = normalizeColumnTitle(column?.title || '');
  const statusText = normalizeColumnTitle(changedLabel || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(deriveTypeLabel(job) || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]) || job?.dashboard_type);
  const jobApproved = resolveJobApproved(job, columnValues);

  if (title === 'STATUS' && !clearRequested && isStockOrderedStatus(statusText)) {
    return {
      group_id: currentDashboardGroupIdForStatusOnlyUpdate(job, currentState, typeText, jobApproved, defaultGroupId),
      item_name: currentState?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: false,
    };
  }

  if (title === 'STATUS' && !clearRequested && isManualStatusAutomationOverride(statusText)) {
    const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
    if (statusText === COMPLETED_LABEL) clearCompletedProductionColumns(columnValues);
    return {
      group_id: automatedGroupId || groupId,
      item_name: currentState?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: false,
    };
  }

  if (title === 'STATUS' && !clearRequested && !jobApproved && isAllowedUnapprovedManualStatus(statusText)) {
    const manualGroupId = groupIdForStatusAndType(statusText, typeText);
    return {
      group_id: sanitizeUnapprovedDashboardGroupId(manualGroupId || groupId, false),
      item_name: currentState?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: false,
    };
  }

  if (!jobApproved) {
    applyAwaitingApprovalColumnValues?.(job, columnValues);
    return {
      group_id: TEST_DASHBOARD_GROUP_IDS.OFFICE,
      item_name: currentState?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: false,
    };
  }

  if (title === 'STATUS' && !clearRequested) {
    archived = statusText === 'INVOICED';
    const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
    if (statusText === COMPLETED_LABEL) {
      groupId = automatedGroupId || TEST_DASHBOARD_GROUP_IDS.COMPLETED;
      clearCompletedProductionColumns(columnValues);
    } else if (automatedGroupId) {
      groupId = automatedGroupId;
    }
  }

  return {
    group_id: groupId,
    item_name: currentState?.item_name || formatJobName(job),
    column_values: columnValues,
    archived,
  };
}

function applyPrivateDashboardAutomations({
  currentJob,
  column,
  columnValues,
  changedLabel,
  clearRequested,
  applyAwaitingApprovalColumnValues,
}) {
  let groupId = currentJob?.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE;
  let archived = Boolean(currentJob?.archived);
  const title = normalizeColumnTitle(column?.title || '');
  const statusText = normalizeColumnTitle(changedLabel || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]));
  const jobApproved = jobApprovedFromColumnValues(columnValues) === true;

  if (!jobApproved && !statusText) {
    applyAwaitingApprovalColumnValues?.(columnValues);
    return {
      group_id: TEST_DASHBOARD_GROUP_IDS.OFFICE,
      item_name: currentJob?.item_name || '',
      column_values: columnValues,
      archived: false,
    };
  }

  if (title === 'STATUS' && !clearRequested) {
    archived = statusText === 'INVOICED';
    const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
    if (statusText === COMPLETED_LABEL) {
      groupId = automatedGroupId || TEST_DASHBOARD_GROUP_IDS.COMPLETED;
      clearCompletedProductionColumns(columnValues);
    } else if (automatedGroupId) {
      groupId = automatedGroupId;
    }
  }

  return {
    group_id: groupId,
    item_name: currentJob?.item_name || '',
    column_values: columnValues,
    archived,
  };
}

function clearCompletedProductionColumns(columnValues) {
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.TRANS];
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.JAQ];
}

function resolveDashboardGroupId(job, state, scan, defaultGroupId = TEST_DASHBOARD_GROUP_IDS.OFFICE) {
  const stateValues = state?.column_values || {};
  const statusText = normalizeColumnTitle(
    job?.dashboard_status || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]) || scan?.status || ''
  );
  const typeText = normalizeColumnTitle(
    deriveTypeLabel(job) || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]) || job?.dashboard_type
  );
  const jobApproved = resolveJobApproved(job, stateValues);
  if (!jobApproved) {
    if (isStockOrderedStatus(statusText)) {
      return sanitizeUnapprovedDashboardGroupId(state?.group_id || defaultGroupId, false);
    }
    if (isAllowedUnapprovedManualStatus(statusText)) {
      const manualGroupId = groupIdForStatusAndType(statusText, typeText);
      return sanitizeUnapprovedDashboardGroupId(manualGroupId || state?.group_id || defaultGroupId, false);
    }
    return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  }
  const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
  if (automatedGroupId) return automatedGroupId;
  return state?.group_id || defaultGroupId;
}

function resolvePrivateDashboardGroupId(job) {
  const stateValues = job?.column_values || {};
  const statusText = normalizeColumnTitle(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]));
  const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
  if (automatedGroupId) return automatedGroupId;
  return job?.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE;
}

function stockOrderedGroupIdForJob(job) {
  const columnValues = job?.column_values || {};
  const currentStatus = normalizeColumnTitle(
    job?.dashboard_status || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS])
  );
  const typeText = normalizeColumnTitle(
    deriveTypeLabel(job) || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]) || job?.dashboard_type
  );
  const currentGroupId = job?.group_id ||
    groupIdForStatusAndType(currentStatus, typeText) ||
    TEST_DASHBOARD_GROUP_IDS.OFFICE;
  return sanitizeUnapprovedDashboardGroupId(currentGroupId, resolveJobApproved(job, columnValues) === true);
}

function statusLabelForMoveGroup(groupId, currentStatus = '') {
  if (groupId === TEST_DASHBOARD_GROUP_IDS.HOLD) return HOLD_LABEL;
  if (groupId === TEST_DASHBOARD_GROUP_IDS.OFFICE) return AWAITING_APPROVAL_LABEL;
  if (groupId === TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION) {
    return normalizeColumnTitle(currentStatus) === CHECKED_IN_LABEL
      ? CHECKED_IN_LABEL
      : NO_STOCK_LABEL;
  }
  return '';
}

function normalizeStatusLookupLabel(value) {
  const normalized = normalizeColumnTitle(value);
  if (normalized === AWAITING_APPROVAL_LABEL || normalized === WAITING_APPROVAL_LABEL) return WAITING_APPROVAL_LABEL;
  if (isStockOrderedStatus(normalized)) return STOCK_ORDERED_LABEL;
  return normalized;
}

function formatDashboardJobName(job) {
  return [
    job?.order_no,
    job?.customer_name,
    job?.job_title || job?.order_type,
  ].filter(Boolean).join(' - ');
}

module.exports = {
  AWAITING_APPROVAL_LABEL,
  WAITING_APPROVAL_LABEL,
  NO_STOCK_LABEL,
  STOCK_ORDERED_LABEL,
  HOLD_LABEL,
  PRE_PRODUCTION_LABEL,
  READY_TO_PRINT_LABEL,
  CHECKED_IN_LABEL,
  COMPLETED_LABEL,
  applyDashboardAutomations,
  applyPrivateDashboardAutomations,
  awaitingApprovalStatusValue,
  dashboardStatusIndex,
  dashboardStatusValue,
  deriveJobCategory,
  deriveTypeLabel,
  formatDashboardJobName,
  getColumnText,
  groupIdForStatusAndType,
  isAllowedUnapprovedManualStatus,
  isManualStatusAutomationOverride,
  isStockOrderedStatus,
  normalizeStatusLookupLabel,
  resolveDashboardGroupId,
  resolveJobApproved,
  resolvePrivateDashboardGroupId,
  sanitizeUnapprovedDashboardGroupId,
  statusLabelForApprovedPreProduction,
  statusLabelForMoveGroup,
  stockOrderedGroupIdForJob,
  stockOrderedStatusValue,
};
