const { TEST_DASHBOARD_COLUMN_IDS } = require('./testDashboardDefaults');

function clean(value) {
  return String(value || '').trim();
}

function getColumnText(value) {
  return clean(value?.text || '');
}

function dashboardFieldLabelsFromValues(columnValues = {}) {
  return {
    status: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]),
    priority: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY]),
    type: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]),
  };
}

function inferProofApproved(statusLabel) {
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

  if (Object.prototype.hasOwnProperty.call(labels, 'status')) {
    const statusLabel = clean(labels.status);
    values.push(statusLabel || null);
    fields.push(`dashboard_status = $${values.length}`);
    fields.push('dashboard_status_updated_at = NOW()');
    if (statusLabel.toUpperCase() === 'COMPLETED') {
      fields.push('is_complete = TRUE');
      fields.push('complete_date = COALESCE(complete_date, NOW())');
    }

    if (options.updateProofApproved !== false) {
      const proofApproved = inferProofApproved(labels.status);
      values.push(proofApproved);
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
  inferProofApproved,
  updateDatabaseJobDashboardFields,
};
