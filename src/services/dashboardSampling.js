const {
  TEST_DASHBOARD_COLUMN_IDS,
  TEST_DASHBOARD_GROUP_IDS,
  normalizeColumnTitle,
} = require('./testDashboardDefaults');

const DASHBOARD_SAMPLING_STATE_KEY = '__dashboard_sampling';
const SAMPLE_REQUIRED_MESSAGE = 'Set this job to SAMPLED before approving it or marking it READY TO PRINT.';
const JOB_APPROVAL_REQUIRED_MESSAGE = 'Tick JOB ✔ before setting READY TO PRINT.';

function dashboardSamplingState(job = {}, state = {}, history = {}) {
  const values = state?.column_values || {};
  const saved = values[DASHBOARD_SAMPLING_STATE_KEY] || {};
  const statuses = [job?.dashboard_status, values[TEST_DASHBOARD_COLUMN_IDS.STATUS]?.text]
    .map(normalizeColumnTitle);
  const required = history.required === true || saved.required === true
    || statuses.includes('TO SAMPLE') || state?.group_id === TEST_DASHBOARD_GROUP_IDS.TO_SAMPLE;
  const sampled = history.sampled === true || saved.sampled === true || statuses.includes('SAMPLED');
  return { required, sampled, blocked: required && !sampled };
}

// Private rows have no DATABASE activity log. Carry their sampling history in
// dashboard JSON, including when a legacy TO SAMPLE/SAMPLED row is moved away.
function rememberPrivateDashboardSampling(job) {
  if (!job) return job;
  const { required, sampled } = dashboardSamplingState({}, job);
  if (!required && !sampled) return job;
  return {
    ...job,
    column_values: {
      ...(job.column_values || {}),
      [DASHBOARD_SAMPLING_STATE_KEY]: { required, sampled },
    },
  };
}

async function fetchDashboardSamplingHistory(db, sourceOrderIds) {
  if (!sourceOrderIds.length) return new Map();
  const result = await db.query(
    `SELECT source_order_id,
            BOOL_OR(UPPER(BTRIM(status)) = 'TO SAMPLE'
              OR UPPER(BTRIM(COALESCE(previous_status, ''))) = 'TO SAMPLE') AS required,
            BOOL_OR(UPPER(BTRIM(status)) = 'SAMPLED'
              OR UPPER(BTRIM(COALESCE(previous_status, ''))) = 'SAMPLED') AS sampled
     FROM database_job_status_updates
     WHERE source_order_id = ANY($1::int[]) AND event_type = 'status'
     GROUP BY source_order_id`,
    [sourceOrderIds]
  );
  return new Map(result.rows.map(row => [row.source_order_id, row]));
}

module.exports = {
  DASHBOARD_SAMPLING_STATE_KEY,
  SAMPLE_REQUIRED_MESSAGE,
  JOB_APPROVAL_REQUIRED_MESSAGE,
  dashboardSamplingState,
  rememberPrivateDashboardSampling,
  fetchDashboardSamplingHistory,
};
