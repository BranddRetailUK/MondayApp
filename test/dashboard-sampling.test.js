const assert = require('node:assert/strict');
const test = require('node:test');
const {
  TEST_DASHBOARD_COLUMNS: columns,
  TEST_DASHBOARD_COLUMN_IDS: ids,
  TEST_DASHBOARD_GROUP_IDS: groups,
} = require('../src/services/testDashboardDefaults');
const {
  DASHBOARD_SAMPLING_STATE_KEY,
  SAMPLE_REQUIRED_MESSAGE,
  JOB_APPROVAL_REQUIRED_MESSAGE,
  dashboardSamplingState,
  rememberPrivateDashboardSampling,
} = require('../src/services/dashboardSampling');

test('sampling requirement survives leaving TO SAMPLE and accepts any prior SAMPLED status', () => {
  assert.equal(dashboardSamplingState({ dashboard_status: 'TO SAMPLE' }).blocked, true);
  assert.equal(dashboardSamplingState({}, { group_id: groups.TO_SAMPLE }).blocked, true);
  assert.equal(dashboardSamplingState({}, {}, { required: true, sampled: false }).blocked, true);
  assert.equal(dashboardSamplingState({}, {}, { required: true, sampled: true }).blocked, false);
  assert.equal(dashboardSamplingState({ dashboard_status: ' sampled ' }, {}, { required: true }).blocked, false);
  assert.equal(dashboardSamplingState().blocked, false);
});

test('private sampling history persists across unrelated status and group changes', () => {
  let row = rememberPrivateDashboardSampling({ group_id: groups.TO_SAMPLE, column_values: {} });
  row = rememberPrivateDashboardSampling({ ...row, group_id: groups.OFFICE });
  assert.equal(dashboardSamplingState({}, row).blocked, true);
  row = rememberPrivateDashboardSampling({ ...row, column_values: { ...row.column_values, [ids.STATUS]: value('SAMPLED') } });
  row = rememberPrivateDashboardSampling({ ...row, group_id: groups.TO_SAMPLE, column_values: { ...row.column_values, [ids.STATUS]: value('TO SAMPLE') } });
  assert.deepEqual(row.column_values[DASHBOARD_SAMPLING_STATE_KEY], { required: true, sampled: true });
  assert.equal(dashboardSamplingState({}, row).blocked, false);
});

test('TO SAMPLE cannot be approved even with design and proof present', async () => {
  await withFixture({}, async fixture => {
    const before = fixture.snapshot();
    const response = await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'sample_required');
    assert.equal(response.body.error, SAMPLE_REQUIRED_MESSAGE);
    assert.deepEqual(fixture.snapshot(), before);
    assert.equal(fixture.jobWrites(), 0);
  });
});

test('a previous TO SAMPLE cannot bypass approval by moving to Office', async () => {
  await withFixture({ status: 'AWAITING APPROVAL', history: ['TO SAMPLE'] }, async fixture => {
    const response = await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true });
    assert.equal(response.body.code, 'sample_required');
    assert.equal(fixture.jobWrites(), 0);
  });
});

test('SAMPLED then approval then READY TO PRINT moves the job into Print', async () => {
  await withFixture({}, async fixture => {
    let response = await fixture.request('status-column', { columnId: ids.STATUS, label: 'SAMPLED' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.groupId, groups.OFFICE);
    response = await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true });
    assert.equal(response.statusCode, 200);
    assert.equal(fixture.snapshot().job.proof_approved, true);
    assert.equal(response.body.groupId, groups.PRE_PRODUCTION);
    response = await fixture.request('status-column', { columnId: ids.STATUS, label: 'READY TO PRINT' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.groupId, groups.PRINT);
    assert.equal(fixture.snapshot().job.dashboard_status, 'READY TO PRINT');
    assert.equal(fixture.snapshot().state.column_values[ids.STATUS].text, 'READY TO PRINT');
  });
});

test('a previously sampled job can be approved after returning to TO SAMPLE', async () => {
  await withFixture({ history: ['TO SAMPLE', 'SAMPLED'] }, async fixture => {
    const response = await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true });
    assert.equal(response.statusCode, 200);
  });
});

test('ordinary approval still succeeds and sampled jobs still require proof', async () => {
  await withFixture({ status: 'AWAITING APPROVAL' }, async fixture => {
    assert.equal((await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true })).statusCode, 200);
  });
  await withFixture({ status: 'SAMPLED', history: ['TO SAMPLE'], hasProof: false }, async fixture => {
    const response = await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true });
    assert.equal(response.body.code, 'approval_requirements_missing');
    assert.deepEqual(response.body.missing, ['proof']);
    assert.equal(fixture.jobWrites(), 0);
  });
});

test('READY TO PRINT cannot silently move an unsampled job or alter its status', async () => {
  await withFixture({}, async fixture => {
    const before = fixture.snapshot();
    const response = await fixture.request('status-column', { columnId: ids.STATUS, label: 'READY TO PRINT' });
    assert.equal(response.body.code, 'sample_required');
    assert.deepEqual(fixture.snapshot(), before);
    assert.equal(fixture.jobWrites(), 0);
  });
});

test('READY TO PRINT requires approval after sampling without mutating the job', async () => {
  await withFixture({ status: 'SAMPLED', history: ['TO SAMPLE'] }, async fixture => {
    const before = fixture.snapshot();
    const response = await fixture.request('status-column', { columnId: ids.STATUS, label: 'READY TO PRINT' });
    assert.equal(response.body.code, 'job_approval_required');
    assert.equal(response.body.error, JOB_APPROVAL_REQUIRED_MESSAGE);
    assert.deepEqual(fixture.snapshot(), before);
  });
});

test('approval can still be cleared and unrelated ticks can be saved before sampling', async () => {
  await withFixture({}, async fixture => {
    assert.equal((await fixture.request('checkbox-column', { columnId: ids.TRANS, checked: true })).statusCode, 200);
    assert.equal((await fixture.request('checkbox-column', { columnId: ids.JOB, checked: false })).statusCode, 200);
    assert.equal(fixture.snapshot().job.proof_approved, false);
  });
});

test('status response and DATABASE mirror the effective automation result', async () => {
  await withFixture({ status: 'AWAITING APPROVAL' }, async fixture => {
    const response = await fixture.request('status-column', { columnId: ids.STATUS, label: 'IN PRODUCTION' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.label, 'AWAITING APPROVAL');
    assert.equal(fixture.snapshot().job.dashboard_status, response.body.label);
    assert.equal(fixture.snapshot().state.column_values[ids.STATUS].text, response.body.label);
  });
});

test('order-number fallback checks and saves the canonical source job', async () => {
  await withFixture({ status: 'SAMPLED', history: ['TO SAMPLE'] }, async fixture => {
    const response = await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true }, '51256');
    assert.equal(response.statusCode, 200);
    const ready = await fixture.request('status-column', { columnId: ids.STATUS, label: 'READY TO PRINT' }, '51256');
    assert.equal(ready.body.itemId, '50503');
    assert.equal(fixture.snapshot().state.source_order_id, 50503);
  });
});

test('private jobs cannot bypass sampling with a group move and can proceed after SAMPLED', async () => {
  await withFixture({ privateJob: true }, async fixture => {
    assert.equal((await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true })).body.code, 'sample_required');
    assert.equal((await fixture.request('status-column', { columnId: ids.STATUS, label: 'READY TO PRINT' })).body.code, 'sample_required');
    assert.equal((await fixture.request('group', { groupId: groups.OFFICE })).statusCode, 200);
    assert.equal((await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true })).body.code, 'sample_required');
    assert.equal((await fixture.request('status-column', { columnId: ids.STATUS, label: 'SAMPLED' })).statusCode, 200);
    assert.equal((await fixture.request('status-column', { columnId: ids.STATUS, label: 'HOLD' })).statusCode, 200);
    assert.equal((await fixture.request('checkbox-column', { columnId: ids.JOB, checked: true })).statusCode, 200);
  });
});

function value(text) { return { id: ids.STATUS, text, type: 'status', value: '{}' }; }

async function withFixture(options, run) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/test-dashboard');
  const originalPool = require.cache[poolPath];
  const originalRoute = require.cache[routePath];
  let job = { source_order_id: 50503, order_no: 51256, order_type: 'Printing', dashboard_status: options.status || 'TO SAMPLE', proof_approved: false };
  let state = {
    source_order_id: 50503, id: 'private_00000000-0000-0000-0000-000000000001', item_name: 'Sampling test', archived: false,
    group_id: job.dashboard_status === 'TO SAMPLE' ? groups.TO_SAMPLE : groups.OFFICE,
    column_values: {
      [ids.STATUS]: value(job.dashboard_status),
      [ids.DESIGN]: { id: ids.DESIGN, text: '29079', type: 'text' },
      [ids.PROOF]: { id: ids.PROOF, text: 'proof.pdf', type: 'file' },
    },
  };
  const history = [...(options.history || [])];
  const queries = [];
  const rows = data => ({ rows: structuredClone(data), rowCount: data.length });
  const pool = { async query(sql, values = []) {
    queries.push({ sql, values });
    if (sql.includes('FROM test_dashboard_columns') && sql.trimStart().startsWith('SELECT')) return rows(columns);
    if (sql.includes('FROM database_jobs') && sql.trimStart().startsWith('SELECT')) return rows([job]);
    if (sql.includes('FROM test_dashboard_job_state') && sql.trimStart().startsWith('SELECT')) {
      assert.equal(values[0], 50503);
      return rows([state]);
    }
    if (sql.includes('FROM test_dashboard_private_jobs')) return rows(options.privateJob ? [state] : []);
    if (sql.includes('FROM database_job_status_updates')) {
      assert.deepEqual(values[0], [50503]);
      return rows([{ source_order_id: 50503, required: history.includes('TO SAMPLE'), sampled: history.includes('SAMPLED') }]);
    }
    if (sql.includes('FROM database_job_positions')) return rows([{ design_ref: '29079' }]);
    if (sql.includes('FROM test_dashboard_files')) return rows(options.hasProof === false ? [] : [{ id: 1 }]);
    if (sql.includes('INSERT INTO test_dashboard_job_state') || sql.includes('UPDATE test_dashboard_private_jobs')) {
      if (!options.privateJob) assert.equal(values[0], 50503);
      state = { ...state, group_id: values[1], item_name: values[2], column_values: structuredClone(values[3]), archived: values[4] };
      return rows([state]);
    }
    if (sql.includes('UPDATE database_jobs')) {
      assert.equal(values[0], 50503);
      for (const field of ['dashboard_status', 'dashboard_priority', 'proof_approved']) {
        const match = sql.match(new RegExp(`${field} = \\$(\\d+)`));
        if (match) {
          if (field === 'dashboard_status') history.push(job.dashboard_status, values[Number(match[1]) - 1]);
          job[field] = values[Number(match[1]) - 1];
        }
      }
      return rows([job]);
    }
    return rows([]);
  } };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: pool };
  delete require.cache[routePath];
  try {
    const { protectedRouter } = require('../src/routes/test-dashboard');
    await run({
      snapshot: () => structuredClone({ job, state }),
      jobWrites: () => queries.filter(({ sql }) => /(?:UPDATE database_jobs|INSERT INTO test_dashboard_job_state|UPDATE test_dashboard_private_jobs)/.test(sql)).length,
      async request(endpoint, body, id = options.privateJob ? 'private_00000000-0000-0000-0000-000000000001' : '50503') {
        const route = protectedRouter.stack.find(layer => layer.route?.path === `/api/test-dashboard/items/:jobId/${endpoint}` && layer.route.methods.put);
        assert.ok(route);
        const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
        await route.route.stack[0].handle({ params: { jobId: id }, body }, response);
        return response;
      },
    });
  } finally {
    if (originalPool) require.cache[poolPath] = originalPool; else delete require.cache[poolPath];
    if (originalRoute) require.cache[routePath] = originalRoute; else delete require.cache[routePath];
  }
}
