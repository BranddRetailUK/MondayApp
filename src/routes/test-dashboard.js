const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { fullName } = require('../services/hubAuth');
const { signPayload, advanceScan } = require('../services/scanner');
const {
  TEST_DASHBOARD_BOARD_ID,
  TEST_DASHBOARD_GROUPS,
  TEST_DASHBOARD_GROUP_IDS,
  TEST_DASHBOARD_COLUMNS,
  TEST_DASHBOARD_SUBITEM_COLUMNS,
  TEST_DASHBOARD_COLUMN_IDS,
  normalizeColumnTitle,
} = require('../services/testDashboardDefaults');
const {
  folderForColumn,
  publicIdForUpload,
  signUpload,
  destroyAsset,
  requireCloudinaryConfig,
} = require('../services/cloudinaryDashboard');
const {
  jobApprovedFromColumnValues,
  updateDatabaseJobDashboardFields,
} = require('../services/testDashboardDbFields');

const publicRouter = express.Router();
const protectedRouter = express.Router();

const EDITABLE_STATUS_TITLES = new Set(['STATUS', 'PRIORITY']);
const EDITABLE_TEXT_TITLES = new Set(['NOTES']);
const DEFAULT_OFFICE_GROUP_ID = TEST_DASHBOARD_GROUP_IDS.OFFICE;
const AWAITING_APPROVAL_LABEL = 'AWAITING APPROVAL';
const WAITING_APPROVAL_LABEL = 'WAITING APPROVAL';
const NO_STOCK_LABEL = 'NO STOCK';
const HOLD_LABEL = 'HOLD';
const PRE_PRODUCTION_LABEL = 'PRE-PRODUCTION';
const COMPLETED_LABEL = 'COMPLETED';
const APPROVAL_REQUIREMENTS_MESSAGE = 'Please add design number and/or Visual Proof.';
const DESIGN_POSITION_LOCK_KEY = 71060217;
const STITCH_REFERENCE_LABEL = String.raw`(?:STITCH[\s._/-]*COUNT|STITCHES?|S[\s._/-]*T(?:[\s._/-]*(?:S|C))?)`;
const PSG_REFERENCE_PATTERN = new RegExp(
  String.raw`\bP[\s._/-]*S[\s._/-]*G(?:[\s:._#/-]*(?:NO\.?|NUM(?:BER)?)?[\s:._#/-]*)?(\d+\s*[A-Z]?)\b` +
    String.raw`(?:\s*(?:[,;/|+&-]\s*)?(?:${STITCH_REFERENCE_LABEL}[\s:._#/-]*(\d[\d,\s]*\d)|(\d[\d,\s]*\d)))?`,
  'gi'
);
const STITCH_REFERENCE_PATTERN = new RegExp(
  String.raw`\b${STITCH_REFERENCE_LABEL}(?:[\s:._#/-]*(?:NO\.?|NUM(?:BER)?)?[\s:._#/-]*)?(\d[\d,\s]*\d)\b`,
  'gi'
);

protectedRouter.get('/api/test-dashboard/board', async (_req, res) => {
  try {
    await ensureTestDashboardDefaults(pool);
    const payload = await buildTestDashboardBoardPayload();
    res.json(payload);
  } catch (err) {
    console.error('GET /api/test-dashboard/board', err);
    res.status(500).json({ error: 'Failed to fetch test dashboard board' });
  }
});

protectedRouter.post('/api/test-dashboard/private-jobs', async (req, res) => {
  try {
    await ensureTestDashboardDefaults(pool);
    const columns = await fetchDashboardColumns(false);
    const job = await createPrivateDashboardJob({
      groupId: normalizeMoveTargetGroupId(req.body?.groupId) || TEST_DASHBOARD_GROUP_IDS.OFFICE,
      title: clean(req.body?.title),
      columns,
      user: req.hubUser,
    });
    res.status(201).json({ ok: true, item: buildPrivateBoardItem(job, columns) });
  } catch (err) {
    console.error('POST /api/test-dashboard/private-jobs', err);
    res.status(500).json({ error: 'Failed to create private dashboard job' });
  }
});

protectedRouter.delete('/api/test-dashboard/private-jobs/:jobId', async (req, res) => {
  const jobId = clean(req.params.jobId);
  if (!isPrivateDashboardJobId(jobId)) return res.status(400).json({ error: 'Invalid private dashboard job id' });

  try {
    await ensureTestDashboardDefaults(pool);
    const job = await fetchPrivateDashboardJob(jobId);
    if (!job) return res.status(404).json({ error: 'Private dashboard job not found' });

    const deleted = await pool.query(
      `DELETE FROM test_dashboard_private_jobs
       WHERE id = $1
       RETURNING id`,
      [jobId]
    );
    if (!deleted.rowCount) return res.status(404).json({ error: 'Private dashboard job not found' });

    for (const asset of privateDashboardFileAssets(job)) {
      destroyAsset(asset.publicId, asset.resourceType).catch((err) => {
        console.warn('[test-dashboard] Cloudinary private job cleanup failed:', err?.message || err);
      });
    }

    res.json({ ok: true, itemId: jobId });
  } catch (err) {
    console.error('DELETE /api/test-dashboard/private-jobs/:jobId', err);
    res.status(500).json({ error: 'Failed to delete private dashboard job' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/name', async (req, res) => {
  const jobId = clean(req.params.jobId);
  if (!isPrivateDashboardJobId(jobId)) return res.status(400).json({ error: 'Only private dashboard jobs can be renamed here' });
  const title = clean(req.body?.name || req.body?.title).slice(0, 300);

  try {
    await ensureTestDashboardDefaults(pool);
    const job = await fetchPrivateDashboardJob(jobId);
    if (!job) return res.status(404).json({ error: 'Private dashboard job not found' });
    const saved = await updatePrivateDashboardJob(job.id, {
      group_id: job.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE,
      item_name: title,
      column_values: job.column_values || {},
      archived: Boolean(job.archived),
    });
    res.json({ ok: true, itemId: saved.id, name: saved.item_name });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/name', err);
    res.status(500).json({ error: 'Failed to rename private dashboard job' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/group', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const groupId = normalizeMoveTargetGroupId(req.body?.groupId || req.body?.group);
  if (!groupId) return res.status(400).json({ error: 'Unsupported test dashboard group' });

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });

    const statusLabel = statusLabelForMoveGroup(groupId);
    const state = privateJob ? job : await fetchJobState(job.source_order_id);
    const columnValues = { ...(state?.column_values || {}) };
    const statusColumn = columnById(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS);
    if (statusColumn && statusLabel) {
      const status = statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, statusLabel);
      if (status) columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] = status;
    }
    if (groupId === TEST_DASHBOARD_GROUP_IDS.OFFICE) {
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
    }

    const nextState = {
      group_id: groupId,
      item_name: privateJob ? job.item_name || '' : (state?.item_name || formatJobName(job)),
      column_values: columnValues,
      archived: false,
    };
    const saved = privateJob
      ? await updatePrivateDashboardJob(job.id, nextState)
      : await upsertJobState(job.source_order_id, nextState);

    if (!privateJob) {
      const labels = {
        status: statusLabel,
      };
      if (groupId === TEST_DASHBOARD_GROUP_IDS.OFFICE) labels.priority = '';
      await updateDatabaseJobDashboardFields(pool, job.source_order_id, labels);
    }

    res.json({
      ok: true,
      itemId: privateJob ? job.id : String(job.source_order_id),
      groupId: saved.group_id,
      status: statusLabel,
    });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/group', err);
    res.status(500).json({ error: 'Failed to move test dashboard job' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/date-column', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const columnId = clean(req.body?.columnId);
  const rawDate = clean(req.body?.date);
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });
  const parsedDate = rawDate ? parseDashboardDateInput(rawDate) : null;
  if (rawDate && !parsedDate) return res.status(400).json({ error: 'Invalid date' });

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });
    if (!privateJob && isTruthyDatabaseValue(job.customer_date_required)) {
      return res.status(409).json({ error: 'This job uses a customer date from DATABASE' });
    }

    const column = columns.find(col => col.id === columnId);
    if (!column || column.type !== 'date') return res.status(400).json({ error: 'Column is not a test dashboard date column' });

    const state = privateJob ? job : await fetchJobState(job.source_order_id);
    const columnValues = { ...(state?.column_values || {}) };
    if (parsedDate) {
      columnValues[column.id] = dateValue(column, parsedDate);
      const priorityLabel = priorityLabelForDate(parsedDate);
      columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY] = statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, priorityLabel);
    } else {
      delete columnValues[column.id];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
    }

    const nextState = {
      group_id: state?.group_id || (privateJob ? TEST_DASHBOARD_GROUP_IDS.OFFICE : resolveDashboardGroupId(job, state, null)),
      item_name: privateJob ? state?.item_name || '' : state?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: Boolean(state?.archived),
    };
    const saved = privateJob
      ? await updatePrivateDashboardJob(job.id, nextState)
      : await upsertJobState(job.source_order_id, nextState);

    const priorityLabel = getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY]);
    if (!privateJob) {
      await updateDatabaseJobDashboardFields(pool, job.source_order_id, {
        priority: priorityLabel,
      });
    }

    res.json({
      ok: true,
      itemId: privateJob ? job.id : String(job.source_order_id),
      columnId: column.id,
      date: parsedDate || '',
      priority: priorityLabel,
      groupId: saved.group_id,
    });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/date-column', err);
    res.status(500).json({ error: 'Failed to update test dashboard date' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/status-column', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });
  const columnId = clean(req.body?.columnId);
  const requestedLabel = clean(req.body?.label);
  const clearRequested = req.body?.clear === true;
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });

    const column = columns.find(col => col.id === columnId);
    if (!column || column.type !== 'status') {
      return res.status(400).json({ error: 'Column is not a test dashboard status column' });
    }
    if (!EDITABLE_STATUS_TITLES.has(normalizeColumnTitle(column.title))) {
      return res.status(400).json({ error: 'Only test dashboard STATUS and PRIORITY columns can be updated' });
    }

    const state = privateJob ? job : await fetchJobState(sourceOrderId);
    const columnValues = { ...(state?.column_values || {}) };

    if (clearRequested) {
      if (normalizeColumnTitle(column.title) !== 'PRIORITY') {
        return res.status(400).json({ error: 'Only PRIORITY can be cleared' });
      }
      delete columnValues[columnId];
    } else {
      const option = findStatusOption(column, requestedLabel);
      if (!option) {
        return res.status(400).json({ error: 'Status label is not configured on that test dashboard column' });
      }
      columnValues[columnId] = statusValue(column, option.label, option.index);
    }

    const nextState = privateJob
      ? applyPrivateDashboardAutomations({
        currentJob: job,
        column,
        columnValues,
        changedLabel: clearRequested ? '' : requestedLabel,
        clearRequested,
      })
      : applyDashboardAutomations({
        job,
        currentState: state,
        column,
        columnValues,
        changedLabel: clearRequested ? '' : requestedLabel,
        clearRequested,
      });

    const saved = privateJob
      ? await updatePrivateDashboardJob(job.id, nextState)
      : await upsertJobState(sourceOrderId, nextState);
    if (!privateJob) {
      await updateDatabaseJobDashboardFields(
        pool,
        job.source_order_id,
        dashboardLabelsForChangedColumn(column, clearRequested ? '' : requestedLabel)
      );
    }
    res.json({
      ok: true,
      itemId: privateJob ? job.id : String(sourceOrderId),
      columnId,
      columnTitle: column.title,
      label: clearRequested ? '' : requestedLabel,
      cleared: clearRequested,
      groupId: saved.group_id,
      archived: saved.archived,
    });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/status-column', err);
    res.status(500).json({ error: 'Failed to update test dashboard status column' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/checkbox-column', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });
  const columnId = clean(req.body?.columnId);
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });
  const checked = req.body?.checked === true || req.body?.checked === 'true' || req.body?.checked === 1 || req.body?.checked === '1';

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });

    const column = columns.find(col => col.id === columnId);
    if (!column || column.type !== 'checkbox') {
      return res.status(400).json({ error: 'Column is not a test dashboard checkbox column' });
    }

    const state = privateJob ? job : await fetchJobState(job.source_order_id);
    const columnValues = { ...(state?.column_values || {}) };
    const isApprovalCheckbox = isProofApprovalCheckbox(column);
    let nextState = null;
    let databaseJob = null;

    if (isApprovalCheckbox) {
      if (checked) {
        const requirements = privateJob
          ? getPrivateApprovalRequirements(columnValues)
          : await getApprovalRequirements(job, columnValues);
        if (!requirements.ok) {
          return res.status(400).json({
            error: APPROVAL_REQUIREMENTS_MESSAGE,
            code: 'approval_requirements_missing',
            missing: requirements.missing,
          });
        }
        columnValues[column.id] = checkboxValue(column, true);
        applyApprovedDashboardColumnValues(columns, columnValues);
        nextState = {
          group_id: TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION,
          item_name: privateJob ? state?.item_name || '' : state?.item_name || formatJobName(job),
          column_values: columnValues,
          archived: false,
        };
        if (!privateJob) {
          databaseJob = await updateDatabaseJobDashboardFields(pool, job.source_order_id, {
            status: NO_STOCK_LABEL,
            priority: '',
            jobApproved: true,
          });
        }
      } else {
        columnValues[column.id] = checkboxValue(column, false);
        if (privateJob) {
          applyPrivateAwaitingApprovalColumnValues(columns, columnValues);
        } else {
          applyAwaitingApprovalColumnValues(job, columns, columnValues);
        }
        nextState = {
          group_id: TEST_DASHBOARD_GROUP_IDS.OFFICE,
          item_name: privateJob ? state?.item_name || '' : state?.item_name || formatJobName(job),
          column_values: columnValues,
          archived: false,
        };
        if (!privateJob) {
          databaseJob = await updateDatabaseJobDashboardFields(pool, job.source_order_id, {
            status: AWAITING_APPROVAL_LABEL,
            priority: '',
            jobApproved: false,
          });
        }
      }
    } else {
      columnValues[column.id] = checkboxValue(column, checked);
      nextState = {
        group_id: state?.group_id || (privateJob ? TEST_DASHBOARD_GROUP_IDS.OFFICE : resolveDashboardGroupId(job, state, null)),
        item_name: privateJob ? state?.item_name || '' : state?.item_name || formatJobName(job),
        column_values: columnValues,
        archived: Boolean(state?.archived),
      };
    }

    const saved = privateJob
      ? await updatePrivateDashboardJob(job.id, nextState)
      : await upsertJobState(job.source_order_id, nextState);

    res.json({
      ok: true,
      itemId: privateJob ? job.id : String(job.source_order_id),
      columnId: column.id,
      columnTitle: column.title,
      checked,
      groupId: saved.group_id,
      archived: saved.archived,
      databaseJob,
    });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/checkbox-column', err);
    res.status(500).json({ error: 'Failed to update test dashboard checkbox column' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/text-column', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });
  const columnId = clean(req.body?.columnId);
  const hasValue = Object.prototype.hasOwnProperty.call(req.body || {}, 'value');
  const value = clean(req.body?.value).slice(0, 2000);
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });
  if (!hasValue) return res.status(400).json({ error: 'Text value is required' });

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });

    const column = columns.find(col => col.id === columnId);
    if (!column || !['text', 'long_text'].includes(column.type)) {
      return res.status(400).json({ error: 'Column is not a test dashboard text column' });
    }
    if (!privateJob && !EDITABLE_TEXT_TITLES.has(normalizeColumnTitle(column.title))) {
      return res.status(400).json({ error: 'Only the test dashboard NOTES column can be updated' });
    }

    const state = privateJob ? job : await fetchJobState(job.source_order_id);
    const columnValues = { ...(state?.column_values || {}) };
    columnValues[column.id] = textValue(column, value);

    const nextState = {
      group_id: state?.group_id || (privateJob ? TEST_DASHBOARD_GROUP_IDS.OFFICE : resolveDashboardGroupId(job, state, null)),
      item_name: privateJob ? state?.item_name || '' : state?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: Boolean(state?.archived),
    };
    const saved = privateJob
      ? await updatePrivateDashboardJob(job.id, nextState)
      : await upsertJobState(job.source_order_id, nextState);

    res.json({
      ok: true,
      itemId: privateJob ? job.id : String(job.source_order_id),
      columnId: column.id,
      columnTitle: column.title,
      value,
      groupId: saved.group_id,
      archived: saved.archived,
    });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/text-column', err);
    res.status(500).json({ error: 'Failed to update test dashboard text column' });
  }
});

protectedRouter.put('/api/test-dashboard/items/:jobId/design-column', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });
  const columnId = clean(req.body?.columnId);
  const hasValue = Object.prototype.hasOwnProperty.call(req.body || {}, 'value');
  const rawValue = cleanDesignColumnText(req.body?.value);
  if (!hasValue) return res.status(400).json({ error: 'Design / PSG value is required' });

  try {
    await ensureTestDashboardDefaults(pool);
    if (privateJob) {
      const [job, column] = await Promise.all([
        fetchPrivateDashboardJob(jobId),
        columnId ? fetchDashboardColumn(columnId) : Promise.resolve(columnById(TEST_DASHBOARD_COLUMNS, TEST_DASHBOARD_COLUMN_IDS.DESIGN)),
      ]);
      if (!job) return res.status(404).json({ error: 'Private dashboard job not found' });
      if (!isDesignDashboardColumn(column)) {
        return res.status(400).json({ error: 'Column is not the test dashboard DES/PSG column' });
      }
      const columnValues = { ...(job.column_values || {}) };
      columnValues[column.id] = textValue(column, rawValue);
      const saved = await updatePrivateDashboardJob(job.id, {
        group_id: job.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE,
        item_name: job.item_name || '',
        column_values: columnValues,
        archived: Boolean(job.archived),
      });
      return res.json({
        ok: true,
        itemId: job.id,
        columnId: column.id,
        inserted: false,
        insertedCount: 0,
        updatedCount: 1,
        removedCount: rawValue ? 0 : 1,
        designText: getColumnText(saved.column_values?.[column.id]),
        positions: [],
      });
    }

    const [job, column] = await Promise.all([
      fetchDashboardJob(sourceOrderId),
      columnId ? fetchDashboardColumn(columnId) : Promise.resolve(columnById(TEST_DASHBOARD_COLUMNS, TEST_DASHBOARD_COLUMN_IDS.DESIGN)),
    ]);
    if (!job) return res.status(404).json({ error: 'Database job not found' });
    if (!isDesignDashboardColumn(column)) {
      return res.status(400).json({ error: 'Column is not the test dashboard DES/PSG column' });
    }

    const result = await appendDashboardDesignPosition(job, rawValue);
    res.json({
      ok: true,
      itemId: String(job.source_order_id),
      columnId: column.id,
      inserted: result.inserted,
      insertedCount: result.insertedCount || 0,
      updatedCount: result.updatedCount || 0,
      removedCount: result.removedCount || 0,
      designText: designTextFromPositions(result.positions, job),
      positions: result.positions,
    });
  } catch (err) {
    console.error('PUT /api/test-dashboard/items/:jobId/design-column', err);
    res.status(500).json({ error: 'Failed to save test dashboard design / PSG value' });
  }
});

protectedRouter.get('/api/test-dashboard/scan-url', (req, res) => {
  const jobId = clean(req.query.jobId || req.query.itemId);
  if (!jobId) return res.status(400).json({ error: 'jobId required' });
  const ts = Date.now().toString();
  const sig = signPayload(jobId, ts);
  const base = `${req.protocol}://${req.get('host')}`;
  const url = `${base}/test-scan?j=${encodeURIComponent(jobId)}&ts=${ts}&sig=${sig}`;
  res.json({ url });
});

protectedRouter.post('/api/test-dashboard/scanner', async (req, res) => {
  try {
    const { scan } = req.body || {};
    if (!scan || typeof scan !== 'string') return res.status(400).json({ error: 'No scan data' });
    const parsed = parseTestScan(scan);
    if (!parsed.jobId) return res.status(400).json({ error: 'Invalid test dashboard scan string' });
    const result = await recordTestDashboardScan(parsed.jobId);
    res.json({ ok: true, item: parsed.jobId, ...result });
  } catch (err) {
    console.error('POST /api/test-dashboard/scanner', err);
    res.status(500).json({ error: 'Failed to process test dashboard scan' });
  }
});

protectedRouter.post('/api/test-dashboard/uploads/signature', async (req, res) => {
  const jobId = clean(req.body?.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  const columnId = clean(req.body?.columnId);
  const filename = clean(req.body?.filename) || 'file';
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });

  try {
    requireCloudinaryConfig();
    await ensureTestDashboardDefaults(pool);
    const [job, column] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumn(columnId),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });
    if (!column || column.type !== 'file') return res.status(400).json({ error: 'Column is not a file/image column' });

    const folder = folderForColumn(column, privateJob ? `private-${job.id}` : (job.order_no || sourceOrderId));
    const publicId = publicIdForUpload({ filename, source: privateJob ? `private-${job.id}` : `job-${job.order_no || sourceOrderId}` });
    res.json(signUpload({ folder, publicId }));
  } catch (err) {
    console.error('POST /api/test-dashboard/uploads/signature', err);
    res.status(500).json({ error: err.message || 'Failed to sign Cloudinary upload' });
  }
});

protectedRouter.post('/api/test-dashboard/items/:jobId/files', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const columnId = clean(req.body?.columnId);
  const publicId = clean(req.body?.publicId || req.body?.public_id);
  const secureUrl = clean(req.body?.secureUrl || req.body?.secure_url);
  if (!columnId || !publicId || !secureUrl) {
    return res.status(400).json({ error: 'columnId, publicId, and secureUrl are required' });
  }

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, column] = await Promise.all([
      privateJob ? fetchPrivateDashboardJob(jobId) : fetchDashboardJob(sourceOrderId),
      fetchDashboardColumn(columnId),
    ]);
    if (!job) return res.status(404).json({ error: privateJob ? 'Private dashboard job not found' : 'Database job not found' });
    if (!column || column.type !== 'file') return res.status(400).json({ error: 'Column is not a file/image column' });

    if (privateJob) {
      const file = privateUploadFileFromBody(req.body, column, {
        publicId,
        secureUrl,
        createdByName: req.hubUser ? fullName(req.hubUser) : '',
      });
      const columnValues = { ...(job.column_values || {}) };
      const currentFiles = privateFilesFromColumnValue(columnValues[column.id]);
      columnValues[column.id] = fileColumnPayloadFromFiles(column, [...currentFiles, file]);
      await updatePrivateDashboardJob(job.id, {
        group_id: job.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE,
        item_name: job.item_name || '',
        column_values: columnValues,
        archived: Boolean(job.archived),
      });
      return res.status(201).json({ file: privateFileToApi(file, column.id) });
    }

    const inserted = await pool.query(
      `INSERT INTO test_dashboard_files (
         source_order_id,
         column_id,
         column_title,
         public_id,
         secure_url,
         resource_type,
         format,
         original_filename,
         bytes,
         width,
         height,
         metadata,
         created_by_user_id,
         created_by_name,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (public_id) DO UPDATE SET
         secure_url = EXCLUDED.secure_url,
         resource_type = EXCLUDED.resource_type,
         format = EXCLUDED.format,
         original_filename = EXCLUDED.original_filename,
         bytes = EXCLUDED.bytes,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING *`,
      [
        sourceOrderId,
        column.id,
        column.title,
        publicId,
        secureUrl,
        clean(req.body?.resourceType || req.body?.resource_type) || null,
        clean(req.body?.format) || null,
        clean(req.body?.originalFilename || req.body?.original_filename) || null,
        nullableInt(req.body?.bytes),
        nullableInt(req.body?.width),
        nullableInt(req.body?.height),
        req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
        req.hubUser?.id || null,
        req.hubUser ? fullName(req.hubUser) : null,
      ]
    );

    res.status(201).json({ file: dbFileToApi(inserted.rows[0]) });
  } catch (err) {
    console.error('POST /api/test-dashboard/items/:jobId/files', err);
    res.status(500).json({ error: 'Failed to save test dashboard file metadata' });
  }
});

protectedRouter.delete('/api/test-dashboard/items/:jobId/proof-files', async (req, res) => {
  const jobId = clean(req.params.jobId);
  const privateJob = isPrivateDashboardJobId(jobId);
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!privateJob && !Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  try {
    await ensureTestDashboardDefaults(pool);

    if (privateJob) {
      const job = await fetchPrivateDashboardJob(jobId);
      if (!job) return res.status(404).json({ error: 'Private dashboard job not found' });

      const columnValues = { ...(job.column_values || {}) };
      const files = privateFilesFromColumnValue(columnValues[TEST_DASHBOARD_COLUMN_IDS.PROOF]);
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PROOF];
      await updatePrivateDashboardJob(job.id, {
        group_id: job.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE,
        item_name: job.item_name || '',
        column_values: columnValues,
        archived: Boolean(job.archived),
      });

      destroyPrivateFileAssets(files, 'proof cleanup');
      return res.json({ ok: true, itemId: job.id, removed: files.length });
    }

    const job = await fetchDashboardJob(sourceOrderId);
    if (!job) return res.status(404).json({ error: 'Database job not found' });

    const deleted = await pool.query(
      `DELETE FROM test_dashboard_files
       WHERE source_order_id = $1
         AND column_id = $2
       RETURNING *`,
      [sourceOrderId, TEST_DASHBOARD_COLUMN_IDS.PROOF]
    );

    for (const row of deleted.rows) {
      destroyAsset(row.public_id, row.resource_type).catch((err) => {
        console.warn('[test-dashboard] Cloudinary proof cleanup failed:', err?.message || err);
      });
    }

    res.json({ ok: true, itemId: String(sourceOrderId), removed: deleted.rowCount });
  } catch (err) {
    console.error('DELETE /api/test-dashboard/items/:jobId/proof-files', err);
    res.status(500).json({ error: 'Failed to remove test dashboard proof' });
  }
});

protectedRouter.delete('/api/test-dashboard/items/:jobId/files/:fileId', async (req, res) => {
  const sourceOrderId = Number.parseInt(req.params.jobId, 10);
  const fileId = Number.parseInt(req.params.fileId, 10);
  if (!Number.isFinite(sourceOrderId) || !Number.isFinite(fileId)) {
    return res.status(400).json({ error: 'Invalid job or file id' });
  }

  try {
    const deleted = await pool.query(
      `DELETE FROM test_dashboard_files
       WHERE id = $1 AND source_order_id = $2
       RETURNING *`,
      [fileId, sourceOrderId]
    );
    if (!deleted.rowCount) return res.status(404).json({ error: 'Test dashboard file not found' });

    destroyAsset(deleted.rows[0].public_id, deleted.rows[0].resource_type).catch((err) => {
      console.warn('[test-dashboard] Cloudinary destroy failed:', err?.message || err);
    });
    res.json({ ok: true, fileId });
  } catch (err) {
    console.error('DELETE /api/test-dashboard/items/:jobId/files/:fileId', err);
    res.status(500).json({ error: 'Failed to delete test dashboard file' });
  }
});

publicRouter.get('/test-scan', async (req, res) => {
  const jobId = clean(req.query.j || req.query.i);
  const ts = clean(req.query.ts);
  const sig = clean(req.query.sig);
  const wantsJson = Boolean(req.query.json);
  if (!jobId || !ts || !sig) return sendScanError(res, wantsJson, 400, 'Invalid scan URL');
  if (signPayload(jobId, ts) !== sig) return sendScanError(res, wantsJson, 403, 'Signature check failed');

  try {
    const result = await recordTestDashboardScan(jobId);
    if (wantsJson) return res.json({ ok: true, ...result });
    return res.send(
      `<html><body style="font-family:Arial;padding:20px">
        <div>Test dashboard scan recorded</div>
        <div>Count: ${result.scan_count} - Status: <b>${escapeHtml(result.status)}</b></div>
        <script>setTimeout(()=>{ try{window.close()}catch(e){} }, 1200)</script>
      </body></html>`
    );
  } catch (err) {
    console.error('GET /test-scan', err);
    return sendScanError(res, wantsJson, 500, 'Failed to update test dashboard scan');
  }
});

async function buildTestDashboardBoardPayload() {
  const [columns, subitemColumns, groups, jobs, privateJobs] = await Promise.all([
    fetchDashboardColumns(false),
    fetchDashboardColumns(true),
    fetchDashboardGroups(),
    fetchOpenDashboardJobs(),
    fetchPrivateDashboardJobs(),
  ]);
  const candidateJobs = jobs.filter(job => deriveJobCategory(job) !== 'gifts');
  const sourceOrderIds = candidateJobs.map(job => job.source_order_id);
  const [states, lineItems, initialPositions, files, scans] = await Promise.all([
    fetchStateMap(sourceOrderIds),
    fetchLineItemMap(sourceOrderIds),
    fetchPositionMap(sourceOrderIds),
    fetchFileMap(sourceOrderIds),
    fetchScanMap(sourceOrderIds),
  ]);
  let positions = initialPositions;
  if (await backfillDashboardDesignPositions(candidateJobs, states, positions, scans)) {
    positions = await fetchPositionMap(sourceOrderIds);
  }

  const grouped = new Map(groups.map(group => [group.id, []]));
  for (const job of candidateJobs) {
    const state = states.get(job.source_order_id) || null;
    const scan = scans.get(String(job.source_order_id)) || null;
    if (!shouldRenderDashboardJob(job, state, scan)) continue;
    const item = buildBoardItem({
      job,
      state,
      columns,
      subitemColumns,
      lineItems: lineItems.get(job.source_order_id) || [],
      positions: positions.get(job.source_order_id) || [],
      files: files.get(job.source_order_id) || new Map(),
      scan,
    });
    const groupId = resolveDashboardGroupId(job, state, scan);
    if (!grouped.has(groupId)) grouped.set(groupId, []);
    grouped.get(groupId).push(item);
  }
  for (const privateJob of privateJobs) {
    if (privateJob.archived) continue;
    const item = buildPrivateBoardItem(privateJob, columns);
    const groupId = resolvePrivateDashboardGroupId(privateJob);
    if (!grouped.has(groupId)) grouped.set(groupId, []);
    grouped.get(groupId).push(item);
  }

  return {
    boards: [{
      id: TEST_DASHBOARD_BOARD_ID,
      name: 'Test Dashboard',
      columns,
      subitemColumns,
      groups: groups.map(group => ({
        id: group.id,
        title: group.title,
        color: group.color,
        position: group.position,
        items_page: { items: grouped.get(group.id) || [] },
      })),
    }],
  };
}

function shouldRenderDashboardJob(job, state, scan) {
  if (deriveJobCategory(job) === 'gifts') return false;
  if (state?.archived) return false;
  const stateValues = state?.column_values || {};
  const statusText = normalizeColumnTitle(
    job.dashboard_status || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]) || scan?.status || ''
  );
  if (statusText === 'INVOICED') return false;
  if (statusText === 'COMPLETED' && isDashboardJobInvoiced(job)) return false;
  return hasDashboardIdentity(job, state, scan);
}

function isDashboardJobInvoiced(job) {
  return Boolean(job?.is_complete || job?.invoice_printed || job?.pf_invoice_printed);
}

function hasDashboardIdentity(job, state, scan) {
  const stateValues = state?.column_values || {};
  return Boolean(
    clean(job.dashboard_status) ||
    clean(job.dashboard_priority) ||
    clean(scan?.status) ||
    state?.monday_item_id ||
    clean(state?.group_id) ||
    clean(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS])) ||
    clean(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY]))
  );
}

function buildBoardItem({ job, state, columns, subitemColumns, lineItems, positions, files, scan }) {
  const stateValues = state?.column_values || {};
  const values = new Map();
  const itemName = state?.item_name || formatJobName(job);
  const groupId = resolveDashboardGroupId(job, state, scan);
  const typeLabel = deriveTypeLabel(job);
  const designText = designTextFromPositions(positions, job);
  const fallbackDesignText = getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN]);
  const jobApproved = resolveJobApproved(job, stateValues);

  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, jobApproved
    ? statusValueFromJobOrState(columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, job.dashboard_priority, stateValues)
    : stateValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY] || null);
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JOB, checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JOB), jobApproved));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DATE, customerDateValue(job, columns) || stateValues[TEST_DASHBOARD_COLUMN_IDS.DATE] || null);
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TRANS, stateValues[TEST_DASHBOARD_COLUMN_IDS.TRANS] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.TRANS), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JAQ, stateValues[TEST_DASHBOARD_COLUMN_IDS.JAQ] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JAQ), Boolean(job.has_screens || job.screen_numbers)));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, jobApproved
    ? (statusValueFromJobOrState(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, job.dashboard_status, stateValues) || statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, scan?.status || ''))
    : unapprovedStatusValue(columns, job, stateValues));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TYPE, statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.TYPE, typeLabel) || stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE] || statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.TYPE, job.dashboard_type));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DESIGN, textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DESIGN), designText || fallbackDesignText));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.NOTES, stateValues[TEST_DASHBOARD_COLUMN_IDS.NOTES] || textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.NOTES), job.comments || ''));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN, stateValues[TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN), Boolean(scan?.scan_count >= 1)));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JOB_OWNER, stateValues[TEST_DASHBOARD_COLUMN_IDS.JOB_OWNER] || textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JOB_OWNER), job.order_owner_name || job.order_taken_by || ''));

  for (const column of columns) {
    if (column.type === 'file') {
      putIfColumn(values, columns, column.id, fileColumnValue(column, files.get(column.id) || []));
    } else if (stateValues[column.id] && !values.has(column.id)) {
      values.set(column.id, stateValues[column.id]);
    }
  }

  return {
    id: String(job.source_order_id),
    name: itemName,
    group: {
      id: groupId,
      title: '',
      color: null,
    },
    database_job: {
      source_order_id: job.source_order_id,
      order_no: job.order_no,
      customer_date_required: Boolean(job.customer_date_required),
    },
    column_values: Array.from(values.values()).filter(Boolean),
    subitems: lineItems
      .filter(isDashboardVisibleLineItem)
      .map(line => buildSubitem(line, subitemColumns)),
  };
}

function buildPrivateBoardItem(job, columns) {
  const stateValues = job?.column_values || {};
  const values = new Map();
  const jobApproved = jobApprovedFromColumnValues(stateValues) === true;

  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, stateValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY] || null);
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JOB, stateValues[TEST_DASHBOARD_COLUMN_IDS.JOB] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JOB), jobApproved));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DATE, stateValues[TEST_DASHBOARD_COLUMN_IDS.DATE] || null);
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TRANS, stateValues[TEST_DASHBOARD_COLUMN_IDS.TRANS] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.TRANS), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JAQ, stateValues[TEST_DASHBOARD_COLUMN_IDS.JAQ] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JAQ), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] || awaitingApprovalStatusValue(columns));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TYPE, stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE] || null);
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DESIGN, stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN] || textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DESIGN), ''));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.NOTES, stateValues[TEST_DASHBOARD_COLUMN_IDS.NOTES] || textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.NOTES), ''));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN, stateValues[TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JOB_OWNER, stateValues[TEST_DASHBOARD_COLUMN_IDS.JOB_OWNER] || textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JOB_OWNER), job.created_by_name || ''));

  for (const column of columns) {
    if (stateValues[column.id] && !values.has(column.id)) {
      values.set(column.id, stateValues[column.id]);
    }
  }

  return {
    id: job.id,
    name: job.item_name || '',
    group: {
      id: resolvePrivateDashboardGroupId(job),
      title: '',
      color: null,
    },
    database_job: null,
    dashboard_private_job: true,
    column_values: Array.from(values.values()).filter(Boolean),
    subitems: [],
  };
}

function isDashboardVisibleLineItem(line) {
  if (!line) return false;
  if (isTruthyDatabaseValue(line.is_non_deliverable) || isTruthyDatabaseValue(line.is_internal)) return false;

  const description = clean(line.line_description || line.style_name || '');
  return !/^delivery\b/i.test(description);
}

function isTruthyDatabaseValue(value) {
  if (value === true || value === 1) return true;
  const text = clean(value).toLowerCase();
  return text === 'true' || text === 't' || text === 'yes' || text === 'y' || text === '1';
}

function buildSubitem(line, columns) {
  const values = [
    textValue(columnByTitle(columns, 'SIZE'), line.size || ''),
    textValue(columnByTitle(columns, 'QTY'), line.quantity == null ? '' : String(line.quantity)),
    textValue(columnByTitle(columns, 'CODE'), line.style_code || line.alt_style_code || ''),
    textValue(columnByTitle(columns, 'COLOUR'), line.colour || ''),
  ].filter(Boolean);
  return {
    id: String(line.source_order_item_id),
    name: line.line_description || line.style_name || line.style_code || `Line ${line.source_order_item_id}`,
    column_values: values,
  };
}

function resolveJobApproved(job, stateValues = {}) {
  const seededJobApproved = jobApprovedFromColumnValues(stateValues);
  return seededJobApproved === null ? job?.proof_approved === true : seededJobApproved;
}

function customerDateValue(job, columns) {
  if (!isTruthyDatabaseValue(job?.customer_date_required)) return null;
  return dateValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DATE), job?.delivery_date);
}

function awaitingApprovalStatusValue(columns) {
  return statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, AWAITING_APPROVAL_LABEL);
}

function unapprovedStatusValue(columns, job, stateValues = {}) {
  const label = clean(job?.dashboard_status) || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]);
  if (isAllowedUnapprovedManualStatus(label)) {
    return statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, label);
  }
  return awaitingApprovalStatusValue(columns);
}

function isAllowedUnapprovedManualStatus(label) {
  const normalized = normalizeColumnTitle(label);
  return normalized === HOLD_LABEL ||
    normalized === NO_STOCK_LABEL ||
    normalized === PRE_PRODUCTION_LABEL ||
    normalized === COMPLETED_LABEL ||
    normalized === 'TO SAMPLE' ||
    normalized === 'SAMPLED';
}

function applyAwaitingApprovalColumnValues(job, columns, columnValues) {
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];

  const dueDateValue = customerDateValue(job, columns);
  if (dueDateValue) {
    columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE] = dueDateValue;
  } else {
    delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
  }

  const status = awaitingApprovalStatusValue(columns);
  if (status) columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] = status;
}

function applyPrivateAwaitingApprovalColumnValues(columns, columnValues) {
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];

  const status = awaitingApprovalStatusValue(columns);
  if (status) columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] = status;
}

function applyApprovedDashboardColumnValues(columns, columnValues) {
  delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];

  const dueDate = dateValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DATE), addDaysFromTodayIso(14));
  if (dueDate) columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE] = dueDate;

  const status = statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, NO_STOCK_LABEL);
  if (status) columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] = status;
}

async function getApprovalRequirements(job, stateValues = {}) {
  const [positions, hasProof] = await Promise.all([
    fetchPositionsForApproval(job.source_order_id),
    hasProofFile(job.source_order_id),
  ]);
  const designText = designTextFromPositions(positions, job) ||
    cleanDesignColumnText(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN]));
  const missing = [];
  if (!designText) missing.push('design');
  if (!hasProof) missing.push('proof');
  return {
    ok: missing.length === 0,
    missing,
  };
}

function getPrivateApprovalRequirements(stateValues = {}) {
  const designText = cleanDesignColumnText(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN]));
  const proofFiles = privateFilesFromColumnValue(stateValues[TEST_DASHBOARD_COLUMN_IDS.PROOF]);
  const proofText = getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.PROOF]);
  const missing = [];
  if (!designText) missing.push('design');
  if (!proofFiles.length && !proofText) missing.push('proof');
  return {
    ok: missing.length === 0,
    missing,
  };
}

async function fetchPositionsForApproval(sourceOrderId) {
  const result = await pool.query(
    `SELECT *
     FROM database_job_positions
     WHERE source_order_id = $1
     ORDER BY COALESCE(position_sort_order, source_order_position_id), source_order_position_id`,
    [sourceOrderId]
  );
  return result.rows;
}

async function hasProofFile(sourceOrderId) {
  const result = await pool.query(
    `SELECT 1
     FROM test_dashboard_files
     WHERE source_order_id = $1
       AND column_id = $2
     LIMIT 1`,
    [sourceOrderId, TEST_DASHBOARD_COLUMN_IDS.PROOF]
  );
  return result.rowCount > 0;
}

async function ensureTestDashboardDefaults(db) {
  for (const group of TEST_DASHBOARD_GROUPS) {
    await db.query(
      `INSERT INTO test_dashboard_groups (id, title, color, position, sort_order, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = COALESCE(test_dashboard_groups.title, EXCLUDED.title),
         color = COALESCE(test_dashboard_groups.color, EXCLUDED.color),
         position = COALESCE(test_dashboard_groups.position, EXCLUDED.position),
         sort_order = COALESCE(test_dashboard_groups.sort_order, EXCLUDED.sort_order),
         updated_at = NOW()`,
      [group.id, group.title, group.color, group.position, group.sort_order]
    );
  }

  for (const column of TEST_DASHBOARD_COLUMNS) {
    await upsertColumnDefault(db, column, false);
  }
  for (const column of TEST_DASHBOARD_SUBITEM_COLUMNS) {
    await upsertColumnDefault(db, column, true);
  }
}

async function upsertColumnDefault(db, column, isSubitem) {
  await db.query(
    `INSERT INTO test_dashboard_columns (id, title, type, settings_str, is_subitem, position, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (id, is_subitem) DO UPDATE SET
       title = COALESCE(test_dashboard_columns.title, EXCLUDED.title),
       type = COALESCE(test_dashboard_columns.type, EXCLUDED.type),
       settings_str = COALESCE(NULLIF(test_dashboard_columns.settings_str, ''), EXCLUDED.settings_str),
       position = COALESCE(test_dashboard_columns.position, EXCLUDED.position),
       updated_at = NOW()`,
    [column.id, column.title, column.type, column.settings_str || '', isSubitem, column.position || null]
  );
}

async function fetchDashboardGroups() {
  const result = await pool.query(
    `SELECT id, title, color, position
     FROM test_dashboard_groups
     ORDER BY COALESCE(sort_order, 999999), position NULLS LAST, title`
  );
  return result.rows.length ? result.rows : TEST_DASHBOARD_GROUPS;
}

async function fetchDashboardColumns(isSubitem) {
  const result = await pool.query(
    `SELECT id, title, type, COALESCE(settings_str, '') AS settings_str
     FROM test_dashboard_columns
     WHERE is_subitem = $1
     ORDER BY COALESCE(position, 999999), title`,
    [Boolean(isSubitem)]
  );
  const fallback = isSubitem ? TEST_DASHBOARD_SUBITEM_COLUMNS : TEST_DASHBOARD_COLUMNS;
  return result.rows.length ? result.rows : fallback;
}

async function fetchDashboardColumn(columnId) {
  const result = await pool.query(
    `SELECT id, title, type, COALESCE(settings_str, '') AS settings_str
     FROM test_dashboard_columns
     WHERE id = $1 AND is_subitem IS FALSE
     LIMIT 1`,
    [columnId]
  );
  return result.rows[0] || TEST_DASHBOARD_COLUMNS.find(column => column.id === columnId) || null;
}

async function fetchOpenDashboardJobs() {
  const result = await pool.query(`
    SELECT j.*
    FROM database_jobs j
    LEFT JOIN test_dashboard_job_state td_state ON td_state.source_order_id = j.source_order_id
    LEFT JOIN job_scans scan ON scan.item_id = j.source_order_id::text
    WHERE COALESCE(UPPER(TRIM(j.dashboard_status)), '') <> 'INVOICED'
      AND (
        (
          j.is_complete IS NOT TRUE
          AND j.invoice_printed IS NOT TRUE
          AND j.pf_invoice_printed IS NOT TRUE
        )
        OR j.dashboard_status IS NOT NULL
        OR j.dashboard_priority IS NOT NULL
        OR td_state.source_order_id IS NOT NULL
        OR scan.item_id IS NOT NULL
      )
    ORDER BY COALESCE(order_date, created_at_source, updated_at_source) DESC NULLS LAST,
             order_no DESC
  `);
  return result.rows;
}

async function fetchDashboardJob(sourceOrderId) {
  const result = await pool.query(
    `SELECT *
     FROM database_jobs
     WHERE source_order_id = $1 OR order_no = $1
     ORDER BY CASE WHEN source_order_id = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [sourceOrderId]
  );
  return result.rows[0] || null;
}

async function fetchPrivateDashboardJobs() {
  const result = await pool.query(
    `SELECT *
     FROM test_dashboard_private_jobs
     WHERE archived IS NOT TRUE
     ORDER BY created_at ASC, id ASC`
  );
  return result.rows;
}

async function fetchPrivateDashboardJob(jobId) {
  const result = await pool.query(
    `SELECT *
     FROM test_dashboard_private_jobs
     WHERE id = $1
     LIMIT 1`,
    [jobId]
  );
  return result.rows[0] || null;
}

async function createPrivateDashboardJob({ groupId, title, columns, user }) {
  const id = `private_${crypto.randomUUID()}`;
  const columnValues = {};
  applyPrivateAwaitingApprovalColumnValues(columns, columnValues);
  const result = await pool.query(
    `INSERT INTO test_dashboard_private_jobs (
       id,
       group_id,
       item_name,
       column_values,
       archived,
       created_by_user_id,
       created_by_name,
       updated_at
     ) VALUES ($1,$2,$3,$4,FALSE,$5,$6,NOW())
     RETURNING *`,
    [
      id,
      groupId || TEST_DASHBOARD_GROUP_IDS.OFFICE,
      title || '',
      columnValues,
      user?.id || null,
      user ? fullName(user) : null,
    ]
  );
  return result.rows[0];
}

async function updatePrivateDashboardJob(jobId, state) {
  const result = await pool.query(
    `UPDATE test_dashboard_private_jobs
     SET group_id = $2,
         item_name = $3,
         column_values = $4,
         archived = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      jobId,
      state.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE,
      state.item_name || '',
      state.column_values || {},
      Boolean(state.archived),
    ]
  );
  return result.rows[0];
}

async function fetchJobState(sourceOrderId) {
  const result = await pool.query(
    'SELECT * FROM test_dashboard_job_state WHERE source_order_id = $1 LIMIT 1',
    [sourceOrderId]
  );
  return result.rows[0] || null;
}

async function fetchStateMap(sourceOrderIds) {
  const map = new Map();
  if (!sourceOrderIds.length) return map;
  const result = await pool.query(
    'SELECT * FROM test_dashboard_job_state WHERE source_order_id = ANY($1::int[])',
    [sourceOrderIds]
  );
  for (const row of result.rows) map.set(row.source_order_id, row);
  return map;
}

async function fetchLineItemMap(sourceOrderIds) {
  const map = new Map();
  if (!sourceOrderIds.length) return map;
  const result = await pool.query(
    `SELECT *
     FROM database_job_line_items
     WHERE source_order_id = ANY($1::int[])
     ORDER BY source_order_id, COALESCE(line_sort_order, source_order_item_id), source_order_item_id`,
    [sourceOrderIds]
  );
  for (const row of result.rows) {
    if (!map.has(row.source_order_id)) map.set(row.source_order_id, []);
    map.get(row.source_order_id).push(row);
  }
  return map;
}

async function fetchPositionMap(sourceOrderIds) {
  const map = new Map();
  if (!sourceOrderIds.length) return map;
  const result = await pool.query(
    `SELECT *
     FROM database_job_positions
     WHERE source_order_id = ANY($1::int[])
     ORDER BY source_order_id, COALESCE(position_sort_order, source_order_position_id), source_order_position_id`,
    [sourceOrderIds]
  );
  for (const row of result.rows) {
    if (!map.has(row.source_order_id)) map.set(row.source_order_id, []);
    map.get(row.source_order_id).push(row);
  }
  return map;
}

async function fetchFileMap(sourceOrderIds) {
  const map = new Map();
  if (!sourceOrderIds.length) return map;
  const result = await pool.query(
    `SELECT *
     FROM test_dashboard_files
     WHERE source_order_id = ANY($1::int[])
     ORDER BY source_order_id, column_id, created_at, id`,
    [sourceOrderIds]
  );
  for (const row of result.rows) {
    if (!map.has(row.source_order_id)) map.set(row.source_order_id, new Map());
    const byColumn = map.get(row.source_order_id);
    if (!byColumn.has(row.column_id)) byColumn.set(row.column_id, []);
    byColumn.get(row.column_id).push(row);
  }
  return map;
}

async function fetchScanMap(sourceOrderIds) {
  const map = new Map();
  if (!sourceOrderIds.length) return map;
  const ids = sourceOrderIds.map(String);
  const result = await pool.query(
    'SELECT item_id, scan_count, status FROM job_scans WHERE item_id = ANY($1::text[])',
    [ids]
  );
  for (const row of result.rows) map.set(String(row.item_id), row);
  return map;
}

async function upsertJobState(sourceOrderId, state) {
  const result = await pool.query(
    `INSERT INTO test_dashboard_job_state (
       source_order_id,
       group_id,
       item_name,
       column_values,
       archived,
       updated_at
     ) VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (source_order_id) DO UPDATE SET
       group_id = EXCLUDED.group_id,
       item_name = COALESCE(EXCLUDED.item_name, test_dashboard_job_state.item_name),
       column_values = EXCLUDED.column_values,
       archived = EXCLUDED.archived,
       updated_at = NOW()
     RETURNING *`,
    [
      sourceOrderId,
      state.group_id || DEFAULT_OFFICE_GROUP_ID,
      state.item_name || null,
      state.column_values || {},
      Boolean(state.archived),
    ]
  );
  return result.rows[0];
}

function applyDashboardAutomations({ job, currentState, column, columnValues, changedLabel, clearRequested }) {
  let groupId = currentState?.group_id || deriveDefaultGroupId(job);
  let archived = Boolean(currentState?.archived);
  const title = normalizeColumnTitle(column.title);
  const statusText = normalizeColumnTitle(changedLabel || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(deriveTypeLabel(job) || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]) || job.dashboard_type);
  const jobApproved = resolveJobApproved(job, columnValues);

  if (title === 'STATUS' && !clearRequested && isManualStatusAutomationOverride(statusText)) {
    const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
    if (statusText === COMPLETED_LABEL) {
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.TRANS];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.JAQ];
    }
    return {
      group_id: automatedGroupId || groupId,
      item_name: currentState?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: false,
    };
  }

  if (!jobApproved) {
    applyAwaitingApprovalColumnValues(job, TEST_DASHBOARD_COLUMNS, columnValues);
    return {
      group_id: TEST_DASHBOARD_GROUP_IDS.OFFICE,
      item_name: currentState?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: false,
    };
  }

  if (title === 'STATUS' && !clearRequested) {
    if (statusText === 'INVOICED') {
      archived = true;
    } else {
      archived = false;
    }
    const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
    if (statusText === 'COMPLETED') {
      groupId = automatedGroupId || TEST_DASHBOARD_GROUP_IDS.COMPLETED;
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.TRANS];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.JAQ];
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

function isManualStatusAutomationOverride(statusText) {
  return statusText === COMPLETED_LABEL ||
    statusText === 'TO SAMPLE' ||
    statusText === 'SAMPLED';
}

function applyPrivateDashboardAutomations({ currentJob, column, columnValues, changedLabel, clearRequested }) {
  let groupId = currentJob?.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE;
  let archived = Boolean(currentJob?.archived);
  const title = normalizeColumnTitle(column?.title || '');
  const statusText = normalizeColumnTitle(changedLabel || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]));
  const jobApproved = jobApprovedFromColumnValues(columnValues) === true;

  if (!jobApproved && !statusText) {
    applyPrivateAwaitingApprovalColumnValues(TEST_DASHBOARD_COLUMNS, columnValues);
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
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.TRANS];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.JAQ];
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

async function recordTestDashboardScan(jobId) {
  const sourceOrderId = Number.parseInt(jobId, 10);
  if (!Number.isFinite(sourceOrderId)) throw new Error('Invalid test dashboard job id');
  await ensureTestDashboardDefaults(pool);
  const job = await fetchDashboardJob(sourceOrderId);
  if (!job) throw new Error('Database job not found');

  const result = await advanceScan(String(job.source_order_id));
  const columns = await fetchDashboardColumns(false);
  const state = await fetchJobState(job.source_order_id);
  const columnValues = { ...(state?.column_values || {}) };
  const statusColumn = columnById(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS);
  const checkedColumn = columnById(columns, TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN);

  if (result.scan_count >= 1 && checkedColumn) {
    columnValues[TEST_DASHBOARD_COLUMN_IDS.CHECKED_IN] = checkboxValue(checkedColumn, true);
  }
  if (statusColumn) {
    const label = result.scan_count === 1
      ? 'CHECKED IN'
      : result.scan_count === 2
        ? 'IN PRODUCTION'
        : 'COMPLETED';
    const option = findStatusOption(statusColumn, label);
    if (option) columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] = statusValue(statusColumn, option.label, option.index);
  }

  const nextState = applyDashboardAutomations({
    job,
    currentState: state,
    column: statusColumn || { title: 'STATUS' },
    columnValues,
    changedLabel: getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]),
    clearRequested: false,
  });
  await upsertJobState(job.source_order_id, nextState);
  await updateDatabaseJobDashboardFields(pool, job.source_order_id, {
    status: getColumnText(nextState.column_values[TEST_DASHBOARD_COLUMN_IDS.STATUS]),
  });
  return result;
}

function parseTestScan(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value)) return { jobId: value };
  try {
    const url = new URL(value, 'http://dummy.local');
    return { jobId: clean(url.searchParams.get('j') || url.searchParams.get('i')) };
  } catch {
    return { jobId: '' };
  }
}

function sendScanError(res, wantsJson, status, message) {
  if (wantsJson) return res.status(status).json({ ok: false, error: message });
  return res.status(status).send(message);
}

function formatJobName(job) {
  return [
    job.order_no,
    job.customer_name,
    job.job_title || job.order_type,
  ].filter(Boolean).join(' - ');
}

function resolveDashboardGroupId(job, state, scan) {
  const stateValues = state?.column_values || {};
  const statusText = normalizeColumnTitle(
    job.dashboard_status || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]) || scan?.status || ''
  );
  const typeText = normalizeColumnTitle(
    deriveTypeLabel(job) || getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]) || job.dashboard_type
  );
  if (!resolveJobApproved(job, stateValues) && !isAllowedUnapprovedManualStatus(statusText)) {
    return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  }
  const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
  if (automatedGroupId) return automatedGroupId;
  return state?.group_id || deriveDefaultGroupId(job);
}

function resolvePrivateDashboardGroupId(job) {
  const stateValues = job?.column_values || {};
  const statusText = normalizeColumnTitle(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]));
  const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
  if (automatedGroupId) return automatedGroupId;
  return job?.group_id || TEST_DASHBOARD_GROUP_IDS.OFFICE;
}

function groupIdForStatusAndType(statusText, typeText) {
  if (statusText === 'AWAITING APPROVAL' || statusText === 'WAITING APPROVAL') return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  if (statusText === 'COMPLETED') return TEST_DASHBOARD_GROUP_IDS.COMPLETED;
  if (statusText === 'HOLD') return TEST_DASHBOARD_GROUP_IDS.HOLD;
  if (statusText === 'TO SAMPLE') return TEST_DASHBOARD_GROUP_IDS.TO_SAMPLE;
  if (statusText === 'SAMPLED') return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  if (statusText === 'PRE-PRODUCTION' || statusText === 'NO STOCK') {
    return TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION;
  }
  if (statusText === 'READY TO PRINT') {
    if (typeText.includes('EMB')) return TEST_DASHBOARD_GROUP_IDS.EMBROIDERY;
    if (typeText.includes('PRINT')) return TEST_DASHBOARD_GROUP_IDS.PRINT;
  }
  return '';
}

function deriveDefaultGroupId(_job) {
  return DEFAULT_OFFICE_GROUP_ID;
}

function deriveTypeLabel(job) {
  const category = deriveJobCategory(job);
  if (category === 'print_embroidery') return 'EMB / PRINT';
  if (category === 'embroidery') return 'EMB';
  if (category === 'print') return 'PRINT';
  return '';
}

function deriveJobCategory(job) {
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

function designTextFromPositions(positions, job) {
  return formatDesignColumnText(designPartsFromSources(positions, job));
}

async function backfillDashboardDesignPositions(jobs, states, positionMap, scans) {
  const candidates = [];
  const stateOnlyCleanupIds = [];
  for (const job of jobs || []) {
    const state = states.get(job.source_order_id) || null;
    const scan = scans.get(String(job.source_order_id)) || null;
    if (!shouldRenderDashboardJob(job, state, scan)) continue;
    const stateValues = state?.column_values || {};
    const stateDesignText = cleanDesignColumnText(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN]));
    if (!stateDesignText) continue;
    const positions = positionMap.get(job.source_order_id) || [];
    const databaseDesignText = designTextFromPositions(positions, job);
    if (databaseDesignText) {
      stateOnlyCleanupIds.push(job.source_order_id);
      continue;
    }
    candidates.push({ job, value: stateDesignText });
  }
  if (!candidates.length && !stateOnlyCleanupIds.length) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [DESIGN_POSITION_LOCK_KEY]);
    for (const sourceOrderId of stateOnlyCleanupIds) {
      await clearDashboardDesignStateValueWithClient(client, sourceOrderId);
    }
    let insertedCount = 0;
    for (const candidate of candidates) {
      const result = await appendDashboardDesignPositionWithClient(client, candidate.job, candidate.value);
      insertedCount += result.insertedCount || (result.inserted ? 1 : 0);
    }
    await client.query('COMMIT');
    return insertedCount > 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[test-dashboard] DES/PSG backfill failed:', err);
    return false;
  } finally {
    client.release();
  }
}

async function appendDashboardDesignPosition(job, rawValue) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [DESIGN_POSITION_LOCK_KEY]);
    const result = await appendDashboardDesignPositionWithClient(client, job, rawValue);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function appendDashboardDesignPositionWithClient(client, job, rawValue) {
  const value = cleanDesignColumnText(rawValue);

  const lockedJob = await client.query(
    `SELECT *
     FROM database_jobs
     WHERE source_order_id = $1
     LIMIT 1
     FOR UPDATE`,
    [job.source_order_id]
  );
  if (!lockedJob.rowCount) throw new Error('Database job not found');

  const currentJob = lockedJob.rows[0] || job;
  const positions = await fetchPositionsForUpdate(client, currentJob.source_order_id);
  const saveResult = await reconcileDashboardDesignPositionsWithClient(client, currentJob, positions, value);
  await clearDashboardDesignStateValueWithClient(client, currentJob.source_order_id);

  return {
    inserted: saveResult.insertedCount > 0,
    insertedCount: saveResult.insertedCount,
    updatedCount: saveResult.updatedCount,
    removedCount: saveResult.removedCount,
    positions: await fetchPositionsForUpdate(client, currentJob.source_order_id),
  };
}

async function reconcileDashboardDesignPositionsWithClient(client, currentJob, positions, rawValue) {
  const desiredRefs = designPositionDesiredReferences(rawValue, currentJob);
  const protectedKeys = protectedDashboardDesignKeys(currentJob);
  const entries = designPositionRowEntries(positions);
  const assignments = new Map();
  const usedDesiredIndexes = new Set();
  let updatedCount = 0;
  let removedCount = 0;

  for (const entry of entries) {
    const desiredIndex = desiredRefs.findIndex((desired, index) => (
      !usedDesiredIndexes.has(index) &&
      entry.refs.some((current) => current.kind === desired.kind && current.key === desired.key)
    ));
    if (desiredIndex < 0) continue;
    assignments.set(entry.row.source_order_position_id, desiredRefs[desiredIndex]);
    usedDesiredIndexes.add(desiredIndex);
  }

  for (const entry of entries) {
    if (assignments.has(entry.row.source_order_position_id)) continue;
    const currentKind = entry.refs[0]?.kind || 'design';
    const desiredIndex = desiredRefs.findIndex((desired, index) => (
      !usedDesiredIndexes.has(index) &&
      desired.kind === currentKind &&
      !protectedKeys.has(desired.key)
    ));
    if (desiredIndex < 0) continue;
    assignments.set(entry.row.source_order_position_id, desiredRefs[desiredIndex]);
    usedDesiredIndexes.add(desiredIndex);
  }

  for (const entry of entries) {
    const desired = assignments.get(entry.row.source_order_position_id);
    if (!desired) {
      await clearOrDeleteDashboardDesignPositionWithClient(client, entry.row);
      removedCount += 1;
      continue;
    }
    if (cleanDesignColumnText(entry.row.design_ref) !== desired.value || entry.refs.length !== 1) {
      await updateDashboardDesignPositionValueWithClient(client, entry.row, desired.value);
      updatedCount += 1;
    }
  }

  const valuesToInsert = desiredRefs
    .filter((desired, index) => !usedDesiredIndexes.has(index) && !protectedKeys.has(desired.key))
    .map((desired) => desired.value);
  const insertedCount = await insertDashboardDesignPositionsWithClient(client, currentJob.source_order_id, valuesToInsert);

  return { insertedCount, updatedCount, removedCount };
}

async function clearDashboardDesignStateValueWithClient(client, sourceOrderId) {
  await client.query(
    `UPDATE test_dashboard_job_state
     SET column_values = column_values - $2,
         updated_at = NOW()
     WHERE source_order_id = $1
       AND column_values ? $2`,
    [sourceOrderId, TEST_DASHBOARD_COLUMN_IDS.DESIGN]
  );
}

async function fetchPositionsForUpdate(client, sourceOrderId) {
  const result = await client.query(
    `SELECT *
     FROM database_job_positions
     WHERE source_order_id = $1
     ORDER BY COALESCE(position_sort_order, source_order_position_id), source_order_position_id
     FOR UPDATE`,
    [sourceOrderId]
  );
  return result.rows;
}

function splitDesignPositionRows(value) {
  return cleanDesignColumnText(value)
    .split('/')
    .map((segment) => cleanDesignColumnText(segment))
    .filter(Boolean);
}

function designPositionReferencesFromSegment(segment) {
  const references = [];
  const designText = displayDesignReference(segment);
  for (const reference of splitReferenceList(designText)) {
    references.push({ kind: 'design', value: reference });
  }
  for (const reference of extractOrderDesignReferences(segment)) {
    references.push({ kind: 'psg', value: reference });
  }
  return references;
}

function designPositionDesiredReferences(rawValue, job) {
  const designRefs = [];
  const psgRefs = [];
  const designSeen = new Set();
  const psgSeen = new Set();

  for (const segment of splitDesignPositionRows(rawValue)) {
    for (const reference of designPositionReferencesFromSegment(segment)) {
      const normalized = normalizeDashboardDesignReference(reference);
      if (!normalized) continue;
      const seen = normalized.kind === 'psg' ? psgSeen : designSeen;
      const values = normalized.kind === 'psg' ? psgRefs : designRefs;
      if (seen.has(normalized.key)) continue;
      seen.add(normalized.key);
      values.push(normalized);
    }
  }

  return [...designRefs, ...psgRefs];
}

function designPositionRowEntries(positions) {
  return (positions || [])
    .map((row) => ({
      row,
      refs: designPositionReferencesFromSegment(row.design_ref)
        .map(normalizeDashboardDesignReference)
        .filter(Boolean),
    }))
    .filter((entry) => entry.refs.length > 0);
}

function normalizeDashboardDesignReference(reference) {
  const kind = reference?.kind === 'psg' ? 'psg' : 'design';
  const value = cleanDesignColumnText(reference?.value);
  const key = normalizeReferenceKey(value);
  if (!key) return null;
  return { kind, value, key };
}

function protectedDashboardDesignKeys(job) {
  return new Set(
    extractOrderDesignReferences(job?.screen_numbers)
      .map(normalizeReferenceKey)
      .filter(Boolean)
  );
}

async function updateDashboardDesignPositionValueWithClient(client, row, value) {
  await client.query(
    `UPDATE database_job_positions
     SET design_ref = $3,
         updated_at_source = NOW(),
         imported_at = NOW()
     WHERE source_order_id = $1
       AND source_order_position_id = $2`,
    [row.source_order_id, row.source_order_position_id, value]
  );
}

async function clearOrDeleteDashboardDesignPositionWithClient(client, row) {
  if (!clean(row.position_name) && !clean(row.colour_notes)) {
    await client.query(
      `DELETE FROM database_job_positions
       WHERE source_order_id = $1
         AND source_order_position_id = $2`,
      [row.source_order_id, row.source_order_position_id]
    );
    return;
  }

  await updateDashboardDesignPositionValueWithClient(client, row, null);
}

async function insertDashboardDesignPositionsWithClient(client, sourceOrderId, values) {
  if (!values.length) return 0;

  const nextId = await client.query(`
    SELECT (COALESCE(MAX(source_order_position_id), 0) + 1)::int AS next_id
    FROM database_job_positions
  `);
  const nextSort = await client.query(
    `SELECT (COALESCE(MAX(COALESCE(position_sort_order, source_order_position_id)), 0) + 1)::int AS next_sort_order
     FROM database_job_positions
     WHERE source_order_id = $1`,
    [sourceOrderId]
  );

  const firstId = Number(nextId.rows[0].next_id) || 1;
  const firstSort = Number(nextSort.rows[0].next_sort_order) || 1;
  for (let index = 0; index < values.length; index += 1) {
    await client.query(
      `INSERT INTO database_job_positions (
         source_order_position_id,
         source_order_id,
         position_sort_order,
         position_name,
         colour_notes,
         design_ref,
         created_at_source,
         updated_at_source
       ) VALUES ($1, $2, $3, NULL, NULL, $4, NOW(), NOW())`,
      [
        firstId + index,
        sourceOrderId,
        firstSort + index,
        values[index],
      ]
    );
  }

  return values.length;
}

function designPartsFromSources(positions, job) {
  const parts = createDesignParts();
  addPsgReferencesFromText(parts, job?.screen_numbers, { fallbackRaw: true });
  for (const row of positions || []) {
    addDesignReferencesFromText(parts, row.design_ref);
    addPsgReferencesFromText(parts, `${row.position_name || ''} ${row.colour_notes || ''} ${row.design_ref || ''}`);
  }
  return parts;
}

function createDesignParts() {
  return {
    designRefs: [],
    psgRefs: [],
    designSeen: new Set(),
    psgSeen: new Set(),
  };
}

function addDesignReferencesFromText(parts, value) {
  const designText = displayDesignReference(value);
  for (const reference of splitReferenceList(designText)) {
    addUniqueReference(parts.designRefs, parts.designSeen, reference);
  }
}

function addPsgReferencesFromText(parts, value, options = {}) {
  const beforeCount = parts.psgRefs.length;
  for (const reference of extractOrderDesignReferences(value)) {
    addUniqueReference(parts.psgRefs, parts.psgSeen, reference);
  }
  if (options.fallbackRaw && parts.psgRefs.length === beforeCount) {
    for (const reference of splitReferenceList(value)) {
      addUniqueReference(parts.psgRefs, parts.psgSeen, reference);
    }
  }
}

function formatDesignColumnText(parts) {
  const designText = (parts.designRefs || []).join(', ');
  const psgText = (parts.psgRefs || []).join(', ');
  if (designText && psgText) return `${designText} / ${psgText}`;
  return designText || psgText;
}

function extractOrderDesignReferences(value) {
  const psgReferences = [];
  const stitchReferences = [];
  const seen = new Set();
  const text = String(value || '');
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;

  let match;
  while ((match = PSG_REFERENCE_PATTERN.exec(text))) {
    addOrderDesignReference(psgReferences, seen, 'PSG', match[1]);
    addOrderDesignReference(stitchReferences, seen, 'ST', match[2] || match[3]);
  }

  while ((match = STITCH_REFERENCE_PATTERN.exec(text))) {
    addOrderDesignReference(stitchReferences, seen, 'ST', match[1]);
  }

  return [...psgReferences, ...stitchReferences];
}

function addOrderDesignReference(references, seen, prefix, rawValue) {
  const value = prefix === 'PSG'
    ? String(rawValue || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    : String(rawValue || '').replace(/\D/g, '');
  if (!value) return;

  const reference = `${prefix}${value}`;
  if (seen.has(reference)) return;
  seen.add(reference);
  references.push(reference);
}

function displayDesignReference(value) {
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;
  const withoutReferences = String(value || '')
    .replace(PSG_REFERENCE_PATTERN, ' ')
    .replace(STITCH_REFERENCE_PATTERN, ' ');
  PSG_REFERENCE_PATTERN.lastIndex = 0;
  STITCH_REFERENCE_PATTERN.lastIndex = 0;

  return withoutReferences
    .replace(/\s+/g, ' ')
    .replace(/^[,;:/|._\-\s]+|[,;:/|._\-\s]+$/g, '')
    .trim();
}

function splitReferenceList(value) {
  return String(value || '')
    .split(/[,;\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addUniqueReference(values, seen, value) {
  const reference = clean(value).replace(/\s+/g, ' ');
  const key = normalizeReferenceKey(reference);
  if (!key || seen.has(key)) return;
  seen.add(key);
  values.push(reference);
}

function normalizeReferenceKey(value) {
  return String(value || '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
}

function cleanDesignColumnText(value) {
  return clean(value).replace(/\s+/g, ' ').slice(0, 500);
}

function isDesignDashboardColumn(column) {
  if (!column || column.type !== 'text') return false;
  if (column.id === TEST_DASHBOARD_COLUMN_IDS.DESIGN) return true;
  const compactTitle = normalizeColumnTitle(column.title).replace(/[^A-Z0-9]/g, '');
  return compactTitle === 'DESPSG' || compactTitle === 'DESNOPSG';
}

function isPrivateDashboardJobId(value) {
  return /^private_[0-9a-f-]{36}$/i.test(clean(value));
}

function normalizeMoveTargetGroupId(value) {
  const raw = clean(value);
  const normalized = normalizeColumnTitle(raw).replace(/[^A-Z0-9]/g, '');
  if (raw === TEST_DASHBOARD_GROUP_IDS.HOLD || normalized === 'HOLD') return TEST_DASHBOARD_GROUP_IDS.HOLD;
  if (raw === TEST_DASHBOARD_GROUP_IDS.OFFICE || normalized === 'OFFICE') return TEST_DASHBOARD_GROUP_IDS.OFFICE;
  if (raw === TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION || normalized === 'PREPRODUCTION') return TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION;
  return '';
}

function statusLabelForMoveGroup(groupId) {
  if (groupId === TEST_DASHBOARD_GROUP_IDS.HOLD) return HOLD_LABEL;
  if (groupId === TEST_DASHBOARD_GROUP_IDS.OFFICE) return AWAITING_APPROVAL_LABEL;
  if (groupId === TEST_DASHBOARD_GROUP_IDS.PRE_PRODUCTION) return NO_STOCK_LABEL;
  return '';
}

function parseDashboardDateInput(value) {
  const raw = clean(value);
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validLocalDateIso(Number(match[1]), Number(match[2]), Number(match[3]));
  match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  return validLocalDateIso(year, Number(match[2]), Number(match[1]));
}

function validLocalDateIso(year, month, day) {
  if (![year, month, day].every(Number.isFinite)) return '';
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }
  return localDateIso(date);
}

function priorityLabelForDate(isoDate) {
  const date = parseDate(isoDate);
  if (!date) return 'Low';
  const due = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((due - today) / 86400000);
  if (days <= 1) return 'Critical';
  if (days <= 3) return 'High';
  if (days <= 7) return 'Medium';
  return 'Low';
}

function privateFilesFromColumnValue(value) {
  const parsed = parseJsonMaybe(value?.value);
  return Array.isArray(parsed?.files) ? parsed.files : [];
}

function privateDashboardFileAssets(job) {
  const assets = [];
  const values = job?.column_values || {};
  for (const value of Object.values(values)) {
    for (const file of privateFilesFromColumnValue(value)) {
      const asset = privateFileAsset(file);
      if (asset) assets.push(asset);
    }
  }
  return assets;
}

function privateFileAsset(file) {
  const publicId = clean(file?.publicId || file?.public_id);
  if (!publicId) return null;
  return {
    publicId,
    resourceType: clean(file?.resourceType || file?.resource_type) || 'image',
  };
}

function destroyPrivateFileAssets(files, context = 'cleanup') {
  for (const file of files || []) {
    const asset = privateFileAsset(file);
    if (!asset) continue;
    destroyAsset(asset.publicId, asset.resourceType).catch((err) => {
      console.warn(`[test-dashboard] Cloudinary private file ${context} failed:`, err?.message || err);
    });
  }
}

function privateUploadFileFromBody(body, column, { publicId, secureUrl, createdByName }) {
  const originalFilename = clean(body?.originalFilename || body?.original_filename) || publicId || 'File';
  return {
    dashboardPrivateFileId: crypto.randomUUID(),
    publicId,
    public_id: publicId,
    name: originalFilename,
    url: secureUrl,
    public_url: secureUrl,
    secure_url: secureUrl,
    mime: mimeFromPrivateUpload(body, originalFilename),
    resourceType: clean(body?.resourceType || body?.resource_type),
    resource_type: clean(body?.resourceType || body?.resource_type),
    format: clean(body?.format),
    bytes: nullableInt(body?.bytes),
    width: nullableInt(body?.width),
    height: nullableInt(body?.height),
    columnId: column?.id || '',
    columnTitle: column?.title || '',
    createdByName: createdByName || '',
    createdAt: new Date().toISOString(),
  };
}

function mimeFromPrivateUpload(body, filename) {
  const format = clean(body?.format).toLowerCase();
  if (format === 'pdf' || /\.pdf$/i.test(filename || '')) return 'application/pdf';
  const resourceType = clean(body?.resourceType || body?.resource_type).toLowerCase();
  if (resourceType === 'image' && format) return `image/${format === 'jpg' ? 'jpeg' : format}`;
  return '';
}

function fileColumnPayloadFromFiles(column, files) {
  const normalized = Array.isArray(files) ? files : [];
  return {
    id: column.id,
    text: normalized.map(file => file.name || file.publicId || file.public_id).filter(Boolean).join(', '),
    type: 'file',
    value: JSON.stringify({ files: normalized }),
  };
}

function privateFileToApi(file, columnId) {
  return {
    id: file.dashboardPrivateFileId,
    private: true,
    column_id: columnId,
    public_id: file.publicId || file.public_id,
    secure_url: file.secure_url || file.url,
    resource_type: file.resourceType || file.resource_type,
    format: file.format,
    original_filename: file.name,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function putIfColumn(map, columns, columnId, value) {
  if (!value) return;
  const column = columnById(columns, columnId);
  if (!column) return;
  map.set(columnId, value);
}

function columnById(columns, columnId) {
  return (columns || []).find(column => column.id === columnId) || null;
}

function columnByTitle(columns, title) {
  const wanted = normalizeColumnTitle(title);
  return (columns || []).find(column => normalizeColumnTitle(column.title) === wanted) || null;
}

function textValue(column, text) {
  if (!column) return null;
  return {
    id: column.id,
    text: clean(text),
    type: column.type || 'text',
    value: clean(text),
  };
}

function dateValue(column, rawDate) {
  if (!column || !rawDate) return null;
  const date = parseDate(rawDate);
  if (!date) return null;
  const iso = date.toISOString().slice(0, 10);
  return {
    id: column.id,
    text: iso,
    type: 'date',
    value: JSON.stringify({ date: iso }),
  };
}

function checkboxValue(column, checked) {
  if (!column) return null;
  return {
    id: column.id,
    text: checked ? 'v' : '',
    type: 'checkbox',
    value: checked ? JSON.stringify({ checked: 'true' }) : JSON.stringify({}),
  };
}

function statusValueByLabel(columns, columnId, label) {
  const column = Array.isArray(columns)
    ? columnById(columns, columnId)
    : TEST_DASHBOARD_COLUMNS.find(col => col.id === columnId);
  if (!column || !label) return null;
  const option = findStatusOption(column, label);
  return option ? statusValue(column, option.displayLabel || option.label, option.index) : null;
}

function statusValueFromJobOrState(columns, columnId, label, stateValues) {
  if (label) return statusValueByLabel(columns, columnId, label);
  return stateValues?.[columnId] || null;
}

function statusValue(column, label, index) {
  return {
    id: column.id,
    text: label || '',
    type: 'status',
    value: label ? JSON.stringify({ index: normalizeStatusIndex(index) }) : JSON.stringify({}),
  };
}

function fileColumnValue(column, files) {
  const normalized = (files || []).map(dbFileToPayloadFile);
  return {
    id: column.id,
    text: normalized.map(file => file.name).filter(Boolean).join(', '),
    type: 'file',
    value: JSON.stringify({ files: normalized }),
  };
}

function dbFileToPayloadFile(row) {
  return {
    dashboardFileId: row.id,
    publicId: row.public_id,
    name: row.original_filename || row.public_id || 'File',
    url: row.secure_url,
    public_url: row.secure_url,
    secure_url: row.secure_url,
    mime: mimeFromCloudinary(row),
    resourceType: row.resource_type || '',
    format: row.format || '',
  };
}

function dbFileToApi(row) {
  return {
    id: row.id,
    source_order_id: row.source_order_id,
    column_id: row.column_id,
    column_title: row.column_title,
    public_id: row.public_id,
    secure_url: row.secure_url,
    resource_type: row.resource_type,
    format: row.format,
    original_filename: row.original_filename,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
  };
}

function mimeFromCloudinary(row) {
  const format = clean(row.format).toLowerCase();
  if (format === 'pdf' || /\.pdf$/i.test(row.original_filename || '')) return 'application/pdf';
  if (!format) return '';
  if (row.resource_type === 'image') return `image/${format === 'jpg' ? 'jpeg' : format}`;
  return '';
}

function findStatusOption(column, requestedLabel) {
  const settings = parseJsonMaybe(column?.settings_str) || {};
  const labels = settings.labels || {};
  const wanted = normalizeStatusLookupLabel(requestedLabel);
  for (const [index, label] of Object.entries(labels)) {
    const cleanLabel = clean(label);
    if (cleanLabel && normalizeStatusLookupLabel(cleanLabel) === wanted) {
      return {
        index,
        label: cleanLabel,
        displayLabel: clean(requestedLabel) || cleanLabel,
      };
    }
  }
  return null;
}

function normalizeStatusLookupLabel(value) {
  const normalized = normalizeColumnTitle(value);
  if (normalized === AWAITING_APPROVAL_LABEL || normalized === WAITING_APPROVAL_LABEL) return WAITING_APPROVAL_LABEL;
  return normalized;
}

function dashboardLabelsForChangedColumn(column, label) {
  const title = normalizeColumnTitle(column?.title || '');
  if (title === 'STATUS') {
    const labels = { status: label };
    if (normalizeColumnTitle(label) === COMPLETED_LABEL) labels.priority = '';
    return labels;
  }
  if (title === 'PRIORITY') return { priority: label };
  if (title === 'TYPE') return { type: label };
  return {};
}

function isProofApprovalCheckbox(column) {
  const title = normalizeColumnTitle(column?.title || '');
  return column?.id === TEST_DASHBOARD_COLUMN_IDS.JOB || title.includes('APPROVED') || title.includes('JOB');
}

function getColumnText(value) {
  return clean(value?.text || '');
}

function normalizeStatusIndex(index) {
  const numeric = Number(index);
  return Number.isFinite(numeric) ? numeric : index;
}

function addDaysFromTodayIso(days) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(days || 0));
  return localDateIso(date);
}

function localDateIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseJsonMaybe(raw) {
  if (!raw || typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function nullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  publicRouter,
  protectedRouter,
  ensureTestDashboardDefaults,
  buildTestDashboardBoardPayload,
};
