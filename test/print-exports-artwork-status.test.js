const test=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {ensurePrintExportTables}=require('../src/db/printExportSchema');
const {summarize,decorateArtworkStatus,COLUMN}=require('../src/services/artworkExportStatus');
const production={email:'production@ultimatepromotions.co.uk',access_scope:'full'};
const success={status:'exported',outputs:['art.eps']};
const failed={status:'needs_attention',outputs:[]};
test('artwork ticks aggregate complete, partial, failed and pending outcomes',()=>{
 assert.equal(summarize([success]).result,'success');
 assert.equal(summarize([success,failed]).result,'partial');
 assert.equal(summarize([{...failed,outputs:['art.png']}]).result,'partial');
 assert.equal(summarize([failed]).result,'failed');
 assert.equal(summarize([{status:'exported',outputs:[]}]).result,'failed');
 for(const pending of [{status:'queued'},{status:'processing',lease_until:'2100-01-01'},{status:'awaiting_review',lease_until:'2100-01-01'},{status:'cancelled'}])assert.equal(summarize([success,pending]),null);
 assert.equal(summarize([{status:'processing',lease_until:'2000-01-01',outputs:[]}]).result,'failed');
});
function payload(){return {boards:[{columns:[{id:'before'},{id:'checkbox_mkm9ah5x'}],groups:[{items_page:{items:[{database_job:{source_order_id:1},column_values:[]},{id:'private_1',column_values:[]}]}}]}]};}
test('non-production accounts receive neither artwork column nor result lookup',async()=>{
 for(const user of [null,{email:'admin@ultimatepromotions.co.uk'}, {...production,access_scope:'dtf_only'}]){
  const p=payload();await decorateArtworkStatus({query(){throw Error('must not query');}},p,user);
  assert.equal(p.boards[0].columns.length,2);
 }
});
test('production column precedes TRANS and only latest approval contributes',async()=>{
 const db=new PGlite();await db.exec('CREATE TABLE database_jobs(source_order_id INTEGER PRIMARY KEY,proof_approved BOOLEAN,proof_approved_at TIMESTAMPTZ)');await ensurePrintExportTables(db);
 await db.exec("INSERT INTO database_jobs VALUES(1,true,'2026-09-29T10:00Z')");
 const add=async(id,cycle,status,outputs,created)=>db.query('INSERT INTO print_export_jobs(id,source_order_id,design_number,approval_id,status,outputs,created_at) VALUES($1,1,$2,$3,$4,$5,$6)',[id,'28516',cycle,status,JSON.stringify(outputs),created]);
 await add('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','exported',['old.eps'],'2026-09-28T10:00Z');
 let p=payload();await decorateArtworkStatus(db,p,production);assert.equal(p.boards[0].columns[1].id,COLUMN.id);assert.equal(p.boards[0].groups[0].items_page.items[0].column_values.length,0);
 await add('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','needs_attention',[],'2026-09-29T10:00Z');
 p=payload();await decorateArtworkStatus(db,p,production);let items=p.boards[0].groups[0].items_page.items;assert.equal(JSON.parse(items[0].column_values[0].value).result,'failed');assert.equal(items[1].column_values.length,0);
 await db.exec("UPDATE print_export_jobs SET status='queued' WHERE id='00000000-0000-4000-8000-000000000002'");p=payload();await decorateArtworkStatus(db,p,production);assert.equal(p.boards[0].groups[0].items_page.items[0].column_values.length,0);
 await db.close();
});
