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

const publicRouter = express.Router();
const protectedRouter = express.Router();

const EDITABLE_STATUS_TITLES = new Set(['STATUS', 'PRIORITY']);
const DEFAULT_OFFICE_GROUP_ID = TEST_DASHBOARD_GROUP_IDS.OFFICE;

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
  const sourceOrderIds = jobs.map(job => job.source_order_id);
  const [states, lineItems, positions, files, scans] = await Promise.all([
    fetchStateMap(sourceOrderIds),
    fetchLineItemMap(sourceOrderIds),
    fetchPositionMap(sourceOrderIds),
    fetchFileMap(sourceOrderIds),
    fetchScanMap(sourceOrderIds),
  ]);

  const grouped = new Map(groups.map(group => [group.id, []]));
  for (const job of jobs) {
    const state = states.get(job.source_order_id) || null;
    if (state?.archived) continue;
    const item = buildBoardItem({
      job,
      state,
      columns,
      subitemColumns,
      lineItems: lineItems.get(job.source_order_id) || [],
      positions: positions.get(job.source_order_id) || [],
      files: files.get(job.source_order_id) || new Map(),
      scan: scans.get(String(job.source_order_id)) || null,
    });
    const groupId = state?.group_id || DEFAULT_OFFICE_GROUP_ID;
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

function buildBoardItem({ job, state, columns, subitemColumns, lineItems, positions, files, scan }) {
  const stateValues = state?.column_values || {};
  const values = new Map();
  const itemName = state?.item_name || formatJobName(job);
  const typeLabel = deriveTypeLabel(job);
  const designText = designTextFromPositions(positions, job);

  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.PRIORITY, stateValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY] || priorityValueFromDate(job.delivery_date));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JOB, stateValues[TEST_DASHBOARD_COLUMN_IDS.JOB] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JOB), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DATE, stateValues[TEST_DASHBOARD_COLUMN_IDS.DATE] || dateValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DATE), job.delivery_date));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TRANS, stateValues[TEST_DASHBOARD_COLUMN_IDS.TRANS] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.TRANS), false));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.JAQ, stateValues[TEST_DASHBOARD_COLUMN_IDS.JAQ] || checkboxValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.JAQ), Boolean(job.has_screens || job.screen_numbers)));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, stateValues[TEST_DASHBOARD_COLUMN_IDS.STATUS] || statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.STATUS, scan?.status || ''));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.TYPE, stateValues[TEST_DASHBOARD_COLUMN_IDS.TYPE] || statusValueByLabel(columns, TEST_DASHBOARD_COLUMN_IDS.TYPE, typeLabel));
  putIfColumn(values, columns, TEST_DASHBOARD_COLUMN_IDS.DESIGN, stateValues[TEST_DASHBOARD_COLUMN_IDS.DESIGN] || textValue(columnById(columns, TEST_DASHBOARD_COLUMN_IDS.DESIGN), designText));
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
      id: state?.group_id || DEFAULT_OFFICE_GROUP_ID,
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
  let groupId = currentState?.group_id || DEFAULT_OFFICE_GROUP_ID;
  let archived = Boolean(currentState?.archived);
  const title = normalizeColumnTitle(column.title);
  const statusText = normalizeColumnTitle(changedLabel || getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.STATUS]));
  const typeText = normalizeColumnTitle(getColumnText(columnValues[TEST_DASHBOARD_COLUMN_IDS.TYPE]) || deriveTypeLabel(job));

  if (title === 'STATUS' && !clearRequested) {
    if (statusText === 'INVOICED') {
      archived = true;
    } else {
      archived = false;
    }
    if (statusText === 'COMPLETED') {
      groupId = TEST_DASHBOARD_GROUP_IDS.COMPLETED;
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.PRIORITY];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.DATE];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.TRANS];
      delete columnValues[TEST_DASHBOARD_COLUMN_IDS.JAQ];
    } else if (statusText === 'HOLD') {
      groupId = TEST_DASHBOARD_GROUP_IDS.HOLD;
    } else if (statusText === 'TO SAMPLE') {
      groupId = TEST_DASHBOARD_GROUP_IDS.TO_SAMPLE;
    } else if (statusText === 'SAMPLED') {
      groupId = TEST_DASHBOARD_GROUP_IDS.OFFICE;
    } else if (statusText === 'READY TO PRINT') {
      if (typeText.includes('EMB')) groupId = TEST_DASHBOARD_GROUP_IDS.EMBROIDERY;
      else if (typeText.includes('PRINT')) groupId = TEST_DASHBOARD_GROUP_IDS.PRINT;
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

function deriveTypeLabel(job) {
  const raw = `${job.order_type || ''} ${job.order_type_abbr || ''}`.toLowerCase();
  if (raw.includes('embro') || /\be\b/.test(raw)) return 'EMB';
  if (raw.includes('print') || /\bp\b/.test(raw)) return 'PRINT';
  return '';
}

function designTextFromPositions(positions, job) {
  const parts = [];
  if (job.screen_numbers) parts.push(job.screen_numbers);
  for (const row of positions || []) {
    if (row.design_ref) parts.push(row.design_ref);
  }
  return Array.from(new Set(parts.map(clean).filter(Boolean))).join(', ');
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
