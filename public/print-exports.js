(() => {
  const host=document.getElementById('print-export-controls');
  if(!host)return;
  const button=document.createElement('button');button.type='button';button.textContent='Print exports';host.append(button);
  const dialog=document.createElement('dialog');dialog.className='print-exports-dialog';
  const title=document.createElement('h2');title.textContent='Print exports';
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();
  const info=document.createElement('p'), list=document.createElement('div');
  dialog.append(title,close,info,list);document.body.append(dialog);
  const labels={queued:'Queued',processing:'Processing',awaiting_review:'Review in Illustrator',exported:'Exported',needs_attention:'Needs attention',cancelled:'Cancelled'};
  let loading=false;
  async function refresh() {
    if(loading)return;loading=true;
    try {
      const response=await fetch('/api/print-exports');if(!response.ok)throw Error('Could not load export queue');
      const data=await response.json();
      info.textContent=data.enabled?'Approvals queue eligible print designs. Showing the latest 200 exports.':'Automatic exports are disabled. Existing export history is shown below.';
      list.replaceChildren();
      if(!data.jobs.length){list.textContent='No exports queued yet.';return;}
      for(const job of data.jobs) {
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
