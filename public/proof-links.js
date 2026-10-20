/* Shared authorised proof/job actions. Ordinary visual viewing stays unchanged. */
(() => {
  const allowed=()=>window.ultimateHubUser?.access_scope!=='dtf_only' && String(window.ultimateHubUser?.email||'').trim().toLowerCase()==='production@ultimatepromotions.co.uk';
  async function api(path,body){
    const response=await fetch('/api/proof-generator'+path,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Proof action failed.');return data;
  }
  function button(label,run){const el=document.createElement('button');el.type='button';el.className='proof-secondary-button';el.textContent=label;el.addEventListener('click',async()=>{el.disabled=true;try{await run();}catch(error){window.alert(error.message);}finally{el.disabled=false;}});return el;}
  function picker(kind,{customer=''}={}){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='proof-link-dialog';
      const title=document.createElement('h2');title.textContent=kind==='jobs'?'Link to job':'Attach existing proof';
      const search=document.createElement('input');search.type='search';search.placeholder=kind==='jobs'?'Job number, customer or title':'Design/ref, customer or title';search.setAttribute('aria-label',search.placeholder);search.value=customer;
      const list=document.createElement('div');list.className='proof-link-results';
      const status=document.createElement('p');status.setAttribute('role','status');
      const close=button('Cancel',()=>dialog.close());
      dialog.append(title,search,status,list,close);document.body.append(dialog);dialog.showModal();search.focus();
      let chosen=null,request=0,timer,offset=0;
      const more=button('Load more',()=>load(true));more.hidden=true;dialog.insertBefore(more,close);
      dialog.addEventListener('close',()=>{clearTimeout(timer);request++;dialog.remove();resolve(chosen);});
      async function load(append=false){
        const token=++request;if(!append){offset=0;list.replaceChildren();}status.innerHTML='<span class="app-section-loading" role="status" aria-label="Loading choices"><span class="board-loading-spinner" aria-hidden="true"></span></span>';more.hidden=true;
        try{
          const data=await api(kind==='jobs'?`/link-jobs?q=${encodeURIComponent(search.value)}`:`/designs?q=${encodeURIComponent(search.value)}&offset=${offset}`);
          if(token!==request)return;const rows=kind==='jobs'?data.jobs:data.designs.filter(row=>row.status==='saved'&&row.hasPdf);
          status.textContent=rows.length?'':kind==='jobs'?'No matching jobs without visuals.':'No saved proofs on this page.';
          for(const row of rows){
            const card=document.createElement('div');card.className='proof-link-choice';
            if(kind!=='jobs'){
              const image=document.createElement('img');image.loading='lazy';image.alt='Proof thumbnail';image.src=`/api/proof-generator/designs/${row.id}/preview`;card.append(image);
              const preview=document.createElement('a');preview.href=`/api/proof-generator/designs/${row.id}/pdf`;preview.target='_blank';preview.rel='noopener';preview.textContent='Preview PDF';card.append(preview);
            }
            card.append(button(kind==='jobs'?`${row.order_no||row.source_order_id} · ${row.customer_name} · ${row.job_title}`:`${row.designNumber} · ${row.customer} · ${row.jobTitle}`,()=>{chosen=row;dialog.close();}));list.append(card);
          }
          offset=data.nextOffset;more.hidden=kind==='jobs'||offset==null;
        }catch(error){if(token===request)status.textContent=error.message;}
      }
      search.addEventListener('input',()=>{clearTimeout(timer);request++;timer=setTimeout(()=>load(),200);});load();
    });
  }
  function refresh(){window.dispatchEvent(new CustomEvent('proof-job-linked'));if(typeof loadTestBoard==='function')loadTestBoard({forceRefresh:true});}
  async function link(proofId,id){
    if(!allowed())return null;
    return api(`/designs/${proofId}/link`,{sourceOrderId:id});
  }
  async function attach(id,customer=''){
    if(!allowed())return;const proof=await picker('proofs',{customer});if(!proof)return;
    if(await link(proof.id,id))refresh();
  }
  async function edit(id){
    if(!allowed())return;const {job}=await api(`/link-jobs/${id}`);
    const {design}=await api(`/link-jobs/${id}/edit`,{});
    activateDashboardTab('proof-generator');await window.openLinkedProof({design,job});
  }
  function confirmRegeneration(job){
    return new Promise(resolve=>{
      const previousFocus=document.activeElement;
      const dialog=document.createElement('dialog');dialog.className='proof-regeneration-warning';
      dialog.setAttribute('aria-labelledby','proof-regeneration-warning-title');
      dialog.setAttribute('aria-describedby','proof-regeneration-warning-message');
      const title=document.createElement('h2');title.id='proof-regeneration-warning-title';title.textContent='Regenerate an approved proof?';
      const message=document.createElement('p');message.id='proof-regeneration-warning-message';
      message.textContent=`Job ${job.order_no||job.source_order_id} is already approved. Regenerating will clear JOB approval and return this job to OFFICE. Saving the new proof will replace its linked visual and require approval again.`;
      const note=document.createElement('p');note.textContent='Cancel keeps the job approved and leaves the saved proof unchanged.';
      const actions=document.createElement('div');actions.className='proof-regeneration-warning-actions';
      const cancel=button('Cancel',()=>dialog.close('cancel'));
      const confirm=button('Regenerate proof',()=>dialog.close('regenerate'));confirm.classList.add('proof-regeneration-confirm');
      actions.append(cancel,confirm);dialog.append(title,message,note,actions);
      dialog.addEventListener('close',()=>{const confirmed=dialog.returnValue==='regenerate';dialog.remove();previousFocus?.focus();resolve(confirmed);},{once:true});
      document.body.append(dialog);dialog.showModal();cancel.focus();
    });
  }
  async function beginRegeneration(id,proofId){
    if(!allowed())return false;
    const {job}=await api(`/link-jobs/${id}`);
    if(job.proof_id!==proofId)throw new Error('The linked proof changed. Reopen it from the job before regenerating.');
    if(job.proof_approved){
      if(!await confirmRegeneration(job))return false;
      const response=await fetch(`/api/test-dashboard/items/${id}/checkbox-column`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({columnId:'checkbox1__1',checked:false})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not clear approval.');
      refresh();
    }
    return true;
  }
  async function create(id){
    if(!allowed())return;const {job}=await api(`/link-jobs/${id}`);
    if(job.has_visual||job.proof_id)throw new Error('This job already has a visual or linked proof.');
    activateDashboardTab('proof-generator');await window.openLinkedProof({job});
  }
  async function controls(container,id,{showLinkedActions=true}={}){
    if(!container)return;container.replaceChildren();container.dataset.proofControlJob=String(id);if(!allowed()||!/^\d+$/.test(String(id)))return;
    try{
      const {job}=await api(`/link-jobs/${id}`);if(!container.isConnected||container.dataset.proofControlJob!==String(id))return;
      if(job.proof_id){
        if(!showLinkedActions)return;
        container.append(button('Edit proof',()=>edit(id)),button('Retry proof sync',async()=>{await api(`/designs/${job.proof_id}/sync`,{});refresh();}),button('Unlink proof',async()=>{if(!window.confirm('Remove this job’s proof link and visual? The original proof stays in Proof Generator.'))return;await api(`/link-jobs/${id}/unlink`,{});refresh();await controls(container,id);}));
      }else if(!job.has_visual){container.append(button('Create proof',()=>create(id)),button('Attach existing proof',()=>attach(id,job.customer_name)));}
    }catch(error){container.textContent=error.message;}
  }
  window.ProofLinks={allowed,api,picker,link,attach,edit,beginRegeneration,create,controls,refresh};
})();
