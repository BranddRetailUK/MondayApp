const { TEST_DASHBOARD_COLUMN_IDS } = require('./testDashboardDefaults');

function clean(value) {
  return String(value || '').trim();
}

function getColumnText(value) {
  return clean(value?.text || '');
}

function parseJsonMaybe(raw) {
  if (!raw || typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function checkboxIsChecked(value) {
  if (!value) return null;

  const parsed = parseJsonMaybe(value.value);
  if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'checked')) {
    return parsed.checked === true || String(parsed.checked).toLowerCase() === 'true';
  }

  const text = clean(value.text).toLowerCase();
  if (text === 'v' || text === '✓' || text === 'true' || text === 'checked') return true;
  if (!text) return false;
  return null;
}

function jobApprovedFromColumnValues(columnValues = {}) {
  return checkboxIsChecked(columnValues[TEST_DASHBOARD_COLUMN_IDS.JOB]);
}

function dashboardFieldLabelsFromValues(columnValues = {}) {
  const labels = {
    status: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]),
    priority: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY]),
    type: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]),
  };
  const jobApproved = jobApprovedFromColumnValues(columnValues);
  if (jobApproved !== null) labels.jobApproved = jobApproved;
  return labels;
}

function inferJobApproved(statusLabel) {
  const normalized = clean(statusLabel).toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('APPROVED')) return true;
  if (normalized.includes('WAITING APPROVAL') || normalized.includes('NOT APPROVED')) return false;
  if (normalized === 'READY TO PRINT' || normalized === 'IN PRODUCTION' || normalized === 'COMPLETED') return true;
  return null;
}

async function updateDatabaseJobDashboardFields(db, sourceOrderId, labels = {}, options = {}) {
  const fields = [];
  const values = [sourceOrderId];
  const hasExplicitJobApproved = Object.prototype.hasOwnProperty.call(labels, 'jobApproved')
    || Object.prototype.hasOwnProperty.call(labels, 'proofApproved');
  const explicitJobApproved = Object.prototype.hasOwnProperty.call(labels, 'jobApproved')
    ? labels.jobApproved
    : labels.proofApproved;

  if (Object.prototype.hasOwnProperty.call(labels, 'status')) {
    const statusLabel = clean(labels.status);
    values.push(statusLabel || null);
    fields.push(`dashboard_status = $${values.length}`);
    fields.push('dashboard_status_updated_at = NOW()');

    if (!hasExplicitJobApproved && options.inferJobApprovedFromStatus === true && options.updateJobApproved !== false && options.updateProofApproved !== false) {
      const jobApproved = inferJobApproved(labels.status);
      values.push(jobApproved);
      fields.push(`proof_approved = $${values.length}`);
      fields.push(`proof_approved_at = CASE WHEN $${values.length} IS TRUE THEN NOW() ELSE NULL END`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(labels, 'priority')) {
    values.push(clean(labels.priority) || null);
    fields.push(`dashboard_priority = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(labels, 'type')) {
    values.push(clean(labels.type) || null);
    fields.push(`dashboard_type = $${values.length}`);
  }

  if (hasExplicitJobApproved && options.updateJobApproved !== false && options.updateProofApproved !== false) {
    values.push(Boolean(explicitJobApproved));
    if (options.onlyBackfillJobApproved || options.onlyBackfillProofApproved) {
      fields.push(`proof_approved = CASE WHEN proof_approved IS NULL THEN $${values.length} ELSE proof_approved END`);
      fields.push(`proof_approved_at = CASE WHEN proof_approved IS NULL AND $${values.length} IS TRUE THEN NOW() ELSE proof_approved_at END`);
    } else {
      fields.push(`proof_approved = $${values.length}`);
      fields.push(`proof_approved_at = CASE WHEN $${values.length} IS TRUE THEN NOW() ELSE NULL END`);
    }
  }

  if (!fields.length) return null;

  const result = await db.query(
    `UPDATE database_jobs
     SET ${fields.join(', ')},
         updated_at_source = NOW(),
         imported_at = NOW()
     WHERE source_order_id = $1
     RETURNING source_order_id, dashboard_status, dashboard_priority, dashboard_type, proof_approved, proof_approved_at, is_complete, complete_date`,
    values
  );
  return result.rows[0] || null;
}

module.exports = {
  dashboardFieldLabelsFromValues,
  inferJobApproved,
  jobApprovedFromColumnValues,
  proofApprovedFromColumnValues: jobApprovedFromColumnValues,
  updateDatabaseJobDashboardFields,
};
