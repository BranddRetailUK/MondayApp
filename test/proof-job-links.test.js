const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {ensureProofGeneratorTables}=require('../src/db/proofGeneratorSchema');
const {createService,isProduction}=require('../src/services/proofJobLinks');
const {createService:designService}=require('../src/services/proofDesignJobs');
const {TEST_DASHBOARD_COLUMN_IDS:COL}=require('../src/services/testDashboardDefaults');
async function fixture(){
  const db=new PGlite();
  await ensureProofGeneratorTables(db);
  await db.exec(`CREATE TABLE database_jobs(source_order_id INTEGER PRIMARY KEY,order_no INTEGER,customer_name TEXT,job_title TEXT,
    order_type TEXT DEFAULT 'Printing',order_type_abbr TEXT DEFAULT 'P',is_complete BOOLEAN DEFAULT false,dashboard_status TEXT DEFAULT 'AWAITING APPROVAL',proof_approved BOOLEAN DEFAULT false);
    CREATE TABLE test_dashboard_job_state(source_order_id INTEGER PRIMARY KEY,archived BOOLEAN DEFAULT false,group_id TEXT,column_values JSONB DEFAULT '{}'::jsonb);
    CREATE TABLE test_dashboard_files(id SERIAL PRIMARY KEY,source_order_id INTEGER,column_id TEXT,column_title TEXT,public_id TEXT,secure_url TEXT,resource_type TEXT,format TEXT,original_filename TEXT,bytes INTEGER,metadata JSONB);
    CREATE TABLE database_job_positions(source_order_position_id INTEGER UNIQUE,source_order_id INTEGER,position_sort_order INTEGER,design_ref TEXT,position_name TEXT,colour_notes TEXT,created_at_source TIMESTAMP,updated_at_source TIMESTAMP);
    INSERT INTO database_jobs(source_order_id,order_no,customer_name,job_title) VALUES(1,10001,'Customer A','First order'),(2,10002,'Customer A','Repeat'),(3,10003,'Customer B','Has visual'),(4,10004,'Customer C','Pending job');
    INSERT INTO test_dashboard_files(source_order_id,column_id,column_title,public_id) VALUES(3,'custom','VISUAL','manual');`);
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  let failUpload=false;const uploads=[];
  const links=createService(pool,{upload:async(bytes,options)=>{if(failUpload)throw Error('Cloudinary unavailable');uploads.push({bytes:bytes.toString(),options});return {public_id:`${options.folder}/${options.publicId}`,secure_url:`https://example.test/${options.publicId}.pdf`,resource_type:'image'};}});
  const designs=designService(pool),id=randomUUID();
  await designs.reserve(id,'Customer A','First order',true);
  await db.query(`UPDATE proof_design_jobs SET status='saved',design_number=30001,folder_name='30001 Customer A',revision=1,saved_revision=1,
    saved_proof_pdf=$2,proof_pdf=$2,proof_ready=true,source=$3,saved_snapshot=$4 WHERE id=$1`,[id,Buffer.from('original PDF'),{request:'original request',jobTitle:'First order'},{source:{request:'original request',jobTitle:'First order'},source_artworks:[],garment_assets:{},customer:'Customer A',job_title:'First order'}]);
  return {db,pool,links,designs,id,uploads,fail(value){failUpload=value;}};
}
test('production identity is exact and excludes uploader-only users',()=>{
  assert.equal(isProduction({email:'production@ultimatepromotions.co.uk',access_scope:'full'}),true);
  for(const user of [null,{email:'office@ultimatepromotions.co.uk'},{email:'production@ultimatepromotions.co.uk.example.com'},{email:'production@ultimatepromotions.co.uk',access_scope:'dtf_only'}])assert.equal(isProduction(user),false);
});
test('job picker excludes visuals and linking rechecks; attachment adds one PDF/ref and retries do not duplicate',async()=>{
  const f=await fixture();try{
    assert.deepEqual((await f.links.jobs()).map(j=>j.source_order_id),[4,2,1]);
    await assert.rejects(()=>f.links.link(f.id,3),/already has a visual/);
    await f.links.link(f.id,1);await f.links.link(f.id,1);await f.links.publish(f.id);
    assert.equal(f.uploads.length,1);
    assert.equal((await f.db.query('SELECT * FROM test_dashboard_files WHERE source_order_id=1')).rows.length,1);
    assert.equal((await f.db.query('SELECT design_ref FROM database_job_positions WHERE source_order_id=1')).rows[0].design_ref,'30001');
    assert.equal((await f.db.query('SELECT proof_approved FROM database_jobs WHERE source_order_id=1')).rows[0].proof_approved,false);
    assert.deepEqual((await f.links.jobs()).map(j=>j.source_order_id),[4,2]);
    assert.deepEqual((await f.designs.get(f.id)).linkedJobs,[1]);
    assert.deepEqual((await f.designs.get(f.id)).linkedOrders,[{sourceOrderId:1,orderNo:10001}]);
    assert.equal((await f.designs.list(0,true)).designs.length,0);
  }finally{await f.db.close();}
});
test('proof-first and job-first both publish only workstation-confirmed PDF, never a newer draft',async()=>{
  const f=await fixture();try{
    await f.db.query("UPDATE proof_design_jobs SET status='preparing',saved_revision=0,revision=0,saved_proof_pdf=NULL WHERE id=$1",[f.id]);
    await f.links.link(f.id,1);assert.equal(f.uploads.length,0);
    await f.db.query("UPDATE proof_design_jobs SET status='saved',publish_source_order_id=1,saved_revision=1,revision=1,saved_proof_pdf=$2,proof_pdf=$3 WHERE id=$1",[f.id,Buffer.from('confirmed PDF'),Buffer.from('draft PDF')]);
    await f.links.publish(f.id);assert.equal(f.uploads[0].bytes,'confirmed PDF');
  }finally{await f.db.close();}
});
test('repeat snapshot keeps old visual; editing repeat retains design number and restores its source',async()=>{
  const f=await fixture();try{
    await f.links.link(f.id,1);
    // Same transactional copies as the existing Repeat Order route.
    await f.db.query(`INSERT INTO proof_job_links(source_order_id,proof_id,saved_revision,file_public_id,snapshot)
      SELECT 2,proof_id,saved_revision,file_public_id,snapshot FROM proof_job_links WHERE source_order_id=1`);
    await f.db.query(`INSERT INTO test_dashboard_files(source_order_id,column_id,column_title,public_id,secure_url)
      SELECT 2,column_id,column_title,public_id,secure_url FROM test_dashboard_files WHERE source_order_id=1`);
    const old=(await f.db.query('SELECT public_id FROM test_dashboard_files WHERE source_order_id=1')).rows[0].public_id;
    await f.db.query('UPDATE proof_design_jobs SET source=$2 WHERE id=$1',[f.id,{request:'unrelated latest draft'}]);
    await f.links.activate(2);
    assert.equal((await f.designs.source(f.id)).source.request,'original request');
    assert.equal((await f.designs.source(f.id)).source.jobTitle,'Repeat');
    assert.equal((await f.designs.get(f.id)).designNumber,'30001');
    await assert.rejects(()=>f.designs.queueSave(f.id,randomUUID(),1,Buffer.from('stale'),{proofSourceOrderId:1}),/linked job changed/);
    await f.db.query("UPDATE proof_design_jobs SET publish_source_order_id=2,saved_revision=2,revision=2,saved_proof_pdf=$2 WHERE id=$1",[f.id,Buffer.from('repeat PDF')]);
    await f.links.publish(f.id);
    assert.equal((await f.db.query('SELECT public_id FROM test_dashboard_files WHERE source_order_id=1')).rows[0].public_id,old);
    assert.notEqual((await f.db.query('SELECT public_id FROM test_dashboard_files WHERE source_order_id=2')).rows[0].public_id,old);
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM test_dashboard_files WHERE source_order_id=2')).rows[0].n,1);
    await f.links.activate(1);
    await f.links.publish(f.id);
    assert.equal((await f.designs.get(f.id)).linkPending,false);
    assert.equal((await f.db.query('SELECT public_id FROM test_dashboard_files WHERE source_order_id=1')).rows[0].public_id,old,'reopening the historical proof must not publish another job’s newer PDF');

  }finally{await f.db.close();}
});
test('approval, conflicting visuals and failed publication preserve job data and support retry',async()=>{
  const f=await fixture();try{
    f.fail(true);await assert.rejects(()=>f.links.link(f.id,1),/unavailable/);
    assert.equal((await f.links.job(1)).proof_id,f.id);
    assert.equal((await f.db.query('SELECT * FROM test_dashboard_files WHERE source_order_id=1')).rows.length,0);
    f.fail(false);await f.links.publish(f.id);
    await f.db.query('UPDATE database_jobs SET proof_approved=true WHERE source_order_id=1');
    await assert.rejects(()=>f.links.activate(1),/approval/);await assert.rejects(()=>f.links.unlink(1),/approval/);
    await f.db.query('UPDATE proof_design_jobs SET saved_revision=2 WHERE id=$1',[f.id]);
    await assert.rejects(()=>f.links.publish(f.id),/Approved proofs/);
    await f.db.query('UPDATE database_jobs SET proof_approved=false WHERE source_order_id=1');
    await f.db.query(`INSERT INTO test_dashboard_files(source_order_id,column_id,column_title,public_id) VALUES(1,$1,'PROOF','unrelated')`,[COL.PROOF]);
    await assert.rejects(()=>f.links.publish(f.id),/visual has changed/);
    await f.db.query("DELETE FROM test_dashboard_files WHERE public_id='unrelated'");
    await f.links.publish(f.id);assert.equal(f.uploads.length,2);
    await f.links.unlink(1);
    assert.equal((await f.links.job(1)).proof_id,null);
    assert.equal((await f.db.query('SELECT * FROM database_job_positions WHERE source_order_id=1')).rows.length,0);
    assert.equal((await f.designs.get(f.id)).designNumber,'30001');
  }finally{await f.db.close();}
});
test('worker acknowledgement snapshots confirmed revision and job context is fenced',async()=>{
  const f=await fixture();try{
    await f.links.link(f.id,1);
    await f.designs.saveSource(f.id,{proofSourceOrderId:1,request:'new request',customer:'Customer A',jobTitle:'First order'},[],[]);
    await f.designs.queueSave(f.id,randomUUID(),1,Buffer.from('new saved PDF'),{proofSourceOrderId:1,customer:'Customer A',jobTitle:'First order'});
    assert.equal(f.uploads.length,1);
    const task=await f.designs.claim('test-worker');
    await f.designs.report(f.id,task.claimToken,{status:'saved',revision:task.revision,hash:task.hash});
    await f.links.publish(f.id);
    assert.equal(f.uploads[1].bytes,'new saved PDF');
    assert.equal((await f.db.query('SELECT snapshot FROM proof_job_links WHERE source_order_id=1')).rows[0].snapshot.source.request,'new request');
    await assert.rejects(()=>f.designs.saveSource(f.id,{proofSourceOrderId:2,request:'wrong job'},[],[]),/linked job changed/);
  }finally{await f.db.close();}
});

test('saved proofs automatically pair only one exact customer match in OFFICE, excluding existing visuals and other groups',async()=>{
  const f=await fixture();try{
    // Two office jobs for the same customer are ambiguous, so neither is chosen.
    await f.links.sync(f.id);assert.equal((await f.designs.get(f.id)).sourceOrderId,null);
    await f.db.query("UPDATE database_jobs SET dashboard_status='HOLD' WHERE source_order_id=2");
    await f.db.query("INSERT INTO test_dashboard_job_state(source_order_id,group_id) VALUES(2,'group_mkv26kq5')");
    await f.db.query("UPDATE database_jobs SET customer_name='  CUSTOMER   A  ' WHERE source_order_id=1");
    await f.links.sync(f.id);
    assert.equal((await f.designs.get(f.id)).sourceOrderId,1);
    assert.equal(f.uploads.length,1);
    await f.links.sync(f.id);assert.equal(f.uploads.length,1);
    assert.equal((await f.links.job(1)).has_visual,true);
    assert.equal((await f.links.job(2)).has_visual,false);
  }finally{await f.db.close();}
});
test('automatic pairing ignores customers whose only matching job already has a visual',async()=>{
  const f=await fixture();try{
    await f.db.query("UPDATE proof_design_jobs SET customer='Customer B',saved_snapshot=jsonb_set(saved_snapshot,'{customer}','\"Customer B\"') WHERE id=$1",[f.id]);
    await f.links.sync(f.id);assert.equal((await f.designs.get(f.id)).sourceOrderId,null);assert.equal(f.uploads.length,0);
  }finally{await f.db.close();}
});
test('a save changed during Cloudinary upload cannot replace the job visual with stale bytes',async()=>{
  const f=await fixture();try{
    await f.links.link(f.id,1);
    const original=(await f.db.query('SELECT public_id FROM test_dashboard_files WHERE source_order_id=1')).rows[0].public_id;
    await f.db.query('UPDATE proof_design_jobs SET saved_revision=2,revision=2 WHERE id=$1',[f.id]);
    const racing=createService(f.pool,{upload:async()=>{
      await f.db.query("UPDATE proof_design_jobs SET status='save_queued',revision=3 WHERE id=$1",[f.id]);
      return {public_id:'stale-upload',secure_url:'https://example.test/stale.pdf'};
    }});
    await racing.publish(f.id);
    assert.equal((await f.db.query('SELECT public_id FROM test_dashboard_files WHERE source_order_id=1')).rows[0].public_id,original);
    assert.equal((await f.db.query('SELECT saved_revision FROM proof_job_links WHERE source_order_id=1')).rows[0].saved_revision,1);
  }finally{await f.db.close();}
});

test('approved jobs accept an initial saved proof without clearing approval but block replacement',async()=>{
  const f=await fixture();try{
    await f.db.query('UPDATE database_jobs SET proof_approved=true WHERE source_order_id=1');
    await f.links.link(f.id,1);
    assert.equal((await f.db.query('SELECT saved_revision FROM proof_job_links WHERE source_order_id=1')).rows[0].saved_revision,1);
    assert.equal((await f.db.query('SELECT proof_approved FROM database_jobs WHERE source_order_id=1')).rows[0].proof_approved,true);
    assert.equal(f.uploads.length,1);
    await assert.rejects(()=>f.links.activate(1),/approval/);
    await f.db.query('UPDATE proof_design_jobs SET saved_revision=2 WHERE id=$1',[f.id]);
    await assert.rejects(()=>f.links.publish(f.id),/Approved proofs/);
    await f.db.query('DELETE FROM test_dashboard_files WHERE source_order_id=1');
    await assert.rejects(()=>f.links.publish(f.id),/Approved proofs/);
    assert.equal(f.uploads.length,1);
  }finally{await f.db.close();}
});
test('approved jobs reject unsaved proof links without reserving an association',async()=>{
  const f=await fixture();try{
    await f.db.query('UPDATE database_jobs SET proof_approved=true WHERE source_order_id=1');
    await f.db.query("UPDATE proof_design_jobs SET status='folder_ready',saved_revision=0,saved_proof_pdf=NULL WHERE id=$1",[f.id]);
    await assert.rejects(()=>f.links.link(f.id,1),/existing saved proof/);
    assert.equal((await f.db.query('SELECT * FROM proof_job_links')).rows.length,0);
  }finally{await f.db.close();}
});
