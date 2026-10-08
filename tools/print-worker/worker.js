/* Windows interactive-session worker. No dependencies; Node 22+ required. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { findProof, parseResult } = require('./local-files');
const { acquireWorkerLock } = require('./worker-lock');
const wait = ms=>new Promise(r=>setTimeout(r,ms));
const exists = async p=>fs.access(p).then(()=>true,()=>false);
const atomicJson = async (p,data)=>{ await fs.writeFile(p+'.tmp',JSON.stringify(data,null,2)); await fs.rename(p+'.tmp',p); };
const execFileAsync=promisify(execFile);

async function readIllustratorResult(resultPath,progressPath,launcherError) {
  if(await exists(resultPath))return parseResult(await fs.readFile(resultPath,'utf8'));
  if(launcherError) {
    const progress=await fs.readFile(progressPath,'utf8').catch(()=>null);
    const stage=progress&&progress.replace(/^\uFEFF/,'').split('\n').slice(1).join(' ').trim();
    throw new Error((stage?`Illustrator stopped during ${stage}: `:'Illustrator launcher failed: ')+launcherError.message);
  }
  throw new Error('Illustrator finished without writing an export result. Inspect its open dialogs and the PRINT folder.');
}

async function main() {
  if (process.platform!=='win32') throw new Error('Run this worker on the signed-in Windows Illustrator computer.');
  const config=JSON.parse(await fs.readFile(path.resolve(process.argv[2]||path.join(__dirname,'config.json')),'utf8'));
  const url=new URL(config.hubUrl);
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('hubUrl must be an HTTPS URL without credentials');
  if(typeof config.token!=='string'||config.token.length<32||config.token.startsWith('REPLACE_')) throw new Error('Configure the worker token (at least 32 characters)');
  if(!/^[A-Za-z0-9._-]{1,80}$/.test(config.workerId||'')) throw new Error('Set an alphanumeric workerId');
  const exporter=path.join(__dirname,'exporter','Proof-Artwork-Exporter.jsx');
  const core=path.join(__dirname,'exporter','proof-core.js');
  const [exporterSource,coreSource]=await Promise.all([fs.readFile(exporter,'utf8'),fs.readFile(core,'utf8')]);
  if(!exporterSource.includes('Proof Artwork Exporter 1.15')||!coreSource.includes("version:'1.14'"))
    throw new Error(`Worker files are out of date or mixed in ${__dirname}. Replace the complete worker folder before starting.`);
  const stateDir=path.join(process.env.LOCALAPPDATA||os.homedir(),'UltimateHub','PrintWorker');
  const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const runner=path.join(__dirname,'run-illustrator.ps1');
  await fs.mkdir(stateDir,{recursive:true});
  // An exclusive local lock prevents two startup shortcuts driving the same Illustrator.
  const lockPath=path.join(stateDir,'worker.lock');
  const releaseLock=await acquireWorkerLock(lockPath);
  // File saving does not depend on Illustrator readiness or the Print exports switch.
  const proofFileAbort=new AbortController();
  const folderLoop=require('./design-folder-worker').runDesignFolderWorker(config,{signal:proofFileAbort.signal}).catch(error=>console.error('Folder opening stopped:',error.message));
  const proofFileLoop=require('./proof-file-worker').runProofFileWorker(config,stateDir,{signal:proofFileAbort.signal}).catch(error=>console.error('Proof storage stopped:',error.message));
  const api=async(route,body)=>{
    const response=await fetch(new URL(route,url.origin),{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error(`Hub request failed (${response.status})`);
    return response.json();
  };
  const pending=path.join(stateDir,'pending.json');
  async function report(record) {
    const result=await api(`/api/print-worker/tasks/${record.task.id}`,{claimToken:record.task.claimToken,...record.result});
    if(!result.accepted) {
      console.error('Hub rejected the result; check the task and local files.');
      await atomicJson(path.join(stateDir,`unacknowledged-${record.task.id}-${record.task.attempt}.json`),record);
    }
    await fs.unlink(pending);
  }
  async function run(task) {
    const dir=path.join(stateDir,`${task.id}-${task.attempt}`); await fs.mkdir(dir,{recursive:true});
    const resultPath=path.join(dir,'result.xml'),progressPath=path.join(dir,'progress.txt'),cancelPath=path.join(dir,'cancel.flag');
    // Persist BEFORE launching, so a restart cannot silently rerun an uncertain attempt.
    let record={task,dir,resultPath,result:null}; await atomicJson(pending,record);
    let child=null,finished=false,lastContact=Date.now(),heartbeatBusy=false,cancelled=false,locatingMessage='Finding local proof';
    const cancel=async message=>{cancelled=true;await fs.writeFile(cancelPath,message);};
    // Renew the claim during OneDrive directory scans and proof hydration too.
    const timer=setInterval(async()=>{
      if(heartbeatBusy||finished)return; heartbeatBusy=true;
      try {
        const progress=await fs.readFile(progressPath,'utf8').catch(()=>`processing\n${locatingMessage}`);
        const [phase,...message]=progress.replace(/^\uFEFF/,'').split('\n');
        const reply=await api(`/api/print-worker/tasks/${task.id}`,{claimToken:task.claimToken,status:phase==='awaiting_review'?'awaiting_review':'processing',message:message.join('\n')});
        if(!reply.accepted) await cancel('Approval, design or claim changed'); else lastContact=Date.now();
      } catch(e) { console.error(e.message); if(Date.now()-lastContact>45000) await cancel('Lost contact with Hub'); }
      finally {heartbeatBusy=false;}
    },10000);
    try {
      locatingMessage='Scanning local design folders';
      const lookup=await api(`/api/print-worker/tasks/${task.id}`,{claimToken:task.claimToken,status:'processing',message:locatingMessage});
      if(!lookup.accepted)throw new Error('Task is no longer eligible before proof lookup');
      lastContact=Date.now();
      const located=await findProof(config.designRoot,task.designNumber,message=>{locatingMessage=message;console.log(message);});
      if(cancelled)throw new Error('Task was cancelled while finding the proof');
      const job={reference:task.designNumber,proofPath:located.proof,designFolder:located.designFolder,pdfPages:located.pdfPages,resultPath,progressPath,cancelPath};
      await atomicJson(path.join(dir,'source.json'),{...located,taskId:task.id});
      const launcher=path.join(dir,'launch.jsx');
      await fs.writeFile(launcher,'#target illustrator\n$.global.__ultimatePrintJob='+JSON.stringify(job)+';\n$.evalFile(new File('+JSON.stringify(exporter)+'));\n','utf8');
      const check=await api(`/api/print-worker/tasks/${task.id}`,{claimToken:task.claimToken,status:'processing',message:'Opening local proof'});
      if(!check.accepted) throw new Error('Task is no longer eligible');
      lastContact=Date.now();
      let stderr='';
      child=spawn(ps,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',runner,'-ScriptPath',launcher],{windowsHide:true,stdio:['ignore','ignore','pipe']});
      locatingMessage='Illustrator is processing';
      const completion=new Promise((resolve,reject)=>{
        child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-4000);});
        child.on('error',reject);child.on('close',code=>{finished=true;code===0?resolve():reject(new Error(stderr||`Illustrator launcher exited ${code}`));});
      });
      // Illustrator can return COM E_FAIL after the JSX has already written its
      // result. Read that result first so its actual export error is not hidden.
      let launcherError=null;
      try { await completion; } catch(e) { launcherError=e; }
      record.result=await readIllustratorResult(resultPath,progressPath,launcherError);
      if(cancelled) record.result={...record.result,status:'needs_attention',message:'Cancelled or lost contact. Inspect any exported files.'};
    } catch(e) { record.result={status:'needs_attention',message:e.message,outputs:[]}; }
    finally {clearInterval(timer);while(heartbeatBusy)await wait(100);}
    await atomicJson(pending,record); await report(record);
  }
  try {
    if(await exists(pending)) {
      const record=JSON.parse(await fs.readFile(pending,'utf8'));
      if(!record.result) {
        await fs.writeFile(path.join(record.dir,'cancel.flag'),'Worker restarted; inspect Illustrator');
        if(await exists(record.resultPath)) record.result=parseResult(await fs.readFile(record.resultPath,'utf8'));
        else throw new Error('Previous export may still be running. Close its Illustrator review/temporary documents, then restart after moving pending.json aside. Do not automatically retry.');
      }
      await report(record);
    }
    console.log(`Ultimate Hub print worker 1.24 ready: exporter 1.15 and proof folder saving from ${__dirname}. Keep this window running.`);
    let lastIllustratorError='';
    for(;;) {
      try {
        if(await exists(pending)) await report(JSON.parse(await fs.readFile(pending,'utf8')));
        else {
          // A plug-in startup dialog can leave COM unusable. Never claim a task
          // until the already-running Illustrator accepts a harmless script.
          try {
            await execFileAsync(ps,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',runner,'-CheckOnly'],{timeout:8000,windowsHide:true});
            if(lastIllustratorError)console.log('Illustrator is ready.');
            lastIllustratorError='';
          } catch(e) {
            const message=(e.stderr||e.message||'Illustrator is unavailable').trim();
            if(message!==lastIllustratorError)console.error('Waiting for Illustrator: '+message);
            lastIllustratorError=message;
            await wait(10000);continue;
          }
          const response=await api('/api/print-worker/claim',{workerId:config.workerId});
          if(response.task) { console.log(`Design ${response.task.designNumber}: opening Illustrator`); await run(response.task); continue; }
        }
      } catch(e) {console.error(e.message);}
      await wait(10000);
    }
  } finally {proofFileAbort.abort();await Promise.all([proofFileLoop,folderLoop]);await releaseLock();}
}
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={readIllustratorResult};
