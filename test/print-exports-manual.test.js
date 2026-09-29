const test=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const service=require('../src/services/printExports');
const {ensurePrintExportTables}=require('../src/db/printExportSchema');
const production={email:'production@ultimatepromotions.co.uk'};
test('manual requests bypass Off for this job only, deduplicate, retain eligibility and permit reruns',async()=>{
 const db=new PGlite();const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
 await db.exec(`CREATE TABLE database_jobs(source_order_id integer PRIMARY KEY,order_type text,order_type_abbr text,proof_approved boolean);
 CREATE TABLE database_job_positions(source_order_id integer,design_ref text);
 CREATE TABLE test_dashboard_job_state(source_order_id integer PRIMARY KEY,column_values jsonb);
 INSERT INTO database_jobs VALUES(1,'Print',null,true),(2,'Print',null,true),(3,'Print',null,false),(4,'Embroidery',null,true);
 INSERT INTO database_job_positions VALUES(1,'28516 / PSG6893 / 28299'),(2,'29109'),(3,'29110'),(4,'PSG6893');`);
 await ensurePrintExportTables(db);
 await db.exec("INSERT INTO print_export_jobs(id,source_order_id,design_number,approval_id) VALUES('00000000-0000-4000-8000-000000000001',2,'29109','00000000-0000-4000-8000-000000000002')");
 await assert.rejects(service.requestManual(pool,1,{email:'other@ultimatepromotions.co.uk'}),/Production/);
 await assert.rejects(service.requestManual(pool,3,production),/Approve/);
 await assert.rejects(service.requestManual(pool,4,production),/eligible/);
 await assert.rejects(service.requestManual(pool,999,production),/Approve/);
 assert.equal(await service.claim(pool,'pc'),null);
 assert.equal((await service.requestManual(pool,1,production)).queued,1);
 assert.equal((await service.requestManual(pool,1,production)).alreadyActive,true);
 assert.equal(await service.enabled(db),false);
 let task=await service.claim(pool,'pc');assert.equal(task.source_order_id,1);assert.equal(task.manual_requested,true);
 assert.equal((await service.requestManual(pool,1,production)).alreadyActive,true);
 assert.equal(await service.claim(pool,'other-pc'),null);
 await service.updateClaim(pool,task.id,task.claim_token,{status:'exported',outputs:['file.eps']});
 assert.equal(await service.claim(pool,'pc'),null); // job 2 still paused
 assert.equal((await service.requestManual(pool,1,production)).alreadyActive,false);
 task=await service.claim(pool,'pc');await db.exec('UPDATE database_jobs SET proof_approved=false WHERE source_order_id=1');
 assert.equal((await service.updateClaim(pool,task.id,task.claim_token,{status:'processing'})).stop,true);
 // A manual click promotes an existing automatic queued request without duplicating it.
 assert.equal((await service.requestManual(pool,2,production)).alreadyActive,true);
 task=await service.claim(pool,'pc');assert.equal(task.source_order_id,2);
 await db.query("UPDATE print_export_jobs SET lease_until=NOW()-INTERVAL '1 minute' WHERE id=$1",[task.id]);
 assert.equal((await service.requestManual(pool,2,production)).alreadyActive,false);
 const rerun=await service.claim(pool,'pc');assert.ok(rerun);assert.notEqual(rerun.id,task.id);
 }finally{await db.close();}
});
test('manual artwork endpoint rejects other users and invalid job IDs before database access',async()=>{
 const express=require('express');const {createRouter}=require('../src/routes/print-exports');
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers['test-email'])req.hubUser={email:req.headers['test-email'],access_scope:req.headers['test-scope']||'full'};next();});
 app.use(createRouter({connect(){throw Error('Unexpected database access');}}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const req=(email,id='1',scope='full')=>fetch(`http://127.0.0.1:${server.address().port}/api/print-exports/jobs/${id}/run`,{method:'POST',headers:{...(email?{'test-email':email,'test-scope':scope}:{}),'Content-Type':'application/json'},body:'{}'});
 try{
 assert.equal((await req(null)).status,401);
 assert.equal((await req('other@ultimatepromotions.co.uk')).status,403);
 assert.equal((await req(production.email,'1','dtf_only')).status,403);
 assert.equal((await req(production.email,'private_1')).status,400);
 assert.equal((await req(production.email,'2147483648')).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
