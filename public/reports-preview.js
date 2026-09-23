(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
  const pct = (n) => `${n.toFixed(1)}%`;
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const names = ['Northfield Academy', 'Oak & Co. Construction', 'Riverside Running Club', 'Horizon Events', 'Westbridge College', 'Parkside Engineering', 'Elmwood Hospitality', 'Apex Fitness'];
  const types = ['Printing', 'Embroidery', 'Print + Emb', 'Business Gifts'];
  const jobs = ['Team shirts', 'Staff uniform', 'Event collection', 'Club kit', 'Workwear refresh', 'Promotional bags'];
  // Deterministic invented orders, isolated from all production APIs.
  const orders = [];
  for (const month of [7, 8, 9]) {
    const days = month === 9 ? 23 : 31;
    for (let day = 1; day <= days; day++) {
      const weekday = new Date(Date.UTC(2026, month - 1, day)).getUTCDay();
      const count = weekday === 0 ? 0 : weekday === 6 ? 1 : 3 + (day * 7 + month) % 5;
      for (let j = 0; j < count; j++) {
        const seed = day * 11 + j * 17 + month * 3;
        const net = (180 + seed % 43 * 23) * (month === 9 ? 1.08 : 1);
        const missing = seed % 29 === 0;
        const cost = missing ? 0 : net * (seed % 17 === 0 ? 1.08 : seed % 9 === 0 ? .84 : .43 + (seed % 18) / 100);
        orders.push({ id: 51000 + orders.length, month, day, date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, customer: names[seed % names.length], job: jobs[seed % jobs.length], type: types[seed % 4], net: Math.round(net * 100) / 100, cost: Math.round(cost * 100) / 100, vat: Math.round(net * (seed % 6 === 0 ? 0 : .2) * 100) / 100, units: 12 + seed % 88, missing });
      }
    }
  }
  const metrics = [['net','Net sales'],['gross','Gross sales'],['vat','VAT'],['cost','Cost of goods'],['profit','Gross profit'],['count','Orders']];
  let metric = 'net', grain = 'day', selected = null, current = [], previous = [], buckets = [], previousBuckets = [];
  const sum = (rows) => rows.reduce((a, r) => ({ net: a.net+r.net, gross: a.gross+r.net+r.vat, vat: a.vat+r.vat, cost: a.cost+r.cost, profit: a.profit+r.net-r.cost, count:a.count+1, units:a.units+r.units, missing:a.missing+Number(r.missing) }), {net:0,gross:0,vat:0,cost:0,profit:0,count:0,units:0,missing:0});
  const margin = (s) => s.net ? s.profit / s.net * 100 : 0;
  const value = (n) => metric === 'count' ? String(n) : money(n);
  const monthName = (m) => new Date(Date.UTC(2026,m-1,1)).toLocaleDateString('en-GB',{month:'long',timeZone:'UTC'});
  const dayLabel = (b, m = Number($('period').value)) => b.start === b.end ? `${b.start} ${monthName(m)}` : `${b.start}–${b.end} ${monthName(m)}`;
  const delta = (a,b) => b === 0 ? a === 0 ? 'No change' : 'No prior baseline' : `${a-b>=0?'+':''}${pct((a-b)/Math.abs(b)*100)}`;
  function group(rows, days, month) {
    const result = [];
    for (let start=1;start<=days;) {
      // Calendar weeks begin Monday; first and last weeks may be partial.
      const weekday = new Date(Date.UTC(2026,month-1,start)).getUTCDay();
      const end = grain === 'day' ? start : Math.min(days,start+(7-weekday)%7);
      const items = rows.filter(r=>r.day>=start&&r.day<=end);
      result.push({start,end,rows:items,...sum(items)}); start=end+1;
    }
    return result;
  }
  const row = (label,v,cls='') => `<div class="metric-row"><span>${label}</span><strong class="${cls}">${v}</strong></div>`;
  function render() {
    const month = Number($('period').value), days = month === 9 ? 23 : 31, type = $('type').value;
    current = orders.filter(r=>r.month===month&&r.day<=days&&(type==='All types'||r.type===type));
    previous = orders.filter(r=>r.month===month-1&&r.day<=days&&(type==='All types'||r.type===type));
    buckets = group(current,days,month);
    // Compare identical day-of-month windows, including when current calendar weeks are partial.
    previousBuckets = buckets.map(b=>({...b,...sum(previous.filter(r=>r.day>=b.start&&r.day<=b.end))}));
    const s = sum(current), p = sum(previous), compare = $('compare').checked;
    $('period-label').textContent = `1–${days} ${monthName(month)} 2026${month===9?' · Month to date':''} · ${type}`;
    $('kpis').innerHTML = metrics.map(([k,label])=>`<button class="db-report-kpi ${metric===k?'is-primary':''}" data-metric="${k}" aria-pressed="${metric===k}"><span>${label}${k==='profit'&&s.missing?' *':''}</span><strong>${k==='count'?s[k]:money(s[k])}</strong><small>${compare?`${delta(s[k],p[k])} vs 1–${days} ${monthName(month-1)}`:k==='profit'?`${pct(margin(s))} margin`:k==='net'?'Excluding VAT':'Selected period'}</small></button>`).join('');
    $('bridge').innerHTML = row('Net sales',money(s.net))+row('− Recorded goods costs',money(s.cost))+row('= Gross profit'+(s.missing?' *':''),money(s.profit))+`<div class="bar" aria-label="Cost and gross profit share of net sales"><span style="width:${s.net?Math.max(0,Math.min(100,s.cost/s.net*100)):0}%"></span><span style="flex:1"></span></div><p class="note">Grey: costs · Blue: gross profit${s.missing?' · * Provisional: some costs are missing.':''}</p>`;
    $('health').innerHTML = row('Gross margin'+(s.missing?' *':''),pct(margin(s)))+row('Average order (net)',money(s.count?s.net/s.count:0))+row('Units sold',s.units.toLocaleString('en-GB'))+row('Low-margin orders',current.filter(r=>!r.missing&&margin(sum([r]))<25).length,'warning')+`<p class="note">Low margin: below 25%, excluding orders with missing costs.${compare?` Margin change: ${(margin(s)-margin(p)).toFixed(1)} percentage points.`:''}</p>`;
    const complete=s.count-s.missing;
    $('coverage').innerHTML=`<div class="big-number ${s.missing?'warning':'good'}">${s.count?pct(complete/s.count*100):'—'}</div><p>orders with complete sample costs</p>`+row('Orders missing costs',s.missing,'warning')+`<p class="note">${s.missing?`Profit is overstated until costs are entered. ${money(sum(current.filter(r=>r.missing)).net)} of net sales needs review.`:'All selected orders have recorded costs.'} Coverage is per order in this sample.</p>`;
    const customerRows=names.map(name=>({name,...sum(current.filter(r=>r.customer===name))})).filter(r=>r.count).sort((a,b)=>b.net-a.net);
    $('customers').innerHTML=`<table class="report-table"><thead><tr><th>Customer</th><th>Orders</th><th>Net sales</th><th>Share</th></tr></thead><tbody>${customerRows.slice(0,5).map(c=>`<tr><td>${escape(c.name)}</td><td>${c.count}</td><td>${money(c.net)}</td><td>${pct(s.net?c.net/s.net*100:0)}</td></tr>`).join('')}</tbody></table><p class="note">Top 5 by net sales · ${customerRows.length} customers in this period · Full order list below.</p>`;
    $('types').innerHTML=`<table class="report-table"><thead><tr><th>Type</th><th>Orders</th><th>Gross profit</th><th>Margin</th></tr></thead><tbody>${types.map(name=>({name,...sum(current.filter(r=>r.type===name))})).filter(t=>t.count).map(t=>`<tr><td>${escape(t.name)}</td><td>${t.count}</td><td>${money(t.profit)}${t.missing?' *':''}</td><td>${pct(margin(t))}</td></tr>`).join('')}</tbody></table><p class="note">* Provisional where costs are missing. Compare profitability alongside sales volume.</p>`;
    drawChart(); renderOrders();
  }
  function drawChart() {
    hideTip();
    const compared=$('compare').checked, values=buckets.map(b=>b[metric]).concat(compared?previousBuckets.map(b=>b[metric]):[]);
    const max=Math.max(1,...values)*1.15, min=Math.min(0,...values)*1.15, left=75,right=977,top=20,bottom=217;
    const x=i=>buckets.length===1?(left+right)/2:left+i/(buckets.length-1)*(right-left), y=v=>bottom-(v-min)/(max-min)*(bottom-top);
    const path=arr=>arr.map((b,i)=>`${i?'L':'M'}${x(i)},${y(b[metric])}`).join(' ');
    $('chart-title').textContent=`${metrics.find(m=>m[0]===metric)[1]} by ${grain}${grain==='week'?' · Monday–Sunday':''}`;
    $('chart-total').textContent=value(sum(current)[metric]); $('compare-legend').hidden=!compared;
    $('chart').innerHTML=Array.from({length:5},(_,i)=>{const v=min+(max-min)*i/4;return `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#c4c4bd"/><text x="65" y="${y(v)+4}" text-anchor="end">${metric==='count'?Math.round(v):'£'+Math.round(v).toLocaleString('en-GB')}</text>`;}).join('')+`<path d="M${left},${y(0)} ${path(buckets).replace(/^M/,'L')} L${right},${y(0)}Z" fill="#b9d5fb" opacity=".6"/>${compared?`<path d="${path(previousBuckets)}" fill="none" stroke="#c03a23" stroke-width="2" stroke-dasharray="6 4"/>`:''}<path d="${path(buckets)}" fill="none" stroke="#003cc5" stroke-width="2.5"/><line id="cursor" class="cursor-line" y1="${top}" y2="${bottom}" visibility="hidden"/>`+buckets.map((b,i)=>`<circle cx="${x(i)}" cy="${y(b[metric])}" r="3" fill="#003cc5"/><text x="${x(i)}" y="240" text-anchor="middle">${grain==='week'?`${b.start}–${b.end}`:b.start}</text><rect data-bucket="${i}" x="${i? (x(i-1)+x(i))/2:left-10}" y="${top}" width="${buckets.length===1?right-left+20:(right-left)/(buckets.length-1)*(i===0||i===buckets.length-1?.5:1)+ (i===0||i===buckets.length-1?10:0)}" height="${bottom-top}" fill="transparent" tabindex="${i===0?0:-1}" role="button" aria-label="${dayLabel(b)}: ${value(b[metric])}. Show ${b.count} orders."/>`).join('');
    $('chart').querySelectorAll('[data-bucket]').forEach(el=>{
      const i=Number(el.dataset.bucket);
      el.addEventListener('pointerenter',()=>showTip(i,x(i)));
      el.addEventListener('focus',()=>showTip(i,x(i)));
      el.addEventListener('click',()=>{selected=i;hideTip();renderOrders();});
      el.addEventListener('keydown',e=>{if(e.key==='Escape') hideTip(); if(e.key==='Enter'||e.key===' '){e.preventDefault();selected=i;hideTip();renderOrders();} if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const next=Math.max(0,Math.min(buckets.length-1,i+(e.key==='ArrowRight'?1:-1)));el.tabIndex=-1;const target=$('chart').querySelector(`[data-bucket="${next}"]`);target.tabIndex=0;target.focus();}});
    });
  }
  function showTip(i,x) {
    const b=buckets[i], p=previousBuckets[i], tip=$('tooltip');
    tip.innerHTML=`<h3>${dayLabel(b)} 2026</h3>`+[['Net sales',money(b.net)],['VAT',money(b.vat)],['Gross sales',money(b.gross)],['Known goods costs',money(b.cost)],['Gross profit'+(b.missing?' *':''),money(b.profit)],['Gross margin',pct(margin(b))],['Orders / units',`${b.count} / ${b.units}`],['Average order (net)',money(b.count?b.net/b.count:0)]].map(([k,v])=>`<div class="row"><span>${k}</span><strong>${v}</strong></div>`).join('')+($('compare').checked?`<div class="row total"><span>Prior net sales</span><strong>${money(p.net)}</strong></div><small>Same dates in ${monthName(Number($('period').value)-1)} · ${delta(b.net,p.net)}</small>`:'')+`<small>${b.missing?`* ${b.missing} order(s) missing costs. `:''}Click to show ${b.count} orders below.</small>`;
    tip.hidden=false;
    const wrap=$('chart').parentElement, px=x/1000*wrap.clientWidth;
    tip.style.left=`${Math.max(4,Math.min(wrap.clientWidth-tip.offsetWidth-4,px>wrap.clientWidth/2?px-tip.offsetWidth-16:px+16))}px`;tip.style.top='12px';
    $('cursor').setAttribute('x1',x);$('cursor').setAttribute('x2',x);$('cursor').setAttribute('visibility','visible');
  }
  function hideTip(){ $('tooltip').hidden=true; $('cursor')?.setAttribute('visibility','hidden'); }
  function visibleOrders(){return current.filter(r=>(selected===null||(r.day>=buckets[selected].start&&r.day<=buckets[selected].end))&&($('order-filter').value==='all'||($('order-filter').value==='missing'?r.missing:!r.missing&&margin(sum([r]))<25))).sort((a,b)=>b.day-a.day||b.id-a.id);}
  function renderOrders(){
    const rows=visibleOrders(),s=sum(rows);
    $('orders-title').textContent=selected===null?'All customer orders in selected period':`Customer orders · ${dayLabel(buckets[selected])}`;
    $('orders-subtitle').textContent='Every matching order is included. Scroll to browse the complete list.';
    $('clear-bucket').hidden=selected===null;
    $('orders').innerHTML=rows.length?rows.map(r=>`<tr><td><strong>#${r.id}</strong><small>${r.date}</small></td><td>${escape(r.customer)}<small>${escape(r.job)} · ${escape(r.type)}</small></td><td>${money(r.net)}</td><td>${r.missing?'<span class="warning">Missing cost</span>':money(r.cost)}</td><td>${money(r.net-r.cost)}${r.missing?' *':''}</td><td class="${!r.missing&&margin(sum([r]))<25?'warning':''}">${r.missing?'Provisional':pct(margin(sum([r])))}</td></tr>`).join(''):'<tr><td colspan="6">No orders match these filters.</td></tr>';
    $('order-count').textContent=`${rows.length} of ${current.length} period orders · Net sales ${money(s.net)} · Known costs ${money(s.cost)} · Gross profit ${money(s.profit)}${s.missing?' (provisional)':''}`;
  }
  for(const id of ['period','type','compare']) $(id).addEventListener('change',()=>{selected=null;render();});
  document.querySelectorAll('[data-grain]').forEach(b=>b.addEventListener('click',()=>{grain=b.dataset.grain;selected=null;document.querySelectorAll('[data-grain]').forEach(el=>el.classList.toggle('active',el===b));render();}));
  $('kpis').addEventListener('click',e=>{const b=e.target.closest('[data-metric]');if(b){metric=b.dataset.metric;render();}});
  $('chart').addEventListener('pointerleave',hideTip);
  $('chart').addEventListener('focusout',e=>{if(!$('chart').contains(e.relatedTarget))hideTip();});
  $('order-filter').addEventListener('change',renderOrders);
  $('clear-bucket').addEventListener('click',()=>{selected=null;renderOrders();});
  $('review-costs').addEventListener('click',()=>{selected=null;$('order-filter').value='missing';renderOrders();$('order-filter').focus();$('orders-title').scrollIntoView({behavior:'smooth',block:'center'});});
  $('export').addEventListener('click',()=>{
    const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';
    const csv=[['Order','Date','Customer','Job','Type','Net sales GBP','VAT GBP','Known cost GBP','Gross profit GBP','Cost missing'],...visibleOrders().map(r=>[r.id,r.date,r.customer,r.job,r.type,r.net.toFixed(2),r.vat.toFixed(2),r.missing?'':r.cost.toFixed(2),(r.net-r.cost).toFixed(2),r.missing?'Yes - profit provisional':'No'])].map(r=>r.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`SAMPLE-orders-2026-${$('period').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  render();
})();
