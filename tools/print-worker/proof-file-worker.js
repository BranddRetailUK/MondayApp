const path=require('node:path');
const fs=require('node:fs/promises');
const {allocateDesign,saveDesignProof}=require('./proof-files');
const {acquireWorkerLock}=require('./worker-lock');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runProofFileWorker(config,stateDir,{signal}={}){
  const rootUrl=new URL(config.hubUrl);if(rootUrl.protocol!=='https:')throw new Error('Proof worker requires HTTPS.');
  await fs.mkdir(stateDir,{recursive:true});const release=await acquireWorkerLock(path.join(stateDir,'proof-worker.lock'));
  const api=async(route,body)=>{
    const r=await fetch(new URL(route,rootUrl.origin),{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`Proof file request failed (${r.status})`);return r.json();
  };
  try{while(!signal?.aborted){
    try{
      const {task}=await api('/api/proof-file-worker/claim',{workerId:config.workerId,proofFilesVersion:4});
      if(task){
        let message='Preparing design files',heartbeatBusy=false,claimLost=false;
        const report=result=>api(`/api/proof-file-worker/tasks/${task.id}`,{claimToken:task.claimToken,...result});
        const assertClaim=async()=>{if(claimLost||!(await report({status:'heartbeat',message})).accepted)throw new Error('Proof file claim changed.');};
        const timer=setInterval(async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{await assertClaim();}catch(e){claimLost=true;}finally{heartbeatBusy=false;}},10000);
        try{
          let result;
          if(task.operation==='allocate'){const folder=await allocateDesign(config.designRoot,stateDir,task,value=>{message=value;},async proposedNumber=>{const reservation=await report({status:'reserve',proposedNumber});if(!reservation.accepted)throw new Error('Proof allocation claim changed.');return reservation.designNumber;});result={status:'allocated',...folder};}
          else{message='Saving proof PDF';await saveDesignProof(config.designRoot,stateDir,task,assertClaim);result={status:'saved',hash:task.hash,revision:task.revision};}
          const acknowledgement=await report(result);if(!acknowledgement.accepted)throw new Error(acknowledgement.message||'Proof file claim changed.');
        }catch(error){console.error('Proof files:',error.message);await report({status:'error',message:error.message}).catch(()=>{});}
        finally{clearInterval(timer);while(heartbeatBusy)await wait(50);}
      }
    }catch(error){console.error('Proof file worker:',error.message);}
    await wait(5000);
  }}finally{await release();}
}
module.exports={runProofFileWorker};
