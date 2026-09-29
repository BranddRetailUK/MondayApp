const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {ensurePrintExportTables}=require('../src/db/printExportSchema');
const service=require('../src/services/printExports');
const {TEST_DASHBOARD_COLUMN_IDS:ids}=require('../src/services/testDashboardDefaults');
const {findProof,parseResult}=require('../tools/print-worker/local-files');
const {workerAuth}=require('../src/routes/print-exports');

test('eligible refs exclude PSG, stitch counts and old designs; boundary inclusive',()=>{
  assert.deepEqual(service.numericDesigns('28299, 28300 / PSG29109 / 29109, 29109; ST45000'),['28300','29109']);
  assert.deepEqual(service.numericDesigns('PSG 29108, P.S.G.29109, PSG NO. 30000, PSG30001A'),[]);
  assert.deepEqual(service.eligibleDesigns({order_type:'Embroidery'},[{design_ref:'29108'}]),[]);
  assert.deepEqual(service.eligibleDesigns({order_type_abbr:'PE'},[{design_ref:'28516 / PSG6893'}]),['28516']);
  assert.deepEqual(service.eligibleDesigns({order_type:'Print'},[],{column_values:{[ids.DESIGN]:{text:'29109'}}}),['29109']);
});

test('worker authentication never accepts an absent or incorrect token',()=>{
  const original=process.env.PRINT_EXPORT_WORKER_TOKEN;
  let accepted=false;const res={status(c){this.code=c;return this;},json(x){return x;}};
  try{
    delete process.env.PRINT_EXPORT_WORKER_TOKEN;workerAuth({headers:{}},res,()=>accepted=true);assert.equal(res.code,401);
    process.env.PRINT_EXPORT_WORKER_TOKEN='x'.repeat(40);
    workerAuth({headers:{authorization:'Bearer '+'y'.repeat(40)}},res,()=>accepted=true);assert.equal(accepted,false);
    workerAuth({headers:{authorization:'Bearer '+'x'.repeat(40)}},res,()=>accepted=true);assert.equal(accepted,true);
  }finally{if(original===undefined)delete process.env.PRINT_EXPORT_WORKER_TOKEN;else process.env.PRINT_EXPORT_WORKER_TOKEN=original;}
});

test('folder/proof lookup is exact, case-insensitive at suffix, and rejects ambiguity',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'print-export-test-'));
  try{
    const dir=path.join(root,'29100-29199','29109 Ace');await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'27844 OLD CLIENT PROOF.PDF'),'proof');
    await fs.mkdir(path.join(root,'129109 wrong'));
    const result=await findProof(root,'29109');assert.equal(result.designFolder,dir);
    await fs.writeFile(path.join(dir,'other proof.ai'),'proof');await assert.rejects(findProof(root,'29109'),/found 2/);
    await assert.rejects(findProof(root,'28299'),/Ineligible/);
    await fs.unlink(path.join(dir,'other proof.ai'));
    await fs.mkdir(path.join(root,'29109 duplicate'));await assert.rejects(findProof(root,'29109'),/folder.*found 2/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Illustrator result preserves XML-escaped filenames and rejects incomplete results',()=>{
  assert.deepEqual(parseResult('<result><status>exported</status><message>Done &amp; checked</message><output>E:\\A&amp;B\\PRINT\\x.png</output></result>'),{status:'exported',message:'Done & checked',outputs:['E:\\A&B\\PRINT\\x.png']});
  assert.throws(()=>parseResult('<result/>'),/Invalid/);
});

test('durable SQL queue: transitions, rollback, duplicate approval, cancellation, lease and retry',async()=>{
  const db=new PGlite();const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  try{
    await db.exec(`CREATE TABLE database_jobs(source_order_id integer PRIMARY KEY, order_no integer, order_type text,order_type_abbr text,
      proof_approved boolean,proof_approved_at timestamp,dashboard_status text,dashboard_priority text,dashboard_type text,
      dashboard_status_updated_at timestamp,updated_at_source timestamp,imported_at timestamp,is_complete boolean,complete_date timestamp);
      CREATE TABLE database_job_positions(source_order_id integer,design_ref text);
      CREATE TABLE test_dashboard_job_state(source_order_id integer PRIMARY KEY,column_values jsonb);`);
    await ensurePrintExportTables(db);await ensurePrintExportTables(db);
    assert.equal(await service.enabled(db),false);
    await service.setEnabled(db,true,{email:'production@ultimatepromotions.co.uk'});
    await ensurePrintExportTables(db);assert.equal(await service.enabled(db),true);
    await db.query("INSERT INTO database_jobs(source_order_id,order_type,proof_approved) VALUES(1,'Print',false),(2,'Print',true),(3,'Embroidery',false)");
    await db.query("INSERT INTO database_job_positions VALUES(1,'28299 / 28300 / 29109 / PSG30000'),(2,'29110'),(3,'29111')");
    // Installing never backfills existing approvals.
    assert.equal((await db.query('SELECT * FROM print_export_jobs')).rows.length,0);
    const state={column_values:{[ids.JOB]:{text:'✓'}}};
    async function approve(id=1,checked=true,fail=false){return service.saveApproval(pool,{sourceOrderId:id,labels:{jobApproved:checked,status:checked?'NO STOCK':'AWAITING APPROVAL'},nextState:state,saveState:async client=>{
      if(fail)throw Error('simulated state failure');
      return (await client.query('INSERT INTO test_dashboard_job_state VALUES($1,$2) ON CONFLICT(source_order_id) DO UPDATE SET column_values=$2 RETURNING *',[id,state.column_values])).rows[0];
    }});}
    await assert.rejects(approve(1,true,true),/simulated/);
    assert.equal((await db.query('SELECT proof_approved FROM database_jobs WHERE source_order_id=1')).rows[0].proof_approved,false);
    await approve();await approve();await approve(3);
    let rows=(await db.query('SELECT * FROM print_export_jobs ORDER BY design_number')).rows;
    assert.deepEqual(rows.map(r=>r.design_number),['28300','29109']);
    await service.setEnabled(db,false,{email:'production@ultimatepromotions.co.uk'});
    assert.equal(await service.claim(pool,'worker'),null);
    await service.setEnabled(db,true,{email:'production@ultimatepromotions.co.uk'});
    const first=await service.claim(pool,'worker');assert.ok(first.claim_token);
    assert.equal(await service.claim(pool,'second-worker'),null);
    assert.equal((await service.updateClaim(pool,first.id,'00000000-0000-0000-0000-000000000000',{status:'exported'})).accepted,false);
    assert.equal((await service.updateClaim(pool,first.id,first.claim_token,{status:'awaiting_review'})).accepted,true);
    assert.equal((await service.updateClaim(pool,first.id,first.claim_token,{status:'exported',outputs:['E:\\PRINT\\logo.png']})).accepted,true);
    assert.equal((await service.updateClaim(pool,first.id,first.claim_token,{status:'exported'})).accepted,true);
    const second=await service.claim(pool,'worker');
    await db.query("UPDATE print_export_jobs SET lease_until=NOW()-INTERVAL '1 minute' WHERE id=$1",[second.id]);
    assert.equal(await service.claim(pool,'worker'),null);
    assert.equal((await db.query('SELECT status FROM print_export_jobs WHERE id=$1',[second.id])).rows[0].status,'needs_attention');
    assert.equal((await service.updateClaim(pool,second.id,second.claim_token,{status:'exported'})).accepted,false);
    assert.equal(await service.retry(pool,second.id),true);
    const again=await service.claim(pool,'worker');assert.notEqual(again.claim_token,second.claim_token);
    await approve(1,false);
    assert.equal((await service.updateClaim(pool,again.id,again.claim_token,{status:'exported'})).stop,true);
    await service.setEnabled(db,false,{email:'production@ultimatepromotions.co.uk'});
    await approve();assert.equal((await db.query("SELECT * FROM print_export_jobs WHERE status='queued'")).rows.length,0);
    await service.setEnabled(db,true,{email:'production@ultimatepromotions.co.uk'});
    assert.equal(await service.claim(pool,'worker'),null); // enabling never backfills approvals made while off
    await approve(1,false);
    await approve();rows=(await db.query("SELECT * FROM print_export_jobs WHERE status='queued'")).rows;assert.equal(rows.length,2);
    // Editing a design after approval invalidates queued work before it runs.
    await db.query("UPDATE database_job_positions SET design_ref='27844' WHERE source_order_id=1");
    assert.equal(await service.claim(pool,'worker'),null);
    assert.equal((await db.query("SELECT * FROM print_export_jobs WHERE status='queued'")).rows.length,0);
  }finally{await db.close();}
});


test('automation uses Hub design even when proof reference and filename are old',async()=>{
  const vm=require('node:vm');
  const sourceText=await fs.readFile(path.join(__dirname,'../tools/print-worker/exporter/Proof-Artwork-Exporter.jsx'),'utf8');
  const configFunction=sourceText.slice(sourceText.indexOf('    function hubConfig('),sourceText.indexOf('    var originalInteraction='));
  const context={hubJob:{reference:'29109',designFolder:'E:/DESIGN FILES/29109 Ace'},
    Folder:function(p){return {exists:true,name:'29109 Ace',fsName:p};},
    source:{fullName:{parent:{fsName:'E:/DESIGN FILES/29109 Ace'}},artboards:{length:1}},
    ProofCore:{folderMatches:(name,ref)=>name.startsWith(ref+' ')}};
  vm.createContext(context);vm.runInContext(configFunction,context);
  const result=context.hubConfig({value:'27696',conflict:true,fromFilename:false});
  assert.equal(result.ref,'29109');assert.equal(result.root.fsName,'E:/DESIGN FILES/29109 Ace');
});


test('only the exact production account can operate the persisted switch API', async()=>{
  const express=require('express');const {createRouter}=require('../src/routes/print-exports');
  let setting=false,writes=0;
  const pool={async query(sql,params){
    if(sql.startsWith('UPDATE print_export_settings')){setting=params[0];writes++;return {rows:[]};}
    if(sql.startsWith('SELECT enabled'))return {rows:[{enabled:setting}]};
    throw Error('Unexpected query');
  }};
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{if(req.headers['test-email'])req.hubUser={email:req.headers['test-email'],access_scope:req.headers['test-scope']||'full'};next();});
  app.use(createRouter(pool));
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const url=`http://127.0.0.1:${server.address().port}/api/print-exports/settings`;
  const request=(email,method='GET',enabled=true,scope='full')=>fetch(url,{method,headers:{...(email?{'test-email':email,'test-scope':scope}:{}),'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify({enabled})}:{})});
  try{
    assert.equal((await request(null)).status,401);
    assert.equal((await request('other@ultimatepromotions.co.uk','PUT')).status,403);
    assert.equal((await request('production@ultimatepromotions.co.uk.evil','PUT')).status,403);
    assert.equal((await request('production@ultimatepromotions.co.uk','PUT',true,'dtf_only')).status,403);
    assert.equal((await (await request('other@ultimatepromotions.co.uk')).json()).canToggle,false);
    assert.equal(writes,0);
    assert.equal((await request('production@ultimatepromotions.co.uk','PUT','true')).status,400);
    const on=await (await request('Production@UltimatePromotions.co.uk','PUT',true)).json();assert.deepEqual(on,{enabled:true,canToggle:true});
    assert.equal((await (await request('production@ultimatepromotions.co.uk')).json()).enabled,true);
    assert.equal((await (await request('production@ultimatepromotions.co.uk','PUT',false)).json()).enabled,false);
    assert.equal(writes,2);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
