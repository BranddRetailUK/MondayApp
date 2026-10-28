(() => {
  const root = document.getElementById('insights-root');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pounds = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(value);
  const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Not recorded';
  const presets = [['contact','Who to contact'],['value','Highest spend'],['orders','Most orders'],['all','All customers'],['lapsed','Inactive 6+ months'],['dormant','Inactive 12+ months']];
  let state = {years:'3',preset:'contact',search:'',page:1}, controller, sequence=0, initialized=false, timer;
  try { const saved=JSON.parse(localStorage.getItem('hub-insights-filters') || '{}'); if(['1','2','3','5'].includes(saved.years))state.years=saved.years;if(presets.some(p=>p[0]===saved.preset))state.preset=saved.preset; } catch {}
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-ins-order]');
    if (!button || !root.contains(button) || button.disabled) return;
    const id = Number(button.dataset.insOrder);
    if (!Number.isSafeInteger(id)) return;
    button.disabled = true;
    const feedback = root.querySelector('#ins-navigation-status');
    if (feedback) feedback.textContent = '';
    try {
      if (typeof window.ultimateHubOpenDatabaseOrder !== 'function') throw new Error('Order navigation is unavailable. Refresh the page and try again.');
      await window.ultimateHubOpenDatabaseOrder(id, 'details');
    } catch (error) {
      if (feedback) feedback.textContent = error.message || 'Could not open this order. Please try again.';
    } finally { button.disabled = false; }
  });
  function initialize() {
    root.innerHTML = `<header class="ins-head"><div><h1>Insights</h1><p>Customer value and follow-up opportunities.</p></div><button type="button" id="ins-refresh">Refresh</button></header>
      <div class="ins-filters"><label>Order history period<select id="ins-years">${[1,2,3,5].map(n=>`<option value="${n}" ${state.years===String(n)?'selected':''}>Last ${n} year${n===1?'':'s'}</option>`).join('')}</select></label><label>Show me<select id="ins-preset">${presets.map(([v,t])=>`<option value="${v}" ${state.preset===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="ins-search">Search customers or contacts<input type="search" id="ins-search" placeholder="Company, contact or email" maxlength="200"></label></div>
      <p class="ins-explainer" id="ins-explainer"></p><p id="ins-navigation-status" role="alert"></p><div id="ins-results" aria-live="polite"></div>
      <details class="ins-method"><summary>How values and contact recommendations work</summary><p>Values are booked order value excluding VAT and internal lines, not confirmed payments or profit. The selected period limits both customer activity and the spend/order figures used for ranking; lifetime totals are shown separately. Zero-value orders count towards frequency.</p><p>Contact candidates have at least £5,000 lifetime order value or 10 historical orders, no order in the last six calendar months, and an order within your selected period. Matching recent DTF activity prevents an inactive recommendation; DTF revenue is not included in these totals. Accounts sharing an email or business email domain with a recently active customer are flagged for review and excluded from recommendations.</p><p>The priority score combines selected-period value (50 points), frequency (30) and inactivity compared with normal order intervals (20). Value and frequency use logarithmic scales relative to customers in the selected period. Typical intervals use the median gap between distinct order dates in the three years before the last order, with at least four dates required; otherwise inactivity is compared with one year. Scores are a sorting aid, not a forecast of conversion.</p><p>Customer IDs and exact names (ignoring case and extra spaces) connect history. Similar company names and corporate changes may need manual review. Seasonal notes are clues from customer/job names. Historical contact details may be outdated; recorded marketing opt-in is shown separately. No messages are sent from this page.</p><p>Data is read-only and cached for up to five minutes. Refresh reloads the latest available snapshot. Dates use Europe/London. Undated, future and pre-2000 orders are excluded.</p></details>`;
    for(const key of ['years','preset'])root.querySelector(`#ins-${key}`).onchange=e=>{state[key]=e.target.value;state.page=1;try{localStorage.setItem('hub-insights-filters',JSON.stringify({years:state.years,preset:state.preset}));}catch{}load();};
    root.querySelector('#ins-search').oninput=e=>{state.search=e.target.value;state.page=1;clearTimeout(timer);timer=setTimeout(load,250);};
    root.querySelector('#ins-refresh').onclick=()=>load();
    initialized=true;
  }
  async function load() {
    if (!window.ultimateHubUser || window.ultimateHubUser.access_scope==='dtf_only') return;
    if (!initialized) initialize();
    clearTimeout(timer);controller?.abort();controller=new AbortController();const ticket=++sequence;
    const result=root.querySelector('#ins-results');
    root.querySelector('#ins-explainer').textContent=state.preset==='contact'?'Valuable customers who have gone quiet, ranked to help you prioritise a personal follow-up.':'Compare customers with an order in your selected period. Rankings use that period’s order value or frequency.';
    result.innerHTML='<div class="workspace-loading" role="status" aria-label="Loading customer insights"><span class="board-loading-spinner" aria-hidden="true"></span></div>';
    try {
      const response=await fetch(`/api/insights/customers?${new URLSearchParams(state)}`,{cache:'no-store',signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load insights.');
      if(ticket!==sequence)return;state.page=data.page;
      result.innerHTML=`<div class="ins-kpis"><div><span>Matching customers</span><strong>${data.total.toLocaleString()}</strong></div><div><span>Order value · selected period</span><strong>${pounds(data.summary.value)}</strong></div><div><span>Orders · selected period</span><strong>${data.summary.orders.toLocaleString()}</strong></div><div><span>Contact candidates</span><strong>${data.summary.candidates.toLocaleString()}</strong></div></div><div class="ins-meta"><span>${date(data.start)} – ${date(data.today)} · latest order ${date(data.latestOrder)}</span><span>Snapshot ${new Date(data.fetchedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} · ${data.invalidDates} invalid-date orders excluded</span></div>
        ${data.customers.length?`<div class="ins-grid">${data.customers.map(card).join('')}</div>`:'<div class="ins-empty"><h2>No customers match these filters</h2><p>Try a longer period, another preset or a broader search.</p></div>'}
        <div class="ins-pagination"><button type="button" id="ins-prev" ${data.page===1?'disabled':''}>Previous</button><span>Page ${data.page} of ${data.pages}</span><button type="button" id="ins-next" ${data.page>=data.pages?'disabled':''}>Next</button></div>`;
      root.querySelector('#ins-prev').onclick=()=>{state.page--;load();root.scrollIntoView({block:'start'});};root.querySelector('#ins-next').onclick=()=>{state.page++;load();root.scrollIntoView({block:'start'});};
    } catch(error) { if(error.name==='AbortError'||ticket!==sequence)return;result.innerHTML=`<div class="ins-empty" role="alert"><p>${esc(error.message)}</p><button type="button" id="ins-retry">Try again</button></div>`;root.querySelector('#ins-retry').onclick=load; }
  }
  function card(c) {
    return `<article class="ins-card"><div class="ins-card-top"><span class="ins-badge ${c.candidate?'ins-priority':''}">${c.candidate?'Suggested follow-up':(c.sharedContact||c.sharedDomain)?'Review identity':c.inactiveDays>=183?'Inactive customer':'Active customer'}</span><span>${c.inactiveDays<60?`${c.inactiveDays} days`:`${Math.floor(c.inactiveDays/30.4375)} months`} since activity</span></div><h2>${esc(c.name)}</h2><p class="ins-reason">${esc(c.reason)}</p><div class="ins-card-metrics"><div><strong>${pounds(c.periodValue)}</strong><span>${c.periodOrders} order${c.periodOrders===1?'':'s'} · last ${state.years} year${state.years==='1'?'':'s'}</span></div><div><strong>${pounds(c.lifetimeValue)}</strong><span>${c.lifetimeOrders} lifetime orders</span></div><div><strong>${date(c.lastOrderDate)}</strong><span>Last main order</span></div></div><div class="ins-contact"><strong>${esc(c.contact.name||'No named contact')}</strong><span>${esc(c.contact.email||'No email recorded')}</span><span>${esc(c.contact.phone||'No phone recorded')}</span></div><p class="ins-last-job">Last job: ${esc(c.recentOrders[0]?.title||'Untitled order')}</p><button type="button" class="ins-open-order" data-ins-order="${esc(c.recentOrders[0].id)}">View latest order</button><div class="ins-notes-slot" ${c.notes.length?'tabindex="0" role="region" aria-label="Customer notes"':'aria-hidden="true"'}>${c.notes.length?`<ul class="ins-notes">${c.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}</div><details><summary>View order history and details</summary><p>Contact priority: ${c.candidate?`${c.score}/100`:"Not currently recommended"}. Contact source: ${esc(c.contact.source)}. Marketing opt-in: ${esc(c.marketingOptIn)}.</p><div class="ins-annual">${c.annual.map(p=>`<div><span>${date(p.from)} – ${date(p.endInclusive?p.to:new Date(Date.parse(p.to)-86400000).toISOString().slice(0,10))}</span><strong>${pounds(p.value)} · ${p.orders} orders</strong></div>`).join('')}</div><p>Average order in period: <b>${pounds(c.averageOrder)}</b>. Typical order interval: <b>${c.cadence?`${c.cadence} days`:'Not enough history'}</b>. ${c.zeroValueOrders} historical zero-value orders.</p>${c.accountManager?`<p>Account manager: ${esc(c.accountManager)}</p>`:''}<ul class="ins-orders">${c.recentOrders.map(j=>`<li><button type="button" class="ins-history-order" data-ins-order="${esc(j.id)}">#${esc(j.number)} · ${esc(j.title||'Untitled order')}</button><span>${date(j.date)} · ${pounds(j.value)}</span></li>`).join('')}</ul><small>Customer IDs: ${esc(c.customerIds.join(', ')||'Name-matched')}</small></details></article>`;
  }
  window.loadInsights=load;
})();
