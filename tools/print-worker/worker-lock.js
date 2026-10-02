/* Exclusive worker lock; reclaim only locks whose owner process has exited. */
const fs=require('node:fs/promises');

function ownerAlive(pid) {
  try { process.kill(pid,0); return true; }
  catch(e) { if(e.code==='ESRCH')return false; return true; }
}

async function acquireWorkerLock(lockPath) {
  const owner=String(process.pid);
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const handle=await fs.open(lockPath,'wx');
      try { await handle.writeFile(owner); }
      finally { await handle.close(); }
      return async()=>{
        // Never release a lock now owned by a different worker.
        if((await fs.readFile(lockPath,'utf8').catch(()=>null))===owner)
          await fs.unlink(lockPath).catch(()=>{});
      };
    } catch(e) {
      if(e.code!=='EEXIST')throw e;
      const recorded=(await fs.readFile(lockPath,'utf8').catch(()=>null))?.trim();
      if(recorded===null)continue; // It disappeared while we were checking.
      const pid=Number(recorded);
      if(!Number.isSafeInteger(pid)||pid<1)
        throw new Error('Worker lock has no valid process ID. Inspect Illustrator and '+lockPath);
      if(ownerAlive(pid))throw new Error('Another worker is running (PID '+pid+'). Lock: '+lockPath);
      // Compare once more before removing a stale lock. The exclusive create
      // above still decides which of two restarting workers may proceed.
      if((await fs.readFile(lockPath,'utf8').catch(()=>null))?.trim()===recorded) {
        await fs.unlink(lockPath).catch(e=>{if(e.code!=='ENOENT')throw e;});
        console.log('Removed stale worker lock from exited process '+pid);
      }
    }
  }
  throw new Error('Could not acquire worker lock: '+lockPath);
}

module.exports={acquireWorkerLock};
