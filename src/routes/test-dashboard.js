const express = require('express');
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
  updateDatabaseJobDashboardFields,
} = require('../services/testDashboardDbFields');

const publicRouter = express.Router();
const protectedRouter = express.Router();

const EDITABLE_STATUS_TITLES = new Set(['STATUS', 'PRIORITY']);
const DEFAULT_OFFICE_GROUP_ID = TEST_DASHBOARD_GROUP_IDS.OFFICE;
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

protectedRouter.put('/api/test-dashboard/items/:jobId/status-column', async (req, res) => {
  const sourceOrderId = Number.parseInt(req.params.jobId, 10);
  if (!Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const columnId = clean(req.body?.columnId);
  const requestedLabel = clean(req.body?.label);
  const clearRequested = req.body?.clear === true;
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: 'Database job not found' });

    const column = columns.find(col => col.id === columnId);
    if (!column || column.type !== 'status') {
      return res.status(400).json({ error: 'Column is not a test dashboard status column' });
    }
    if (!EDITABLE_STATUS_TITLES.has(normalizeColumnTitle(column.title))) {
      return res.status(400).json({ error: 'Only test dashboard STATUS and PRIORITY columns can be updated' });
    }

    const state = await fetchJobState(sourceOrderId);
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

    const nextState = applyDashboardAutomations({
      job,
      currentState: state,
      column,
      columnValues,
      changedLabel: clearRequested ? '' : requestedLabel,
      clearRequested,
    });

    const saved = await upsertJobState(sourceOrderId, nextState);
    await updateDatabaseJobDashboardFields(
      pool,
      job.source_order_id,
      dashboardLabelsForChangedColumn(column, clearRequested ? '' : requestedLabel)
    );
    res.json({
      ok: true,
      itemId: String(sourceOrderId),
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
  const sourceOrderId = Number.parseInt(req.params.jobId, 10);
  if (!Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const columnId = clean(req.body?.columnId);
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });
  const checked = req.body?.checked === true || req.body?.checked === 'true' || req.body?.checked === 1 || req.body?.checked === '1';

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, columns] = await Promise.all([
      fetchDashboardJob(sourceOrderId),
      fetchDashboardColumns(false),
    ]);
    if (!job) return res.status(404).json({ error: 'Database job not found' });

    const column = columns.find(col => col.id === columnId);
    if (!column || column.type !== 'checkbox') {
      return res.status(400).json({ error: 'Column is not a test dashboard checkbox column' });
    }

    const state = await fetchJobState(job.source_order_id);
    const columnValues = { ...(state?.column_values || {}) };
    columnValues[column.id] = checkboxValue(column, checked);

    const nextState = {
      group_id: state?.group_id || resolveDashboardGroupId(job, state, null),
      item_name: state?.item_name || formatJobName(job),
      column_values: columnValues,
      archived: Boolean(state?.archived),
    };
    const saved = await upsertJobState(job.source_order_id, nextState);
    let databaseJob = null;
    if (isProofApprovalCheckbox(column)) {
      databaseJob = await updateDatabaseJobProofApproved(pool, job.source_order_id, checked);
    }

    res.json({
      ok: true,
      itemId: String(job.source_order_id),
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

protectedRouter.put('/api/test-dashboard/items/:jobId/design-column', async (req, res) => {
  const sourceOrderId = Number.parseInt(req.params.jobId, 10);
  if (!Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const columnId = clean(req.body?.columnId);
  const rawValue = cleanDesignColumnText(req.body?.value);
  if (!rawValue) return res.status(400).json({ error: 'Design / PSG value is required' });

  try {
    await ensureTestDashboardDefaults(pool);
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
  const sourceOrderId = Number.parseInt(req.body?.jobId, 10);
  const columnId = clean(req.body?.columnId);
  const filename = clean(req.body?.filename) || 'file';
  if (!Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });

  try {
    requireCloudinaryConfig();
    await ensureTestDashboardDefaults(pool);
    const [job, column] = await Promise.all([
      fetchDashboardJob(sourceOrderId),
      fetchDashboardColumn(columnId),
    ]);
    if (!job) return res.status(404).json({ error: 'Database job not found' });
    if (!column || column.type !== 'file') return res.status(400).json({ error: 'Column is not a file/image column' });

    const folder = folderForColumn(column, job.order_no || sourceOrderId);
    const publicId = publicIdForUpload({ filename, source: `job-${job.order_no || sourceOrderId}` });
    res.json(signUpload({ folder, publicId }));
  } catch (err) {
    console.error('POST /api/test-dashboard/uploads/signature', err);
    res.status(500).json({ error: err.message || 'Failed to sign Cloudinary upload' });
  }
});

protectedRouter.post('/api/test-dashboard/items/:jobId/files', async (req, res) => {
  const sourceOrderId = Number.parseInt(req.params.jobId, 10);
  if (!Number.isFinite(sourceOrderId)) return res.status(400).json({ error: 'Invalid job id' });

  const columnId = clean(req.body?.columnId);
  const publicId = clean(req.body?.publicId || req.body?.public_id);
  const secureUrl = clean(req.body?.secureUrl || req.body?.secure_url);
  if (!columnId || !publicId || !secureUrl) {
    return res.status(400).json({ error: 'columnId, publicId, and secureUrl are required' });
  }

  try {
    await ensureTestDashboardDefaults(pool);
    const [job, column] = await Promise.all([
      fetchDashboardJob(sourceOrderId),
      fetchDashboardColumn(columnId),
    ]);
    if (!job) return res.status(404).json({ error: 'Database job not found' });
    if (!column || column.type !== 'file') return res.status(400).json({ error: 'Column is not a file/image column' });

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
  const [columns, subitemColumns, groups, jobs] = await Promise.all([
    fetchDashboardColumns(false),
    fetchDashboardColumns(true),
    fetchDashboardGroups(),
    fetchOpenDashboardJobs(),
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
  if (statusText === 'COMPLETED' || statusText === 'INVOICED') return false;
  return hasDashboardIdentity(job, state, scan);
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

  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, statusValueFromJobOrState(columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, job.dashboard_priority, stateValues) || priorityValueFromDate(job.delivery_date));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JOB, stateValues[TEST_DASHBOARD_COLUMN_IDS.JOB] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JOB), Boolean(job.proof_approved)));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DATE, stateValues[TEST_DASHBOARD_COLUMN_IDS.DATE] || dateValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DATE), job.delivery_date));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TRANS, stateValues[TEST_DASHBOARD_COLUMN_IDS.TRANS] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.TRANS), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JAQ, stateValues[TEST_DASHBOARD_COLUMN_IDS.JAQ] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JAQ), Boolean(job.has_screens || job.screen_numbers)));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, statusValueFromJobOrState(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, job.dashboard_status, stateValues) || statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, scan?.status || ''));
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
    },
    column_values: Array.from(values.values()).filter(Boolean),
    subitems: lineItems.map(line => buildSubitem(line, subitemColumns)),
  };
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
    SELECT *
    FROM database_jobs
    WHERE is_complete IS NOT TRUE
      AND invoice_printed IS NOT TRUE
      AND pf_invoice_printed IS NOT TRUE
      AND COALESCE(UPPER(TRIM(dashboard_status)), '') NOT IN ('INVOICED', 'COMPLETED')
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
  const automatedGroupId = groupIdForStatusAndType(statusText, typeText);
  if (automatedGroupId) return automatedGroupId;
  return state?.group_id || deriveDefaultGroupId(job);
}

function groupIdForStatusAndType(statusText, typeText) {
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

function deriveDefaultGroupId(job) {
  const category = deriveJobCategory(job);
  if (category === 'print_embroidery') return TEST_DASHBOARD_GROUP_IDS.EMBROIDERY;
  if (category === 'embroidery') return TEST_DASHBOARD_GROUP_IDS.EMBROIDERY;
  if (category === 'print') return TEST_DASHBOARD_GROUP_IDS.PRINT;
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
  for (const job of jobs || []) {
    const state = states.get(job.source_order_id) || null;
    const scan = scans.get(String(job.source_order_id)) || null;
    if (!shouldRenderDashboardJob(job, state, scan)) continue;
    const stateValues = state?.column_values || {};
    const stateDesignText = cleanDesignColumnText(getColumnText(stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN]));
    if (!stateDesignText) continue;
    const positions = positionMap.get(job.source_order_id) || [];
    if (isDesignTextRepresented(stateDesignText, positions, job)) continue;
    candidates.push({ job, value: stateDesignText });
  }
  if (!candidates.length) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [DESIGN_POSITION_LOCK_KEY]);
    let insertedCount = 0;
    for (const candidate of candidates) {
      const result = await appendDashboardDesignPositionWithClient(client, candidate.job, candidate.value);
      if (result.inserted) insertedCount += 1;
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
  if (!value) return { inserted: false, positions: [] };

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
  if (isDesignTextRepresented(value, positions, currentJob)) {
    return { inserted: false, positions };
  }

  const nextId = await client.query(`
    SELECT (COALESCE(MAX(source_order_position_id), 0) + 1)::int AS next_id
    FROM database_job_positions
  `);
  const nextSort = await client.query(
    `SELECT (COALESCE(MAX(COALESCE(position_sort_order, source_order_position_id)), 0) + 1)::int AS next_sort_order
     FROM database_job_positions
     WHERE source_order_id = $1`,
    [currentJob.source_order_id]
  );

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
      nextId.rows[0].next_id,
      currentJob.source_order_id,
      nextSort.rows[0].next_sort_order,
      value,
    ]
  );

  return {
    inserted: true,
    positions: await fetchPositionsForUpdate(client, currentJob.source_order_id),
  };
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

function isDesignTextRepresented(rawValue, positions, job) {
  const incoming = designPartsFromRaw(rawValue);
  const existing = designPartsFromSources(positions, job);
  if (!incoming.designRefs.length && !incoming.psgRefs.length) return false;

  const designKeys = new Set(existing.designRefs.map(normalizeReferenceKey));
  const psgKeys = new Set(existing.psgRefs.map(normalizeReferenceKey));
  return incoming.designRefs.every((value) => designKeys.has(normalizeReferenceKey(value))) &&
    incoming.psgRefs.every((value) => psgKeys.has(normalizeReferenceKey(value)));
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

function designPartsFromRaw(value) {
  const parts = createDesignParts();
  addDesignReferencesFromText(parts, value);
  addPsgReferencesFromText(parts, value);
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

function priorityValueFromDate(dateValueRaw) {
  const date = parseDate(dateValueRaw);
  if (!date) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDue = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startDue - startToday) / 86400000);
  if (days <= 1) return statusValueByLabel(null, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, 'Critical');
  if (days <= 3) return statusValueByLabel(null, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, 'High');
  if (days <= 7) return statusValueByLabel(null, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, 'Medium');
  return null;
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
    text: formatUkDate(iso),
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
  return option ? statusValue(column, option.label, option.index) : null;
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
  if (!format) return '';
  if (format === 'pdf') return 'application/pdf';
  if (row.resource_type === 'image') return `image/${format === 'jpg' ? 'jpeg' : format}`;
  return '';
}

function findStatusOption(column, requestedLabel) {
  const settings = parseJsonMaybe(column?.settings_str) || {};
  const labels = settings.labels || {};
  const wanted = normalizeColumnTitle(requestedLabel);
  for (const [index, label] of Object.entries(labels)) {
    const cleanLabel = clean(label);
    if (cleanLabel && normalizeColumnTitle(cleanLabel) === wanted) {
      return { index, label: cleanLabel };
    }
  }
  return null;
}

function dashboardLabelsForChangedColumn(column, label) {
  const title = normalizeColumnTitle(column?.title || '');
  if (title === 'STATUS') return { status: label };
  if (title === 'PRIORITY') return { priority: label };
  if (title === 'TYPE') return { type: label };
  return {};
}

function isProofApprovalCheckbox(column) {
  const title = normalizeColumnTitle(column?.title || '');
  return column?.id === TEST_DASHBOARD_COLUMN_IDS.JOB || title.includes('APPROVED') || title.includes('JOB');
}

async function updateDatabaseJobProofApproved(db, sourceOrderId, approved) {
  const result = await db.query(
    `UPDATE database_jobs
     SET proof_approved = $2,
         proof_approved_at = CASE WHEN $2 IS TRUE THEN NOW() ELSE NULL END,
         updated_at_source = NOW(),
         imported_at = NOW()
     WHERE source_order_id = $1
     RETURNING source_order_id, proof_approved, proof_approved_at`,
    [sourceOrderId, Boolean(approved)]
  );
  return result.rows[0] || null;
}

function getColumnText(value) {
  return clean(value?.text || '');
}

function normalizeStatusIndex(index) {
  const numeric = Number(index);
  return Number.isFinite(numeric) ? numeric : index;
}

function formatUkDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
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
