const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { ensureProductionJobTables, saveLinkedProductionJob, fetchProductionLinks, readyLinkedProductionParent } = require('../src/services/dashboardProductionJobs');
const { TEST_DASHBOARD_COLUMN_IDS: C, TEST_DASHBOARD_GROUP_IDS: G } = require('../src/services/testDashboardDefaults');
const { dashboardStatusValue, groupIdForStatusAndType } = require('../src/services/dashboardAutomation');

test('eleven linked jobs complete independently, aggregate atomically, reopen, and retain design links', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE TABLE database_jobs (source_order_id int PRIMARY KEY, order_no int, customer_name text, job_title text,
    is_complete boolean DEFAULT false, complete_date timestamp, dashboard_status text, dashboard_priority text, dashboard_type text, order_type text, proof_approved boolean, proof_approved_at timestamp,
    invoice_printed boolean, pf_invoice_printed boolean, closed_without_invoice boolean, invoice_required boolean,
    dashboard_status_updated_at timestamp, updated_at_source timestamp, imported_at timestamp);
   CREATE TABLE database_job_positions (source_order_position_id int PRIMARY KEY, source_order_id int, position_sort_order int, position_name text, colour_notes text, design_ref text, updated_at_source timestamp);
   CREATE TABLE database_job_line_items (source_order_item_id int PRIMARY KEY, source_order_id int, quantity int);
   CREATE TABLE test_dashboard_private_jobs (id text PRIMARY KEY, column_values jsonb, group_id text, item_name text, archived boolean DEFAULT false, updated_at timestamp);
   CREATE TABLE test_dashboard_job_state (source_order_id int PRIMARY KEY, group_id text, archived boolean, column_values jsonb, updated_at timestamp, item_name text);
   CREATE TABLE database_job_status_updates(source_order_id int, status text, previous_status text, event_type text);
   INSERT INTO database_jobs(source_order_id,order_no,dashboard_status,proof_approved) VALUES(1,51346,'NO STOCK',true),(2,999,'NO STOCK',true);
   INSERT INTO test_dashboard_job_state(source_order_id,group_id,archived,column_values,updated_at) VALUES(1,'${G.PRE_PRODUCTION}',false,'{}',NOW());`);
  await db.query("UPDATE database_jobs SET order_type='Embroidery'");
  await ensureProductionJobTables(db);
  await ensureProductionJobTables(db);
  for(let i=1;i<=11;i++) {
   await db.query('INSERT INTO database_job_positions VALUES($1,1,$1,$2,$3,$4,NOW())',[i,'Front',`Design ${i}`,`PSG${6000+i}`]);
   await db.query('INSERT INTO database_job_line_items VALUES($1,1,50)',[i]);
   await db.query('INSERT INTO test_dashboard_private_jobs(id,column_values,group_id) VALUES($1,$2,$3)',[`child-${i}`,JSON.stringify({[C.STATUS]:dashboardStatusValue('SUPPLIED CLOTHING'),[C.JOB]:{text:'v',value:JSON.stringify({checked:'true'})},[C.TYPE]:{text:i===11?'PRINT':'EMB'},[C.NOTES]:{text:'keep this note'}}),G.PRE_PRODUCTION]);
   await db.query('INSERT INTO dashboard_production_jobs(dashboard_job_id,source_order_id,source_order_position_id,source_order_item_id) VALUES($1,1,$2,$2)',[`child-${i}`,i]);
  }
  const pool = { query: db.query.bind(db), connect: async()=>({query:db.query.bind(db),release(){}}) };
  // A blocked child must roll back the entire parent release.
  await db.query(`UPDATE test_dashboard_private_jobs SET column_values=column_values || $2::jsonb WHERE id=$1`,
    ['child-5',JSON.stringify({__dashboard_sampling:{required:true,sampled:false}})]);
  const before=(await db.query('SELECT * FROM test_dashboard_private_jobs ORDER BY id')).rows;
  await assert.rejects(readyLinkedProductionParent(pool,1),/SAMPLED/);
  assert.deepEqual((await db.query('SELECT * FROM test_dashboard_private_jobs ORDER BY id')).rows,before);
  assert.equal((await db.query('SELECT dashboard_status FROM database_jobs WHERE source_order_id=1')).rows[0].dashboard_status,'NO STOCK');
  await db.query("UPDATE test_dashboard_private_jobs SET column_values=column_values - '__dashboard_sampling' WHERE id='child-5'");
  await db.query("UPDATE database_jobs SET proof_approved=false WHERE source_order_id=1");
  await assert.rejects(readyLinkedProductionParent(pool,1),/Approve the parent/);
  await db.query("UPDATE database_jobs SET proof_approved=true WHERE source_order_id=1");
  const released=await readyLinkedProductionParent(pool,1);
  assert.equal(released.releasedChildren,11);
  assert.equal(released.group_id,G.EMBROIDERY);
  const readyRows=(await db.query('SELECT * FROM test_dashboard_private_jobs')).rows;
  assert.ok(readyRows.every(row=>row.column_values[C.STATUS].text==='READY TO PRINT' && row.column_values[C.NOTES].text==='keep this note'));
  assert.equal(readyRows.find(row=>row.id==='child-11').group_id,G.PRINT);
  assert.ok(readyRows.filter(row=>row.id!=='child-11').every(row=>row.group_id===G.EMBROIDERY));
  assert.equal((await db.query('SELECT dashboard_status FROM database_jobs WHERE source_order_id=1')).rows[0].dashboard_status,'READY TO PRINT');
  assert.equal(await readyLinkedProductionParent(pool,2),null);

  const update = async(i,status,ref) => {
   const state = {archived:false,column_values:{[C.STATUS]:dashboardStatusValue(status),[C.DESIGN]:{text:ref||`PSG${6000+i}`}}};
   return saveLinkedProductionJob(pool,`child-${i}`,state,async client=>(await client.query('UPDATE test_dashboard_private_jobs SET column_values=$2,group_id=$3 WHERE id=$1 RETURNING *',
    [`child-${i}`,JSON.stringify(state.column_values),groupIdForStatusAndType(status,'EMB')])).rows[0],{designChanged:!!ref});
  };
  await assert.rejects(db.query("UPDATE database_jobs SET is_complete=true WHERE source_order_id=1"),/Complete all linked/);
  await assert.rejects(db.query("UPDATE database_jobs SET dashboard_status='COMPLETED' WHERE source_order_id=1"),/Complete all linked/);
  await assert.rejects(db.query('UPDATE test_dashboard_job_state SET group_id=$1 WHERE source_order_id=1',[G.COMPLETED]),/Complete all linked/);
  await update(1,'COMPLETED');
  await update(2,'IN PRODUCTION');
  assert.equal((await readyLinkedProductionParent(pool,1)).releasedChildren,9);
  assert.equal((await db.query("SELECT column_values FROM test_dashboard_private_jobs WHERE id='child-2'")).rows[0].column_values[C.STATUS].text,'IN PRODUCTION');
  assert.equal((await db.query("SELECT column_values FROM test_dashboard_private_jobs WHERE id='child-1'")).rows[0].column_values[C.STATUS].text,'COMPLETED');
  for(let i=1;i<=10;i++)await update(i,'COMPLETED');
  assert.equal((await db.query('SELECT is_complete FROM database_jobs WHERE source_order_id=1')).rows[0].is_complete,false);
  assert.equal((await db.query('SELECT group_id FROM test_dashboard_private_jobs WHERE id=$1',['child-1'])).rows[0].group_id,G.COMPLETED);
  assert.equal((await db.query('SELECT group_id FROM test_dashboard_private_jobs WHERE id=$1',['child-11'])).rows[0].group_id,G.PRINT);
  await update(11,'COMPLETED');
  const parent=(await db.query('SELECT * FROM database_jobs WHERE source_order_id=1')).rows[0];
  await assert.rejects(readyLinkedProductionParent(pool,1),/Reopen the order/);
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
