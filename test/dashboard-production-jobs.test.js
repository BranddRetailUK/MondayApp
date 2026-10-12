const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { ensureProductionJobTables, saveLinkedProductionJob, fetchProductionLinks } = require('../src/services/dashboardProductionJobs');
const { TEST_DASHBOARD_COLUMN_IDS: C, TEST_DASHBOARD_GROUP_IDS: G } = require('../src/services/testDashboardDefaults');
const { dashboardStatusValue, groupIdForStatusAndType } = require('../src/services/dashboardAutomation');

test('eleven linked jobs complete independently, aggregate atomically, reopen, and retain design links', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE TABLE database_jobs (source_order_id int PRIMARY KEY, order_no int, customer_name text, job_title text,
    is_complete boolean DEFAULT false, complete_date timestamp, dashboard_status text, proof_approved boolean,
    invoice_printed boolean, pf_invoice_printed boolean, closed_without_invoice boolean, invoice_required boolean,
    dashboard_status_updated_at timestamp, updated_at_source timestamp);
   CREATE TABLE database_job_positions (source_order_position_id int PRIMARY KEY, source_order_id int, position_sort_order int, position_name text, colour_notes text, design_ref text, updated_at_source timestamp);
   CREATE TABLE database_job_line_items (source_order_item_id int PRIMARY KEY, source_order_id int, quantity int);
   CREATE TABLE test_dashboard_private_jobs (id text PRIMARY KEY, column_values jsonb, group_id text);
   CREATE TABLE test_dashboard_job_state (source_order_id int PRIMARY KEY, group_id text, archived boolean, column_values jsonb, updated_at timestamp);
   INSERT INTO database_jobs(source_order_id,order_no,dashboard_status,proof_approved) VALUES(1,51346,'NO STOCK',true),(2,999,'NO STOCK',true);
   INSERT INTO test_dashboard_job_state VALUES(1,'${G.PRE_PRODUCTION}',false,'{}',NOW());`);
  await ensureProductionJobTables(db);
  await ensureProductionJobTables(db);
  for(let i=1;i<=11;i++) {
   await db.query('INSERT INTO database_job_positions VALUES($1,1,$1,$2,$3,$4,NOW())',[i,'Front',`Design ${i}`,`PSG${6000+i}`]);
   await db.query('INSERT INTO database_job_line_items VALUES($1,1,50)',[i]);
   await db.query('INSERT INTO test_dashboard_private_jobs VALUES($1,$2,$3)',[`child-${i}`,JSON.stringify({[C.STATUS]:dashboardStatusValue('NO STOCK')}),G.PRE_PRODUCTION]);
   await db.query('INSERT INTO dashboard_production_jobs(dashboard_job_id,source_order_id,source_order_position_id,source_order_item_id) VALUES($1,1,$2,$2)',[`child-${i}`,i]);
  }
  const pool = { query: db.query.bind(db), connect: async()=>({query:db.query.bind(db),release(){}}) };
  const update = async(i,status,ref) => {
   const state = {archived:false,column_values:{[C.STATUS]:dashboardStatusValue(status),[C.DESIGN]:{text:ref||`PSG${6000+i}`}}};
   return saveLinkedProductionJob(pool,`child-${i}`,state,async client=>(await client.query('UPDATE test_dashboard_private_jobs SET column_values=$2,group_id=$3 WHERE id=$1 RETURNING *',
    [`child-${i}`,JSON.stringify(state.column_values),groupIdForStatusAndType(status,'EMB')])).rows[0],{designChanged:!!ref});
  };
  await assert.rejects(db.query("UPDATE database_jobs SET is_complete=true WHERE source_order_id=1"),/Complete all linked/);
  await assert.rejects(db.query("UPDATE database_jobs SET dashboard_status='COMPLETED' WHERE source_order_id=1"),/Complete all linked/);
  await assert.rejects(db.query('UPDATE test_dashboard_job_state SET group_id=$1 WHERE source_order_id=1',[G.COMPLETED]),/Complete all linked/);
  for(let i=1;i<=10;i++)await update(i,'COMPLETED');
  assert.equal((await db.query('SELECT is_complete FROM database_jobs WHERE source_order_id=1')).rows[0].is_complete,false);
  assert.equal((await db.query('SELECT group_id FROM test_dashboard_private_jobs WHERE id=$1',['child-1'])).rows[0].group_id,G.COMPLETED);
  assert.equal((await db.query('SELECT group_id FROM test_dashboard_private_jobs WHERE id=$1',['child-11'])).rows[0].group_id,G.PRE_PRODUCTION);
  await update(11,'COMPLETED');
  const parent=(await db.query('SELECT * FROM database_jobs WHERE source_order_id=1')).rows[0];
  assert.equal(parent.is_complete,true);assert.equal(parent.dashboard_status,'COMPLETED');assert.ok(parent.complete_date);
  assert.equal((await db.query('SELECT group_id FROM test_dashboard_job_state WHERE source_order_id=1')).rows[0].group_id,G.COMPLETED);
  await assert.rejects(db.query('UPDATE database_jobs SET is_complete=false WHERE source_order_id=1'),/Reopen an individual/);
  await update(4,'READY TO PRINT');
  assert.equal((await db.query('SELECT is_complete FROM database_jobs WHERE source_order_id=1')).rows[0].is_complete,false);
  assert.equal((await db.query('SELECT group_id FROM test_dashboard_private_jobs WHERE id=$1',['child-4'])).rows[0].group_id,G.EMBROIDERY);
  await update(4,'READY TO PRINT','PSG9999');
  assert.equal((await fetchProductionLinks(db)).find(x=>x.dashboard_job_id==='child-4').design_ref,'PSG9999');
  await db.query("UPDATE database_job_positions SET design_ref='PSG8888',colour_notes='Renamed design' WHERE source_order_position_id=4");
  assert.equal((await fetchProductionLinks(db)).find(x=>x.dashboard_job_id==='child-4').design_ref,'PSG8888');
  await assert.rejects(db.query('DELETE FROM database_job_positions WHERE source_order_position_id=4'),/foreign key/);
  await assert.rejects(db.query('UPDATE dashboard_production_jobs SET source_order_id=2 WHERE dashboard_job_id=$1',['child-4']),/must belong/);
  await assert.rejects(update(4,'INVOICED'),/parent order/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM dashboard_production_jobs')).rows[0].n,11);
 } finally { await db.close(); }
});
