'use strict';
const products=require('../../web/hamper-collection/products.json');
const productByPath=new Map(products.map(p=>['/'+p.slug+'.html',p]));
const productBySku=new Map(products.map(p=>[p.sku,p]));
const paths=new Set(['/', '/all-hampers.html','/sweet-treats.html','/cheese-savoury.html','/wine-fizz.html','/luxury-hampers.html','/hamper-checkout.html','/order-confirmation',...productByPath.keys()]);
const ORIGINS=new Set(['https://christmashampers.ultimatepromotions.co.uk','https://ultimatechristmas-production.up.railway.app','https://www.ultimatehub.co.uk','https://mondayapp-refactor-production.up.railway.app']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function normalize(input,origin,userAgent=''){
 if(!input||typeof input!=='object'||!ORIGINS.has(origin)||input.excluded===true||/bot|crawler|spider|headless|preview|chatgpt|facebookexternalhit|lighthouse/i.test(userAgent))return null;
 if(!UUID.test(input.id||'')||!UUID.test(input.pageId||'')||!['pageview','engaged','add_cart','checkout_start','payment_start','enquiry'].includes(input.event))return null;
 const path=input.path==='/index.html'?'/':input.path;
 if(!paths.has(path))return null;
 const hub=/ultimatehub|mondayapp/.test(new URL(origin).hostname);
 if(hub!==['/hamper-checkout.html','/order-confirmation'].includes(path))return null;
 if(['checkout_start','payment_start'].includes(input.event)&&path!=='/hamper-checkout.html')return null;
 const product=productByPath.get(path);
 const sku=input.event==='add_cart'?String(input.sku||''):product?.sku||null;
 if(input.event==='add_cart'&&!productBySku.has(sku))return null;
 let referrer='direct / unknown',internal=false;
 try{const ref=new URL(input.referrer);if(['http:','https:'].includes(ref.protocol)){internal=ORIGINS.has(ref.origin);referrer=internal?'internal':ref.hostname.replace(/^www\./,'').slice(0,253);}}catch{}
 const device=/ipad|tablet/i.test(userAgent)?'Tablet':/mobile|android|iphone/i.test(userAgent)?'Mobile':'Desktop';
 return {id:input.id,pageId:input.pageId,event:input.event,path,sku,source:referrer,device,landing:input.event==='pageview'&&!internal&&path!=='/order-confirmation',quantity:input.event==='add_cart'&&Number.isInteger(input.quantity)?Math.max(1,Math.min(10000,input.quantity)):1};
}
async function record(db,e){
 await db.query(`INSERT INTO hub_site_events(id,page_id,event,path,sku,source,device,landing,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,[e.id,e.pageId,e.event,e.path,e.sku,e.source,e.device,e.landing,e.quantity]);
}
function dateRange(query,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const to=query.to||today,from=query.from||new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10);
 if(!valid(from)||!valid(to)||from>to||to>today||Date.parse(to)-Date.parse(from)>179*86400000)return null;
 return {from,to};
}
async function report(db,range){
 const params=[range.from,range.to];
 const hourly=range.from===range.to;
 const period="created_at >= ($1::date::timestamp AT TIME ZONE 'Europe/London') AND created_at < (($2::date+1)::timestamp AT TIME ZONE 'Europe/London')";
 const salesPeriod=period.replaceAll('created_at','o.created_at');
 const salesFilter=`o.mode='live' AND COALESCE(o.snapshot->>'discountLabel','') <> 'Single-use live test discount' AND ${salesPeriod}`;
 const [totals,trend,pages,landing,productRows,sources,devices,sales,topSales,config]=await Promise.all([
  db.query(`SELECT COUNT(*) FILTER(WHERE event='pageview')::int AS views,COUNT(*) FILTER(WHERE landing)::int AS entries,COUNT(DISTINCT page_id) FILTER(WHERE event='engaged')::int AS engaged,COUNT(*) FILTER(WHERE event='pageview' AND sku IS NOT NULL)::int AS product_views,COUNT(*) FILTER(WHERE event='add_cart')::int AS adds,COUNT(*) FILTER(WHERE event='checkout_start')::int AS checkouts,COUNT(*) FILTER(WHERE event='payment_start')::int AS payments,COUNT(*) FILTER(WHERE event='enquiry')::int AS enquiries FROM hub_site_events WHERE ${period}`,params),
  hourly ? db.query(`WITH hours AS (
   SELECT generate_series($1::date::timestamp AT TIME ZONE 'Europe/London', (($2::date+1)::timestamp AT TIME ZONE 'Europe/London')-INTERVAL '1 hour', INTERVAL '1 hour') AS hour
  ), activity AS (
   SELECT date_trunc('hour',created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour,
    COUNT(*) FILTER(WHERE event='pageview')::int AS views,COUNT(*) FILTER(WHERE landing)::int AS entries
   FROM hub_site_events WHERE ${period} GROUP BY 1
  ) SELECT hours.hour,COALESCE(activity.views,0)::int AS views,COALESCE(activity.entries,0)::int AS entries
   FROM hours LEFT JOIN activity USING(hour) ORDER BY hours.hour`,params) :
  db.query(`SELECT (created_at AT TIME ZONE 'Europe/London')::date::text AS day,COUNT(*) FILTER(WHERE event='pageview')::int AS views,COUNT(*) FILTER(WHERE landing)::int AS entries FROM hub_site_events WHERE ${period} GROUP BY 1 ORDER BY 1`,params),
  db.query(`SELECT path,COUNT(*)::int AS views FROM hub_site_events WHERE ${period} AND event='pageview' GROUP BY path ORDER BY views DESC,path LIMIT 10`,params),
  db.query(`SELECT path,COUNT(*)::int AS entries FROM hub_site_events WHERE ${period} AND landing GROUP BY path ORDER BY entries DESC,path LIMIT 10`,params),
  db.query(`SELECT sku,COUNT(*) FILTER(WHERE event='pageview')::int AS views,COUNT(*) FILTER(WHERE event='add_cart')::int AS adds FROM hub_site_events WHERE ${period} AND sku IS NOT NULL GROUP BY sku ORDER BY views DESC,adds DESC,sku`,params),
  db.query(`SELECT source,COUNT(*)::int AS entries FROM hub_site_events WHERE ${period} AND landing GROUP BY source ORDER BY entries DESC,source LIMIT 30`,params),
  db.query(`SELECT device,COUNT(*)::int AS views FROM hub_site_events WHERE ${period} AND event='pageview' GROUP BY device ORDER BY views DESC`,params),
  db.query(`SELECT COUNT(*)::int AS started,COUNT(*) FILTER(WHERE o.status='paid')::int AS paid,COUNT(*) FILTER(WHERE o.status='pending')::int AS pending,COUNT(*) FILTER(WHERE o.status='expired')::int AS expired,COALESCE(SUM((o.snapshot->>'totalPence')::bigint) FILTER(WHERE o.status='paid'),0)::text AS revenue FROM hamper_orders o WHERE ${salesFilter}`,params),
  db.query(`SELECT item->>'sku' AS sku,SUM((item->>'quantity')::int)::int AS sold FROM hamper_orders o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.snapshot->'items')='array' THEN o.snapshot->'items' ELSE jsonb_build_array(o.snapshot) END) item WHERE ${salesFilter} AND o.status='paid' GROUP BY 1`,params),
  db.query('SELECT started_at FROM hub_site_analytics_config WHERE id=1')
 ]);
 const merged=new Map(productRows.rows.map(r=>[r.sku,{...r,sold:0}]));for(const r of topSales.rows){if(!merged.has(r.sku))merged.set(r.sku,{sku:r.sku,views:0,adds:0,sold:0});merged.get(r.sku).sold=r.sold;}
 const days=new Map(trend.rows.map(r=>[r.day,r]));const series=hourly?trend.rows:[];for(let t=Date.parse(range.from);!hourly&&t<=Date.parse(range.to);t+=86400000){const day=new Date(t).toISOString().slice(0,10);series.push(days.get(day)||{day,views:0,entries:0});}
 return {range,startedAt:config.rows[0]?.started_at,totals:totals.rows[0],trend:series,trendGranularity:hourly?'hour':'day',pages:pages.rows,landing:landing.rows,sources:sources.rows,devices:devices.rows,sales:sales.rows[0],products:[...merged.values()].map(r=>({...r,name:productBySku.get(r.sku)?.name||r.sku})).sort((a,b)=>b.views-a.views||b.sold-a.sold)};
}
function startRetention(db){const clean=()=>db.query("DELETE FROM hub_site_events WHERE id IN (SELECT id FROM hub_site_events WHERE created_at<NOW()-INTERVAL '180 days' LIMIT 10000)").catch(()=>console.error('Site analytics retention cleanup failed'));setInterval(clean,3600000).unref();void clean();}
module.exports={normalize,record,dateRange,report,startRetention,ORIGINS};
