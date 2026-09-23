/* Live DATABASE Reports enhancements. No sample data or extra API requests. */
(function (root) {
  'use strict';
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fields = ['grossSales', 'netSales', 'vat', 'costOfGoods', 'grossProfit', 'orderCount', 'unitsSold', 'missingCostLines', 'missingPriceLines'];
  const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(numeric(value));
  const percent = value => `${numeric(value).toFixed(1)}%`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // API dates are Europe/London wall-clock strings. UTC arithmetic here preserves
  // calendar days across DST without interpreting the browser's local timezone.
  const date = value => new Date(`${String(value).slice(0, 19)}Z`);
  const stamp = value => value.toISOString().slice(0, 19);
  function bucketEnd(start, grain) {
    const d = date(start);
    if (grain === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (grain === 'hour') d.setUTCHours(d.getUTCHours() + 1);
    else d.setUTCDate(d.getUTCDate() + 1);
    return stamp(d);
  }
  function groupWeeks(series) {
    const result = [];
    for (const point of series) {
      const d = date(point.bucketStart);
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
      const key = stamp(d).slice(0, 10);
      let group = result[result.length - 1];
      if (!group || group.weekKey !== key) {
        group = { weekKey: key, bucketStart: point.bucketStart, ...Object.fromEntries(fields.map(k => [k, 0])) };
        result.push(group);
      }
      for (const key of fields) group[key] += numeric(point[key]);
      group.bucketEnd = bucketEnd(point.bucketStart, 'day');
    }
    return result;
  }
  function totals(orders) {
    const result = Object.fromEntries(fields.map(k => [k, 0]));
    for (const order of orders) {
      for (const key of fields) if (key !== 'orderCount') result[key] += numeric(order[key]);
      result.orderCount++;
    }
    return result;
  }
  const margin = row => numeric(row.netSales) ? numeric(row.grossProfit) / numeric(row.netSales) * 100 : null;
  const marginText = row => margin(row) === null ? '—' : percent(margin(row));
  function filterOrders(orders, { bucket = null, grain = 'day', type = '', query = '', mode = 'all' } = {}) {
    const needle = query.trim().toLocaleLowerCase('en-GB');
    return orders.filter(order => {
      if (bucket && (!order.salesAt || order.salesAt < bucket.bucketStart || order.salesAt >= (bucket.bucketEnd || bucketEnd(bucket.bucketStart, grain)))) return false;
      if (type && order.orderType !== type) return false;
      if (needle && ![order.orderNo, order.customerName, order.jobTitle].join(' ').toLocaleLowerCase('en-GB').includes(needle)) return false;
      if (mode === 'missing' && !numeric(order.missingCostLines) && !numeric(order.missingPriceLines)) return false;
      if (mode === 'low' && (numeric(order.missingCostLines) || numeric(order.missingPriceLines) || margin(order) === null || margin(order) >= 25)) return false;
      return true;
    });
  }
  function csv(orders) {
    const quote = value => {
      const text = String(value ?? '');
      const safe = typeof value !== 'number' && /^(\s*[=+@-]|[\t\r\n])/.test(text) ? "'" + text : text;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const rows = [['Order', 'Order date', 'Customer', 'Job', 'Type', 'Gross sales GBP', 'Net sales GBP', 'VAT GBP', 'Known goods cost GBP', 'Gross profit GBP', 'Margin percent', 'Missing cost lines', 'Missing price lines']];
    orders.forEach(o => rows.push([o.orderNo, o.salesAt, o.customerName, o.jobTitle, o.orderType, Number(numeric(o.grossSales).toFixed(2)), Number(numeric(o.netSales).toFixed(2)), Number((numeric(o.grossSales)-numeric(o.netSales)).toFixed(2)), Number(numeric(o.costOfGoods).toFixed(2)), Number(numeric(o.grossProfit).toFixed(2)), margin(o) === null ? '' : Number(margin(o).toFixed(1)), o.missingCostLines, o.missingPriceLines]));
    return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
  }
  const core = { groupWeeks, bucketEnd, totals, margin, filterOrders, csv };
  if (typeof module === 'object' && module.exports) { module.exports = core; return; }

  const $ = id => document.getElementById(id);
  let data, comparison, draw, series = [], selected = null, weekly = false, mounted = false, lastSelection = '';
  function mount() {
    if (mounted) return;
    const chartPanel = document.querySelector('#db-reports-view .db-report-chart-panel');
    if (!chartPanel) return;
    chartPanel.insertAdjacentHTML('beforebegin', `<div class="db-report-explore"><span>Hover or use arrow keys for details · Click a date to show its orders</span><label>Graph grouping <select id="db-report-group"><option value="default">By period</option><option value="week">Calendar week</option></select></label></div>`);
    $('db-reports-chart-wrap').insertAdjacentHTML('beforeend', '<div id="db-report-hover" role="status" class="db-report-hover" hidden></div>');
    $('db-reports-kpis').insertAdjacentHTML('afterend', `<div id="db-report-health" class="db-report-health"></div>`);
    document.querySelector('#db-reports-view .db-reports-actions').insertAdjacentHTML('beforebegin', `<section id="db-report-order-panel" class="db-report-panel db-report-order-panel">
      <div class="db-report-order-heading"><strong id="db-report-order-heading">All customer orders in selected period</strong><button id="db-report-clear-date" class="db-toolbar-button" type="button" hidden>Clear date selection</button></div>
      <p id="db-report-order-basis"></p>
      <div class="db-report-order-filters"><label>Search <input id="db-report-order-search" type="search" placeholder="Customer, order or job"></label><label>Type <select id="db-report-order-type"><option value="">All types</option></select></label><label>Show <select id="db-report-order-filter"><option value="all">All orders</option><option value="low">Margin below 25%</option><option value="missing">Missing costs / prices</option></select></label><button id="db-report-csv" class="db-toolbar-button" type="button">Export CSV</button></div>
      <div class="db-report-order-scroll"><table class="db-report-mini-table"><thead><tr><th>Order / date</th><th>Customer / job</th><th>Gross sales</th><th>Net sales</th><th>Known cost</th><th>Gross profit</th><th>Margin</th></tr></thead><tbody id="db-report-orders"></tbody></table></div>
      <div id="db-report-order-totals" role="status"></div></section>`);
    $('db-report-group').addEventListener('change', () => { weekly = $('db-report-group').value === 'week'; selected = null; renderGraph(); renderOrders(); });
    $('db-report-clear-date').addEventListener('click', () => { selected = null; renderOrders(); });
    for (const id of ['db-report-order-type', 'db-report-order-filter']) $(id).addEventListener('change', renderOrders);
    $('db-report-order-search').addEventListener('input', renderOrders);
    $('db-report-csv').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([csv(visibleOrders())], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `orders-${data.periodStart}-${data.periodEnd}.csv`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
    $('db-reports-chart').addEventListener('pointerleave', hideHover);
    $('db-reports-chart').addEventListener('focusout', event => { if (!$('db-reports-chart').contains(event.relatedTarget)) hideHover(); });
    new ResizeObserver(() => {
      const view = $('db-reports-view');
      if (view.offsetHeight) view.closest('.db-legacy-app').style.setProperty('--db-reports-height', `${Math.ceil(view.offsetHeight * 1.2 + 60)}px`);
    }).observe($('db-reports-view'));
    mounted = true;
  }
  function clear() {
    hideHover(); data = null; selected = null;
    if (!mounted) return;
    $('db-report-health').replaceChildren();
    $('db-report-orders').replaceChildren();
    $('db-report-order-totals').textContent = '';
    $('db-report-order-panel').hidden = true;
    $('db-report-group').disabled = true;
  }
  function render(report, compared, renderChart) {
    mount(); if (!mounted) return;
    data = report; comparison = compared; draw = renderChart;
    const selection = [report.periodStart, report.periodEnd, report.grain, compared?.secondary?.periodStart, compared?.secondary?.periodEnd].join('|');
    if (selection !== lastSelection) {
      selected = null; $('db-report-order-filter').value = 'all'; $('db-report-order-search').value = ''; $('db-report-order-type').value = '';
    }
    lastSelection = selection;
    const priorType = $('db-report-order-type').value;
    $('db-report-order-type').innerHTML = '<option value="">All types</option>' + [...new Set((data.orders || []).map(o => o.orderType || 'Other'))].sort().map(type => `<option>${escape(type)}</option>`).join('');
    $('db-report-order-type').value = priorType;
    if ($('db-report-order-type').selectedIndex < 0) $('db-report-order-type').value = '';
    const canGroup = data.grain === 'day' && !comparison;
    $('db-report-group').disabled = !canGroup;
    $('db-report-group').title = canGroup ? 'Monday–Sunday; edge weeks include selected dates only' : 'Calendar weeks are available for a single daily-bucket period. Comparisons retain aligned dates.';
    if (!canGroup) weekly = false;
    $('db-report-group').value = weekly ? 'week' : 'default';
    $('db-report-order-panel').hidden = false;
    renderHealth(); renderContributions(); renderGraph(); renderOrders();
  }
  const detail = (label, value) => `<div class="db-report-health-row"><span>${label}</span><strong>${value}</strong></div>`;
  function renderHealth() {
    const s = data.summary || {}, lines = numeric(s.financialLineCount), missing = numeric(s.missingCostLines), unpriced = numeric(s.missingPriceLines);
    const provisional = missing || unpriced;
    const low = filterOrders(data.orders || [], { mode: 'low' }).length;
    const p = comparison?.secondary?.summary;
    $('db-report-health').innerHTML = `<section class="db-report-panel"><h3>Where your sales go</h3>${detail('Net sales',money(s.netSales))}${detail('− Recorded goods costs',money(s.costOfGoods))}${detail('= Gross profit'+(provisional?' *':''),money(s.grossProfit))}<p>Excludes VAT. Gross profit is before labour, rent and other overheads.${provisional?' * Provisional: costs or prices are missing.':''}</p></section>
      <section class="db-report-panel"><h3>Trading health</h3>${detail('Gross margin'+(provisional?' *':''),marginText(s))}${detail('Average order (net)',money(numeric(s.orderCount)?numeric(s.netSales)/numeric(s.orderCount):0))}${detail('Units sold',numeric(s.unitsSold).toLocaleString('en-GB'))}${detail('Orders below 25% margin',low)}<p>${p&&margin(s)!==null&&margin(p)!==null?`Margin change: ${(margin(s)-margin(p)).toFixed(1)} percentage points. `:''}Low-margin count excludes missing costs/prices.</p></section>
      <section class="db-report-panel"><h3>Cost coverage</h3><strong class="db-report-coverage-number">${lines?percent((lines-missing)/lines*100):'—'}</strong><p>invoiceable lines with recorded costs</p>${detail('Lines missing costs',missing)}${detail('Lines missing prices',unpriced)}<button id="db-report-review-costs" type="button" class="db-toolbar-button">Review missing costs / prices</button><p>${provisional?'Incomplete costs or prices can distort profit and margin.':'No missing cost or price values in this period.'}</p></section>`;
    $('db-report-review-costs').addEventListener('click', () => { selected=null; $('db-report-order-search').value=''; $('db-report-order-type').value=''; $('db-report-order-filter').value='missing'; renderOrders(); $('db-report-order-filter').focus(); });
  }
  function renderContributions() {
    const orders = data.orders || [];
    const group = key => {
      const groups = new Map();
      orders.forEach(order => { const name = order[key] || 'Other'; if (!groups.has(name)) groups.set(name,[]); groups.get(name).push(order); });
      return [...groups].map(([name,rows]) => ({name,...totals(rows)})).sort((a,b) => b.netSales-a.netSales);
    };
    $('db-report-customers-title').textContent = 'Customer contribution · top 5';
    $('db-report-customers-body').previousElementSibling.innerHTML = '<tr><th>Customer</th><th>Net sales</th><th>Share</th></tr>';
    $('db-report-customers-body').innerHTML = group('customerName').slice(0,5).map(row => `<tr><td>${escape(row.name)}</td><td>${money(row.netSales)}</td><td>${numeric(data.summary?.netSales)?percent(row.netSales/numeric(data.summary.netSales)*100):'—'}</td></tr>`).join('') || '<tr><td colspan="3">No orders in this period</td></tr>';
    $('db-report-types-title').textContent = 'Profitability by order type';
    $('db-report-types-body').previousElementSibling.innerHTML = '<tr><th>Type</th><th>Gross profit</th><th>Margin</th></tr>';
    $('db-report-types-body').innerHTML = group('orderType').map(row => `<tr><td>${escape(row.name)}</td><td>${money(row.grossProfit)}${row.missingCostLines||row.missingPriceLines?' *':''}</td><td>${marginText(row)}</td></tr>`).join('') || '<tr><td colspan="3">No orders in this period</td></tr>';
  }
  function label(point, grain = data.grain) {
    const formatter = new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric', ...(grain==='hour'?{hour:'2-digit',minute:'2-digit',hour12:false}:{}),timeZone:'UTC'});
    if (point.bucketEnd) return `${formatter.format(date(point.bucketStart))} – ${formatter.format(new Date(date(point.bucketEnd).getTime()-86400000))}`;
    if (grain==='month') return new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(date(point.bucketStart));
    return formatter.format(date(point.bucketStart));
  }
  function hideHover() { if ($('db-report-hover')) $('db-report-hover').hidden=true; $('db-report-crosshair')?.setAttribute('visibility','hidden'); }
  function renderGraph() {
    hideHover();
    series = weekly ? groupWeeks(data.series || []) : (data.series || []);
    draw(series, weekly ? 'week' : data.grain);
    const svg = $('db-reports-chart'), other = comparison?.secondary?.series || [], count=Math.max(series.length,other.length);
    if (!count) return;
    if (weekly) {
      const labels=svg.querySelectorAll('.db-report-chart-x-label');
      labels.forEach((node,i) => { if(series[i]) node.textContent=`${date(series[i].bucketStart).getUTCDate()}–${new Date(date(series[i].bucketEnd).getTime()-86400000).getUTCDate()}`; });
      $('db-reports-chart-subtitle').textContent='Calendar weeks · Monday–Sunday · Edge weeks use selected dates only';
    }
    svg.setAttribute('role','group');
    const left=68,right=878,step=count>1?(right-left)/(count-1):right-left;
    svg.insertAdjacentHTML('beforeend', `<line id="db-report-crosshair" x1="0" x2="0" y1="14" y2="194" stroke="#383399" stroke-dasharray="4 3" visibility="hidden"/>`+Array.from({length:count},(_,i)=>{
      const x=count===1?(left+right)/2:left+i*step;
      const start=i===0?left:(x-step/2),end=i===count-1?right:x+step/2;
      return `<rect data-report-bucket="${i}" x="${start}" y="14" width="${end-start}" height="180" fill="transparent" role="button" tabindex="${i===0?0:-1}" aria-label="${escape(series[i]?label(series[i]):label(other[i]))}. ${series[i]?`${numeric(series[i].orderCount)} orders. Show orders.`:'No matching date in primary period.'}"/>`;
    }).join(''));
    svg.querySelectorAll('[data-report-bucket]').forEach(target => {
      const index=Number(target.dataset.reportBucket),x=count===1?(left+right)/2:left+index*step;
      target.addEventListener('pointerenter',()=>showHover(index,x));
      target.addEventListener('focus',()=>showHover(index,x));
      const choose=()=>{ if (!series[index]) return; selected=series[index]; renderOrders(); hideHover(); };
      target.addEventListener('click',choose);
      target.addEventListener('keydown',event=>{
        if (event.key==='Escape') hideHover();
        if (event.key==='Enter'||event.key===' ') {event.preventDefault();choose();}
        if (event.key==='ArrowLeft'||event.key==='ArrowRight') {event.preventDefault();const next=Math.max(0,Math.min(count-1,index+(event.key==='ArrowRight'?1:-1)));target.tabIndex=-1;const element=svg.querySelector(`[data-report-bucket="${next}"]`);element.tabIndex=0;element.focus();}
      });
    });
  }
  function showHover(index,x) {
    const point=series[index], other=comparison?.secondary?.series?.[index];
    const info = (p,title) => !p?`<h4>${escape(title)}</h4><p>No matching date</p>`:`<h4>${escape(title)} · ${escape(label(p))}</h4>${detail('Net sales',money(p.netSales))}${detail('VAT',money(p.vat))}${detail('Gross sales',money(p.grossSales))}${detail('Known goods costs',money(p.costOfGoods))}${detail('Gross profit',money(p.grossProfit))}${detail('Margin',marginText(p))}${detail('Orders / units',`${numeric(p.orderCount)} / ${numeric(p.unitsSold)}`)}${detail('Average order (net)',money(numeric(p.orderCount)?numeric(p.netSales)/numeric(p.orderCount):0))}${numeric(p.missingCostLines)||numeric(p.missingPriceLines)?'<p class="db-report-warning">Provisional: missing costs or prices.</p>':''}`;
    const tip=$('db-report-hover');
    tip.innerHTML=`<div class="db-report-hover-columns"><section>${info(point,comparison?'Primary period':'Sales breakdown')}</section>${comparison?`<section>${info(other,'Compared period')}</section>`:''}</div><p>Click to show primary-period orders below.</p>`;
    tip.classList.toggle('is-comparison',Boolean(comparison));tip.hidden=false;
    // Convert the SVG coordinate to the wrapper's unscaled CSS coordinate system.
    const svg=$('db-reports-chart'),wrap=$('db-reports-chart-wrap'),rect=wrap.getBoundingClientRect();
    const p=svg.createSVGPoint();p.x=x;p.y=14;const screen=p.matrixTransform(svg.getScreenCTM());
    const localX=(screen.x-rect.left)*wrap.clientWidth/rect.width;
    tip.style.left=`${Math.max(0,Math.min(wrap.clientWidth-tip.offsetWidth,localX>wrap.clientWidth/2?localX-tip.offsetWidth-10:localX+10))}px`;
    tip.style.top='10px';
    $('db-report-crosshair').setAttribute('x1',x);$('db-report-crosshair').setAttribute('x2',x);$('db-report-crosshair').setAttribute('visibility','visible');
  }
  function visibleOrders() { return filterOrders(data?.orders || [],{bucket:selected,grain:data?.grain,type:$('db-report-order-type').value,query:$('db-report-order-search').value,mode:$('db-report-order-filter').value}).sort((a,b)=>String(b.salesAt).localeCompare(String(a.salesAt))||numeric(b.orderNo)-numeric(a.orderNo)); }
  function renderOrders() {
    if (!data) return;
    const orders=visibleOrders(),s=totals(orders);
    $('db-report-order-heading').textContent=selected?`Customer orders · ${label(selected)}`:'All customer orders in selected period';
    $('db-report-order-basis').textContent=`${comparison?'Primary period: ':''}${data.rangeLabel || ''} · ${data.periodStart} – ${data.periodEnd} · Order date · Invoiceable lines · Internal lines excluded`;
    $('db-report-clear-date').hidden=!selected;
    const cell=(name,value)=>`<td data-label="${name}">${value}</td>`;
    $('db-report-orders').innerHTML=orders.map(o=>{
      const incomplete=numeric(o.missingCostLines)||numeric(o.missingPriceLines);
      return '<tr>'+cell('Order / date',`<strong>#${escape(o.orderNo || o.sourceOrderId)}</strong><small>${escape(o.salesAt?.slice(0,10) || '—')}</small>`)+cell('Customer / job',`${escape(o.customerName)}<small>${escape(o.jobTitle)} · ${escape(o.orderType)}</small>`)+cell('Gross sales',money(o.grossSales))+cell('Net sales',money(o.netSales))+cell('Known cost',`${money(o.costOfGoods)}${numeric(o.missingCostLines)?'<small class="db-report-warning">Missing costs</small>':''}${numeric(o.missingPriceLines)?'<small class="db-report-warning">Missing prices</small>':''}`)+cell('Gross profit',`${money(o.grossProfit)}${incomplete?' *':''}`)+cell('Margin',incomplete?'Provisional':`<span class="${margin(o)!==null&&margin(o)<25?'db-report-warning':''}">${marginText(o)}</span>`)+'</tr>';
    }).join('')||'<tr><td colspan="7">No orders match these filters.</td></tr>';
    $('db-report-order-totals').textContent=`${orders.length} of ${(data.orders||[]).length} period orders · Net sales ${money(s.netSales)} · Known costs ${money(s.costOfGoods)} · Gross profit ${money(s.grossProfit)}${s.missingCostLines||s.missingPriceLines?' · * Provisional: costs or prices are missing.':''}`;
  }
  root.DatabaseReports = { render, clear };
})(typeof window === 'undefined' ? globalThis : window);
