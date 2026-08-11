const assert = require('node:assert/strict');
const test = require('node:test');

test('Repeat Order copies every line type with blank quantities and resets job workflow fields', async () => {
  const result = await exerciseRepeatRoute(true);

  assert.equal(result.response.statusCode, 201);
  assert.equal(result.body.job.source_order_id, 9001);
  assert.equal(result.body.job.invoice_no, null);
  assert.equal(result.body.job.dashboard_status, 'AWAITING APPROVAL');
  assert.deepEqual(result.body.copied, {
    line_items: 4,
    positions: 4,
    proof_files: 1,
  });

  const jobInsert = result.queries.find(query => query.includes('INSERT INTO database_jobs'));
  assert.ok(jobInsert, 'expected the repeated job insert');
  const repeatedJobFields = insertSelectMap(jobInsert, 'database_jobs', 'FROM database_jobs source');
  assert.equal(repeatedJobFields.get('invoice_no'), 'NULL');
  assert.equal(repeatedJobFields.get('invoice_date'), 'NULL');
  assert.equal(repeatedJobFields.get('invoice_printed'), 'FALSE');
  assert.equal(repeatedJobFields.get('pf_invoice_printed'), 'FALSE');
  assert.equal(repeatedJobFields.get('pf_invoice_date'), 'NULL');
  assert.equal(repeatedJobFields.get('complete_date'), 'NULL');
  assert.equal(repeatedJobFields.get('is_complete'), 'FALSE');
  assert.equal(repeatedJobFields.get('is_printed'), 'FALSE');
  assert.equal(repeatedJobFields.get('is_bagged'), 'FALSE');
  assert.equal(repeatedJobFields.get('is_automatic'), 'FALSE');
  assert.equal(repeatedJobFields.get('has_artwork'), 'FALSE');
  assert.equal(repeatedJobFields.get('has_screens'), 'FALSE');
  assert.equal(repeatedJobFields.get('has_shirts'), 'FALSE');
  assert.equal(repeatedJobFields.get('customer_date_required'), 'FALSE');
  assert.equal(repeatedJobFields.get('dashboard_priority'), 'NULL');
  assert.equal(repeatedJobFields.get('dashboard_type'), 'NULL');
  assert.equal(repeatedJobFields.get('proof_approved'), 'FALSE');
  assert.equal(repeatedJobFields.get('proof_approved_at'), 'NULL');
  assert.equal(repeatedJobFields.get('order_date'), 'CURRENT_TIMESTAMP');

  const lineInsert = result.queries.find(query => query.includes('INSERT INTO database_job_line_items'));
  assert.ok(lineInsert, 'expected line items to be copied for Yes');
  const repeatedLineFields = insertSelectMap(
    lineInsert,
    'database_job_line_items',
    'FROM source_lines'
  );
  assert.equal(repeatedLineFields.get('quantity'), 'NULL');
  assert.equal(repeatedLineFields.get('supplier_order_id'), 'NULL');
  assert.equal(repeatedLineFields.get('item_reference'), 'source_lines.item_reference');
  assert.match(lineInsert, /WHERE li\.source_order_id = \$1/);
  assert.doesNotMatch(lineInsert, /is_non_deliverable\s+IS|is_internal\s+IS/);

  assert.equal(
    result.queries.filter(query => query.includes('INSERT INTO database_job_positions')).length,
    2
  );
  assert.ok(result.queries.some(query => (
    query.includes('INSERT INTO database_job_positions')
    && query.includes('FROM UNNEST($2::text[])')
  )));
  assert.ok(result.queries.some(query => query.includes('INSERT INTO test_dashboard_files')));
  assert.ok(result.queries.some(query => query.includes('INSERT INTO test_dashboard_job_state')));
});

test('Repeat Order without line items still copies designs and proofs', async () => {
  const result = await exerciseRepeatRoute(false);

  assert.equal(result.response.statusCode, 201);
  assert.equal(result.body.copied.line_items, 0);
  assert.equal(
    result.queries.some(query => query.includes('INSERT INTO database_job_line_items')),
    false
  );
  assert.equal(
    result.queries.filter(query => query.includes('INSERT INTO database_job_positions')).length,
    2
  );
  assert.ok(result.queries.some(query => query.includes('INSERT INTO test_dashboard_files')));
  assert.ok(result.queries.some(query => query.includes('INSERT INTO test_dashboard_job_state')));
});

async function exerciseRepeatRoute(copyLineItems) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const client = {
    async query(sql) {
      const text = typeof sql === 'string' ? sql : sql.text;
      queries.push(text);
      if (/SELECT source_order_id, order_no\s+FROM database_jobs/.test(text)) {
        return { rowCount: 1, rows: [{ source_order_id: 8001, order_no: 8101 }] };
      }
      if (text.includes('AS source_year') && text.includes('FROM database_jobs')) {
        return {
          rowCount: 1,
          rows: [{ source_order_id: 9001, order_no: 9101, source_year: 2026 }],
        };
      }
      if (text.includes('AS all_reference_text')) {
        return {
          rowCount: 1,
          rows: [{
            all_reference_text: 'Front print PSG1234 ST5000',
            copied_reference_text: 'Front print',
          }],
        };
      }
      if (text.includes('INSERT INTO database_jobs')) {
        return {
          rowCount: 1,
          rows: [{
            source_order_id: 9001,
            order_no: 9101,
            invoice_no: null,
            dashboard_status: 'AWAITING APPROVAL',
            is_complete: false,
          }],
        };
      }
      if (text.includes('INSERT INTO database_job_line_items')) return { rowCount: 4, rows: [] };
      if (text.includes('INSERT INTO database_job_positions') && text.includes('FROM UNNEST($2::text[])')) {
        return { rowCount: 2, rows: [] };
      }
      if (text.includes('INSERT INTO database_job_positions')) return { rowCount: 2, rows: [] };
      if (text.includes('INSERT INTO test_dashboard_files')) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const fakePool = {
    async connect() {
      return client;
    },
    async query(sql) {
      return client.query(sql);
    },
  };

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: fakePool,
  };
  delete require.cache[routePath];

  try {
    const router = require('../src/routes/database');
    const route = router.stack.find(layer => (
      layer.route?.path === '/api/database/jobs/:id/repeat'
      && layer.route?.methods?.post
    ));
    assert.ok(route, 'Repeat Order route is registered');
    const handler = route.route.stack[0].handle;
    const response = createResponse();
    await handler({
      params: { id: '8001' },
      body: { copy_line_items: copyLineItems },
      hubUser: { id: 42, first_name: 'Repeat', last_name: 'Tester' },
    }, response);
    return { response, body: response.body, queries };
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function insertSelectMap(sql, table, endMarker) {
  const start = sql.indexOf(`INSERT INTO ${table} (`);
  assert.notEqual(start, -1, `missing ${table} insert`);
  const columnsStart = start + `INSERT INTO ${table} (`.length;
  const selectMatch = /\n\s*\)\s*\n\s*SELECT/.exec(sql.slice(columnsStart));
  assert.ok(selectMatch, `missing ${table} SELECT`);
  const selectIndex = columnsStart + selectMatch.index;
  const columnsText = sql.slice(columnsStart, selectIndex);
  const valuesStart = selectIndex + selectMatch[0].lastIndexOf('SELECT') + 'SELECT'.length;
  const valuesEnd = sql.indexOf(endMarker, valuesStart);
  assert.notEqual(valuesEnd, -1, `missing ${table} SELECT end`);

  const columns = splitTopLevel(columnsText);
  const values = splitTopLevel(sql.slice(valuesStart, valuesEnd));
  assert.equal(columns.length, values.length, `${table} insert column/value count`);
  return new Map(columns.map((column, index) => [column, values[index]]));
}

function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  for (const character of value) {
    if (character === "'") quoted = !quoted;
    if (!quoted && character === '(') depth += 1;
    if (!quoted && character === ')') depth -= 1;
    if (!quoted && depth === 0 && character === ',') {
      parts.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
