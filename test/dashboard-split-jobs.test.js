const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEST_DASHBOARD_COLUMN_IDS,
  TEST_DASHBOARD_COLUMNS,
} = require('../src/services/testDashboardDefaults');
const {
  buildDashboardSplitBoardItem,
} = require('../src/routes/test-dashboard');
const {
  DASHBOARD_SPLIT_COMPLETED_STATUS,
  DASHBOARD_SPLIT_READY_STATUS,
  dashboardSplitActivationReady,
  dashboardSplitBranchCompleted,
  dashboardSplitBranchGroupId,
  dashboardSplitBranchStatus,
  dashboardSplitMissingTicks,
  dashboardSplitTickState,
  defaultDashboardSplitState,
  parseSplitDashboardItemId,
  resolveDashboardSplitState,
  splitDashboardItemId,
  transitionDashboardSplitBranchStatus,
} = require('../src/services/dashboardSplitJobs');

function status(text) {
  return {
    id: TEST_DASHBOARD_COLUMN_IDS.STATUS,
    text,
    type: 'status',
    value: JSON.stringify({ index: 8 }),
  };
}

function checkbox(id, checked) {
  return {
    id,
    text: checked ? 'v' : '',
    type: 'checkbox',
    value: checked ? JSON.stringify({ checked: 'true' }) : JSON.stringify({}),
  };
}

function readyPrintEmbJob(overrides = {}) {
  return {
    source_order_id: 50422,
    order_type: 'Print + Emb',
    order_type_abbr: 'PE',
    dashboard_status: DASHBOARD_SPLIT_READY_STATUS,
    ...overrides,
  };
}

function checkedSplitValues() {
  return {
    [TEST_DASHBOARD_COLUMN_IDS.STATUS]: status(DASHBOARD_SPLIT_READY_STATUS),
    [TEST_DASHBOARD_COLUMN_IDS.TRANS]: checkbox(TEST_DASHBOARD_COLUMN_IDS.TRANS, true),
    [TEST_DASHBOARD_COLUMN_IDS.JAQ]: checkbox(TEST_DASHBOARD_COLUMN_IDS.JAQ, true),
  };
}

test('activates a dashboard split only for ready Print + Emb jobs with TRANS and JAQ checked', () => {
  const values = checkedSplitValues();
  assert.equal(dashboardSplitActivationReady(readyPrintEmbJob(), values), true);
  assert.equal(
    dashboardSplitActivationReady(
      readyPrintEmbJob({ order_type: 'Printing', order_type_abbr: 'P' }),
      values
    ),
    false
  );
  assert.equal(
    dashboardSplitActivationReady(readyPrintEmbJob(), {
      ...values,
      [TEST_DASHBOARD_COLUMN_IDS.TRANS]: checkbox(TEST_DASHBOARD_COLUMN_IDS.TRANS, false),
    }),
    false
  );
  assert.equal(
    dashboardSplitActivationReady(
      readyPrintEmbJob({ dashboard_status: 'IN PRODUCTION' }),
      values
    ),
    false
  );
});

test('reports the exact missing production ticks before READY TO PRINT', () => {
  const values = checkedSplitValues();
  assert.deepEqual(dashboardSplitMissingTicks(readyPrintEmbJob(), values), []);
  assert.deepEqual(
    dashboardSplitMissingTicks(readyPrintEmbJob(), {
      ...values,
      [TEST_DASHBOARD_COLUMN_IDS.TRANS]: checkbox(TEST_DASHBOARD_COLUMN_IDS.TRANS, false),
    }),
    ['TRANS']
  );
  assert.deepEqual(
    dashboardSplitMissingTicks(readyPrintEmbJob(), {
      ...values,
      [TEST_DASHBOARD_COLUMN_IDS.JAQ]: checkbox(TEST_DASHBOARD_COLUMN_IDS.JAQ, false),
    }),
    ['JAQ']
  );
  assert.deepEqual(
    dashboardSplitTickState(readyPrintEmbJob(), {
      ...values,
      [TEST_DASHBOARD_COLUMN_IDS.TRANS]: checkbox(TEST_DASHBOARD_COLUMN_IDS.TRANS, false),
      [TEST_DASHBOARD_COLUMN_IDS.JAQ]: checkbox(TEST_DASHBOARD_COLUMN_IDS.JAQ, false),
    }),
    { trans: false, jaq: false }
  );
});

test('uses the same JAQ fallback that is shown on the dashboard', () => {
  const values = checkedSplitValues();
  delete values[TEST_DASHBOARD_COLUMN_IDS.JAQ];
  assert.equal(
    dashboardSplitActivationReady(
      readyPrintEmbJob({ has_screens: true, screen_numbers: 'PSG123' }),
      values
    ),
    true
  );
});

test('builds stable virtual ids without creating another database job id', () => {
  assert.equal(splitDashboardItemId(50422, 'print'), '50422__split_print');
  assert.equal(splitDashboardItemId(50422, 'embroidery'), '50422__split_embroidery');
  assert.deepEqual(parseSplitDashboardItemId('50422__split_print'), {
    sourceOrderId: 50422,
    branch: 'print',
  });
  assert.equal(parseSplitDashboardItemId('50422'), null);
  assert.equal(parseSplitDashboardItemId('50422__split_other'), null);
});

test('keeps the total ready after the first completion and completes it only after the second', () => {
  const initial = defaultDashboardSplitState();
  const first = transitionDashboardSplitBranchStatus(initial, 'print', 'COMPLETED');
  assert.equal(first.allCompleted, false);
  assert.equal(first.aggregateStatus, DASHBOARD_SPLIT_READY_STATUS);
  assert.equal(dashboardSplitBranchCompleted(first.splitState, 'print'), true);
  assert.equal(dashboardSplitBranchCompleted(first.splitState, 'embroidery'), false);

  const second = transitionDashboardSplitBranchStatus(
    first.splitState,
    'embroidery',
    'COMPLETED'
  );
  assert.equal(second.allCompleted, true);
  assert.equal(second.aggregateStatus, DASHBOARD_SPLIT_COMPLETED_STATUS);
  assert.equal(second.splitState, null);
});

test('retains independent non-completed branch statuses while the split is active', () => {
  const splitState = defaultDashboardSplitState();
  const transition = transitionDashboardSplitBranchStatus(
    splitState,
    'embroidery',
    'IN PRODUCTION'
  );
  assert.equal(transition.aggregateStatus, DASHBOARD_SPLIT_READY_STATUS);
  assert.equal(dashboardSplitBranchStatus(transition.splitState, 'print'), 'READY TO PRINT');
  assert.equal(dashboardSplitBranchStatus(transition.splitState, 'embroidery'), 'IN PRODUCTION');
  assert.notEqual(
    dashboardSplitBranchGroupId('print'),
    dashboardSplitBranchGroupId('embroidery')
  );
});

test('resolves an implicit split for an existing ready job and a saved split thereafter', () => {
  const implicit = resolveDashboardSplitState(readyPrintEmbJob(), checkedSplitValues());
  assert.ok(implicit);

  const savedValues = {
    ...checkedSplitValues(),
    __split_job: transitionDashboardSplitBranchStatus(
      implicit,
      'print',
      'IN PRODUCTION'
    ).splitState,
  };
  const saved = resolveDashboardSplitState(
    readyPrintEmbJob({ dashboard_status: 'CHECKED IN' }),
    savedValues
  );
  assert.equal(dashboardSplitBranchStatus(saved, 'print'), 'IN PRODUCTION');

  assert.equal(
    resolveDashboardSplitState(
      readyPrintEmbJob({ dashboard_status: 'COMPLETED' }),
      savedValues
    ),
    null
  );
  assert.equal(
    resolveDashboardSplitState(
      readyPrintEmbJob({
        order_type: 'Printing',
        order_type_abbr: 'P',
        dashboard_status: 'READY TO PRINT',
      }),
      savedValues
    ),
    null
  );
});

test('builds separate Print and Embroidery board rows from one canonical database item', () => {
  const baseItem = {
    id: '50422',
    name: '51175 - Test Customer - Split production',
    database_job: {
      source_order_id: 50422,
      order_no: 51175,
      customer_name: 'Test Customer',
      job_title: 'Split production',
    },
    column_values: [
      status(DASHBOARD_SPLIT_READY_STATUS),
      { id: TEST_DASHBOARD_COLUMN_IDS.NOTES, text: 'Shared note', type: 'text', value: 'Shared note' },
    ],
    subitems: [{ id: '1', name: 'Garment', column_values: [] }],
  };
  const splitState = defaultDashboardSplitState();
  const print = buildDashboardSplitBoardItem({
    item: baseItem,
    splitState,
    branch: 'print',
    columns: TEST_DASHBOARD_COLUMNS,
  });
  const embroidery = buildDashboardSplitBoardItem({
    item: baseItem,
    splitState,
    branch: 'embroidery',
    columns: TEST_DASHBOARD_COLUMNS,
  });

  assert.equal(print.id, '50422__split_print');
  assert.equal(embroidery.id, '50422__split_embroidery');
  assert.equal(print.database_job.source_order_id, 50422);
  assert.equal(embroidery.database_job.source_order_id, 50422);
  assert.notEqual(print.group.id, embroidery.group.id);
  assert.equal(print.dashboard_split_job, true);
  assert.equal(embroidery.dashboard_split_job, true);
  assert.equal(print.column_values.find(value => value.id === TEST_DASHBOARD_COLUMN_IDS.STATUS).text, 'READY TO PRINT');
  assert.equal(embroidery.column_values.find(value => value.id === TEST_DASHBOARD_COLUMN_IDS.STATUS).text, 'READY TO PRINT');
});
