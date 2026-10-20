const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const sharp=require('sharp');
const {ensureProofGeneratorTables}=require('../src/db/proofGeneratorSchema');
const {createService}=require('../src/services/proofPromotion');
const {createService:designService}=require('../src/services/proofDesignJobs');
const {createService:testService}=require('../src/services/proofTestJobs');
const {createService:linkService}=require('../src/services/proofJobLinks');
async function fixture(){
 const db=new PGlite();await ensureProofGeneratorTables(db);await ensureProofGeneratorTables(db);
 await db.exec(`CREATE TABLE database_jobs(source_order_id INTEGER PRIMARY KEY,order_no INTEGER,customer_name TEXT,job_title TEXT,order_type TEXT DEFAULT 'Printing',order_type_abbr TEXT DEFAULT 'P',is_complete BOOLEAN DEFAULT false,dashboard_status TEXT DEFAULT 'AWAITING APPROVAL',proof_approved BOOLEAN DEFAULT false);
 CREATE TABLE test_dashboard_job_state(source_order_id INTEGER PRIMARY KEY,archived BOOLEAN DEFAULT false,group_id TEXT,column_values JSONB DEFAULT '{}'::jsonb);
 CREATE TABLE test_dashboard_files(id SERIAL PRIMARY KEY,source_order_id INTEGER,column_id TEXT,column_title TEXT,public_id TEXT,secure_url TEXT,resource_type TEXT,format TEXT,original_filename TEXT,bytes INTEGER,metadata JSONB);
 CREATE TABLE database_job_positions(source_order_position_id INTEGER UNIQUE,source_order_id INTEGER,position_sort_order INTEGER,design_ref TEXT,position_name TEXT,colour_notes TEXT,created_at_source TIMESTAMP,updated_at_source TIMESTAMP);
 INSERT INTO database_jobs(source_order_id,order_no,customer_name,job_title) VALUES(1,50001,'Promotion customer','Office job');
 INSERT INTO test_dashboard_job_state(source_order_id,group_id) VALUES(1,'office');`);
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 const id=randomUUID(),bytes=await sharp({create:{width:200,height:100,channels:4,background:'#ff0000'}}).png().toBuffer();
 const file={originalname:'Original logo.png',mimetype:'image/png',buffer:bytes};
 const source={request:'Tee logo front 100mm transfer print',customer:'Promotion customer',jobTitle:'Test title',brief:{testProofId:id,reference:'SANDBOX',customer:'Promotion customer',products:[{code:'TEST',name:'Tee',colour:'Black',visual:{matched:true,views:[]},decorations:[{id:'mark',artworkId:'art',position:'front',widthMm:100,method:'transfer print',placement:{x:.7,y:.2}}]}]}};
 const tests=testService(pool);await tests.saveSource(id,'charlie@ultimatepromotions.co.uk',source,[file],[{id:'art',originalName:file.originalname}]);
 await db.query('UPDATE proof_test_jobs SET ready=true,proof_pdf=$2 WHERE id=$1',[id,Buffer.from('sandbox PDF')]);
 const builds=[],links=linkService(pool,{upload:async()=>({public_id:'generated-live',secure_url:'https://example.test/live.pdf',resource_type:'image'})});
 let fail=false;
 const service=createService(pool,{enrich:async()=>{},generateViews:async()=>{},thumbnail:async()=>Buffer.from('png'),links,build:async(brief,artworks,options)=>{if(fail)throw Error('Placement invalid');assert.equal(options.strict,true);builds.push(structuredClone(brief));return {bytes:Buffer.from('live PDF '+brief.reference),issues:[]};}});
 return {db,pool,id,file,tests,service,builds,designs:designService(pool),fail:v=>{fail=v;},updatedAt:(await tests.get(id)).updatedAt};
}
test('promotion retains originals and manual placement, allocates once, saves a numbered proof and matches OFFICE before hiding sandbox',async()=>{
 const f=await fixture();try{
  const started=await f.service.promote(f.id,[f.file],f.updatedAt),liveId=started.design.id;
  assert.notEqual(liveId,f.id);assert.equal(started.design.status,'awaiting_folder');assert.equal(started.complete,false);
  assert.equal((await f.tests.list()).designs.length,1);
  assert.equal((await f.service.promote(f.id)).design.id,liveId);
  const source=await f.designs.source(liveId);assert.equal(source.source.brief.testProofId,undefined);assert.equal(source.source.brief.reference,'');
  assert.deepEqual(Buffer.from(source.artworks[0].data,'base64'),f.file.buffer);
  // Simulate the workstation allocating through its normal claim/reservation/report protocol.
  const task=await f.designs.claim('test-worker',5);
  await f.designs.report(liveId,task.claimToken,{status:'reserve',proposedNumber:'31001'});
  await f.designs.report(liveId,task.claimToken,{status:'allocated',designNumber:'31001',folderName:'31001 Promotion customer'});
  const queued=await f.service.promote(f.id);assert.equal(queued.design.status,'save_queued');assert.equal(queued.design.revision,1);
  assert.equal((await f.tests.list()).designs.length,1);
  const numbered=f.builds.at(-1);assert.equal(numbered.reference,'31001');assert.equal(numbered.testProofId,undefined);assert.deepEqual(numbered.products[0].decorations[0].placement,{x:.7,y:.2});
  const count=f.builds.length;assert.equal((await f.service.promote(f.id)).design.revision,1);assert.equal(f.builds.length,count);
  const save=await f.designs.claim('test-worker',5);assert.equal(save.operation,'save');assert.equal(Buffer.from(save.pdf,'base64').toString(),'live PDF 31001');
  await f.designs.report(liveId,save.claimToken,{status:'saved',hash:save.hash,revision:save.revision});
  const complete=await f.service.promote(f.id);assert.equal(complete.complete,true);assert.equal(complete.design.sourceOrderId,1);
  assert.equal((await f.tests.list()).designs.length,0);
  assert.equal((await f.db.query('SELECT * FROM test_dashboard_files WHERE source_order_id=1')).rows.length,1);
  assert.equal((await f.db.query('SELECT design_ref FROM database_job_positions WHERE source_order_id=1')).rows[0].design_ref,'31001');
  assert.equal((await f.service.promote(f.id)).design.id,liveId);
  assert.equal((await f.db.query('SELECT * FROM proof_design_jobs')).rows.length,1);
 }finally{await f.db.close();}
});
test('invalid or stale sandbox proofs do not allocate live designs; interrupted allocation can resume with the same identity',async()=>{
 const f=await fixture();try{
  await assert.rejects(()=>f.service.promote(f.id,[f.file],'2000-01-01'),/changed/);
  f.fail(true);await assert.rejects(()=>f.service.promote(f.id,[f.file],f.updatedAt),/Placement invalid/);
  assert.equal((await f.db.query('SELECT * FROM proof_design_jobs')).rows.length,0);
  f.fail(false);const first=await f.service.promote(f.id,[f.file],f.updatedAt);
  await f.db.query("UPDATE proof_design_jobs SET status='error',message='Worker offline' WHERE id=$1",[first.design.id]);
  assert.equal((await f.service.promote(f.id)).design.id,first.design.id);assert.equal((await f.tests.list()).designs.length,1);
 }finally{await f.db.close();}
});

test('failed publication keeps the sandbox row; retry publishes once and then removes it',async()=>{
 const f=await fixture();try{
  const started=await f.service.promote(f.id,[f.file],f.updatedAt),id=started.design.id;
  await f.db.query("UPDATE proof_design_jobs SET status='saved',design_number=31002,folder_name='31002 Promotion customer',revision=1,saved_revision=1,saved_proof_pdf=$2,saved_snapshot=jsonb_build_object('customer',customer,'job_title',job_title,'source',source) WHERE id=$1",[id,Buffer.from('live')]);
  const failing=createService(f.pool,{links:{sync:async()=>{throw Error('Cloudinary unavailable');}}});
  await assert.rejects(()=>failing.promote(f.id),/Cloudinary unavailable/);
  assert.equal((await f.tests.list()).designs.length,1);
  await assert.rejects(()=>f.tests.saveSource(f.id,'charlie@example.com',{request:'changed',brief:{}},[],[]),/being added to live/);
  assert.equal((await f.service.promote(f.id)).complete,true);
  assert.equal((await f.tests.list()).designs.length,0);
 }finally{await f.db.close();}
});
