(() => {
  const switchContainer=document.getElementById('printExportSwitchContainer');
  const toggle=document.getElementById('printExportSwitch');
  const toggleMessage=document.getElementById('printExportSwitchMessage');
  let changing=false,reading=false,canToggle=false;
  function showEnabled(value) {
    toggle.setAttribute('aria-checked',String(value));
    toggle.querySelector('.print-export-switch-state').textContent=value?'On':'Off';
  }
  async function readSwitch() {
    if(changing||reading||!toggle)return;reading=true;
    try {
      const response=await fetch('/api/print-exports/settings',{cache:'no-store'});
      if(!response.ok)throw Error('Cannot read print export setting');
      const settings=await response.json();
      canToggle=settings.canToggle===true;switchContainer.hidden=!canToggle;
      showEnabled(settings.enabled===true);toggle.disabled=!canToggle;toggleMessage.textContent='';
    } catch(e) {if(canToggle){toggle.disabled=true;toggleMessage.textContent=e.message;}}
    finally{reading=false;}
  }
  if(toggle)toggle.onclick=async()=>{
    if(changing||reading||!canToggle)return;
    changing=true;toggle.disabled=true;toggleMessage.textContent='';
    try{
      const response=await fetch('/api/print-exports/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:toggle.getAttribute('aria-checked')!=='true'})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save switch');
      showEnabled(result.enabled===true);if(dialog.open)refresh();
    }catch(e){toggleMessage.textContent=e.message;}finally{changing=false;toggle.disabled=false;}
  };
  Promise.resolve(window.ultimateHubUserPromise).then(user=>{if(user&&user.access_scope!=='dtf_only')readSwitch();});
  setInterval(()=>{if(canToggle&&!document.hidden)readSwitch();},20000);

  const host=document.getElementById('print-export-controls');
  if(!host)return;
  const button=document.createElement('button');button.type='button';button.textContent='Print exports';host.append(button);
  const dialog=document.createElement('dialog');dialog.className='print-exports-dialog';
  const title=document.createElement('h2');title.textContent='Print exports';
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();
  const clear=document.createElement('button');clear.type='button';clear.textContent='Clear history';
  clear.title='Hide past exports in this browser. Export records are retained.';
  const info=document.createElement('p'), list=document.createElement('div');
  dialog.append(title,close,clear,info,list);document.body.append(dialog);
  const labels={queued:'Queued',processing:'Processing',awaiting_review:'Review in Illustrator',exported:'Exported',needs_attention:'Needs attention',cancelled:'Cancelled'};
  const historyKey='ultimateHub.printExports.historyClearedAt';
  let historyCutoff=0;
  try{historyCutoff=Number(localStorage.getItem(historyKey))||0;}catch(e){}
  clear.onclick=()=>{
    historyCutoff=Date.now();
    try{localStorage.setItem(historyKey,String(historyCutoff));}catch(e){}
    refresh();
  };
  let loading=false;
  async function refresh() {
    if(loading)return;loading=true;
    try {
      const response=await fetch('/api/print-exports');if(!response.ok)throw Error('Could not load export queue');
      const data=await response.json();
      info.textContent=(data.enabled?'Approvals queue eligible print designs.':'Automatic exports are disabled.')+
        (historyCutoff?' Earlier history is hidden in this browser.':' Showing the latest 200 exports.');
      list.replaceChildren();
      const visible=data.jobs.filter(job=>['queued','processing','awaiting_review'].includes(job.status)||
        !Number.isFinite(Date.parse(job.updated_at))||Date.parse(job.updated_at)>historyCutoff);
      if(!visible.length){list.textContent=historyCutoff?'History cleared on this browser. New exports will appear here.':'No exports queued yet.';return;}
      for(const job of visible) {
        if(['processing','awaiting_review'].includes(job.status)&&job.lease_until&&new Date(job.lease_until)<new Date()){
          job.status='needs_attention';job.message='Worker lost contact. Inspect Illustrator and any exported files before retrying.';
        }
        const row=document.createElement('article'),heading=document.createElement('strong'),message=document.createElement('p');
        heading.textContent=`Job ${job.order_no||job.source_order_id} · Design ${job.design_number} · ${labels[job.status]||job.status}`;
        message.textContent=job.message;row.append(heading,message);
        for(const output of job.outputs||[]){const p=document.createElement('p');p.className='print-export-path';p.textContent=output;row.append(p);}
        if(job.status==='needs_attention'&&data.enabled) {
          const retry=document.createElement('button');retry.type='button';retry.textContent='Retry export';
          retry.onclick=async()=>{
            if(!confirm('Check PRINT for files already exported and close any previous Illustrator export first. Retry this design? Existing files will be kept; new files may have version suffixes.'))return;
            retry.disabled=true;
            try{
              const r=await fetch(`/api/print-exports/${encodeURIComponent(job.id)}/retry`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outputsReviewed:true})});
              if(!r.ok)throw Error((await r.json()).error||'Retry failed');await refresh();
            }catch(e){message.textContent=e.message;retry.disabled=false;}
          };row.append(retry);
        }
        list.append(row);
      }
    }catch(e){info.textContent=e.message;}finally{loading=false;}
  }
  button.onclick=()=>{dialog.showModal();refresh();};
  setInterval(()=>{if(dialog.open&&!document.hidden)refresh();},5000);
})();
