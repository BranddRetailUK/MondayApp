const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {normalize,record,dateRange,report}=require('../src/services/siteAnalytics');
const {ensureSiteAnalyticsTables}=require('../src/db/siteAnalyticsSchema');
const origin='https://christmashampers.ultimatepromotions.co.uk';
const input=()=>({id:crypto.randomUUID(),pageId:crypto.randomUUID(),event:'pageview',path:'/christmas-treats-basket.html',referrer:'https://example.com/private?email=person@example.com'});
test('collector accepts only known pages/products and stores no form contents or referrer path',()=>{
 const raw={...input(),email:'private@example.com',name:'Private name',delivery:{postcode:'secret'},query:'secret'};
 const e=normalize(raw,origin,'Mozilla Mobile');assert.equal(e.source,'example.com');assert.equal(e.sku,'H26002');assert.equal(e.device,'Mobile');assert.equal(e.landing,true);assert.equal(e.email,undefined);assert.ok(!JSON.stringify(e).includes('secret'));
 assert.equal(normalize({...raw,path:'/private-person@example.com'},origin),null);
 assert.equal(normalize(raw,'https://evil.example'),null);
 assert.equal(normalize(raw,origin,'Googlebot'),null);
 assert.equal(normalize({...raw,excluded:true},origin),null);
 assert.equal(normalize({...raw,event:'add_cart',sku:'not-real'},origin),null);
 assert.equal(normalize({...raw,path:'/hamper-checkout.html'},origin),null);
 assert.equal(normalize({...raw,referrer:'https://www.ultimatehub.co.uk/hamper-checkout.html'},origin).landing,false);
 assert.equal(normalize({...raw,path:'/order-confirmation'},'https://www.ultimatehub.co.uk').landing,false);
});
test('date ranges use London calendar dates and reject invalid or oversized intervals',()=>{
 assert.deepEqual(dateRange({},new Date('2026-07-10T23:30:00Z')),{from:'2026-07-05',to:'2026-07-11'});
 assert.equal(dateRange({from:'2026-02-30',to:'2026-03-01'}),null);
 assert.equal(dateRange({from:'2025-01-01',to:'2026-01-01'}),null);
});
test('analytics deduplicates event retries, fills empty days and excludes sandbox/test sales',async()=>{
 const pg=new PGlite(),db={query:(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};
 await ensureSiteAnalyticsTables(db);await ensureSiteAnalyticsTables(db);
 await db.query('CREATE TABLE hamper_orders (id UUID,mode TEXT,status TEXT,snapshot JSONB,created_at TIMESTAMPTZ)');
 const e=normalize(input(),origin);await record(db,e);await record(db,e);
 await record(db,{...e,id:crypto.randomUUID(),event:'engaged',landing:false});await record(db,{...e,id:crypto.randomUUID(),event:'add_cart',landing:false,quantity:2});
 await db.query("UPDATE hub_site_events SET created_at='2026-11-12T10:00:00Z'");
 const order={items:[{sku:'H26002',quantity:2}],totalPence:5000};
 for(const [mode,extra] of [['live',{}],['sandbox',{}],['live',{discountLabel:'Single-use live test discount'}]])await db.query("INSERT INTO hamper_orders VALUES($1,$2,'paid',$3,'2026-11-12T10:00:00Z')",[crypto.randomUUID(),mode,{...order,...extra}]);
 const data=await report(db,{from:'2026-11-11',to:'2026-11-12'});
 assert.equal(data.totals.views,1);assert.equal(data.totals.entries,1);assert.equal(data.totals.adds,1);assert.equal(data.totals.engaged,1);assert.equal(data.trend.length,2);assert.equal(data.trend[0].views,0);assert.equal(data.sales.paid,1);assert.equal(data.sales.revenue,'5000');assert.equal(data.products[0].sold,2);assert.equal(data.trendGranularity,'day');
 const hourly=await report(db,{from:'2026-11-12',to:'2026-11-12'});
 assert.equal(hourly.trendGranularity,'hour');assert.equal(hourly.trend.length,24);assert.equal(hourly.trend[10].views,1);assert.equal(hourly.trend[9].views,0);
 for(const timestamp of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z'])await db.query("INSERT INTO hub_site_events(id,page_id,event,path,source,device,created_at) VALUES($1,$2,'pageview','/','direct / unknown','Desktop',$3)",[crypto.randomUUID(),crypto.randomUUID(),timestamp]);
 const autumn=await report(db,{from:'2026-10-25',to:'2026-10-25'});
 assert.equal(autumn.trend.length,25);assert.equal(autumn.trend.filter(r=>r.views===1).length,2);assert.equal(autumn.trend.reduce((n,r)=>n+r.views,0),2);
 assert.equal((await report(db,{from:'2026-03-29',to:'2026-03-29'})).trend.length,23);
 for(let i=0;i<12;i++)for(let j=0;j<=i;j++)await db.query("INSERT INTO hub_site_events(id,page_id,event,path,source,device,landing,created_at) VALUES($1,$2,'pageview',$3,'direct / unknown','Desktop',true,'2026-11-12T11:00:00Z')",[crypto.randomUUID(),crypto.randomUUID(),'/page-'+String(i).padStart(2,'0')]);
 const top=await report(db,{from:'2026-11-12',to:'2026-11-12'});
 assert.equal(top.pages.length,10);assert.equal(top.landing.length,10);assert.equal(top.pages[0].path,'/page-11');assert.equal(top.landing[9].path,'/page-02');

 await pg.close();
});
test('storefront and checkout tracking stay identical and sending is never part of analytics',()=>{
 const fs=require('node:fs');assert.equal(fs.readFileSync('public/hamper-analytics.js','utf8'),fs.readFileSync('web/hamper-collection/analytics.js','utf8'));
 const source=fs.readFileSync('public/hamper-analytics.js','utf8');assert.match(source,/credentials:'omit'/);assert.match(source,/analytics_test/);assert.ok(!source.includes('sendMarketingEmail'));
});
test('browser tracker strips private referrers, honours opt-out and cannot interrupt checkout on transport errors',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync('public/hamper-analytics.js','utf8');
 function run({dnt=false,fail=false}={}){const calls=[],context={window:{},location:{search:'',pathname:'/christmas-treats-basket.html',href:origin+'/christmas-treats-basket.html',origin},navigator:{doNotTrack:dnt?'1':'0'},localStorage:{getItem:()=>null},crypto,URL,URLSearchParams,setInterval:()=>0,clearInterval:()=>{},document:{referrer:'https://example.com/private?email=secret@example.com',addEventListener:()=>{},querySelector:()=>null},fetch:(url,options)=>{if(fail)throw Error('Transport unavailable');calls.push({url,options});return Promise.resolve({});}};vm.runInNewContext(source,context);return{calls,context};}
 const {calls}=run();assert.equal(calls.length,1);const payload=JSON.parse(calls[0].options.body);assert.equal(payload.referrer,'https://example.com');assert.equal(calls[0].options.credentials,'omit');assert.ok(!JSON.stringify(payload).includes('secret'));
 assert.equal(run({dnt:true}).calls.length,0);
 const failed=run({fail:true});assert.doesNotThrow(()=>failed.context.window.HamperAnalytics.track('payment_start'));
});
