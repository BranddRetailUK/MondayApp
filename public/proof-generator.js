(async function () {
  const {colourName,reviewMessage}=window.ProofDisplay;
  const root = document.getElementById('proof-generator-root');
  if (!root) return;
  const standalonePreview = document.body.classList.contains('proof-preview');
  const user = standalonePreview ? null : await window.ultimateHubUserPromise;
  const sandbox = !standalonePreview && new URLSearchParams(location.search).get('test') === '1';
  const historyEndpoint = sandbox ? 'tests' : 'designs';
  const localPreview = standalonePreview || sandbox;
  if (!standalonePreview) {
    if (!user || user.access_scope === 'dtf_only' || !['production@ultimatepromotions.co.uk', 'charlie@ultimatepromotions.co.uk', 'melvyn@ultimatepromotions.co.uk'].includes(String(user.email || '').trim().toLowerCase())) return;
  }

  // Retry only reads: a failed response must never replay generation or a save.
  async function proofFetch(url, options={}) {
    if(sandbox)url+=(url.includes('?')?'&':'?')+'test=1';
    const attempts=(!options.method || options.method==='GET')?3:1;
    for(let attempt=0;attempt<attempts;attempt++){
      try{
        const response=await fetch(url,options);
        if(![502,503,504].includes(response.status)||attempt===attempts-1)return response;
        await response.body?.cancel();
      }catch(error){
        if(error.name==='AbortError'||attempt===attempts-1)throw error;
      }
      await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
    }
  }
  async function proofJson(response) {
    try{return await response.json();}
    catch(_){throw new Error(`Proof service returned an unreadable response (HTTP ${response.status}). Refresh the proof history to check whether saving completed before regenerating.`);}
  }

  root.innerHTML = `
    <div class="proof-page">
      <header class="proof-page-header">
        <div>
          <h1 class="proof-page-title">${sandbox?"Melvyn's Proofs":"Proof Generator"}</h1>

        </div>
        <div id="proof-list-controls" class="proof-list-controls">
          <div class="proof-view-toggle" role="group" aria-label="Proof list view" data-view="list">
            <span class="proof-view-highlight" aria-hidden="true"></span>
            <button type="button" data-proof-view="list" aria-label="List view" title="List view" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/></svg></button>
            <button type="button" data-proof-view="grid" aria-label="Grid view" title="Grid view" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
          </div>
          ${!standalonePreview&&sandbox?`<a class="proof-primary-button proof-mode-button" href="?#proof-generator">Live proofs</a>`:''}
          <button id="proof-create-new" class="proof-primary-button" type="button">Create proof</button>
        </div>
      </header>
      <section id="proof-history">
        <div id="proof-history-status" role="status"></div>
        <div id="proof-history-list" class="proof-history-list"></div>
        <button id="proof-history-more" class="proof-secondary-button" type="button" hidden>Load more</button>
      </section>
      <div id="proof-editor-screen" hidden>
      <div class="proof-editor-toolbar"><button id="proof-back-list" class="proof-secondary-button" type="button">← All proofs</button></div>
      <div class="proof-layout">
        <div class="proof-form-column">
          <section class="proof-card">
            <div class="proof-review-title proof-section-title"><h2>Proof request</h2></div>
            <div class="proof-product-search">
              <div class="proof-product-picker">
                <div><label class="proof-label" for="proof-product-query">Find a product</label>
                <input id="proof-product-query" type="search" maxlength="24" autocomplete="off" aria-describedby="proof-product-status" aria-controls="proof-product-results"></div>
                <div><label class="proof-label" for="proof-product-colour">Colour</label>
                <select id="proof-product-colour" disabled><option value="">Select a product first</option></select></div>
              </div>
              <div id="proof-product-status" class="proof-search-status" role="status" aria-live="polite"></div>
              <div id="proof-product-results" class="proof-search-results"></div>
            </div>
            <div class="proof-job-fields">
              <div class="proof-customer-picker">
                <label class="proof-control">Customer name<input id="proof-customer" type="search" maxlength="200" autocomplete="off" aria-controls="proof-customer-results" aria-describedby="proof-customer-status"></label>
                <div id="proof-customer-status" class="proof-search-status" role="status" aria-live="polite"></div>
                <div id="proof-customer-results" class="proof-search-results" aria-label="Matching customers"></div>
              </div>
              <label class="proof-control">Job title<input id="proof-job-title" autocomplete="off" type="text" maxlength="200"></label>
            </div>
            <div id="proof-design-status" class="proof-design-status" role="status"></div>
            <label class="proof-label" for="proof-request">Request</label>
            <textarea id="proof-request" class="proof-textarea proof-main-request" maxlength="20000"></textarea>
          </section>
          <section class="proof-card">
            <div class="proof-review-title proof-section-title"><h2>Artwork</h2></div>
            <input id="proof-file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.eps,.ai,.ttf,.otf,.pxf,.dst" multiple hidden>
            <button id="proof-dropzone" class="proof-dropzone" type="button"><span class="proof-upload-icon" aria-hidden="true">↥</span><strong>Choose artwork files</strong></button>
            <div id="proof-artworks" class="proof-artwork-list"></div>
          </section>
          <div class="proof-form-actions"><button id="proof-review" class="proof-primary-button" type="button"><span class="proof-button-spinner" aria-hidden="true" hidden></span><span data-proof-button-label>Create proof</span></button><button id="proof-retry-save" class="proof-secondary-button" type="button" hidden>Retry folder/save</button><span id="proof-feedback" role="status" aria-live="polite"></span></div>
        </div>
        <aside class="proof-review-column">
            <section id="proof-job-picker" class="proof-card">
              <div class="proof-review-title proof-section-title"><h2>Link to existing job</h2></div>
              <label class="proof-control">Find an OFFICE job (optional)<input id="proof-office-search" type="search" autocomplete="off" placeholder="Search job number, customer or title"></label>
              <label class="proof-control">Link to job<select id="proof-office-job"><option value="">No job selected — create a new design</option></select></label>
              <label id="proof-reference-control" class="proof-control" hidden>Design reference<select id="proof-existing-reference"></select></label>
              <div id="proof-office-status" class="proof-search-status" role="status"></div>
            </section>
          <section class="proof-card proof-review-card" aria-live="polite">
            <div class="proof-review-title proof-section-title"><h2>Clothing proof</h2></div>
            <div id="proof-results" class="proof-results-empty"><div class="proof-empty-mark" aria-hidden="true">✦</div><strong>Ready when you are</strong></div>
          </section>
          <div id="proof-placement-loading" class="proof-placement-loading" role="status" aria-label="Loading artwork position previews" hidden><span class="board-loading-spinner" aria-hidden="true"></span></div>
        </aside>
      </div>
      </div>
    </div>`;

  const request = root.querySelector('#proof-request');
  const customer=root.querySelector('#proof-customer'),jobTitle=root.querySelector('#proof-job-title');
  const designStatus=root.querySelector('#proof-design-status'),retrySave=root.querySelector('#proof-retry-save');
  let design=null,designId=null;
  try{if(!localPreview)designId=sessionStorage.getItem('proof-design-id');}catch(_){}
  const input = root.querySelector('#proof-file-input');
  const dropzone = root.querySelector('#proof-dropzone');
  const artworksNode = root.querySelector('#proof-artworks');
  const results = root.querySelector('#proof-results');
  const reviewButton = root.querySelector('#proof-review');
  const formActions = root.querySelector('.proof-form-actions');
  const editorToolbar = root.querySelector('.proof-editor-toolbar');
  const feedback = root.querySelector('#proof-feedback');
  const placementLoading = root.querySelector('#proof-placement-loading');
  const artworks = [];
  let currentBrief = null;
  let currentPreview = null;
  let busy = false, generatingProof = false;
  let dirty = true;
  const historyScreen=root.querySelector('#proof-history'),editorScreen=root.querySelector('#proof-editor-screen');
  const historyList=root.querySelector('#proof-history-list'),historyStatus=root.querySelector('#proof-history-status');
  const createNew=root.querySelector('#proof-create-new'),loadMore=root.querySelector('#proof-history-more');
  let progressChain=Promise.resolve();
  let historyRows=[],nextOffset=null,historyLimit=50,historyLoading=false,historyWaiting=false,historyLoaded=false,lastHistory='',progressMessage='',progressError=false;
  const listControls=root.querySelector('#proof-list-controls');
  const viewButtons=[...root.querySelectorAll('[data-proof-view]')];
  function setHistoryView(view){
    const grid=view==='grid';historyList.classList.toggle('is-grid',grid);
    root.querySelector('.proof-view-toggle').dataset.view=grid?'grid':'list';
    for(const button of viewButtons)button.setAttribute('aria-pressed',String(button.dataset.proofView===(grid?'grid':'list')));
    try{localStorage.setItem('proof-history-view',grid?'grid':'list');}catch(_){}
  }
  let savedView='list';try{savedView=localStorage.getItem('proof-history-view')||'list';}catch(_){}
  setHistoryView(savedView);
  for(const button of viewButtons)button.addEventListener('click',()=>setHistoryView(button.dataset.proofView));
  let selectedLinkJob=null;
  const officeSearch=root.querySelector('#proof-office-search'),officeSelect=root.querySelector('#proof-office-job'),existingReference=root.querySelector('#proof-existing-reference'),referenceControl=root.querySelector('#proof-reference-control'),officeStatus=root.querySelector('#proof-office-status');
  let officeRows=[],officeRequest=0,officeTimer;
  const linkExistingProof=document.createElement('button');
  linkExistingProof.type='button';linkExistingProof.className='proof-secondary-button';linkExistingProof.textContent='Link to job';
  root.querySelector('#proof-job-picker').append(linkExistingProof);
  linkExistingProof.addEventListener('click',linkExistingDesign);
  async function linkExistingDesign(){
    if(busy||!designId||design?.sourceOrderId||design?.linkedJobs?.length)return;
    const id=designId;busy=true;showJobSelection();
    try{
      const target=await window.ProofLinks.picker('jobs',{customer:customer.value});
      if(!target)return;
      if(!await window.ProofLinks.link(id,target.source_order_id))return;
      // Update the open editor's identity without discarding unsaved artwork/layout edits.
      selectedLinkJob=target;
      design={...design,sourceOrderId:target.source_order_id,linkedJobs:[target.source_order_id],linkedOrders:[{sourceOrderId:target.source_order_id,orderNo:target.order_no}]};
      if(currentBrief)currentBrief.proofSourceOrderId=target.source_order_id;
      officeStatus.textContent=`Linked to job ${target.order_no||target.source_order_id}.`;
      window.ProofLinks.refresh();await refreshHistory();
    }catch(error){officeStatus.textContent=error.message;}
    finally{busy=false;showJobSelection();}
  }
  function showJobSelection(){
    officeSelect.replaceChildren(new Option('No job selected — create a new design',''));
    const rows=selectedLinkJob?[selectedLinkJob,...officeRows.filter(row=>row.source_order_id!==selectedLinkJob.source_order_id)]:officeRows;
    for(const row of rows)officeSelect.add(new Option(`${row.order_no||row.source_order_id} · ${row.customer_name||''} · ${row.job_title||''}${row.designRefs?.length?' · '+row.designRefs.join(', '):''}`,String(row.source_order_id)));
    officeSelect.value=selectedLinkJob?String(selectedLinkJob.source_order_id):'';
    referenceControl.hidden=!!designId||!selectedLinkJob?.designRefs?.length;
    officeSearch.parentElement.hidden=!!designId;
    officeSelect.parentElement.hidden=!!designId&&!selectedLinkJob;
    const previous=existingReference.value;existingReference.replaceChildren();
    const refs=selectedLinkJob?.designRefs||[];
    if(refs.length>1)existingReference.add(new Option('Select a design reference',''));
    for(const ref of refs)existingReference.add(new Option(ref,ref));
    if(refs.includes(previous))existingReference.value=previous;
    for(const control of [officeSearch,officeSelect,existingReference])control.disabled=busy||!!designId;
    linkExistingProof.hidden=localPreview||!designId||!!design?.sourceOrderId||!!design?.linkedJobs?.length;
    linkExistingProof.disabled=busy||['saving','save_queued','allocating'].includes(design?.status);
    if(designId&&!design?.sourceOrderId&&!design?.linkedJobs?.length&&!officeStatus.textContent)officeStatus.textContent='Use Link to job to find a job added after this proof was created.';
    root.querySelector('#proof-job-picker').hidden=localPreview;
  }
  async function loadOfficeJobs(){
    if(localPreview||designId)return;
    const token=++officeRequest;officeStatus.innerHTML='<span class="app-section-loading is-compact" role="status" aria-label="Loading OFFICE jobs"><span class="board-loading-spinner" aria-hidden="true"></span></span>';
    try{
      const data=await window.ProofLinks.api(`/link-jobs?office=1&q=${encodeURIComponent(officeSearch.value)}`);
      if(token!==officeRequest||designId)return;
      officeRows=data.jobs;showJobSelection();officeStatus.textContent=officeRows.length===100?'Showing 100 jobs. Type to narrow the list.':officeRows.length?'':'No eligible OFFICE jobs found.';
    }catch(error){if(token===officeRequest)officeStatus.textContent=error.message;}
  }
  officeSearch.addEventListener('input',()=>{clearTimeout(officeTimer);++officeRequest;officeTimer=setTimeout(loadOfficeJobs,250);});
  officeSelect.addEventListener('change',()=>{
    selectedLinkJob=officeRows.find(row=>String(row.source_order_id)===officeSelect.value)||null;
    existingReference.replaceChildren();
    if(selectedLinkJob){customer.value=selectedLinkJob.customer_name||'';jobTitle.value=selectedLinkJob.job_title||'';clearCustomerSearch();sourceChanged();}
    showJobSelection();officeStatus.textContent=selectedLinkJob?(selectedLinkJob.designRefs.length?'The proof will use this job’s existing design folder.':'This job has no numeric design reference. A new design will be created.') : '';
  });
  function jobReservation(){return selectedLinkJob&&!design?.sourceOrderId?{sourceOrderId:selectedLinkJob.source_order_id,designReference:existingReference.value}:{};}

  window.openLinkedProof=async({design:linkedDesign,job})=>{
    if(busy)throw new Error('Wait for the current proof to finish.');
    startNewProof();
    if(linkedDesign)await openHistoryProof(linkedDesign);
    else{customer.value=job.customer_name||'';jobTitle.value=job.job_title||'';showProofEditor();}
    selectedLinkJob=job;showJobSelection();
  };
  function showProofList(foreground=true){
    editorScreen.hidden=true;historyScreen.hidden=false;listControls.hidden=false;renderHistory();refreshHistory(foreground);
  }
  function showProofEditor(){historyScreen.hidden=true;editorScreen.hidden=false;listControls.hidden=true;showJobSelection();loadOfficeJobs();}
  root.querySelector('#proof-back-list').addEventListener('click',showProofList);
  createNew.addEventListener('click',()=>{if(busy)return;startNewProof();showProofEditor();});
  loadMore.addEventListener('click',()=>{historyLimit+=50;refreshHistory(true);});
  function showHistoryLoading(waiting){
    historyWaiting=waiting;
    historyList.hidden=waiting;
    historyStatus.innerHTML=waiting?'<div class="workspace-loading" role="status" aria-label="Loading proofs"><span class="board-loading-spinner" aria-hidden="true"></span></div>':'';
    loadMore.hidden=waiting||nextOffset===null;
  }
  async function refreshHistory(foreground=false){
    if(standalonePreview||historyLoading)return;
    historyLoading=true;
    if(foreground||!historyLoaded)showHistoryLoading(true);
    try{
      let offset=0,rows=[],more=null;
      do{
        const response=await proofFetch(`/api/proof-generator/${historyEndpoint}?offset=${offset}`,{cache:'no-store'});
        const data=await proofJson(response);if(!response.ok)throw new Error(data.error||'Could not load proof history.');
        rows.push(...data.designs);more=data.nextOffset;offset=more;
      }while(more!==null&&rows.length<historyLimit);
      historyRows=rows;historyLoaded=true;if(!busy&&design){const latest=rows.find(job=>job.id===design.id);if(latest)design=latest;}nextOffset=more;showHistoryLoading(false);renderHistory();
    }catch(error){console.warn('Proof history load failed',error);showHistoryLoading(true);}
    finally{historyLoading=false;loadMore.disabled=false;}
  }
  function historyState(job){
    if(job.id===designId&&busy)return ['Pending',progressMessage];
    if(job.liveDesignId)return ['Live migration pending','Use ADD TO LIVE to resume the same live design.'];
    if(job.hasPdf&&['save_queued','saving'].includes(job.status))return ['Proof ready','Saving to design folder…'];
    if(job.status==='error')return [job.hasPdf?'Save needs attention':'Needs attention',job.message];
    if(job.generationStatus==='error')return ['Failed',job.generationMessage];
    if(job.generationStatus==='review')return ['Needs review',job.generationMessage];
    if(job.generationStatus==='interrupted')return ['Interrupted','Generation stopped before saving. Reopen the proof to continue.'];
    if(job.generationStatus==='generating')return ['Pending',job.generationMessage];
    if(job.status==='saved'&&job.linkPending)return ['Sync pending','The saved proof still needs to be added to Dashboard.'];
    if(job.status==='saved')return ['Saved',''];
    if(job.status==='save_queued'||job.status==='saving')return ['Saving',job.message];
    return ['Pending',job.message];
  }
  function renderHistory(){
    createNew.disabled=busy;loadMore.hidden=historyWaiting||nextOffset===null;loadMore.disabled=historyLoading;
    let rows=[...historyRows];
    if(design&&!rows.some(job=>job.id===design.id))rows.unshift(design);
    rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||b.id.localeCompare(a.id));
    const signature=JSON.stringify([rows,design,busy,progressMessage,progressError,!!currentBrief,!!currentPreview]);
    if(signature===lastHistory)return;lastHistory=signature;historyList.replaceChildren();
    if(!rows.length)return;
    for(const row of rows){
      const job=row.id===designId&&design?{...row,...design}:row;
      const item=document.createElement('article');item.className='proof-history-row';
      const thumb=document.createElement('div');thumb.className='proof-history-thumb';
      if(job.hasPreview&&!standalonePreview){
        const img=document.createElement('img');img.loading='lazy';img.alt=`Proof preview for ${job.customer||job.designNumber||'pending design'}`;img.src=`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/preview?v=${encodeURIComponent(job.updatedAt||job.revision)}`;
        const button=document.createElement('button');button.type='button';button.className='proof-history-image';button.setAttribute('aria-label',`Open proof preview ${job.designNumber||''}`);button.append(img);
        button.addEventListener('click',()=>openSavedProof(job));thumb.append(button);
      }else if(localPreview&&job.id===designId&&currentPreview?.pdf){renderDocument(currentPreview.pdf,thumb,[],{onlyPage:1,clickable:false});}
      else{thumb.textContent=job.status==='saved'?'Preview unavailable':'Preview pending';}
      const info=document.createElement('div');info.className='proof-history-info';
      for(const [label,value] of [['Customer',job.customer],['Title',job.jobTitle],['Des No',job.designNumber||job.reference],['Date created',job.createdAt?new Date(job.createdAt).toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'}):'—']]){
        const field=document.createElement('div'),name=document.createElement('span'),valueNode=document.createElement('strong');name.textContent=label;valueNode.textContent=value||'—';
        if(label==='Des No'&&/^[1-9]\d{0,9}$/.test(String(value||''))){
          const link=document.createElement('button');link.type='button';link.className='design-folder-link';link.textContent=value;
          link.title=`Open design folder ${value} on the Windows design computer`;link.addEventListener('click',event=>window.openDesignFolder(value,event));valueNode.replaceChildren(link);
        }
        field.append(name,valueNode);
        if(label==='Des No'){
          const references=document.createElement('div');references.className='proof-history-references';
          for(const linkedOrder of job.linkedOrders||[]){
            const jobField=document.createElement('div'),jobLabel=document.createElement('span'),jobValue=document.createElement('strong');
            jobLabel.textContent='Job';
            const id=linkedOrder.sourceOrderId,link=document.createElement('a');link.className='design-folder-link';link.href=`/database-job.html?id=${id}`;link.textContent=linkedOrder.orderNo||id;
            link.addEventListener('click',event=>{if(window.ultimateHubOpenDatabaseOrder){event.preventDefault();window.ultimateHubOpenDatabaseOrder(id,'details');}});
            jobValue.append(link);jobField.append(jobLabel,jobValue);references.append(jobField);
          }
          references.append(field);
          if(job.hasEmbroidery&&job.psgNumbers?.length){
            const psgField=document.createElement('div'),psgLabel=document.createElement('span'),psgValue=document.createElement('strong');
            psgLabel.textContent='PSG No';psgValue.textContent=(job.psgNumbers||[]).join(' / ');
            psgField.append(psgLabel,psgValue);references.append(psgField);
          }
          info.append(references);
        }else info.append(field);
      }
      const alreadyLinked=Boolean(job.sourceOrderId||job.linkedJobs?.length||job.linkedOrders?.length);
      const linkButton=document.createElement('button');linkButton.type='button';linkButton.className='proof-secondary-button proof-history-link-button';linkButton.textContent='Link to job';linkButton.disabled=busy||['save_queued','saving','allocating'].includes(job.status);
      linkButton.addEventListener('click',async()=>{try{const target=await window.ProofLinks.picker('jobs',{customer:job.customer});if(!target)return;if(!await window.ProofLinks.link(job.id,target.source_order_id))return;if(designId===job.id){design=null;designId=null;}await refreshHistory();window.ProofLinks.refresh();}catch(error){historyStatus.textContent=error.message;}});
      const state=document.createElement('div');state.className='proof-history-state';const [label,message]=historyState(job);
      if(message)state.title=reviewMessage(message);

      const actions=document.createElement('div');actions.className='proof-history-actions';
      if(!localPreview&&job.status==='error'&&job.hasPdf){
        const retry=document.createElement('button');retry.type='button';retry.className='proof-secondary-button';retry.textContent='Retry folder save';
        retry.onclick=async()=>{retry.disabled=true;try{await designRequest(`/${job.id}/retry`,{});await refreshHistory();}catch(error){historyStatus.textContent=error.message;}finally{retry.disabled=false;}};actions.append(retry);
      }
      if(job.linkPending){const sync=document.createElement('button');sync.type='button';sync.className='proof-secondary-button';sync.textContent='Retry proof sync';sync.onclick=async()=>{sync.disabled=true;try{await window.ProofLinks.api(`/designs/${job.id}/sync`,{});await refreshHistory();window.ProofLinks.refresh();}catch(error){historyStatus.textContent=error.message;}finally{sync.disabled=false;}};actions.append(sync);}
      if(sandbox){
        const promote=document.createElement('button');promote.type='button';promote.className='proof-primary-button';promote.textContent='ADD TO LIVE';
        promote.disabled=busy||(!job.hasPdf&&!job.liveDesignId);
        promote.addEventListener('click',()=>addTestToLive(job));actions.append(promote);
      }
      if(!sandbox){
      if(standalonePreview&&job.id===designId&&currentPreview?.pdf){const download=action('Download PDF',()=>downloadPdf());download.disabled=busy||dirty||currentPreview.issues.some(i=>i.blocking);actions.append(download);}
      else if(job.hasPdf){const download=document.createElement('a');download.className='proof-secondary-button';download.textContent='Download';download.href=`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/pdf?download=1`;actions.append(download);}
      else{const download=document.createElement('button');download.type='button';download.className='proof-secondary-button';download.textContent='Download';download.disabled=true;download.title='Available after a proof PDF has been generated and retained.';actions.append(download);}
      }
      const regenerate=document.createElement('button');regenerate.type='button';regenerate.className='proof-secondary-button';regenerate.textContent='Regenerate proof';regenerate.disabled=busy||!!job.liveDesignId||['save_queued','saving'].includes(job.status);
      if(job.liveDesignId)regenerate.title='This proof is moving to live. Use ADD TO LIVE to resume.';
      regenerate.addEventListener('click',async()=>{try{if(job.sourceOrderId)await window.ProofLinks.edit(job.sourceOrderId);else await openHistoryProof(job);}catch(error){historyStatus.textContent=error.message;}});actions.append(regenerate);
      if(sandbox){
        const remove=document.createElement('button');remove.type='button';remove.className='proof-secondary-button proof-delete-button';remove.textContent='Delete';remove.disabled=busy||!!job.liveDesignId;
        if(job.liveDesignId)remove.title='Finish adding this proof to live before it leaves this list.';
        remove.addEventListener('click',()=>deleteTestProof(job));actions.append(remove);
      }
      if(!localPreview&&!alreadyLinked)actions.append(linkButton);state.append(actions);
      item.append(thumb,info,state);
      const generating=label==='Pending'||label==='Saving';
      item.classList.toggle('proof-history-generating',generating);
      item.setAttribute('aria-busy',String(generating));
      if(generating){
        for(const content of [thumb,info,state])content.inert=true;
        const spinner=document.createElement('span');spinner.className='proof-history-sweep';spinner.setAttribute('role','status');spinner.setAttribute('aria-label','Generating proof');item.append(spinner);
      }
      historyList.append(item);
    }
  }
  async function openSavedProof(job){
    const previousFocus=document.activeElement,dialog=document.createElement('dialog');dialog.className='proof-fullscreen';dialog.setAttribute('aria-label','Proof preview');
    const bar=document.createElement('div');bar.className='proof-fullscreen-bar';
    const title=document.createElement('strong');title.textContent=[job.designNumber,job.customer,job.jobTitle].filter(Boolean).join(' · ');bar.append(title);
    if(job.hasPdf&&!sandbox){const download=document.createElement('a');download.className='proof-secondary-button';download.textContent='Download PDF';download.href=`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/pdf?download=1`;bar.append(download);}
    const close=document.createElement('button');close.type='button';close.className='proof-secondary-button';close.textContent='Close preview';close.addEventListener('click',()=>dialog.close());bar.append(close);
    const viewer=document.createElement('div');viewer.className='proof-fullscreen-pages';viewer.innerHTML='<div class="workspace-loading" role="status" aria-label="Loading proof"><span class="board-loading-spinner" aria-hidden="true"></span></div>';dialog.append(bar,viewer);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();previousFocus?.focus();});dialog.showModal();close.focus();
    try{
      if(!job.hasPdf){const img=document.createElement('img');img.className='proof-history-large';img.src=`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/preview`;img.alt='Draft proof preview';viewer.replaceChildren(img);return;}
      const response=await proofFetch(`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/pdf`,{cache:'no-store'});
      if(!response.ok)throw new Error('Proof PDF is unavailable.');
      const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;response.blob().then(blob=>reader.readAsDataURL(blob),reject);});
      if(!dialog.isConnected)return;viewer.replaceChildren();await renderDocument(encoded,viewer,[],{clickable:false});
    }catch(error){viewer.textContent=error.message;}
  }
  function confirmAddToLive(deleting=false) {
    return new Promise(resolve=>{
      const previous=document.activeElement,modal=document.createElement('div');
      modal.className='test-dashboard-complete-confirm-modal proof-live-confirm-modal';
      modal.innerHTML=`<div class="test-dashboard-complete-confirm-shell" role="dialog" aria-modal="true" aria-labelledby="proof-live-confirm-title"><div class="test-dashboard-complete-confirm-message" id="proof-live-confirm-title">${deleting?'Delete this proof, are you sure?':'Add this proof to live?'}</div><div class="test-dashboard-complete-confirm-actions"><button class="test-dashboard-complete-confirm-button confirm" type="button">Confirm</button><button class="test-dashboard-complete-confirm-button cancel" type="button">No</button></div></div>`;
      const yes=modal.querySelector('.confirm'),no=modal.querySelector('.cancel');
      const close=value=>{document.removeEventListener('keydown',keys);modal.remove();previous?.focus();resolve(value);};
      const keys=event=>{if(event.key==='Escape'){event.preventDefault();close(false);}if(event.key==='Tab'){event.preventDefault();(document.activeElement===no?yes:no).focus();}};
      yes.onclick=()=>close(true);no.onclick=()=>close(false);modal.onclick=event=>{if(event.target===modal)close(false);};
      document.addEventListener('keydown',keys);document.body.append(modal);no.focus();
    });
  }
  async function deleteTestProof(job) {
    if(busy)return;
    busy=true;
    if(!await confirmAddToLive(true)){busy=false;renderHistory();return;}
    renderHistory();let message='';
    try{
      const response=await proofFetch(`/api/proof-generator/tests/${encodeURIComponent(job.id)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({updatedAt:job.updatedAt})});
      if(!response.ok)throw Error((await proofJson(response)).error||'Could not delete this proof.');
      busy=false;
      if(designId===job.id)startNewProof();
      showProofList();message='Proof deleted.';
    }catch(error){message=error.message;}
    finally{busy=false;await refreshHistory();renderHistory();historyStatus.textContent=message;}
  }
  async function addTestToLive(job) {
    if(busy)return;
    busy=true;
    if(!await confirmAddToLive()){busy=false;renderHistory();return;}
    let finalMessage='';renderHistory();historyStatus.textContent='Preparing live proof…';
    try{
      let form;
      if(!job.liveDesignId){
        const response=await proofFetch(`/api/proof-generator/tests/${job.id}/source`),data=await proofJson(response);
        if(!response.ok)throw Error(data.error||'Test proof source is unavailable.');
        form=new FormData();form.append('updatedAt',job.updatedAt);
        for(const saved of data.artworks){
          const file=new File([Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0))],saved.name,{type:saved.type||''});
          const prepared=await prepareArtworkFile(file,false,{threadColours:saved.threadColours||[]});
          form.append('artworks',prepared,prepared.name);
        }
      }
      const started=Date.now();
      while(Date.now()-started<90000){
        const response=await proofFetch(`/api/proof-generator/tests/${job.id}/promote`,{method:'POST',...(form?{body:form}:{headers:{'Content-Type':'application/json'},body:'{}'})});
        const result=await proofJson(response);if(!response.ok)throw Error(result.error||'Could not add this proof to live.');
        form=null;
        historyStatus.textContent=result.design.designNumber?`Design ${result.design.designNumber}: saving and matching the live proof…`:'Waiting for ARTWORK-PC to allocate the live design number…';
        if(result.complete){finalMessage=`Design ${result.design.designNumber} added to live.`;window.ProofLinks?.refresh();return;}
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      finalMessage='Live migration is still pending. Keep ARTWORK-PC running, then click ADD TO LIVE to resume the same design.';
    }catch(error){finalMessage=error.message;}
    finally{busy=false;await refreshHistory();renderHistory();historyStatus.textContent=finalMessage;}
  }
  async function saveProofSource(){
    if(standalonePreview)return;
    const form=new FormData();form.append('brief',JSON.stringify({proofSourceOrderId:selectedLinkJob?.source_order_id||null,request:request.value,customer:customer.value,jobTitle:jobTitle.value,brief:currentBrief}));
    form.append('artworkDetails',JSON.stringify(artworks.map(item=>({id:item.id,originalName:item.file.name,backgroundMode:item.backgroundMode,threadColours:item.threadColours,threadCodes:item.threadCodes,runoutFilename:item.runoutFilename,assignment:item.assignment,notes:item.notes}))));
    for(const item of artworks)form.append('artworks',item.file,item.file.name);
    const response=await proofFetch(`/api/proof-generator/${historyEndpoint}/${designId}/source`,{method:'POST',body:form});
    if(!response.ok){const data=await proofJson(response);throw new Error(data.error||'Could not retain proof source.');}
    if(sandbox){design=(await proofJson(response)).design;currentBrief.testProofId=designId;currentBrief.reference='SANDBOX';}
  }
  async function openHistoryProof(job){
    if(busy)return;
    if(job.id===designId&&artworks.length&&currentPreview){design=job;showProofEditor();showDesign();setCreating(false);return;}
    startNewProof();selectedLinkJob=job.sourceOrderId?{source_order_id:job.sourceOrderId,order_no:job.linkedOrders?.find(order=>order.sourceOrderId===job.sourceOrderId)?.orderNo}:null;designId=job.id;design=job;try{if(!localPreview)sessionStorage.setItem('proof-design-id',designId);}catch(_){}
    customer.value=job.customer||'';jobTitle.value=job.jobTitle||'';showProofEditor();showDesign();busy=true;setCreating(true);reviewButton.querySelector('[data-proof-button-label]').textContent='Loading previews…';reviewButton.querySelector('.proof-button-spinner').hidden=true;setFeedback('Loading proof…');
    try{
      const response=await proofFetch(`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/source`,{cache:'no-store'});const data=await proofJson(response);
      if(!response.ok)throw new Error(data.error||'Proof source is unavailable.');
      request.value=[data.source.request,data.source.instructions].filter(Boolean).join('\n\n');customer.value=data.source.customer||job.customer||'';jobTitle.value=data.source.jobTitle||job.jobTitle||'';
      for(const saved of data.artworks){
        const file=new File([Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0))],saved.name,{type:saved.type||''});
        const item={id:saved.id,file,assignment:saved.assignment||'',notes:saved.notes||'',backgroundMode:saved.backgroundMode||'auto',threadColours:saved.threadColours||[],threadCodes:saved.threadCodes||[],runoutFilename:saved.runoutFilename||'',url:file.type.startsWith('image/')?URL.createObjectURL(file):''};artworks.push(item);renderArtwork(item);
      }
      currentBrief=data.source.brief;currentPreview=null;dirty=true;
      if(currentBrief){if(sandbox){delete currentBrief.proofDesignId;delete currentBrief.proofSourceOrderId;delete currentBrief.proofRevision;currentBrief.testProofId=job.id;}else{currentBrief.proofSourceOrderId=job.sourceOrderId||null;currentBrief.proofRevision=job.revision;currentBrief.proofDesignId=job.id;}renderEditor();
        if(job.hasPreview){
          const savedPreview=document.createElement('img');savedPreview.className='proof-history-large';savedPreview.alt='Previously saved proof';savedPreview.src=`/api/proof-generator/${historyEndpoint}/${encodeURIComponent(job.id)}/preview?v=${encodeURIComponent(job.updatedAt||job.revision)}`;
          results.append(savedPreview);
        }
      }
      if(currentBrief)await loadPlacementPreview();
      setFeedback('');
    }catch(error){setFeedback(error.message,true);}
    finally{busy=false;setCreating(false);renderHistory();}
  }
  async function loadPlacementPreview() {
    const target=currentBrief;
    const response=await proofFetch('/api/proof-generator/placement-preview',{method:'POST',body:await uploadForm(target)});
    const payload=await proofJson(response);
    if(!response.ok)throw new Error(payload.error||'Could not load artwork adjustment.');
    if(currentBrief!==target)return;
    currentBrief=payload.brief;currentPreview=payload;
    await renderEditor();
  }
  async function recordProgress(state,message=progressMessage,metadata={}){
    const id=designId;if(!id)return;
    if(localPreview){design={...design,generationStatus:state,generationMessage:message};renderHistory();return;}
    const pending=progressChain.then(async()=>{
      const updated=await designRequest(`/${id}/progress`,{state,message,...metadata});
      if(designId===id){design=updated;renderHistory();}
    });
    progressChain=pending.catch(()=>{});return pending;
  }
  function sourceChanged() {
    currentBrief = null; currentPreview = null; dirty = true;
    results.querySelectorAll('button').forEach(button => { button.disabled = true; });
    setFeedback(`Request changed. ${designId?'Regenerate':'Create'} the proof to apply it.`);
  }
  request.addEventListener('input', sourceChanged);
  function metadataChanged(){
    if(currentBrief){currentBrief.customer=customer.value;currentBrief.jobTitle=jobTitle.value;markDirty(false);setFeedback('Details changed. Regenerate proof to save the updated names.');}
    else sourceChanged();
  }
  const customerResults=root.querySelector('#proof-customer-results');
  const customerStatus=root.querySelector('#proof-customer-status');
  let customerSearchTimer,customerSearchController,customerSearchVersion=0;
  function clearCustomerSearch(){
    clearTimeout(customerSearchTimer);customerSearchController?.abort();customerSearchVersion++;
    customerResults.replaceChildren();customerStatus.textContent='';
  }
  customer.addEventListener('input',()=>{
    clearCustomerSearch();const query=customer.value.trim(),version=customerSearchVersion;
    if(!query||standalonePreview)return;
    customerStatus.textContent='Searching customers…';
    customerSearchTimer=setTimeout(async()=>{
      const controller=new AbortController();customerSearchController=controller;
      try{
        const response=await fetch(`/api/database/customers/search?q=${encodeURIComponent(query)}`,{signal:controller.signal,cache:'no-store'});
        const matches=await response.json();if(version!==customerSearchVersion)return;
        if(!response.ok)throw new Error('Customer search unavailable. You can still enter the customer name manually.');
        customerStatus.textContent=matches.length?(matches.length===20?'Showing the first 20 matches. Keep typing to narrow the list.':''):'No matching customers. You can use the name you entered.';
        for(const match of matches){
          const button=document.createElement('button');button.type='button';button.className='proof-search-result';
          const name=document.createElement('strong');name.textContent=match.business_name;button.append(name);
          button.addEventListener('click',()=>{customer.value=match.business_name;clearCustomerSearch();metadataChanged();customer.focus();});
          customerResults.append(button);
        }
      }catch(error){if(version===customerSearchVersion&&error.name!=='AbortError')customerStatus.textContent='Customer search unavailable. You can still enter the customer name manually.';}
    },250);
  });
  root.addEventListener('pointerdown',event=>{if(!event.target.closest('.proof-customer-picker'))clearCustomerSearch();});
  customer.addEventListener('keydown',event=>{
    if(event.key==='Escape')clearCustomerSearch();
    if(event.key==='ArrowDown'){const first=customerResults.querySelector('button');if(first){event.preventDefault();first.focus();}}
  });
  customer.addEventListener('input',metadataChanged);jobTitle.addEventListener('input',metadataChanged);
  function showDesign(){
    showJobSelection();
    editorToolbar.append(reviewButton);
    retrySave.hidden=localPreview||!designId||design?.status!=='error';
    designStatus.textContent=sandbox?'':design?.designNumber?`Design ${design.designNumber} · ${design.folderName||'Preparing folder'}${design.status==='saved'?' · Saved':design.status==='error'?' · Save needs attention':''}`:designId?'Waiting for ARTWORK-PC to allocate the design folder.':'';
    if(!busy)reviewButton.querySelector('[data-proof-button-label]').textContent=designId?'Regenerate proof':'Create proof';
  }
  async function designRequest(path,body){
    const response=await proofFetch(`/api/proof-generator/designs${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
    const data=await proofJson(response);if(!response.ok)throw new Error(data.error||'Design folder request failed.');return data.design;
  }
  async function awaitDesign(saved=false){
    const id=designId,started=Date.now();
    while(Date.now()-started<90000){
      if(id!==designId)return;
      design=await designRequest(`/${id}`);showDesign();
      if(saved&&design.status==='saved'){try{const synced=await window.ProofLinks.api(`/designs/${id}/sync`,{});design=synced.design;if(design.sourceOrderId)selectedLinkJob={source_order_id:design.sourceOrderId,order_no:design.linkedOrders?.find(order=>order.sourceOrderId===design.sourceOrderId)?.orderNo};window.ProofLinks.refresh();}catch(error){throw new Error('Proof saved, but Dashboard sync needs attention: '+error.message);}}
      if(design.status==='error')throw new Error(design.message||'The design folder needs attention.');
      if(saved?design.status==='saved':!!(design.designNumber&&design.folderName))return;
      setFeedback(saved?'Waiting for ARTWORK-PC to save the proof…':'Waiting for ARTWORK-PC to reserve the next design number…');
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    throw new Error('ARTWORK-PC has not finished the folder/save request. Keep its updated print worker running, then use Retry folder/save. This proof keeps its reserved identity.');
  }
  async function reserveDesign(brief){
    if(localPreview)return;
    if(!designId){designId=crypto.randomUUID();try{if(!localPreview)sessionStorage.setItem('proof-design-id',designId);}catch(_){}showDesign();}
    design=await designRequest('',{id:designId,customer:brief.customer,jobTitle:brief.jobTitle,...jobReservation()});
    if(design.status==='error')design=await designRequest(`/${designId}/retry`,{});
    await awaitDesign();
    if(['save_queued','saving'].includes(design.status))await awaitDesign(true);
    brief.proofSourceOrderId=selectedLinkJob?.source_order_id||null;brief.proofDesignId=design.id;brief.reference=design.designNumber;brief.proofRevision=design.revision;
  }
  function startNewProof(){
    if(busy)return;selectedLinkJob=null;design=null;designId=null;try{if(!localPreview)sessionStorage.removeItem('proof-design-id');}catch(_){}
    ++officeRequest;officeSearch.value='';officeStatus.textContent='';existingReference.replaceChildren();showJobSelection();
    request.value='';customer.value='';clearCustomerSearch();jobTitle.value='';
    for(const art of artworks)if(art.url)URL.revokeObjectURL(art.url);artworks.length=0;artworksNode.replaceChildren();
    resetProductPicker();productQuery.value='';productResults.replaceChildren();productStatus.textContent='';
    sourceChanged();results.replaceChildren();showDesign();setFeedback('Enter a new proof request.');request.focus();
  }
  retrySave.addEventListener('click',async()=>{
    if(busy||!designId)return;busy=true;retrySave.disabled=true;
    try{design=await designRequest(`/${designId}/retry`,{});if(!['save_queued','saving'].includes(design.status))await awaitDesign();showDesign();setFeedback(design.status==='saved'?'Proof saved in DESIGN FILES.':'Design folder ready. Regenerate the proof to continue.');}
    catch(error){setFeedback(error.message,true);}finally{busy=false;retrySave.disabled=false;showDesign();}
  });
  if(designId&&!localPreview){const restoringId=designId;designRequest(`/${restoringId}`).then(value=>{if(designId!==restoringId)return;design=value;showDesign();}).catch(()=>{showDesign();});}

  const productQuery=root.querySelector('#proof-product-query');
  const productResults=root.querySelector('#proof-product-results');
  const productStatus=root.querySelector('#proof-product-status');
  const productColour=root.querySelector('#proof-product-colour');
  let selectedProduct=null;
  function resetProductPicker(){
    selectedProduct=null;productColour.replaceChildren(new Option('Select a product first',''));productColour.disabled=true;
  }
  productColour.addEventListener('change',()=>{
    if(busy||!selectedProduct||!productColour.value)return;
    const lines=request.value.split('\n'),index=lines.lastIndexOf(selectedProduct.line);
    if(index<0){productStatus.textContent='The product line has been edited. Select the product again to add its colour.';return;}
    const line=`${selectedProduct.title}, ${colourName(productColour.value)}`;lines[index]=line;
    const updated=lines.join('\n');
    if(updated.length>request.maxLength){productStatus.textContent='The request is full. Shorten it before adding the colour.';return;}
    request.value=updated;selectedProduct.line=line;sourceChanged();productStatus.textContent='';
  });
  let searchTimer, searchController, searchVersion=0;
  productQuery.addEventListener('input',()=>{
    clearTimeout(searchTimer);searchController?.abort();const version=++searchVersion;
    productResults.replaceChildren();resetProductPicker();
    const query=productQuery.value.trim();
    if(!/^[a-z0-9-]{2,24}$/i.test(query)){productStatus.textContent='';return;}
    productStatus.textContent='Searching catalogue…';
    searchTimer=setTimeout(async()=>{
      const controller=new AbortController();searchController=controller;
      try{
        const response=await proofFetch(`/api/proof-generator/products?q=${encodeURIComponent(query)}`,{signal:controller.signal});
        const data=await proofJson(response);
        if(version!==searchVersion)return;
        if(!response.ok)throw new Error(data.error || 'Catalogue search is unavailable.');
        productStatus.textContent=data.products.length?'':'No matching products.';
        for(const product of data.products){
          const button=document.createElement('button');button.type='button';button.className='proof-search-result';
          const title=document.createElement('strong');title.textContent=`${product.code} — ${colourName(product.name)}`;
          const detail=document.createElement('span');detail.textContent=[product.brand,product.supplier==='pencarrie'?'PenCarrie':'Ralawise'].filter(Boolean).join(' · ');button.append(title,detail);
          button.addEventListener('click',()=>{
            const line=`${product.code} - ${colourName(product.name)} (${product.supplier==='pencarrie'?'PenCarrie':'Ralawise'})`.trim();
            const updated=request.value+(request.value&&!request.value.endsWith('\n')?'\n':'')+line;
            if(updated.length>request.maxLength){productStatus.textContent='The request is full. Shorten it before adding another product.';return;}
            request.value=updated;sourceChanged();request.focus();request.setSelectionRange(updated.length,updated.length);
            selectedProduct={title:line,line};productQuery.value=product.code;
            productColour.replaceChildren(new Option('Select a colour',''));
            for(const colour of [...new Set(product.colours||[])])productColour.append(new Option(colourName(colour),colour));
            productColour.disabled=productColour.options.length<2;
            productResults.replaceChildren();productStatus.textContent=productColour.disabled?'No active catalogue colours available.':'';
            if(!productColour.disabled)productColour.focus({preventScroll:true});
          });
          productResults.append(button);
        }
      }catch(error){if(version===searchVersion&&error.name!=='AbortError')productStatus.textContent=error.message;}
    },250);
  });

  dropzone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
  }
  dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  reviewButton.addEventListener('click', () => reviewBrief([]));

  async function addFiles(files) {
    if(busy)return;
    const {pairRunoutFiles}=await import('/proof-thread-swatches.mjs');
    if(busy)return;
    for (const {file,runout} of pairRunoutFiles(Array.from(files || []))) {
      if (artworks.length >= 20) { setFeedback('Add no more than 20 artwork files.', true); break; }
      if (!/\.(png|jpe?g|webp|svg|pdf|eps|ai|ttf|otf|pxf|dst)$/i.test(file.name)) { setFeedback(`Unsupported file: ${file.name}`, true); continue; }
      const item = { id: crypto.randomUUID(), backgroundMode: 'auto', file, pendingRunout:runout, assignment: '', notes: '', url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' };
      if (file.size > 10 * 1024 * 1024) { setFeedback('Each artwork must be no larger than 10 MB.', true); continue; }
      sourceChanged();
      artworks.push(item);
      renderArtwork(item);
    }
  }

  function renderArtwork(item) {
    const card = document.createElement('div');
    card.className = 'proof-artwork-card';
    const thumb = document.createElement('div');
    thumb.className = 'proof-artwork-thumb';
    if (/\.(svg|eps|pxf)$/i.test(item.file.name)) {
      prepareArtworkFile(item.file).then(file=>{
        if(!card.isConnected)return;
        if(item.url)URL.revokeObjectURL(item.url);
        item.url=URL.createObjectURL(file);
        const image=document.createElement('img');image.src=item.url;image.alt='';thumb.replaceChildren(image);
      }).catch(error=>{thumb.textContent=item.file.name.split('.').pop().toUpperCase();setFeedback(error.message,true);});
    } else if (item.url) {
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = '';
      thumb.append(image);
    } else {
      thumb.textContent = item.file.name.split('.').pop().toUpperCase();
      if(/\.(pdf|ai)$/i.test(item.file.name))renderArtworkThumbnail(item.file,thumb);
    }
    const body = document.createElement('div');
    body.className = 'proof-artwork-fields';
    const title = document.createElement('div');
    title.className = 'proof-artwork-title';
    const name = document.createElement('strong');
    name.textContent = item.file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'proof-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${item.file.name}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => {
      if (busy) return;
      const index = artworks.indexOf(item);
      if (index === -1) return;
      artworks.splice(index, 1);
      if (item.url) URL.revokeObjectURL(item.url);
      card.remove();
      sourceChanged();
    });
    title.append(name, remove);
    const fileType = document.createElement('span');
    fileType.className = 'proof-artwork-type';
    fileType.textContent = item.file.name.split('.').pop().toUpperCase();
    body.append(title);
    if(!/\.dst$/i.test(item.file.name))body.append(fileType);
    if (/\.(pxf|dst)$/i.test(item.file.name)) {
      const status=document.createElement('p');body.append(status);
      const refresh=async()=>{
        const prepared=await prepareArtworkFile(item.file);
        if(!card.isConnected)return;
        if(item.url)URL.revokeObjectURL(item.url);
        item.url=URL.createObjectURL(prepared);
        const image=document.createElement('img');image.src=item.url;image.alt='Embroidery preview';thumb.replaceChildren(image);
      };
      if(/\.pxf$/i.test(item.file.name)){
        status.textContent='Saved PXF preview; specify embroidery width in the request. Small previews retain their original detail.';
        const label=document.createElement('label');label.className='proof-control';label.textContent='Preview background';
        const select=document.createElement('select');
        for(const [value,text] of [['auto','Keep saved background'],['white','Remove white edge background']])select.add(new Option(text,value));
        select.value=item.backgroundMode;select.onchange=()=>{item.backgroundMode=select.value;if(currentBrief)markDirty(false);else sourceChanged();};label.append(select);body.append(label);
      }else{
        import('/proof-embroidery.mjs').then(async module=>{
          const design=module.parseDst(await item.file.arrayBuffer());if(!card.isConnected)return;
          status.hidden=true;
          if(design.colourChanges>=100)throw Error('Proof embroidery supports up to 100 thread colour blocks.');
          const saved=item.threadColours||[];
          item.threadColours=Array.from({length:design.colourChanges+1},(_,i)=>saved[i]||'');
          const {groupThreadSwatches,applyThreadSwatch}=await import('/proof-thread-swatches.mjs');
          if(!card.isConnected)return;
          const threadGrid=document.createElement('div');threadGrid.className='proof-thread-grid';body.append(threadGrid);
          const renderThreads=()=>{
            threadGrid.replaceChildren();
            groupThreadSwatches(item.threadColours,item.threadCodes||[]).forEach((group,order)=>{
              const label=document.createElement('div');label.className='proof-thread-cell';
              const caption=document.createElement('label');caption.textContent=`Thread ${order+1}${group.codes.length?' · '+group.codes.join(' / '):''}`;
              const input=document.createElement('input');input.type='color';input.value=group.colour||'#ffffff';input.disabled=busy;input.id=`proof-thread-${item.id}-${order}`;caption.htmlFor=input.id;input.setAttribute('aria-label',caption.textContent+' colour');
              const change=()=>{
                if(busy)return;
                applyThreadSwatch(item.threadColours,group.indices,input.value);
                // A manual colour edit no longer represents the imported thread catalogue number.
                if(input.value.toLowerCase()!==String(group.colour||'').toLowerCase()){
                  group.indices.forEach(index=>{if(item.threadCodes)item.threadCodes[index]='';});
                  caption.textContent=`Thread ${order+1}`;
                }
                if(currentBrief)markDirty(false);else sourceChanged();
                if(item.threadColours.every(Boolean))refresh().catch(error=>setFeedback(error.message,true));
              };
              input.addEventListener('input',change);input.addEventListener('change',()=>{change();renderThreads();});
              label.append(caption,input);threadGrid.append(label);
            });
          };
          renderThreads();
          const runoutBox=document.createElement('div');runoutBox.className='proof-runout-upload';
          const runoutButton=document.createElement('button');runoutButton.type='button';runoutButton.className='proof-dropzone proof-runout-dropzone';runoutButton.disabled=busy;
          runoutButton.innerHTML='<span class="proof-upload-icon" aria-hidden="true">↥</span><strong>Upload run off sheet</strong><span>Choose or drop a PDF</span>';
          const showRunoutFile=()=>{
            if(!item.runoutFilename)return;
            runoutButton.replaceChildren();
            const icon=document.createElement('span');icon.className='proof-pdf-icon';icon.setAttribute('aria-hidden','true');icon.textContent='PDF';
            const filename=document.createElement('strong');filename.textContent=item.runoutFilename;filename.title=item.runoutFilename;
            const hint=document.createElement('span');hint.textContent='Choose or drop to replace';
            runoutButton.append(icon,filename,hint);runoutButton.setAttribute('aria-label',`Run off sheet ${item.runoutFilename}. Choose or drop a PDF to replace.`);
          };
          showRunoutFile();
          const runoutInput=document.createElement('input');runoutInput.type='file';runoutInput.accept='.pdf,application/pdf';runoutInput.disabled=busy;runoutInput.hidden=true;
          const runoutStatus=document.createElement('p');runoutStatus.className='proof-runout-status';runoutStatus.setAttribute('role','status');
          let runoutVersion=0;
          const readRunout=async(file)=>{
            if(!file||busy)return;
            const token=++runoutVersion,previous=[...item.threadColours];runoutStatus.textContent='Reading run off sheet…';
            try{
              const {readRunoutPdf}=await import('/proof-runout.mjs');
              const blocks=await readRunoutPdf(file,item.threadColours.length,item.file.name);
              if(!card.isConnected||token!==runoutVersion)return;
              if(busy||item.threadColours.some((c,i)=>c!==previous[i]))throw Error('Thread colours changed while reading. Upload the run off sheet again to apply it.');
              item.threadColours=blocks.map(b=>b.colour);item.threadCodes=blocks.map(b=>b.code||'');item.runoutFilename=file.name;showRunoutFile();
              renderThreads();
              if(currentBrief)markDirty(false);else sourceChanged();
              runoutStatus.textContent='';
              await refresh();
            }catch(error){if(card.isConnected&&token===runoutVersion)runoutStatus.textContent=error.message;}
            finally{if(token===runoutVersion)runoutInput.value='';}
          };
          runoutButton.addEventListener('click',()=>{if(!busy)runoutInput.click();});
          runoutInput.addEventListener('change',()=>readRunout(runoutInput.files[0]));
          for(const eventName of ['dragenter','dragover'])runoutButton.addEventListener(eventName,event=>{event.preventDefault();event.stopPropagation();if(!busy)runoutButton.classList.add('dragging');});
          for(const eventName of ['dragleave','drop'])runoutButton.addEventListener(eventName,event=>{event.preventDefault();event.stopPropagation();runoutButton.classList.remove('dragging');});
          runoutButton.addEventListener('drop',event=>{
            if(busy)return;
            const files=event.dataTransfer.files;
            if(files.length!==1){runoutStatus.textContent='Choose one run off PDF.';return;}
            readRunout(files[0]);
          });
          runoutBox.append(runoutButton,runoutInput);
          const media=document.createElement('div');media.className='proof-dst-media';media.append(thumb,runoutBox);
          card.classList.add('proof-dst-artwork');body.insertBefore(media,status);body.insertBefore(runoutStatus,threadGrid);
          if(item.pendingRunout){const file=item.pendingRunout;delete item.pendingRunout;await readRunout(file);}
          else if(item.threadColours.every(Boolean))await refresh();
        }).catch(error=>{status.hidden=false;status.textContent=error.message;setFeedback(error.message,true);});
      }
    }
    card.append(thumb, body);
    artworksNode.append(card);
  }

  async function renderArtworkThumbnail(file,thumb){
    try{
      const pdfjs=await import('/api/proof-generator/renderer/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/api/proof-generator/renderer/pdf.worker.mjs';
      const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
      try{
        const page=await doc.getPage(1),base=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:156/Math.max(base.width,base.height)});
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgba(0,0,0,0)'}).promise;
        const image=document.createElement('img');image.alt='';image.src=canvas.toDataURL();thumb.replaceChildren(image);
      }finally{await doc.destroy();}
    }catch(_){/* Keep the filetype tile for files without a supported preview. */}
  }

  function setFeedback(message, error = false) {
    const loading = !error && /^Loading\b/.test(message);
    placementLoading.hidden = !loading;
    feedback.textContent = loading ? '' : message;
    feedback.hidden=loading || (Boolean(designId)&&!error);
    feedback.classList.toggle('error', error);
    progressMessage=message;progressError=error;if(!historyScreen.hidden)renderHistory();
  }

  function setCreating(creating) {
    reviewButton.disabled = creating || (!localPreview&&['save_queued','saving'].includes(design?.status));
    reviewButton.setAttribute('aria-busy', String(creating));
    reviewButton.querySelector('.proof-button-spinner').hidden = !creating;
    reviewButton.querySelector('[data-proof-button-label]').textContent = creating ? (designId?'Regenerating proof…':'Creating proof…') : designId?'Regenerate proof':'Create proof';
    retrySave.disabled=creating;createNew.disabled=creating;
    editorScreen.querySelectorAll('input,textarea,select,#proof-dropzone,.proof-runout-dropzone,.proof-remove').forEach(control=>{control.disabled=creating;});
    productColour.disabled=creating||!selectedProduct||productColour.options.length<2;
    showJobSelection();
  }

  // Parsing and preflight never allocate a folder, clear approval or generate garment views.
  async function preflightBrief() {
    busy=true;setCreating(true);
    try{
      const submittedSource=JSON.stringify([request.value,customer.value,jobTitle.value,artworks.map(a=>[a.id,a.file.name,a.assignment,a.notes])]);
      const unchanged=()=>submittedSource===JSON.stringify([request.value,customer.value,jobTitle.value,artworks.map(a=>[a.id,a.file.name,a.assignment,a.notes])]);
      setFeedback('Checking all proof details before generation…');
      const prepared=await Promise.allSettled(artworks.map(a=>prepareArtworkFile(a.file,true)));
      const failures=prepared.flatMap((r,i)=>r.status==='rejected'?[`${artworks[i].file.name}: ${r.reason.message}`]:[]);
      if(failures.length){setFeedback(failures.join(' '),true);return false;}
      if(!currentBrief){
        const parseForm=await uploadForm({preflight:true,customer:customer.value,jobTitle:jobTitle.value,requestText:request.value,
          artworks:artworks.map(({id,file,assignment,notes,dstSize})=>({id,fileName:file.name,assignment,notes,dstSize})),answers:[]},false,true);
        const response=await proofFetch('/api/proof-generator/parse',{method:'POST',body:parseForm}),payload=await proofJson(response);
        if(!response.ok)throw Error(payload.error||'Could not read the brief.');
        if(!unchanged())throw Error('The request changed during review. Check the details again.');
        currentBrief=payload.brief;currentPreview=null;dirty=true;
      }
      currentBrief.preflightRequest=request.value;
      const response=await proofFetch('/api/proof-generator/preflight',{method:'POST',body:await uploadForm(currentBrief,false,true)}),payload=await proofJson(response);
      if(!response.ok)throw Error(payload.error||'Could not check the brief.');
      if(!unchanged())throw Error('The request changed during review. Check the details again.');
      currentBrief=payload.brief;
      if(!payload.ready){renderPreflight(payload.issues);setFeedback('Resolve the details below together, then create the proof. Nothing has been allocated or generated.',true);return false;}
      return true;
    }catch(error){setFeedback(error.message,true);return false;}
    finally{busy=false;setCreating(false);}
  }

  function renderPreflight(issues){
    results.className='proof-results proof-editor';results.replaceChildren();
    const title=document.createElement('h3');title.textContent='Confirm proof details';results.append(title);
    for(const issue of issues){
      const label=document.createElement('label');label.className='proof-control proof-missing-detail';label.textContent=issue.message.replace('confirm artwork width or height in mm; one axis is sufficient.','Artwork size needed (mm).').replace('specify the decoration method.','Print or embroidery type needed.');
      if(issue.ack){
        const input=document.createElement('input');input.type='checkbox';input.addEventListener('change',()=>{currentBrief.preflightAcknowledgements=(currentBrief.preflightAcknowledgements||[]).filter(k=>k!==issue.ack);if(input.checked)currentBrief.preflightAcknowledgements.push(issue.ack);});label.append(input);
      }else if(/^products\.\d+\.(code|colour|decorations\.\d+\.(position|method|widthMm|artworkId|fontArtworkId|textColour))$/.test(issue.path)){
        const keys=issue.path.split('.'),field=keys.pop();let target=currentBrief;for(const key of keys)target=target[key];
        const input=document.createElement(issue.options?.length?'select':'input');
        if(issue.options?.length){const blank=document.createElement('option');blank.value='';blank.textContent='Choose…';input.append(blank);for(const option of issue.options){const o=document.createElement('option');o.value=typeof option==='string'?option:option.value;o.textContent=typeof option==='string'?option:option.label;input.append(o);}}
        input.value=target[field]||'';
        if(field==='widthMm')input.placeholder='Width in mm';
        input.addEventListener('change',()=>{target[field]=input.value;if(field==='widthMm'){target.heightMm='';target.dimensionIssues=[];target.dimensionSource='user-confirmed';delete target.manualScale;}if(field==='artworkId'){target.text='';}dirty=true;currentPreview=null;});label.append(input);
        if(field==='widthMm'){
          const height=document.createElement('input');height.placeholder='Or height in mm';height.value=target.heightMm||'';
          height.addEventListener('change',()=>{target.heightMm=height.value;target.widthMm='';input.value='';target.dimensionIssues=[];target.dimensionSource='user-confirmed';delete target.manualScale;dirty=true;currentPreview=null;});
          input.addEventListener('change',()=>{height.value='';});label.append(height);
        }
      }
      results.append(label);
    }
    results.scrollIntoView({block:'nearest',behavior:'smooth'});
  }

  let readyThisRun = false;
  async function reviewBrief() {
    if (busy) return;
    if(!localPreview&&['save_queued','saving'].includes(design?.status)){setFeedback('This proof is still saving to its design folder. You can view or download it now.',true);return;}
    if(selectedLinkJob?.designRefs?.length&&!existingReference.value&&!designId){setFeedback('Select the design reference for this job.',true);existingReference.focus();return;}
    if (!request.value.trim()) { request.focus(); setFeedback('Enter the proof request first.', true); return; }
    if (!artworks.length) { setFeedback('Attach artwork first so each decoration can be assigned to a file.', true); return; }
    const returningToList=Boolean(designId);
    if(returningToList){busy=true;setCreating(true);showProofList(false);}
    if(!await preflightBrief()){
      if(returningToList){busy=false;setCreating(false);showProofEditor();renderHistory();}
      return;
    }
    if(!localPreview&&design?.sourceOrderId){
      busy=true;setCreating(true);
      try{if(!await window.ProofLinks.beginRegeneration(design.sourceOrderId,designId)){if(returningToList)showProofEditor();return;}}
      catch(error){if(returningToList)showProofEditor();setFeedback(error.message,true);return;}
      finally{busy=false;setCreating(false);}
    }
    busy = true; generatingProof = true; readyThisRun = false; setCreating(true);
    if(!designId){designId=crypto.randomUUID();try{if(!localPreview)sessionStorage.setItem('proof-design-id',designId);}catch(_){} }
    design={...design,id:designId,customer:customer.value,jobTitle:jobTitle.value,createdAt:design?.createdAt||new Date().toISOString(),generationStatus:'generating'};
    if(!returningToList)showProofList();
    setFeedback('Preparing the confirmed proof…');
    try {
      design=localPreview?{id:designId,customer:customer.value,jobTitle:jobTitle.value,status:'folder_ready',createdAt:new Date().toISOString()}:await designRequest('',{id:designId,customer:customer.value,jobTitle:jobTitle.value,deferAllocation:true,...jobReservation()});
      if(!localPreview&&selectedLinkJob&&!design.linkedJobs?.includes(selectedLinkJob.source_order_id)){
        const linked=await window.ProofLinks.api(`/designs/${designId}/link`,{sourceOrderId:selectedLinkJob.source_order_id});design=linked.design;
      }
      await recordProgress('generating','Preparing artwork…');
      setFeedback('Preparing artwork…');
      await Promise.all(artworks.map(item=>prepareArtworkFile(item.file)));
      await saveProofSource();
      // Allocation only changes this copy; view preparation may replace currentBrief.
      const numberedBrief={...currentBrief};
      const preparation=await Promise.allSettled([reserveDesign(numberedBrief),prepareMissingViews()]);
      const failed=preparation.find(result=>result.status==='rejected');if(failed)throw failed.reason;
      if(!localPreview)for(const key of ['proofSourceOrderId','proofDesignId','reference','proofRevision'])currentBrief[key]=numberedBrief[key];
      await updatePreview(true,true,true);
      if(!readyThisRun)await recordProgress(currentPreview?.issues.some(issue=>issue.blocking)?'review':'complete');
      if(localPreview){design.status='saved';if(sandbox){design.hasPdf=!currentPreview?.issues.some(issue=>issue.blocking);design.hasPreview=true;design.reference='SANDBOX';setFeedback('Proof saved.');}}
    } catch(error) {
      if(readyThisRun){
        design={...design,generationStatus:'complete',generationMessage:''};
        setFeedback(`Proof ${design.designNumber} is ready. Folder saving continues in the background; refresh history for its status.`);
        return;
      }
      if(design)design={...design,generationStatus:'error',generationMessage:error.message};
      setFeedback(error.message, true);try{await recordProgress('error',error.message);}catch(_){}
    }
    finally { generatingProof = false; busy = false; setCreating(false);renderHistory();refreshHistory(); }
  }

  async function uploadForm(brief,includeOriginals=false,preflight=false) {
    const form = new FormData();
    form.append('brief', JSON.stringify(brief));
    form.append('artworkDetails', JSON.stringify(artworks.map(({id,file,assignment,notes,backgroundMode,threadColours,threadCodes,runoutFilename})=>({id,originalName:file.name,assignment,notes,backgroundMode,threadColours,threadCodes,runoutFilename}))));
    for (const item of artworks) {
      const file = await prepareArtworkFile(item.file,preflight);
      form.append('artworks', file, file.name);
      if(includeOriginals)form.append('originalArtworks',item.file,item.file.name);
    }
    return form;
  }

  async function updatePreview(loadSaved = true,save = true,viewsPrepared = false) {
    if (!currentBrief) return;
    if(sandbox&&save&&designId&&!generatingProof)await saveProofSource();
    if(loadSaved&&!viewsPrepared)await prepareMissingViews();
    if (!currentBrief) return;
    const productionSave=save&&!localPreview&&!!designId;
    // Legacy local calibration templates need a measuring preview before committing.
    let checkCalibration=false;
    if(loadSaved)try{checkCalibration=Object.keys(localStorage).some(key=>currentBrief.products.some(p=>key.startsWith(`proof-calibration-v1:${p.code}:${p.colour}:`)));}catch(_){}
    const commit=productionSave&&!checkCalibration;
    if(commit){currentBrief.proofSourceOrderId=selectedLinkJob?.source_order_id||null;currentBrief.proofSaveKey=crypto.randomUUID();currentBrief.proofRevision=design.revision;}
    const snapshot = JSON.stringify(currentBrief);
    const targetBrief = currentBrief;
    const requestFiles = artworks.map(a=>a.id).join(',');
    setFeedback('Measuring visible artwork and preparing garment views…');
    const response = await proofFetch(`/api/proof-generator/${commit?'generate':'preview'}`, {method:'POST',body:await uploadForm(targetBrief,commit)});
    const payload = await proofJson(response);
    if (!response.ok) throw new Error(payload.error || 'Could not prepare the preview.');
    if (targetBrief !== currentBrief || snapshot !== JSON.stringify(currentBrief) || requestFiles !== artworks.map(a=>a.id).join(',')) return;
    currentBrief = payload.brief; currentPreview = payload;
    if(checkCalibration){
      let loaded=false;
      for(const page of payload.pages){
        const product=currentBrief.products[page.productIndex];
        if(Object.keys(product.calibrations?.[page.view] || {}).some(key=>key!=='sourceHash'))continue;
        try{
          const saved=localStorage.getItem(`proof-calibration-v1:${product.code}:${product.colour}:${page.view}:${page.sourceHash}`);
          if(saved){product.calibrations||={};product.calibrations[page.view]=JSON.parse(saved);loaded=true;}
        }catch(_) { /* A corrupt or unavailable local template must not block automatic proofs. */ }
      }
      if(loaded||productionSave)return updatePreview(false,save,true);
    }
    if(commit){
      design=payload.design;readyThisRun=true;generatingProof=false;
      currentBrief.proofRevision=design.revision;showDesign();
      setFeedback(`Proof ${design.designNumber} is ready. Saving to design folder in the background…`);
    }
    dirty = false;
    renderEditor();
    const hasGarment = payload.pages.some(page => page.image);
    const blockers=payload.issues.filter(issue=>issue.blocking);
    setFeedback(blockers.length?blockers.map(issue=>[currentBrief.products[issue.productIndex]?.code,issue.message].filter(Boolean).join(': ')).filter((text,index,all)=>all.indexOf(text)===index).join(' '):!hasGarment?'No garment preview is available.':'Preview ready.');

  }

  async function prepareMissingViews() {
    const target = currentBrief;
    const snapshot = JSON.stringify(target);
    setFeedback('Loading garment views and checking for missing angles…');
    const response = await proofFetch('/api/proof-generator/views', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brief:target})});
    const task = await proofJson(response);
    if(!response.ok)throw new Error(task.error || 'Could not prepare garment views.');
    const started = Date.now();
    while(Date.now()-started<40*60*1000){
      if(currentBrief!==target || JSON.stringify(target)!==snapshot)return;
      await new Promise(resolve=>setTimeout(resolve,2000));
      const poll = await proofFetch(`/api/proof-generator/views/${encodeURIComponent(task.jobId)}`,{cache:'no-store'});
      const job = await proofJson(poll);
      if(!poll.ok || job.state==='failed')throw new Error(job.error || 'Could not prepare garment views.');
      if(currentBrief!==target || JSON.stringify(target)!==snapshot)return;
      setFeedback(job.message || 'Generating missing garment views…');
      if(job.state==='complete'){currentBrief=job.brief;return;}
    }
    throw new Error('Garment view preparation is taking longer than expected. Create the proof again to reuse completed views.');
  }

  function markDirty(showFeedback = true) {
    dirty = true;
    results.querySelectorAll('[data-download]').forEach(button=>{button.disabled=true;});
    if(showFeedback)setFeedback('Proof changed. Regenerate proof to save your edits.');
  }

  function inputField(label, value, change, {min, max, step='any'} = {}) {
    const node=document.createElement('label'); node.className='proof-control'; node.textContent=label;
    const control=document.createElement('input'); control.type='number'; control.step=step;
    if(min!=null)control.min=min;if(max!=null)control.max=max;
    control.value=value == null?'':value;
    control.addEventListener('input',()=>{change(control.value);markDirty();});
    node.append(control); return node;
  }
  function selectField(label, options, value, change) {
    const node=document.createElement('label'); node.className='proof-control'; node.textContent=label;
    const select=document.createElement('select');
    for(const [id,name] of options){const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);}
    select.value=value || '';
    select.addEventListener('change',()=>{change(select.value);markDirty();});
    node.append(select);return node;
  }
  function action(label, fn, className='proof-secondary-button') {
    const button=document.createElement('button');button.type='button';button.className=className;button.textContent=label;
    button.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;button.disabled=true;reviewButton.disabled=true;
      try{await fn();}catch(error){setFeedback(error.message,true);}
      finally{busy=false;button.disabled=false;reviewButton.disabled=false;}
    });return button;
  }

  async function downloadPdf(productIndex) {
    if(dirty || !currentBrief)throw new Error('Update the preview before downloading.');
    const snapshot=JSON.stringify(currentBrief);
    const suffix=productIndex===undefined?'':`?productIndex=${productIndex}`;
    const response=await proofFetch(`/api/proof-generator/create${suffix}`,{method:'POST',body:await uploadForm(currentBrief)});
    if(!response.ok){const payload=await proofJson(response);throw new Error(payload.error || 'Could not create PDF.');}
    if(dirty || snapshot!==JSON.stringify(currentBrief))throw new Error('The brief changed during export. Update the preview and download again.');
    const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;
    const productDocument=currentPreview.documents?.find(item=>item.productIndex===productIndex);
    link.download=productDocument?.fileName || currentPreview.fileName || 'PROOF.pdf';
    link.hidden=true;document.body.append(link);link.click();link.remove();
    setFeedback('PDF ready. Your browser will save the download.');
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  function renderEditor() {
    if(!currentBrief)return;
    results.className='proof-results proof-editor';results.replaceChildren();
    if(!designId&&currentBrief.products.length===1){
      const download=action('Download PDF',()=>downloadPdf());download.dataset.download='true';download.disabled=dirty||!currentPreview||currentPreview.issues.some(i=>i.blocking);results.append(download);
    }
    const blockers=(currentPreview?.issues || []).filter(issue=>issue.blocking);
    if(blockers.length){
      const list=document.createElement('ul');list.className='proof-issues';
      for(const issue of blockers){const li=document.createElement('li');li.className=issue.blocking?'blocking':'';const product=currentBrief.products[issue.productIndex];const mark=product.decorations.find(d=>d.id===issue.decorationId);li.textContent=`${product.code || product.name}${mark?' / '+mark.position:''}: ${reviewMessage(issue.message)}`;list.append(li);}
      results.append(list);
    }
    const names=document.createElement('section');names.className='proof-product-editor';
    const heading=document.createElement('h3');heading.textContent='Individual names';names.append(heading);
    let count=0;
    for(const product of currentBrief.products){
      for(const d of product.decorations||[]){
        if(!d.text)continue;count++;
        const row=document.createElement('div');row.className='proof-question-actions';
        for(const [label,value,change] of [
          ['Name',d.text,v=>{d.text=v;product.personalisation=v;}],
          ['Garment size',product.size,v=>{product.size=v;}],
          ['Ink colour (hex)',d.textColour,v=>{d.textColour=v;d.printColours=[v];}]
        ]){const wrap=document.createElement('label');wrap.className='proof-control';wrap.textContent=label;const input=document.createElement('input');input.type='text';input.value=value||'';input.maxLength=100;input.addEventListener('input',()=>{change(input.value);markDirty();});wrap.append(input);row.append(wrap);}
        row.append(selectField('Name font',artworks.filter(a=>/\.(ttf|otf)$/i.test(a.file.name)).map(a=>[a.id,a.file.name]),d.fontArtworkId,v=>{d.fontArtworkId=v;}));
        names.append(row);
      }
    }
    if(count)results.append(names);
    const fallback=document.createElement('section');fallback.className='proof-fallback';
    const fallbackTitle=document.createElement('h3');fallbackTitle.textContent='Adjust artwork position';const fallbackHeader=document.createElement('div');fallbackHeader.className='proof-placement-header';
    const lockLabel=document.createElement('label');lockLabel.className='proof-dimension-lock';
    const lock=document.createElement('input');lock.type='checkbox';lock.checked=currentBrief.keepPrintDimensions===true;
    lock.addEventListener('change',()=>{currentBrief.keepPrintDimensions=lock.checked;markDirty(false);});
    lockLabel.append(lock,document.createTextNode('Keep print dimensions when resizing'));
    fallbackHeader.append(fallbackTitle,lockLabel);fallback.append(fallbackHeader);

    const views=document.createElement('div');views.className='proof-placement-views';
    const previewReady=[];
    for(const page of currentPreview?.pages || []){
      const product=currentBrief.products[page.productIndex];
      if(!product)continue;
      const section=document.createElement('section');section.className='proof-product-editor';
      const editor=viewEditor(product,page);section.append(editor);
      if(editor.previewReady)previewReady.push(editor.previewReady);
      views.append(section);
    }
    fallback.append(views);
    const hasGarment = currentPreview?.pages.some(page=>page.image);
    if(currentPreview?.pdf && hasGarment){
      const container=document.createElement('div');container.className='proof-pdf-pages proof-auto-preview';results.append(container);
      renderDocument(currentPreview.pdf,container,currentPreview.documents || []);
    }
    if(currentPreview)results.append(fallback);
    if(currentPreview&&!hasGarment){const status=document.createElement('p');status.textContent='Artwork adjustment preview unavailable. Check the request and artwork, then regenerate.';fallback.append(status);}
    return Promise.all(previewReady);
  }

  function openProofPreview(encoded,pageNumber){
    const previousFocus=document.activeElement,dialog=document.createElement('dialog');dialog.className='proof-fullscreen';
    dialog.setAttribute('aria-label','Full screen proof preview');
    const bar=document.createElement('div');bar.className='proof-fullscreen-bar';
    const title=document.createElement('strong');title.textContent='Proof preview';
    const close=document.createElement('button');close.type='button';close.className='proof-secondary-button';close.textContent='Close preview';close.addEventListener('click',()=>dialog.close());bar.append(title,close);
    const viewer=document.createElement('div');viewer.className='proof-fullscreen-pages';dialog.append(bar,viewer);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();previousFocus?.focus();});dialog.showModal();close.focus();
    renderDocument(encoded,viewer,[],{onlyPage:pageNumber,clickable:false});
  }

  async function renderDocument(encoded,container,documents=[],{onlyPage,clickable=true}={}){
    try{
      const pdfjs=await import('/api/proof-generator/renderer/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/api/proof-generator/renderer/pdf.worker.mjs';
      const data=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
      const doc=await pdfjs.getDocument({data,isEvalSupported:false}).promise;
      try{for(let i=1;i<=doc.numPages;i++){
        if(onlyPage&&i!==onlyPage)continue;
        if(!container.isConnected)break;
        const page=await doc.getPage(i);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.max(.75,(container.clientWidth||600)/base.width)});
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-label',`Proof page ${i} of ${doc.numPages}`);container.append(canvas);
        if(clickable){canvas.tabIndex=0;canvas.setAttribute('role','button');canvas.setAttribute('aria-label',`Open proof sheet ${i} full screen`);canvas.title='Click to view full screen';canvas.classList.add('proof-clickable-preview');canvas.addEventListener('click',()=>openProofPreview(encoded,i));canvas.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openProofPreview(encoded,i);}});}
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      }}finally{await doc.destroy();}
    }catch(error){container.textContent=`PDF preview unavailable: ${error.message}`;}
  }

  function viewEditor(product,page) {
    const wrap=document.createElement('div');wrap.className='proof-view-editor';
    if(!page.image){const text=document.createElement('p');text.textContent='No verified image for this view. Select an available matching view above.';wrap.append(text);return wrap;}
    product.calibrations ||= {};
    let selected=page.placements[0]?.id || product.decorations.find(d=>(d.view||'auto')===page.view)?.id || product.decorations[0]?.id;
    let drag=null;
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=Math.round(600*page.height/page.width);canvas.className='proof-placement-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label',`${product.code} ${page.view} artwork placement. Drag artwork to move it; drag its corner handle to resize.`);
    const ctx=canvas.getContext('2d');const base=new Image();base.src=page.image;
    const images=new Map();for(const p of page.placements){const img=new Image();img.src=p.preview;images.set(p.id,img);img.onload=paint;}
    // Use one scale factor for both axes, based on the renderer's visible bounds.
    function bounds(p){
      const d=product.decorations.find(d=>d.id===p.id),pos=d.placement||p;
      const sizeScale=Number(d.widthMm)>0?Number(d.widthMm)/p.size.width:Number(d.heightMm)>0?Number(d.heightMm)/p.size.height:1;
      const scale=sizeScale*(d.visualScale||1)/(p.visualScale||1);
      return {x:pos.x,y:pos.y,width:p.width*scale,height:p.height*scale};
    }
    function paint(){
      ctx.fillStyle='#eee';ctx.fillRect(0,0,canvas.width,canvas.height);
      if(base.complete&&base.naturalWidth)ctx.drawImage(base,0,0,canvas.width,canvas.height);
      for(const p of page.placements){
        const position=bounds(p);
        const x=(position.x-position.width/2)*canvas.width,y=position.y*canvas.height,w=position.width*canvas.width,h=position.height*canvas.height;
        const img=images.get(p.id);if(img?.complete&&img.naturalWidth)ctx.drawImage(img,x,y,w,h);
        ctx.strokeStyle=p.id===selected?'#0873c8':'#777';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
        if(p.id===selected){ctx.fillStyle='#0873c8';ctx.fillRect(x+w-7,y+h-7,14,14);ctx.strokeStyle='#fff';ctx.strokeRect(x+w-7,y+h-7,14,14);}
      }

    }
    const waitForImage=image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});
    wrap.previewReady=Promise.all([base,...images.values()].map(waitForImage)).then(paint);
    base.onload=paint;
    const point=event=>{const box=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};};
    canvas.addEventListener('pointerdown',event=>{
      if(busy||event.button!==0)return;
      const q=point(event);
      const active=page.placements.find(p=>p.id===selected),box=canvas.getBoundingClientRect();
      if(active){
        const pos=bounds(active);
        if(Math.abs(q.x-pos.x-pos.width/2)*box.width<=12&&Math.abs(q.y-pos.y-pos.height)*box.height<=12){
          drag={mode:'scale',d:product.decorations.find(d=>d.id===active.id),p:active,left:pos.x-pos.width/2,top:pos.y};
          canvas.setPointerCapture(event.pointerId);event.preventDefault();return;
        }
      }
      const hit=[...page.placements].reverse().find(p=>{const pos=bounds(p);return q.x>=pos.x-pos.width/2&&q.x<=pos.x+pos.width/2&&q.y>=pos.y&&q.y<=pos.y+pos.height;});
      if(hit){event.preventDefault();canvas.focus({preventScroll:true});selected=hit.id;const d=product.decorations.find(d=>d.id===hit.id);const pos=bounds(hit);drag={mode:'move',d,p:hit,dx:q.x-pos.x,dy:q.y-pos.y};canvas.setPointerCapture(event.pointerId);paint();}
    });
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;const q=point(event);
      drag.d.manualScale={widthPerMm:drag.p.width/drag.p.size.width/(drag.p.visualScale||1),sourceHash:page.sourceHash,view:page.view};
      if(drag.mode==='scale'){
        const {p,left,top}=drag;
        // Project onto the artwork diagonal in pixel space to preserve its aspect ratio.
        const w=p.width*canvas.width,h=p.height*canvas.height;
        const scale=Math.max(.1/Math.min(p.size.width,p.size.height),Math.min(3000/Math.max(p.size.width,p.size.height),((q.x-left)*canvas.width*w+(q.y-top)*canvas.height*h)/(w*w+h*h)));
        if(currentBrief.keepPrintDimensions===true){
          const sizeScale=Number(drag.d.widthMm)>0?Number(drag.d.widthMm)/p.size.width:Number(drag.d.heightMm)>0?Number(drag.d.heightMm)/p.size.height:1;
          drag.d.visualScale=(p.visualScale||1)*scale/sizeScale;
        }else{
          drag.d.widthMm=p.size.width*scale*(p.visualScale||1)/(drag.d.visualScale||1);drag.d.heightMm='';drag.d.dimensionIssues=[];
        }
        drag.d.placement={x:left+p.width*scale/2,y:top};
      }else drag.d.placement={x:Math.max(0,Math.min(1,q.x-drag.dx)),y:Math.max(0,Math.min(1,q.y-drag.dy))};
      drag.d.offsetXmm='';drag.d.offsetYmm='';drag.d.anchor='region';markDirty(false);paint();
    });
    const finishDrag=event=>{
      if(!drag)return;
      drag=null;
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      paint();
    };
    canvas.addEventListener('pointerup',finishDrag);
    canvas.addEventListener('pointercancel',finishDrag);
    canvas.addEventListener('lostpointercapture',finishDrag);
    wrap.append(canvas);paint();return wrap;
  }

  const epsPreviews=new WeakMap();
  let epsQueue=Promise.resolve();
  async function prepareArtworkFile(file,preflight=false,providedItem) {
    if(/\.(pxf|dst)$/i.test(file.name)){
      const item=providedItem||artworks.find(a=>a.file===file);
      const module=await import('/proof-embroidery.mjs');
      let colours=item?.threadColours||[];
      if(/\.dst$/i.test(file.name)){
        const parsed=module.parseDst(await file.arrayBuffer());
        if(item)item.dstSize={widthMm:parsed.widthMm,heightMm:parsed.heightMm};
        if(preflight){
        if(item)item.threadColours=Array.from({length:parsed.colourChanges+1},(_,i)=>colours[i]||'');
        colours=Array.from({length:parsed.colourChanges+1},(_,i)=>colours[i]||'#808080');
        }
      }
      return module.prepareEmbroidery(file,colours);
    }
    if(/\.svg$/i.test(file.name))return window.ProofSvg.prepare(file);
    if(!/\.eps$/i.test(file.name))return file;
    if(!epsPreviews.has(file)){
      const pending=epsQueue.then(async()=>{
      const form=new FormData();form.append('artwork',file,file.name);
      const response=await proofFetch('/api/proof-generator/artwork/eps-preview',{method:'POST',body:form});
      if(!response.ok){const data=await proofJson(response);throw new Error(data.error||'EPS conversion failed.');}
      return new File([await response.blob()],file.name.replace(/\.eps$/i,'.png'),{type:'image/png'});
      });
      epsQueue=pending.catch(()=>{});
      epsPreviews.set(file,pending.catch(error=>{epsPreviews.delete(file);throw error;}));
    }
    return epsPreviews.get(file);
  }
  showProofList();
  setInterval(()=>{if(!historyScreen.hidden&&document.visibilityState==='visible'&&root.getClientRects().length)refreshHistory();},4000);
  setInterval(()=>{if(generatingProof&&designId)recordProgress('generating').catch(()=>{});},30000);
})();
