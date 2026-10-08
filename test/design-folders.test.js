const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../src/services/designFolders');
const {findDesignFolder,findProof}=require('../tools/print-worker/local-files');
const {openFolder}=require('../tools/print-worker/design-folder-worker');
test('queue requires live unambiguous worker, fences claims and expires requests without re-opening',async()=>{
 const db=new PGlite();const pool={query:(sql,args)=>args?db.query(sql,args):db.exec(sql).then(results=>results.at(-1))};
 try{
  await service.ensureTables(pool);
  await assert.rejects(()=>service.request(pool,'12345'),/offline/);
  assert.equal(await service.claim(pool,'ARTWORK-PC'),null);
  const request=await service.request(pool,'12345');
  assert.equal(await service.claim(pool,'OTHER-PC'),null);
  await assert.rejects(()=>service.request(pool,'12345'),/More than one/);
  const task=await service.claim(pool,'ARTWORK-PC');assert.equal(task.id,request.id);assert.equal(task.designNumber,'12345');
  assert.equal(await service.claim(pool,'ARTWORK-PC'),null);
  assert.equal(await service.report(pool,task.id,require('node:crypto').randomUUID(),'opened',''),false);
  assert.equal(await service.report(pool,task.id,task.claimToken,'opened','Done'),true);
  assert.equal((await service.status(pool,task.id)).status,'opened');
  await db.query("DELETE FROM design_folder_workers WHERE id='OTHER-PC'");
  const expired=await service.request(pool,'12345');
  await db.query("UPDATE design_folder_requests SET created_at=NOW()-INTERVAL '61 seconds' WHERE id=$1",[expired.id]);
  assert.equal(await service.claim(pool,'ARTWORK-PC'),null);assert.equal((await service.status(pool,expired.id)).status,'expired');
 }finally{await db.close();}
});
test('folder opening supports older designs without a PDF, rejects ambiguity, links and shell inputs',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'design-open-')));
 try{
  const folder=path.join(root,'12000-12999','12345 Customer & title');await fs.mkdir(folder,{recursive:true});
  assert.equal(await findDesignFolder(root,'12345'),folder);
  await assert.rejects(()=>findProof(root,'12345'),/Ineligible/);
  for(const ref of ['PSG12345','../12345','12345&calc','12345/'])await assert.rejects(()=>findDesignFolder(root,ref),/Invalid/);
  await assert.rejects(()=>findDesignFolder(root,'12346'),/found 0/);
  let args;
  const launch=(...values)=>{args=values;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  await openFolder(root,{designNumber:'12345',expiresAt:new Date(Date.now()+10000).toISOString()},{launch,platform:'win32'});
  assert.deepEqual(args[1],[folder]);assert.equal(args[2].shell,false);assert.match(args[0],/explorer\.exe$/);
  await assert.rejects(()=>openFolder(root,{designNumber:'12345',expiresAt:'2000-01-01'},{launch,platform:'win32'}),/expired/);
  await fs.mkdir(path.join(root,'12345 Duplicate'));await assert.rejects(()=>findDesignFolder(root,'12345'),/found 2/);
  await fs.symlink(folder,path.join(root,'12346 Link'),'dir');await assert.rejects(()=>findDesignFolder(root,'12346'),/found 0/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('routes require Hub access for opening and worker credentials for claims',async()=>{
 const express=require('express');const app=express();app.use(express.json());
 app.use((req,res,next)=>{if(req.headers['x-test-user'])req.hubUser={access_scope:req.headers['x-test-user']};next();});
 app.use(require('../src/routes/design-folders').createRouter({query:()=>{throw new Error('Unexpected database call');}}));
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(url+'/api/design-folders/open',{method:'POST'})).status,401);
  assert.equal((await fetch(url+'/api/design-folders/open',{method:'POST',headers:{'x-test-user':'dtf_only'}})).status,403);
  assert.equal((await fetch(url+'/api/design-folder-worker/claim',{method:'POST'})).status,401);
  assert.equal((await fetch(url+'/api/design-folders/open',{method:'POST',headers:{'x-test-user':'full','Content-Type':'application/json'},body:JSON.stringify({designNumber:'PSG12345'})})).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
