const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {ensureProofGeneratorTables}=require('../src/db/proofGeneratorSchema');
const pipeline=require('../src/services/madebluntPipeline');
const proofs=require('../src/services/proofDesignJobs');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {saveVisual}=require('../tools/print-worker/visual-files');
test('Madeblunt folder allocation, visual discovery, leases and retries preserve sampling and other customers',async()=>{
 const pg=new PGlite();const db={query:(s,v)=>pg.query(s,v),release(){}};const pool={...db,connect:async()=>db};
 try{
 await ensureProofGeneratorTables(pool);await pipeline.ensureTables(pool);
 await pg.exec(`CREATE TABLE database_jobs(source_order_id INTEGER PRIMARY KEY,customer_id INTEGER,dashboard_status TEXT);
 CREATE TABLE database_job_positions(source_order_position_id INTEGER PRIMARY KEY,source_order_id INTEGER,position_sort_order INTEGER,design_ref TEXT,created_at_source TIMESTAMPTZ,updated_at_source TIMESTAMPTZ);
 CREATE TABLE test_dashboard_files(id INTEGER PRIMARY KEY,source_order_id INTEGER,column_id TEXT,column_title TEXT,public_id TEXT,secure_url TEXT,original_filename TEXT,format TEXT);
 INSERT INTO database_jobs VALUES(50622,3446,'TO SAMPLE'),(50623,9,'AWAITING APPROVAL');`);
 const job={source_order_id:50622,customer_id:3446,customer_name:'Madeblunt ( UK ) Ltd',job_title:'Umbrellas',dashboard_status:'TO SAMPLE'};
 assert.equal(await pipeline.enroll(pool,{...job,source_order_id:50623,customer_id:9}),null);
 assert.equal(await pipeline.enroll(pool,{...job,dashboard_status:'AWAITING APPROVAL'}),null);
 assert.equal(await pipeline.enroll(pool,{...job,dashboard_status:'SAMPLED'}),null);
 assert.equal((await pg.query('SELECT * FROM madeblunt_design_jobs')).rows.length,0);
 await pg.exec("UPDATE database_jobs SET dashboard_status='AWAITING APPROVAL' WHERE source_order_id=50622");
 await assert.rejects(()=>pipeline.activateForSampling(pool,50622,async client=>{
   await client.query("UPDATE database_jobs SET dashboard_status='TO SAMPLE' WHERE source_order_id=50622");
   throw new Error('Status save failed');
 }),/Status save failed/);
 assert.equal((await pg.query('SELECT * FROM madeblunt_design_jobs')).rows.length,0);
 assert.equal((await pg.query('SELECT dashboard_status FROM database_jobs WHERE source_order_id=50622')).rows[0].dashboard_status,'AWAITING APPROVAL');
 await pipeline.activateForSampling(pool,50622,async client=>{
   await client.query("UPDATE database_jobs SET dashboard_status='TO SAMPLE' WHERE source_order_id=50622");
 });
 const id=(await pipeline.status(pool,50622)).id;assert.equal(await pipeline.enroll(pool,job),id);
 await pipeline.activateForSampling(pool,50622,async()=>{});
 assert.equal((await pg.query('SELECT * FROM madeblunt_design_jobs')).rows.length,1);
 const service=proofs.createService(pool);assert.equal((await service.list()).designs.length,0);
 let task=await service.claim('test',5);assert.equal(task.operation,'allocate');
 const reserved=await service.report(id,task.claimToken,{status:'reserve',proposedNumber:'29200'});
 assert.equal(reserved.designNumber,'29200');
 await pipeline.reconcile(pool);assert.equal((await pg.query('SELECT * FROM database_job_positions')).rows.length,0);
 await service.report(id,task.claimToken,{status:'allocated',designNumber:'29200',folderName:'29200 Madeblunt ( UK ) Ltd'});
 await pg.exec(`INSERT INTO test_dashboard_files VALUES(1,50622,'proof','VISUAL','asset1','https://res.cloudinary.com/test/image/upload/v1/a.pdf','Proof','pdf'),(2,50622,'files','FILES','asset2','https://res.cloudinary.com/test/raw/upload/b.txt','Other','txt');`);
 await pipeline.reconcile(pool);await pipeline.reconcile(pool);
 assert.equal((await pg.query('SELECT design_ref FROM database_job_positions')).rows[0].design_ref,'29200');
 assert.equal((await pg.query('SELECT * FROM database_job_positions')).rows.length,1);
 assert.equal((await pipeline.status(pool,50622)).visuals.length,1);
 assert.equal(await pipeline.claim(pool,6),null);
 task=await pipeline.claim(pool);assert.equal(task.filename,'Proof');
 assert.equal(await pipeline.claim(pool),null);
 assert.equal((await pipeline.report(pool,task.id,randomUUID(),{status:'saved',hash:'a'.repeat(64)})).accepted,false);
 await pipeline.report(pool,task.id,task.claimToken,{status:'saved',hash:'a'.repeat(64)});
 await pipeline.reconcile(pool);assert.equal(await pipeline.claim(pool),null);
 await pg.exec("UPDATE madeblunt_visual_files SET filename='Visual 1-12345678 - Proof.pdf' WHERE file_id=1");
 await pipeline.reconcile(pool);
 const rename=await pipeline.claim(pool);assert.equal(rename.filename,'Proof');assert.equal(rename.legacyFilename,'Visual 1-12345678 - Proof.pdf');
 await pipeline.report(pool,rename.id,rename.claimToken,{status:'saved',hash:'a'.repeat(64)});
 await pipeline.reconcile(pool);assert.equal(await pipeline.claim(pool),null);
 assert.equal((await pg.query('SELECT dashboard_status FROM database_jobs WHERE source_order_id=50622')).rows[0].dashboard_status,'TO SAMPLE');
 await pg.exec(`INSERT INTO test_dashboard_files VALUES(3,50622,'proof','VISUAL','asset3','https://res.cloudinary.com/test/image/upload/c.png','Second.png','png');`);
 await pipeline.reconcile(pool);task=await pipeline.claim(pool);assert.equal(task.filename,'Second.png');
 await pg.exec("UPDATE madeblunt_visual_files SET lease_until=NOW()-INTERVAL '1 minute' WHERE status='saving'");
 const replay=await pipeline.claim(pool);assert.equal(replay.id,task.id);assert.notEqual(replay.claimToken,task.claimToken);
 }finally{await pg.close();}
});
test('visual file saving is byte-identical, idempotent and refuses unsafe sources and overwrites',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'madeblunt-'));const folder=path.join(dir,'29200 Madeblunt');
 try{
 await fs.mkdir(folder);const bytes=Buffer.from('original visual bytes');
 const task={designNumber:'29200',folderName:path.basename(folder),filename:'BCG-SpencerStuart_Metro_V2.2[6].pdf',url:'https://res.cloudinary.com/test/image/upload/a.pdf'};
 const fetcher=async()=>new Response(bytes);
 task.legacyFilename='Visual 419-79fb6a6c - '+task.filename;
 await fs.writeFile(path.join(folder,task.legacyFilename),bytes);
 const hash=await saveVisual(dir,task,async()=>{},fetcher);
 await assert.rejects(()=>fs.access(path.join(folder,task.legacyFilename)),/ENOENT/);
 assert.deepEqual(await fs.readFile(path.join(folder,task.filename)),bytes);
 assert.equal(await saveVisual(dir,task,async()=>{},fetcher),hash);
 await assert.rejects(()=>saveVisual(dir,{...task,url:'http://localhost/secret'},async()=>{},fetcher),/Invalid visual source/);
 await assert.rejects(()=>saveVisual(dir,{...task,filename:'../escape'},async()=>{},fetcher),/filename/);
 await fs.writeFile(path.join(folder,task.filename),'manually changed');
 await assert.rejects(()=>saveVisual(dir,task,async()=>{},fetcher),/not been overwritten/);
 assert.equal(await fs.readFile(path.join(folder,task.filename),'utf8'),'manually changed');
 const changed={...task,filename:'Épreuve (2)[1].pdf',legacyFilename:'Visual 420-12345678 - Épreuve (2)[1].pdf'};
 await fs.writeFile(path.join(folder,changed.legacyFilename),'changed old copy');
 await assert.rejects(()=>saveVisual(dir,changed,async()=>{},fetcher),/previously copied visual was changed/);
 await assert.rejects(()=>fs.access(path.join(folder,changed.filename)),/ENOENT/);
 assert.equal(await fs.readFile(path.join(folder,changed.legacyFilename),'utf8'),'changed old copy');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
