const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {findDesignFolder}=require('./local-files');
const {originalArtworkName}=require('./proof-filename');
const MAX_BYTES=50*1024*1024;
async function saveVisual(root,task,assertClaim=async()=>{},fetchImpl=fetch){
  originalArtworkName(task.filename);
  if(!task.filename.startsWith('Visual '))throw new Error('Invalid visual filename');
  const url=new URL(task.url);
  if(url.protocol!=='https:'||url.hostname!=='res.cloudinary.com'||url.username||url.password||url.port)throw new Error('Invalid visual source');
  const folder=await findDesignFolder(root,task.designNumber);
  if(path.basename(folder)!==task.folderName)throw new Error('Design folder name changed; review the destination');
  const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Visual download failed (${response.status})`);
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Visual exceeds 50 MB');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BYTES)throw new Error('Visual exceeds 50 MB');chunks.push(chunk);}
  if(!size)throw new Error('Visual is empty');
  const bytes=Buffer.concat(chunks),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const target=path.join(folder,task.filename);
  const inspect=async()=>{
    const stat=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(!stat)return null;
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Unsafe visual destination');
    return crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
  };
  const current=await inspect();
  if(current===hash)return hash;
  if(current)throw new Error('A different file already exists at the visual destination; it has not been overwritten');
  const temporary=path.join(folder,`.visual-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary,bytes,{flag:'wx'});
  try{
    await assertClaim();
    // Hard-link publication is atomic and fails if another writer created the destination.
    try{await fs.link(temporary,target);}catch(error){if(error.code!=='EEXIST'||await inspect()!==hash)throw error;}
  }finally{await fs.unlink(temporary).catch(()=>{});}
  return hash;
}
module.exports={saveVisual};
