const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { buildJobFilters } = require('../src/services/databaseJobFilters');

test('Open Orders excludes status-only invoices and preserves active pre-completion invoices', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE database_jobs (source_order_id int, is_complete boolean, dashboard_status text, order_type text, order_type_abbr text, invoice_printed boolean, pf_invoice_printed boolean, invoice_required boolean, closed_without_invoice boolean);
      INSERT INTO database_jobs VALUES
      (1,false,'INVOICED','Printing','P',null,null,true,false),
      (2,false,' invoiced ','Printing','P',false,false,true,false),
      (3,false,'READY TO PRINT','Printing','P',true,false,true,false),
      (4,false,'COMPLETED','Printing','P',true,false,true,false),
      (5,false,'COMPLETED','Printing','P',false,false,true,false),
      (6,false,null,'Business Gifts','G',true,false,true,false),
      (7,false,null,'Printing','P',false,false,true,false),
      (8,false,'COMPLETED','Printing','P',false,false,false,false),
      (9,false,'IN PRODUCTION','Printing','P',false,false,false,false),
      (10,false,'COMPLETED','Printing','P',false,false,null,false)`);
    const jobs = (await db.query('SELECT * FROM database_jobs ORDER BY source_order_id')).rows;
    const filters = buildJobFilters({status:'open'});
    const open = (await db.query(`SELECT source_order_id FROM database_jobs j ${filters.whereSql} ORDER BY source_order_id`,filters.params)).rows.map(j=>j.source_order_id);
    assert.deepEqual(open,[3,5,7,9,10]);
    const invoiceFilter = buildJobFilters({status: "to-invoice"});
    assert.deepEqual((await db.query(`SELECT source_order_id FROM database_jobs j ${invoiceFilter.whereSql} ORDER BY source_order_id`)).rows.map(j=>j.source_order_id), [5,10]);
    assert.equal(buildJobFilters({}).whereSql,'');
    const source=fs.readFileSync(require.resolve('../public/database.js'),'utf8');
    const start=source.indexOf('function shouldRemoveFromOpenOrders(job)');
    const end=source.indexOf('function selectedManualInvoiceDate()',start);
    const remove=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{
      truthy:v=>v===true, categoryForJob:j=>j.order_type==='Business Gifts'?'gifts':'print',
      normalizeDashboardStatusLabel:v=>String(v||'').trim().toUpperCase(), invoiceNotRequired:j=>j.invoice_required===false
    });
    assert.deepEqual(jobs.filter(j=>!remove(j)).map(j=>j.source_order_id),open);
  } finally { await db.close(); }
});

 test('completed no-invoice jobs clear the dashboard and return when reopened', () => {
  const source = fs.readFileSync(require.resolve('../src/routes/test-dashboard'), 'utf8');
  const start = source.indexOf('function shouldRenderDashboardJob(');
  const end = source.indexOf('function hasDashboardIdentity(', start);
  const render = vm.runInNewContext(`(function(){ ${source.slice(start,end)}; return shouldRenderDashboardJob; })()`, {
    deriveJobCategory: () => 'print', normalizeColumnTitle: v => String(v || '').trim().toUpperCase(),
    getColumnText: v => v?.text || '', TEST_DASHBOARD_COLUMN_IDS: {STATUS:'status'}, hasDashboardIdentity: () => true,
  });
  const job = {invoice_required:false, dashboard_status:'COMPLETED', closed_without_invoice:false};
  assert.equal(render(job, {}), false);
  assert.equal(render({...job, dashboard_status:'IN PRODUCTION'}, {}), true);
  assert.equal(render({...job, invoice_required:true}, {}), true);
  assert.equal(render({...job, invoice_required:null}, {}), true);
});
