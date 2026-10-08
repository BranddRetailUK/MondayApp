const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {folderMatches}=require('./local-files');
const {proofFileName,originalArtworkName}=require('./proof-filename');
const {acquireWorkerLock}=require('./worker-lock');
const UUID=/^[a-f0-9-]{36}$/i;
const markerName='.ultimate-proof.json';
const cleanCustomer=value=>String(value||'').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim().slice(0,100)||'Unnamed customer';
const rangeFor=number=>`${Math.floor(Number(number)/100)*100}-${Math.floor(Number(number)/100)*100+99}`;
async function directory(p){const stat=await fs.lstat(p);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Design folders must be real directories, not links.');return p;}
async function atomicJson(p,data){const temp=p+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2),{flag:'wx'});try{await fs.rename(temp,p);}finally{await fs.unlink(temp).catch(()=>{});}}
async function safeRead(p){try{const stat=await fs.lstat(p);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Unsafe proof metadata file.');return JSON.parse(await fs.readFile(p,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const stateMarker=(stateDir,id)=>path.join(stateDir,`proof-${id}-state.json`);
async function loadMarker(folder,stateDir,task){
  const local=stateMarker(stateDir,task.id),legacyPath=path.join(folder,markerName);
  let marker=await safeRead(local);const legacy=await safeRead(legacyPath);
  if(legacy){
    if(legacy.id!==task.id||String(legacy.designNumber)!==String(task.designNumber))throw new Error('This folder is not owned by the requested proof.');
    if(marker&&(marker.id!==legacy.id||marker.revision!==legacy.revision||marker.hash!==legacy.hash))throw new Error('Conflicting local proof tracking records.');
    if(!marker){marker={...legacy,folderName:task.folderName};await atomicJson(local,marker);}
    await fs.unlink(legacyPath);
  }
  if(marker&&(marker.id!==task.id||String(marker.designNumber)!==String(task.designNumber)||marker.folderName!==task.folderName))throw new Error('This folder is not owned by the requested proof.');
  return marker;
}
async function scan(root,id,onProgress){
  let highest=0,existing=null,checked=0;
  async function visit(folder,depth){
    if(depth>2)return;
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      if(!entry.isDirectory()||entry.isSymbolicLink())continue;
      const range=entry.name.match(/^(\d{5,10})-(\d{5,10})$/);
      if(range){await visit(path.join(folder,entry.name),depth+1);continue;}
      const number=entry.name.match(/^(\d{5,10})(?:\s|$)/)?.[1];
      if(!number||!folderMatches(entry.name,number))continue;
      if(++checked>30000)throw new Error('Design scan exceeded 30,000 folders.');
      highest=Math.max(highest,Number(number));
      const dir=path.join(folder,entry.name),marker=await safeRead(path.join(dir,markerName));
      if(marker?.id===id){if(existing)throw new Error('This proof is linked to multiple design folders.');existing={designNumber:number,folderName:entry.name,folder:dir};}
      if(checked%100===0)onProgress(`Checking design folders (${checked})`);
    }
  }
  await visit(root,0);return {highest,existing};
}
async function allocateDesign(root,stateDir,task,onProgress=()=>{},reserveNumber){
  if(!UUID.test(task.id))throw new Error('Invalid proof job.');
  root=await directory(await fs.realpath(root));await fs.mkdir(stateDir,{recursive:true});
  const release=await acquireWorkerLock(path.join(stateDir,'proof-files.lock'));
  try{
    // The private local journal survives restart between folder creation and Hub acknowledgement.
    const journal=path.join(stateDir,`proof-${task.id}.json`),saved=await safeRead(journal);
    async function finishReservation(saved){
      if(!/^\d{5,10}$/.test(saved.designNumber||'')||!saved.folderName?.startsWith(saved.designNumber+' ')||/[\\/\x00-\x1f]/.test(saved.folderName))throw new Error('Invalid local proof journal.');
      const parent=path.join(root,rangeFor(saved.designNumber));await fs.mkdir(parent,{recursive:true});await directory(parent);
      const folder=path.join(parent,saved.folderName);
      if(saved.previous){
        const previous=saved.previous;
        if(!/^\d{5,10}$/.test(previous.designNumber||'')||!previous.folderName?.startsWith(previous.designNumber+' ')||/[\\/\x00-\x1f]/.test(previous.folderName))throw new Error('Invalid previous proof reservation.');
        const oldParent=await directory(path.join(root,rangeFor(previous.designNumber))),oldFolder=path.join(oldParent,previous.folderName);
        const marker=await safeRead(stateMarker(stateDir,task.id));
        if(marker?.id!==task.id||marker.revision!==0||marker.hash||![previous.folderName,saved.folderName].includes(marker.folderName))throw new Error('Only an empty, unsaved proof reservation can be reassigned.');
        const exists=async dir=>{try{await directory(dir);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
        const oldExists=await exists(oldFolder),newExists=await exists(folder);
        if(oldExists&&(await fs.readdir(oldFolder)).length)throw new Error('The previous reservation contains files. It has not been moved.');
        if(newExists&&(oldExists||(await fs.readdir(folder)).length))throw new Error('The new design folder already exists. It has not been overwritten.');
        const conflicts=(await fs.readdir(parent,{withFileTypes:true})).filter(e=>e.isDirectory()&&folderMatches(e.name,saved.designNumber)&&e.name!==saved.folderName);
        if(conflicts.length)throw new Error('The reserved design number was created by another process. Review the reservation.');
        if(oldExists)await fs.rename(oldFolder,folder);else if(!newExists)await fs.mkdir(folder);
        await atomicJson(stateMarker(stateDir,task.id),{id:task.id,designNumber:saved.designNumber,folderName:saved.folderName,revision:0});
      }else if(saved.pending){
        const conflicts=(await fs.readdir(parent,{withFileTypes:true})).filter(e=>e.isDirectory()&&folderMatches(e.name,saved.designNumber)&&e.name!==saved.folderName);
        if(conflicts.length)throw new Error('The reserved design number was created by another process. Review the reservation.');
        try{await fs.mkdir(folder);await fs.writeFile(stateMarker(stateDir,task.id),JSON.stringify({id:task.id,designNumber:saved.designNumber,folderName:saved.folderName,revision:0}),{flag:'wx'});}
        catch(error){if(error.code!=='EEXIST')throw error;}
      }
      await directory(folder);const marker=await loadMarker(folder,stateDir,{...task,...saved});
      if(marker?.id!==task.id)throw new Error('Reserved folder ownership could not be verified.');
      const result={designNumber:saved.designNumber,folderName:saved.folderName};await atomicJson(journal,result);return result;
    }
    const localMarker=await safeRead(stateMarker(stateDir,task.id));
    const prior=saved||localMarker;
    // The Hub reserves a number before any new folder is created. An old failed
    // allocation can have a local journal for a number owned by another Hub job.
    const {highest,existing}=prior&&(!reserveNumber||task.designNumber)?{highest:0,existing:null}:await scan(root,task.id,onProgress);
    const previous=prior||existing;
    if(previous){
      const assigned=reserveNumber?String(await reserveNumber(String(Math.max(highest+1,Number(previous.designNumber))))):String(previous.designNumber);
      if(!/^\d{5,10}$/.test(assigned))throw new Error('Invalid reserved design number.');
      if(assigned===String(previous.designNumber))return await finishReservation(previous);
      const oldParent=await directory(path.join(root,rangeFor(previous.designNumber))),oldFolder=path.join(oldParent,previous.folderName);
      const marker=await loadMarker(oldFolder,stateDir,{...task,...previous});
      if(marker?.revision!==0||marker.hash)throw new Error('An existing saved proof cannot be assigned to a new design number.');
      const reservation={designNumber:assigned,folderName:`${assigned} ${cleanCustomer(task.customer)}`,previous:{designNumber:previous.designNumber,folderName:previous.folderName}};
      await atomicJson(journal,reservation);return await finishReservation(reservation);
    }
    onProgress('Finding the next available design number');
    if(highest<10000)throw new Error('No existing numbered design folders found. Check designRoot.');
    const designNumber=String(reserveNumber?await reserveNumber(String(highest+1)):highest+1);
    if(!/^\d{5,10}$/.test(designNumber))throw new Error('Invalid reserved design number.');
    const folderName=`${designNumber} ${cleanCustomer(task.customer)}`;
    const reservation={designNumber,folderName,pending:true};await atomicJson(journal,reservation);
    return await finishReservation(reservation);
  }finally{await release();}
}
async function saveOriginals(folder,originals,assertClaim){
  if(!Array.isArray(originals)||originals.length>20)throw new Error('Invalid artwork archive.');
  let total=0;
  const files=originals.map(item=>{
    const bytes=Buffer.from(item.data||'','base64');total+=bytes.length;
    if(bytes.length>10*1024*1024||total>50*1024*1024||crypto.createHash('sha256').update(bytes).digest('hex')!==item.hash)throw new Error('Artwork file failed integrity validation.');
    const name=originalArtworkName(item.name);
    return {name,hash:item.hash,bytes};
  });
  if(!files.length)return;
  const destination=path.join(folder,'pre-print');await fs.mkdir(destination,{recursive:true});await directory(destination);
  for(const item of files){
    const inspect=async file=>{
      const stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(!stat)return null;
      if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Unsafe artwork destination.');
      return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    };
    let file=path.join(destination,item.name),current=await inspect(file);
    if(current===item.hash)continue;
    if(current)throw new Error('Different artwork already exists with this filename in pre-print. Rename the upload or review the existing file before saving.');
    const temporary=path.join(destination,`.proof-upload-${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary,item.bytes,{flag:'wx'});
    try{await assertClaim();if(await inspect(file))throw new Error('The artwork destination changed while saving.');await fs.rename(temporary,file);}
    finally{await fs.unlink(temporary).catch(()=>{});}
  }
}
async function saveDesignProof(root,stateDir,task,assertClaim=async()=>{}){
  if(!UUID.test(task.id)||!/^\d{5,10}$/.test(task.designNumber||'')||!task.folderName?.startsWith(task.designNumber+' ')||/[\\/\x00-\x1f]/.test(task.folderName)||!Number.isInteger(task.revision)||task.revision<1)throw new Error('Invalid proof destination.');
  const bytes=Buffer.from(task.pdf||'','base64'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(bytes.length>50*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||hash!==task.hash)throw new Error('Proof file failed integrity validation.');
  const {PDFDocument}=require('./vendor/pdf-lib.min.js');const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()<1||pdf.getPageCount()>20)throw new Error('Invalid proof page count.');
  root=await directory(await fs.realpath(root));await fs.mkdir(stateDir,{recursive:true});
  const release=await acquireWorkerLock(path.join(stateDir,'proof-files.lock'));
  try{
    const parent=await directory(path.join(root,rangeFor(task.designNumber)));
    const folder=await directory(path.join(parent,task.folderName));
    const markerPath=stateMarker(stateDir,task.id);let marker=await loadMarker(folder,stateDir,task);
    if(marker?.id!==task.id||marker.designNumber!==task.designNumber)throw new Error('This folder is not owned by the requested proof.');
    if(marker.revision>task.revision)throw new Error('A newer proof is already saved.');
    await saveOriginals(folder,task.artworks||[],assertClaim);
    const safeName=name=>typeof name==='string'&&name===path.basename(name)&&!/[\\/<>:"|?*\x00-\x1f]/.test(name)&&name.startsWith(task.designNumber+' ')&&name.endsWith('PROOF.pdf');
    const fileHash=async name=>{
      if(!safeName(name))throw new Error('Unsafe proof filename.');
      const target=path.join(folder,name),stat=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(stat&&(stat.isSymbolicLink()||!stat.isFile()))throw new Error('Unsafe proof destination.');
      return stat?crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex'):null;
    };
    // Persist a rename intent so a restart can finish it without leaving two proofs.
    const finishRename=async()=>{
      if(!marker.pendingFileName)return;
      const previous=marker.fileName||`${task.designNumber} PROOF.pdf`;
      const previousHash=await fileHash(previous),targetHash=await fileHash(marker.pendingFileName);
      if(previousHash){
        if(previousHash!==marker.hash)throw new Error('The saved proof was changed outside Proof Generator. It has not been overwritten.');
        if(targetHash)throw new Error('The new proof filename already exists. It has not been overwritten.');
        await assertClaim();await fs.rename(path.join(folder,previous),path.join(folder,marker.pendingFileName));
      }else if(targetHash&&targetHash!==marker.hash)throw new Error('The new proof filename already exists. It has not been overwritten.');
      marker={...marker,fileName:marker.pendingFileName};delete marker.pendingFileName;
      await atomicJson(markerPath,marker);
    };
    await finishRename();
    const filename=proofFileName(task),previous=marker.fileName||`${task.designNumber} PROOF.pdf`;
    if(filename!==previous){
      if(await fileHash(filename))throw new Error('The new proof filename already exists. It has not been overwritten.');
      marker={...marker,pendingFileName:filename};await atomicJson(markerPath,marker);await finishRename();
    }
    const file=path.join(folder,filename);
    const stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(stat&&(stat.isSymbolicLink()||!stat.isFile()))throw new Error('Unsafe proof destination.');
    const current=stat?crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'):null;
    if(current===hash){await atomicJson(markerPath,{...marker,fileName:filename,revision:task.revision,hash});return file;}
    if(current && (!marker.hash||current!==marker.hash))throw new Error('The saved proof was changed outside Proof Generator. It has not been overwritten.');
    const temporary=path.join(folder,`.proof-${task.id}-${task.revision}-${crypto.randomUUID()}.tmp`);
    // A crash after rename but before metadata acknowledgement is recovered by its hash.
    await fs.writeFile(temporary,bytes,{flag:'wx'});
    try{await assertClaim();await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
    await atomicJson(markerPath,{...marker,fileName:filename,revision:task.revision,hash});
    return file;
  }finally{await release();}
}
module.exports={allocateDesign,saveDesignProof,cleanCustomer,rangeFor};
