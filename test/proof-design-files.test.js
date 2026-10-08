const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {PDFDocument}=require('pdf-lib');
const {PGlite}=require('@electric-sql/pglite');
const {allocateDesign,saveDesignProof,cleanCustomer,rangeFor}=require('../tools/print-worker/proof-files');
const {ensureProofGeneratorTables}=require('../src/db/proofGeneratorSchema');
const {createService}=require('../src/services/proofDesignJobs');
async function pdfBytes(title){const pdf=await PDFDocument.create();pdf.addPage().drawText(title);return Buffer.from(await pdf.save());}
test('allocation rolls into a new 100-number parent, sanitises names and reuses the same folder after restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-files-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29199 Last customer'),{recursive:true});
  const task={id:randomUUID(),customer:'AC / Solutions: Ltd'};
  const first=await allocateDesign(root,state,task);assert.equal(first.designNumber,'29200');assert.equal(first.folderName,'29200 AC Solutions Ltd');
  assert.equal(rangeFor(first.designNumber),'29200-29299');
  assert.deepEqual(await allocateDesign(root,state,{...task,customer:'Changed name'}),first);
  await fs.unlink(path.join(state,`proof-${task.id}.json`));
  assert.deepEqual(await allocateDesign(root,state,task),first);
  const second=await allocateDesign(root,state,{id:randomUUID(),customer:''});assert.equal(second.designNumber,'29201');assert.equal(second.folderName,'29201 Unnamed customer');
  assert.equal(/[\\/]/.test(cleanCustomer('../../bad')),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('regeneration atomically replaces only its own proof and rejects stale revisions or external edits',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-save-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29198 Previous'),{recursive:true});const id=randomUUID();const folder=await allocateDesign(root,state,{id,customer:'Test'});
  const bytes=await pdfBytes('First');const task={id,...folder,revision:1,pdf:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex')};
  const file=await saveDesignProof(root,state,task);assert.equal(path.basename(file),'29199 - PROOF.pdf');assert.deepEqual(await fs.readFile(file),bytes);
  assert.equal(await saveDesignProof(root,state,task),file);
  const next=await pdfBytes('Changed garment');const regenerated={...task,revision:2,pdf:next.toString('base64'),hash:createHash('sha256').update(next).digest('hex')};
  assert.equal(await saveDesignProof(root,state,regenerated),file);assert.deepEqual(await fs.readFile(file),next);
  await assert.rejects(()=>saveDesignProof(root,state,task),/newer proof/);
  await assert.rejects(()=>saveDesignProof(root,state,{...regenerated,id:randomUUID()}),/not owned/);
  await assert.rejects(()=>saveDesignProof(root,state,{...regenerated,folderName:'../elsewhere'}),/Invalid proof destination/);
  await fs.writeFile(file,await pdfBytes('Manual edit'));
  await assert.rejects(()=>saveDesignProof(root,state,{...task,revision:3}),/changed outside/);
  assert.equal((await fs.readdir(path.dirname(file))).filter(f=>/PROOF.pdf$/.test(f)).length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('pending allocation never consumes a second number after an uncertain folder creation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-reserve-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29199 Test'),{recursive:true});await fs.mkdir(state);
  const task={id:randomUUID(),customer:'Test'};
  await fs.writeFile(path.join(state,`proof-${task.id}.json`),JSON.stringify({designNumber:'29199',folderName:'29199 Test',pending:true}));
  await assert.rejects(()=>allocateDesign(root,state,task),/ownership/);
  assert.deepEqual(await fs.readdir(root),['29100-29199']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('durable proof jobs allocate once, fence leases, reject stale saves and reuse a number for regeneration',async()=>{
 const db=new PGlite(),pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await ensureProofGeneratorTables(db);await ensureProofGeneratorTables(db);const service=createService(pool),id=randomUUID();
  await service.reserve(id,'Customer','Title');await service.reserve(id,'Duplicate','Title');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM proof_design_jobs')).rows[0].n,1);
  const first=await service.claim('production-pc');assert.equal(first.operation,'allocate');assert.equal(await service.claim('other'),null);
  await db.query("UPDATE proof_design_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",[id]);
  const replacement=await service.claim('production-pc');assert.notEqual(first.claimToken,replacement.claimToken);
  assert.equal((await service.report(id,first.claimToken,{status:'allocated',designNumber:'29200',folderName:'29200 Customer'})).accepted,false);
  await service.report(id,replacement.claimToken,{status:'reserve',proposedNumber:'29200'});
  await service.report(id,replacement.claimToken,{status:'allocated',designNumber:'29200',folderName:'29200 Customer'});
  const bytes=await pdfBytes('First'),key=randomUUID();await service.queueSave(id,key,0,bytes,{customer:'Customer',jobTitle:'Job title'},[{originalname:'logo.svg',buffer:Buffer.from('<svg/>')}]);await service.queueSave(id,key,0,bytes,{});
  const save=await service.claim('production-pc');assert.equal(save.operation,'save');assert.equal(save.jobTitle,'Job title');assert.equal(save.artworks[0].name,'logo.svg');assert.equal(Buffer.from(save.artworks[0].data,'base64').toString(),'<svg/>');assert.deepEqual(Buffer.from(save.pdf,'base64'),bytes);
  await service.report(id,save.claimToken,{status:'saved',hash:save.hash,revision:save.revision});
  const job=await service.get(id);assert.equal(job.status,'saved');assert.equal(job.revision,1);assert.equal(job.designNumber,'29200');
  const stored=(await db.query('SELECT pdf,artworks FROM proof_design_jobs WHERE id=$1',[id])).rows[0];assert.equal(stored.pdf,null);assert.deepEqual(stored.artworks,[]);
  await assert.rejects(()=>service.queueSave(id,randomUUID(),0,bytes,{}),/has changed/);
  await service.queueSave(id,randomUUID(),1,bytes,{customer:'Changed'});assert.equal((await service.get(id)).designNumber,'29200');assert.equal((await service.get(id)).revision,2);
  const renamedSave=await service.claim('production-pc');
  await assert.rejects(()=>service.report(id,renamedSave.claimToken,{status:'saved',hash:renamedSave.hash,revision:renamedSave.revision,folderName:'29200 Wrong'}),/Invalid saved design folder/);
  await service.report(id,renamedSave.claimToken,{status:'saved',hash:renamedSave.hash,revision:renamedSave.revision,folderName:'29200 Changed'});
  assert.equal((await service.get(id)).folderName,'29200 Changed');
 }finally{await db.close();}
});

test('new filenames migrate legacy tracking out of the design folder and rename safely on regeneration',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-rename-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29198 Previous'),{recursive:true});const id=randomUUID();const destination=await allocateDesign(root,state,{id,customer:'AC Solutions'});
  const folder=path.join(root,rangeFor(destination.designNumber),destination.folderName);
  assert.deepEqual(await fs.readdir(folder),[]);
  const oldBytes=await pdfBytes('Old proof'),oldHash=createHash('sha256').update(oldBytes).digest('hex');
  await fs.writeFile(path.join(folder,'29199 PROOF.pdf'),oldBytes);
  await fs.unlink(path.join(state,`proof-${id}-state.json`));
  await fs.writeFile(path.join(folder,'.ultimate-proof.json'),JSON.stringify({id,designNumber:'29199',revision:1,hash:oldHash}));
  const bytes=await pdfBytes('New proof'),task={id,...destination,customer:'AC Solutions',jobTitle:'Staff clothing',revision:2,pdf:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex')};
  const file=await saveDesignProof(root,state,task);
  assert.equal(path.basename(file),'29199 - AC Solutions - Staff clothing - PROOF.pdf');
  assert.deepEqual(await fs.readdir(folder),[path.basename(file)]);
  const renamed=await saveDesignProof(root,state,{...task,revision:3,jobTitle:'Summer clothing'});
  assert.deepEqual(await fs.readdir(folder),[path.basename(renamed)]);
  assert.equal(await saveDesignProof(root,state,{...task,revision:3,jobTitle:'Summer clothing'}),renamed);
  await fs.writeFile(path.join(folder,'29199 - AC Solutions - Conflict - PROOF.pdf'),oldBytes);
  await assert.rejects(()=>saveDesignProof(root,state,{...task,revision:4,jobTitle:'Conflict'}),/already exists/);
  assert.deepEqual(await fs.readFile(renamed),bytes);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('proof names and display labels omit unsafe filename characters and supplier footnote keys',()=>{
 const {proofFileName}=require('../tools/print-worker/proof-filename');
 const {colourName,printMethod}=require('../public/proof-display');
 assert.equal(proofFileName({reference:'29200',customer:'AC / Solutions',jobTitle:'Staff: clothing'}),'29200 - AC Solutions - Staff clothing - PROOF.pdf');
 assert.equal(proofFileName({reference:'29200'}),'29200 - PROOF.pdf');
 for(const colour of ['Navy*','Navy ** †','Navy#','Navy²','Navy°','Navy♦'])assert.equal(colourName(colour),'Navy');
 assert.equal(colourName('Black/White (Heather)*'),'Black/White (Heather)');
 assert.equal(printMethod('print'),'Transfer print');assert.equal(printMethod('embroidery'),'Embroidery');assert.equal(printMethod('screen print'),'screen print');
});

test('pre-print preserves exact Unicode filenames and bytes and refuses changed same-name artwork',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-originals-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29198 Previous'),{recursive:true});const id=randomUUID(),destination=await allocateDesign(root,state,{id,customer:'Test'});
  const bytes=await pdfBytes('Proof'),original=Buffer.from('<svg>original artwork</svg>');
  const artwork=buffer=>({name:'Fullers Centenary Crest 1926–2026.svg',data:buffer.toString('base64'),hash:createHash('sha256').update(buffer).digest('hex')});
  const task={id,...destination,customer:'Test',revision:1,pdf:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex'),artworks:[artwork(original)]};
  const file=await saveDesignProof(root,state,task),archive=path.join(path.dirname(file),'pre-print');
  await saveDesignProof(root,state,task);assert.deepEqual(await fs.readdir(archive),['Fullers Centenary Crest 1926–2026.svg']);assert.deepEqual(await fs.readFile(path.join(archive,'Fullers Centenary Crest 1926–2026.svg')),original);
  const revised=Buffer.from('<svg>revised artwork</svg>');
  await assert.rejects(()=>saveDesignProof(root,state,{...task,revision:2,artworks:[artwork(revised)]}),/Different artwork already exists/);
  assert.equal((await fs.readdir(archive)).length,1);assert.deepEqual(await fs.readFile(path.join(archive,'Fullers Centenary Crest 1926–2026.svg')),original);
  assert.equal((await fs.readdir(path.dirname(file))).some(name=>name.endsWith('.json')),false);
  await assert.rejects(()=>saveDesignProof(root,state,{...task,revision:3,artworks:[{...artwork(revised),hash:'bad'}]}),/integrity/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('new proofs use the next database or filesystem number even after deletion and with the same customer',async()=>{
 const db=new PGlite(),pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-numbering-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await ensureProofGeneratorTables(db);const service=createService(pool);
  await fs.mkdir(path.join(root,'29100-29199','29116 Previous'),{recursive:true});
  const create=async()=>{const id=randomUUID();await service.reserve(id,'Same Customer','');return service.claim('production-pc');};
  const allocate=async task=>allocateDesign(root,state,task,()=>{},async proposedNumber=>{
   const result=await service.report(task.id,task.claimToken,{status:'reserve',proposedNumber});assert.equal(result.accepted,true);return result.designNumber;
  });
  const first=await create(),a=await allocate(first);assert.equal(a.designNumber,'29117');
  await service.report(first.id,first.claimToken,{status:'allocated',...a});
  await fs.rm(path.join(root,'29100-29199',a.folderName),{recursive:true});
  const next=await create();
  // Reproduce the old worker's failed local reservation of the deleted number.
  const legacy=await allocateDesign(root,state,next);assert.equal(legacy.designNumber,'29117');
  const b=await allocate(next);assert.equal((await service.report(next.id,next.claimToken,{status:'allocated',...legacy})).accepted,false);assert.equal(b.designNumber,'29118');assert.equal(b.folderName,'29118 Same Customer');
  assert.equal((await service.get(next.id)).folderName,null);
  assert.deepEqual(await allocate(next),b);
  await db.query("UPDATE proof_design_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",[next.id]);
  const retry=await service.claim('production-pc');assert.equal(retry.operation,'allocate');assert.equal(retry.designNumber,'29118');
  assert.equal((await service.report(next.id,next.claimToken,{status:'reserve',proposedNumber:'29199'})).accepted,false);
  assert.deepEqual(await allocate(retry),b);
  await service.report(next.id,retry.claimToken,{status:'allocated',...b});
  assert.deepEqual((await fs.readdir(path.join(root,'29100-29199'))).sort(),['29116 Previous','29118 Same Customer']);
  await fs.mkdir(path.join(root,'29100-29199','29199 Manual design'));
  const third=await create(),c=await allocate(third);assert.equal(c.designNumber,'29200');
  await service.report(third.id,third.claimToken,{status:'allocated',...c});
  assert.equal((await service.get(first.id)).designNumber,'29117');
  assert.equal((await db.query('SELECT COUNT(DISTINCT design_number)::int n FROM proof_design_jobs')).rows[0].n,3);
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('reassigning a failed allocation preserves folders containing files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-safe-reassign-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29116 Previous'),{recursive:true});
  const task={id:randomUUID(),customer:'Same Customer'},first=await allocateDesign(root,state,task);
  const folder=path.join(root,'29100-29199',first.folderName);await fs.writeFile(path.join(folder,'customer-artwork.svg'),'keep this artwork');
  await assert.rejects(()=>allocateDesign(root,state,task,()=>{},async()=> '29118'),/contains files/);
  assert.equal(await fs.readFile(path.join(folder,'customer-artwork.svg'),'utf8'),'keep this artwork');
  assert.equal((await fs.readdir(path.join(root,'29100-29199'))).includes('29118 Same Customer'),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('original artwork names retain Unicode and reject Windows-invalid names rather than silently renaming',()=>{
 const {originalArtworkName}=require('../tools/print-worker/proof-filename');
 for(const name of ['Fullers Centenary Crest 1926–2026.png','Café logo 你好.svg','two  spaces.PDF'])assert.equal(originalArtworkName(name),name);
 for(const name of ['../logo.svg','bad:name.png','name?.png','CON.png','LPT1.svg','trailing.png ','bad\u0080.png','x'.repeat(256)+'.png'])assert.throws(()=>originalArtworkName(name),/not valid on Windows/);
});

test('proof history is newest-first, paginated, private of upload data and retains thumbnails after saving',async()=>{
 const db=new PGlite(),pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await ensureProofGeneratorTables(db);await ensureProofGeneratorTables(db);const service=createService(pool),id=randomUUID();
  await service.reserve(id,'Customer','Title',true);
  assert.equal(await service.claim('worker'),null,'Pending generation does not allocate an unnamed folder before parsing');
  await service.progress(id,{state:'generating',message:'Reading brief',reference:'CUSTOM-REF'});
  const pending=(await service.list()).designs[0];assert.equal(pending.generationStatus,'generating');assert.equal(pending.reference,'CUSTOM-REF');
  await db.query("UPDATE proof_design_jobs SET generation_updated_at=NOW()-INTERVAL '3 minutes' WHERE id=$1",[id]);
  assert.equal((await service.get(id)).generationStatus,'interrupted');
  await service.reserve(id,'Parsed customer','Parsed title');
  const claim=await service.claim('worker');assert.equal(claim.customer,'Parsed customer');
  await service.report(id,claim.claimToken,{status:'reserve',proposedNumber:'29200'});
  await service.report(id,claim.claimToken,{status:'allocated',designNumber:'29200',folderName:'29200 Parsed customer'});
  const bytes=await pdfBytes('History proof');
  const savedBrief={customer:'Parsed customer',jobTitle:'Parsed title',products:[{code:'TEST',decorations:[{id:'logo',artworkId:'art',widthMm:125,placement:{x:.6,y:.2}}]}]};
  await service.saveSource(id,{request:'TEST navy, logo 125mm',instructions:'Keep position',customer:'Parsed customer',jobTitle:'Parsed title'},[{buffer:Buffer.from('<svg>original</svg>'),mimetype:'image/svg+xml',originalname:'logo.svg'}],[{id:'art',originalName:'logo.svg'}]);
  await service.setPreview(id,bytes,savedBrief,true);
  await service.queueSave(id,randomUUID(),0,bytes,savedBrief);
  const save=await service.claim('worker');await service.report(id,save.claimToken,{status:'saved',hash:save.hash,revision:save.revision});
  assert.deepEqual(Buffer.from(await service.document(id)),bytes);
  const restored=await service.source(id);assert.equal(restored.source.request,'TEST navy, logo 125mm');assert.equal(restored.source.instructions,'Keep position');assert.deepEqual(restored.source.brief,savedBrief);assert.equal(Buffer.from(restored.artworks[0].data,'base64').toString(),'<svg>original</svg>');
  assert.equal((await service.get(id)).hasSource,true);
  assert.equal((await service.get(id)).hasPreview,true);assert.equal((await service.get(id)).generationStatus,'complete');
  assert.equal(Buffer.from(await service.preview(id)).subarray(1,4).toString(),'PNG');
  assert.equal((await db.query('SELECT pdf FROM proof_design_jobs WHERE id=$1',[id])).rows[0].pdf,null);
  await db.query("UPDATE proof_design_jobs SET created_at='2020-01-01' WHERE id=$1",[id]);
  for(let i=0;i<51;i++)await service.reserve(randomUUID(),`Customer ${i}`,'Title',true);
  const first=await service.list();assert.equal(first.designs.length,50);assert.equal(first.nextOffset,50);
  const last=await service.list(50);assert.equal(last.designs.length,2);assert.equal(last.designs[1].id,id);assert.equal(last.nextOffset,null);
  assert.equal(JSON.stringify(first).includes('artworks'),false);assert.equal(JSON.stringify(first).includes('pdf_hash'),false);
 }finally{await db.close();}
});

test('retained garment images survive a new service instance without supplier access',async()=>{
 const db=new PGlite(),pool={query:(...args)=>db.query(...args)};
 try{
  await ensureProofGeneratorTables(db);const service=createService(pool),id=randomUUID();await service.reserve(id);
  const url='https://www.pencarrie.com/storage/saved.png',bytes=Buffer.from('saved garment');
  const first=await service.garmentLoader(id);
  assert.deepEqual(await first(url,'PenCarrie',async()=>({ok:true,arrayBuffer:async()=>bytes})),bytes);
  const reopened=await createService(pool).garmentLoader(id);
  assert.deepEqual(await reopened(url,'PenCarrie',async()=>{throw new Error('Supplier unavailable');}),bytes);
 }finally{await db.close();}
});

test('archived test proofs are hidden and unclaimable while their design numbers stay reserved',async()=>{
 const db=new PGlite(),pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await ensureProofGeneratorTables(db);const service=createService(pool),id=randomUUID();await service.reserve(id,'Test');
  await db.query("UPDATE proof_design_jobs SET status='archived',design_number=29132 WHERE id=$1",[id]);
  assert.deepEqual((await service.list()).designs,[]);await assert.rejects(()=>service.get(id),/not found/);
  await assert.rejects(()=>service.source(id),/not found/);assert.equal(await service.claim('worker'),null);
  const next=randomUUID();await service.reserve(next,'Real job');const claim=await service.claim('worker');
  const allocated=await service.report(next,claim.claimToken,{status:'reserve',proposedNumber:'29100'});
  assert.equal(allocated.designNumber,'29133');assert.equal((await service.list()).designs.length,1);
 }finally{await db.close();}
});

test('customer regeneration renames the owned folder and PDF, retains contents and replays safely',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-customer-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29198 Previous'),{recursive:true});
  const id=randomUUID(),destination=await allocateDesign(root,state,{id,customer:'Old customer'}),bytes=await pdfBytes('Proof');
  const task={id,...destination,customer:'Old customer',jobTitle:'Old title',revision:1,pdf:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex')};
  const original=await saveDesignProof(root,state,task);await fs.writeFile(path.join(path.dirname(original),'keep.txt'),'retain');
  const changed={...task,revision:2,customer:'New customer',jobTitle:'New title'};
  const renamed=await saveDesignProof(root,state,changed);
  assert.equal(path.basename(path.dirname(renamed)),'29199 New customer');
  assert.equal(path.basename(renamed),'29199 - New customer - New title - PROOF.pdf');
  assert.equal(await fs.readFile(path.join(path.dirname(renamed),'keep.txt'),'utf8'),'retain');
  await assert.rejects(()=>fs.stat(path.dirname(original)),{code:'ENOENT'});
  assert.equal(await saveDesignProof(root,state,changed),renamed);
  assert.deepEqual(await allocateDesign(root,state,{id,customer:'New customer'}),{designNumber:'29199',folderName:'29199 New customer'});
  const titleOnly=await saveDesignProof(root,state,{...changed,folderName:'29199 New customer',revision:3,jobTitle:'Third title'});
  assert.equal(path.dirname(titleOnly),path.dirname(renamed));assert.equal(path.basename(titleOnly),'29199 - New customer - Third title - PROOF.pdf');
  await fs.mkdir(path.join(path.dirname(path.dirname(titleOnly)),'29199 Conflict'));
  await assert.rejects(()=>saveDesignProof(root,state,{...changed,folderName:'29199 New customer',revision:4,customer:'Conflict'}),/already exists/);
  assert.deepEqual(await fs.readFile(titleOnly),bytes);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('customer folder rename recovers a crash between filesystem rename and journal acknowledgement',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-customer-recovery-')),root=path.join(dir,'designs'),state=path.join(dir,'state');
 try{
  await fs.mkdir(path.join(root,'29100-29199','29198 Previous'),{recursive:true});
  const id=randomUUID(),destination=await allocateDesign(root,state,{id,customer:'Before'}),bytes=await pdfBytes('Proof');
  const task={id,...destination,customer:'Before',jobTitle:'Job',revision:1,pdf:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex')};
  const file=await saveDesignProof(root,state,task),markerPath=path.join(state,`proof-${id}-state.json`);
  const marker=JSON.parse(await fs.readFile(markerPath,'utf8'));marker.pendingFolderName='29199 After';await fs.writeFile(markerPath,JSON.stringify(marker));
  await fs.rename(path.dirname(file),path.join(path.dirname(path.dirname(file)),marker.pendingFolderName));
  const saved=await saveDesignProof(root,state,{...task,customer:'After',revision:2});
  assert.equal(path.basename(path.dirname(saved)),'29199 After');assert.deepEqual(await fs.readFile(saved),bytes);
  assert.equal(JSON.parse(await fs.readFile(markerPath,'utf8')).pendingFolderName,undefined);
  assert.equal(JSON.parse(await fs.readFile(path.join(state,`proof-${id}.json`),'utf8')).folderName,'29199 After');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
