const path=require('node:path');
const {spawn}=require('node:child_process');
const {findDesignFolder}=require('./local-files');
async function openFolder(root,task,{launch=spawn,platform=process.platform}={}){
  if(platform!=='win32')throw new Error('Opening folders requires the Windows worker');
  const folder=await findDesignFolder(root,task.designNumber);
  if(!Number.isFinite(Date.parse(task.expiresAt))||Date.parse(task.expiresAt)<=Date.now())throw new Error('Folder request expired; click the design number again');
  const executable=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  await new Promise((resolve,reject)=>{
    const child=launch(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'open-design-folder.ps1'),'-Folder',folder],{shell:false,windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{child.kill();reject(new Error('Explorer did not respond; check the Windows desktop'));},15000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{
      clearTimeout(timer);
      if(code===0)resolve();
      else reject(new Error(code===3?'Folder opened, but Windows blocked foreground focus. Select Explorer on the taskbar.':'Could not open and focus the design folder; check the Windows desktop'));
    });
  });
}
async function runDesignFolderWorker(config,{signal}={}){
  const origin=new URL(config.hubUrl).origin;
  if(!origin.startsWith('https://'))throw new Error('HTTPS Hub URL required');
  const api=async(route,body)=>{
    const response=await fetch(new URL(route,origin),{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`Folder request failed (${response.status})`);return response.json();
  };
  while(!signal?.aborted){
    try{
      const {task}=await api('/api/design-folder-worker/claim',{workerId:config.workerId});
      if(task){
        let status='opened',message='Explorer opened on the Windows design computer';
        try{await openFolder(config.designRoot,task);}catch(error){status='error';message=error.message;}
        // Claims are never retried automatically: a lost reply must not open Explorer twice.
        await api(`/api/design-folder-worker/tasks/${task.id}`,{claimToken:task.claimToken,status,message});
      }
    }catch(error){console.error('Folder opening:',error.message);}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
}
module.exports={openFolder,runDesignFolderWorker};
