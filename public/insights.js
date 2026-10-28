(() => {
  const root = document.getElementById('insights-root');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pounds = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(value);
  const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Not recorded';
  const currentYear=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric'}).format(new Date()));
  const presets = [['contact','Who to contact'],['value','Highest spend'],['orders','Most orders'],['all','All customers'],['lapsed','Inactive 6+ months'],['dormant','Inactive 12+ months']];
  const types=[['all','All jobs'],['print','Print'],['embroidery','Embroidery'],['combined','Print & Emb'],['gifts','Gifts']];
  let state={years:'3',mode:'rolling',fromYear:String(currentYear-1),toYear:String(currentYear),jobType:'all',preset:'contact',page:1};
  let controller, sequence=0, initialized=false;
  const drafts=new Map();
  try {
    const saved=JSON.parse(localStorage.getItem('hub-insights-filters')||'{}');
    if(['1','2','3','5'].includes(saved.years))state.years=saved.years;
    if(presets.some(p=>p[0]===saved.preset))state.preset=saved.preset;
    if(types.some(t=>t[0]===saved.jobType))state.jobType=saved.jobType;
    if(saved.mode==='calendar' && Number(saved.fromYear)>=2000 && Number(saved.toYear)<=currentYear && Number(saved.fromYear)<=Number(saved.toYear))Object.assign(state,{mode:'calendar',fromYear:saved.fromYear,toYear:saved.toYear});
  }catch{}
  function remember(){try{localStorage.setItem('hub-insights-filters',JSON.stringify(state));}catch{}}
  root.addEventListener('click', async event => {
    const button=event.target.closest('[data-ins-order]');
    if(!button||!root.contains(button)||button.disabled)return;
    const id=Number(button.dataset.insOrder);if(!Number.isSafeInteger(id))return;
    button.disabled=true;const feedback=root.querySelector('#ins-navigation-status');if(feedback)feedback.textContent='';
    try{
      if(typeof window.ultimateHubOpenDatabaseOrder!=='function')throw new Error('Order navigation is unavailable. Refresh the page and try again.');
      await window.ultimateHubOpenDatabaseOrder(id,'details');
    }catch(error){if(feedback)feedback.textContent=error.message||'Could not open this order. Please try again.';}
    finally{button.disabled=false;}
  });
  root.addEventListener('input',event=>{
    const field=event.target.closest('[data-ins-note-text]');if(!field)return;
    const card=field.closest('[data-customer-key]'),key=card.dataset.customerKey;
    const previous=drafts.get(key);
    drafts.set(key,{body:field.value,version:previous?.version ?? Number(card.dataset.noteVersion),documentKey:previous?.documentKey ?? (card.dataset.noteDocument||null)});
  });
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-ins-note-form]');if(!form)return;event.preventDefault();
    const card=form.closest('[data-customer-key]'),key=card.dataset.customerKey,field=form.querySelector('textarea'),button=form.querySelector('button'),feedback=form.querySelector('[role="status"]');
    const body=field.value;if(button.disabled)return;
    let draft=drafts.get(key);if(!draft||draft.body!==body){draft={body,version:Number(card.dataset.noteVersion),documentKey:card.dataset.noteDocument||null};drafts.set(key,draft);}
    button.disabled=true;field.disabled=true;feedback.textContent='Saving…';
    try{
      const response=await fetch('/api/insights/notes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceOrderId:Number(card.dataset.orderId),body,version:draft.version,documentKey:draft.documentKey})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save your note.');
      // A filter change may have detached this card. Never erase a newer draft.
      if(drafts.get(key)===draft)drafts.delete(key);
      else if(drafts.has(key)){drafts.get(key).version=data.salesNote.version;drafts.get(key).documentKey=data.salesNote.documentKey;}
      const visible=[...root.querySelectorAll('[data-customer-key]')].find(c=>c.dataset.customerKey===key);
      if(visible){visible.dataset.noteVersion=data.salesNote.version;visible.dataset.noteDocument=data.salesNote.documentKey;if(!drafts.has(key))visible.querySelector('textarea').value=data.salesNote.body;visible.querySelector('[role="status"]').textContent='Saved';}
    }catch(error){feedback.textContent=error.message+' Your text is kept here; try saving again.';}
    finally{button.disabled=false;field.disabled=false;}
  });
  window.addEventListener?.('beforeunload',event=>{if(drafts.size>0){event.preventDefault();event.returnValue='';}});
  function initialize(){
    const options=selected=>Array.from({length:currentYear-1999},(_,i)=>currentYear-i).map(y=>`<option value="${y}" ${String(y)===String(selected)?'selected':''}>${y}</option>`).join('');
    root.innerHTML=`<header class="ins-head"><div><h1>Insights</h1><p>Customer value and follow-up opportunities.</p></div><button type="button" id="ins-refresh">Refresh</button></header>
      <div class="ins-filters"><label>Order history period<select id="ins-period">${[1,2,3,5].map(n=>`<option value="${n}" ${state.mode==='rolling'&&state.years===String(n)?'selected':''}>Last ${n} year${n===1?'':'s'}</option>`).join('')}<option value="calendar" ${state.mode==='calendar'?'selected':''}>Calendar years</option></select></label><label>From year<select id="ins-from">${options(state.fromYear)}</select></label><label>To year<select id="ins-to">${options(state.toYear)}</select></label><label>Show me<select id="ins-preset">${presets.map(([v,t])=>`<option value="${v}" ${state.preset===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="ins-type-filter" role="group" aria-label="Job type"><span>Job type</span><div>${types.map(([v,t])=>`<button type="button" data-ins-type="${v}" aria-pressed="${state.jobType===v}">${t}</button>`).join('')}</div></div></div>
      <p id="ins-navigation-status" role="alert"></p><div id="ins-results" aria-live="polite"></div>
      <details class="ins-method"><summary>How values and recommendations work</summary><p>Choose a rolling period or select From year and To year for inclusive calendar years. Job-type buttons select distinct categories: Print & Emb is separate from Print and Embroidery. Only customers with a matching order in the selected period appear; period values, order counts and annual totals include only matching job types. Lifetime value, last order and inactivity always cover all job types.</p><p>Values are booked order value excluding VAT and internal lines, not confirmed payments or profit. Contact candidates have £5,000 lifetime value or 10 historical orders, and no activity in the last six calendar months. Matched DTF activity prevents a lapsed recommendation but its revenue is not included. Shared business emails/domains flag possible active relationships. Closed Special Wear is excluded.</p><p>Priority scores combine selected-period value (50 points), frequency (30) and inactivity against typical order intervals (20). They are a sorting aid, not a conversion forecast. Seasonal hints and historical contact details need checking. Sales notes are shared with full-access Hub users and saved with the author and timestamp. The single Sales notes field keeps your saved text. Conflicting edits are rejected so another person’s newer notes are not silently overwritten.</p><p>Order data is cached for up to five minutes; saved notes are read fresh on each load. Dates use Europe/London. No outreach is sent from this page.</p></details>`;
    root.querySelector('#ins-period').onchange=e=>{if(e.target.value==='calendar')state.mode='calendar';else{state.mode='rolling';state.years=e.target.value;}change();};
    root.querySelector('#ins-from').onchange=e=>{state.fromYear=e.target.value;if(+state.toYear<+state.fromYear){state.toYear=state.fromYear;root.querySelector('#ins-to').value=state.toYear;}state.mode='calendar';root.querySelector('#ins-period').value='calendar';change();};
    root.querySelector('#ins-to').onchange=e=>{state.toYear=e.target.value;if(+state.fromYear>+state.toYear){state.fromYear=state.toYear;root.querySelector('#ins-from').value=state.fromYear;}state.mode='calendar';root.querySelector('#ins-period').value='calendar';change();};
    root.querySelector('#ins-preset').onchange=e=>{state.preset=e.target.value;change();};
    root.querySelectorAll('[data-ins-type]').forEach(button=>button.onclick=()=>{state.jobType=button.dataset.insType;root.querySelectorAll('[data-ins-type]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));change();});
    root.querySelector('#ins-refresh').onclick=()=>load();initialized=true;
  }
  function change(){state.page=1;remember();load();}
  async function load(){
    if(!window.ultimateHubUser||window.ultimateHubUser.access_scope==='dtf_only')return;
    if(!initialized)initialize();controller?.abort();controller=new AbortController();const ticket=++sequence,result=root.querySelector('#ins-results');
    result.innerHTML='<div class="workspace-loading" role="status" aria-label="Loading customer insights"><span class="board-loading-spinner" aria-hidden="true"></span></div>';
    const params={years:state.years,preset:state.preset,page:state.page,jobType:state.jobType};if(state.mode==='calendar')Object.assign(params,{fromYear:state.fromYear,toYear:state.toYear});
    try{
      const response=await fetch(`/api/insights/customers?${new URLSearchParams(params)}`,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load insights.');if(ticket!==sequence)return;state.page=data.page;
      result.innerHTML=`<div class="ins-kpis"><div><span>Matching customers</span><strong>${data.total.toLocaleString()}</strong></div><div><span>Order value · selected period</span><strong>${pounds(data.summary.value)}</strong></div><div><span>Orders · selected period</span><strong>${data.summary.orders.toLocaleString()}</strong></div><div><span>Contact candidates</span><strong>${data.summary.candidates.toLocaleString()}</strong></div></div>${data.customers.length?`<div class="ins-grid">${data.customers.map(card).join('')}</div>`:'<div class="ins-empty"><h2>No matching customers</h2><p>Try another year range, job type or preset.</p></div>'}<div class="ins-pagination"><button type="button" id="ins-prev" ${data.page===1?'disabled':''}>Previous</button><span>Page ${data.page} of ${data.pages}</span><button type="button" id="ins-next" ${data.page>=data.pages?'disabled':''}>Next</button></div>`;
      root.querySelector('#ins-prev').onclick=()=>{state.page--;load();root.scrollIntoView({block:'start'});};root.querySelector('#ins-next').onclick=()=>{state.page++;load();root.scrollIntoView({block:'start'});};
    }catch(error){if(error.name==='AbortError'||ticket!==sequence)return;result.innerHTML=`<div class="ins-empty" role="alert"><p>${esc(error.message)}</p><button type="button" id="ins-retry">Try again</button></div>`;root.querySelector('#ins-retry').onclick=load;}
  }
  function card(c){
    const saved=c.salesNote||{body:'',version:0,documentKey:null},draft=drafts.get(c.key);
    return `<article class="ins-card" data-customer-key="${esc(c.key)}" data-order-id="${esc(c.recentOrders[0].id)}" data-note-version="${saved.version}" data-note-document="${esc(saved.documentKey||'')}"><h2>${esc(c.name)}</h2><div class="ins-activity">${c.inactiveDays<60?`${c.inactiveDays} day${c.inactiveDays===1?'':'s'}`:`${Math.floor(c.inactiveDays/30.4375)} months`} since activity</div>
      <div class="ins-card-metrics"><div><strong>${pounds(c.periodValue)}</strong><span>Selected period · ${c.periodOrders} order${c.periodOrders===1?'':'s'}</span></div><div><strong>${pounds(c.lifetimeValue)}</strong><span>Lifetime · ${c.lifetimeOrders} orders</span></div><div><strong>${date(c.lastOrderDate)}</strong><span>Last order · all types</span></div></div>
      <div class="ins-contact-job"><div class="ins-contact"><strong>${esc(c.contact.name||'No named contact')}</strong><span>${esc(c.contact.email||'No email recorded')}</span><span>${esc(c.contact.phone||'No phone recorded')}</span></div><div class="ins-job"><p class="ins-last-job"><strong>Last job</strong><br>${esc(c.recentOrders[0].title||'Untitled order')}</p><button type="button" class="ins-open-order" data-ins-order="${esc(c.recentOrders[0].id)}">View latest order</button></div></div>
      <form data-ins-note-form class="ins-sales-notes"><label>Sales notes<textarea data-ins-note-text maxlength="20000" rows="3" placeholder="Contact dates, conversations and next steps…">${esc(draft?.body ?? saved.body)}</textarea></label><div class="ins-note-actions"><span role="status" aria-live="polite">${saved.updatedBy?`Saved by ${esc(saved.updatedBy)}`:''}</span><button type="submit">Save notes</button></div></form>
      <div class="ins-notes-slot" ${c.notes.length?'tabindex="0" role="region" aria-label="Customer insights"':'aria-hidden="true"'}>${c.notes.length?`<ul class="ins-notes">${c.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}</div></article>`;
  }
  window.loadInsights=load;
})();
