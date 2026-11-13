(() => {
 const root=document.querySelector('#tab-site-analytics');if(!root)return;
 const $=id=>root.querySelector('#site-'+id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>Number(v||0).toLocaleString('en-GB');
 const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(Number(v||0)/100);
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const label=p=>p==='/'?'Home':p==='/order-confirmation'?'Order confirmation':p.replace(/^\//,'').replace(/\.html$/,'').split('-').map(w=>w[0]?.toUpperCase()+w.slice(1)).join(' ');
 let busy=false,queued=false,latestTrend,lastChartWidth;
 function dates(days){$('to').value=today();$('from').value=new Date(Date.parse(today())-(days-1)*86400000).toISOString().slice(0,10);}
 function table(id,rows,columns){
  const body=$(id);
  const headings=[...body.closest('table').tHead.rows[0].cells].map(cell=>cell.textContent);
  body.innerHTML=rows.length?rows.map(row=>'<tr>'+columns.map((fn,index)=>
   `<td data-label="${esc(headings[index])}">${esc(fn(row))}</td>`
  ).join('')+'</tr>').join(''):`<tr><td colspan="${columns.length}" class="site-empty">No activity yet</td></tr>`;
 }
 function chart(rows,granularity){
  lastChartWidth=$('chart').clientWidth;
  const hourly=granularity==='hour';
  $('chart-title').textContent=hourly?'Hourly page views':'Daily page views';
  if(hourly){
   const width=Math.max(1,lastChartWidth),left=42,right=12,top=15,bottom=176,max=Math.max(1,...rows.map(r=>r.views));
   const x=i=>left+i*(width-left-right)/Math.max(1,rows.length-1),y=v=>bottom-v/max*(bottom-top);
   const time=h=>new Date(h).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
   const tickStep=width<360?6:width<600?4:3;
   const ticks=[...new Set([0,Math.round(max/2),max])];
   $('chart').innerHTML=`<svg viewBox="0 0 ${width} 210" role="img" aria-label="Hourly page views, London time" preserveAspectRatio="none">${ticks.map(v=>`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#373b40"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" fill="#fff" font-size="12">${number(v)}</text>`).join('')}<polyline points="${rows.map((r,i)=>`${x(i)},${y(r.views)}`).join(' ')}" fill="none" stroke="#94cafa" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.views)}" r="3" fill="#94cafa"><title>${esc(time(r.hour))}: ${number(r.views)} page views</title></circle>${i===rows.length-1||(i%tickStep===0&&i<rows.length-2)?`<text x="${x(i)}" y="202" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}" fill="#fff" font-size="12">${esc(time(r.hour))}</text>`:''}`).join('')}</svg>`;
   $('chart-start').textContent='';$('chart-end').textContent='';$('chart-peak').textContent=`Peak ${number(Math.max(0,...rows.map(r=>r.views)))}`;return;
  }
  const max=Math.max(1,...rows.map(r=>r.views)),width=Math.max(600,rows.length*12),height=180,step=width/rows.length;
  $('chart').innerHTML=`<svg viewBox="0 0 ${width} 210" role="img" aria-label="Daily page views" preserveAspectRatio="none"><line x1="0" y1="180" x2="${width}" y2="180" stroke="#535a63"/>${rows.map((r,i)=>{const h=r.views/max*160;return `<rect x="${i*step+step*.15}" y="${height-h}" width="${step*.7}" height="${h}" rx="2" fill="#94cafa"><title>${esc(r.day)}: ${number(r.views)} page views</title></rect>`;}).join('')}</svg>`;
  $('chart-start').textContent=rows[0]?.day||'';$('chart-end').textContent=rows.at(-1)?.day||'';$('chart-peak').textContent=`Peak ${number(Math.max(0,...rows.map(r=>r.views)))}`;
 }
 async function load(){
  if(busy){queued=true;return;}busy=true;$('refresh').disabled=true;$('status').textContent='';
  try{
   const response=await fetch(`/api/site-analytics?from=${encodeURIComponent($('from').value)}&to=${encodeURIComponent($('to').value)}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load analytics. Please refresh.');
   const t=data.totals,s=data.sales;
   const metrics=[['Page views',number(t.views)],['Landing views',number(t.entries)],['Product views',number(t.product_views)],['Added to basket',number(t.adds)],['Checkout starts',number(t.checkouts)],['Paid orders',number(s.paid)],['Sales incl. VAT',money(s.revenue)],['Contact clicks',number(t.enquiries)]];
   $('metrics').innerHTML=metrics.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');
   $('since').textContent=data.startedAt?'Tracking from '+new Date(data.startedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Europe/London'}):'';
   latestTrend=[data.trend,data.trendGranularity];
   chart(...latestTrend);
   table('products',data.products,[r=>r.name,r=>r.pricePence==null?'—':money(r.pricePence),r=>number(r.views),r=>number(r.adds),r=>number(r.sold)]);
   table('landing',data.landing,[r=>label(r.path),r=>number(r.entries)]);
   table('pages',data.pages,[r=>label(r.path),r=>number(r.views)]);
   table('devices',data.devices,[r=>r.device,r=>number(r.views)]);
   table('shopping',[{name:'Engaged page views (10s)',value:t.engaged},{name:'Continued to payment',value:t.payments},{name:'Orders awaiting payment',value:s.pending},{name:'Expired checkouts',value:s.expired}],[r=>r.name,r=>number(r.value)]);
  }catch(e){$('status').textContent=e.message;}finally{busy=false;$('refresh').disabled=false;if(queued){queued=false;load();}}
 }
 $('range').addEventListener('change',()=>{const custom=$('range').value==='custom';$('custom').hidden=!custom;if(!custom){dates(Number($('range').value));load();}});
 $('apply').addEventListener('click',load);$('refresh').addEventListener('click',load);dates(7);
 if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => {
   const width=$('chart').clientWidth;
   if (latestTrend && width && width!==lastChartWidth) chart(...latestTrend);
  }).observe($('chart'));
 }
 window.loadSiteAnalytics=load;
})();
