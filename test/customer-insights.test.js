const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { buildCustomers,selectCustomers,monthsBefore,todayLondon,JOBS_SQL,createSnapshotLoader }=require('../src/services/customerInsights');
const {createRouter}=require('../src/routes/insights');
const job=(id,date,net=1000,extra={})=>({source_order_id:id,order_no:id,customer_id:1,customer_name:'Acme',order_date:date,net,missing:0,...extra});
const snap=jobs=>({jobs,profiles:[],contacts:[],dtf:[],fetchedAt:'2026-10-28T12:00:00Z'});
const build=s=>buildCustomers(s,{today:'2026-10-28',years:3});
test('calendar boundaries clamp leap days and use London today',()=>{
 assert.equal(monthsBefore('2024-02-29',12),'2023-02-28');assert.equal(monthsBefore('2026-08-31',6),'2026-02-28');
 assert.equal(todayLondon(new Date('2026-06-01T23:30:00Z')),'2026-06-02');
});
test('duplicate names/IDs merge without multiplying values; active aliases exclude candidates',()=>{
 const r=build(snap([job(1,'2025-01-01',6000),job(2,'2026-02-01',100,{customer_id:2,customer_name:' ACME '}),job(3,'2026-10-01',500,{customer_id:2,customer_name:'New Acme'})]));
 assert.equal(r.customers.length,1);const c=r.customers[0];assert.equal(c.lifetimeValue,6600);assert.equal(c.periodOrders,3);assert.equal(c.candidate,false);
});
test('selected period bounds, invalid dates and annual totals reconcile',()=>{
 const r=build(snap([job(1,'2023-10-27',200),job(2,'2023-10-28',3000),job(3,'2024-10-28',2000),job(4,'2025-10-28',500),job(5,'2026-10-29',80000),job(6,'1931-01-01',90000)]));
 const c=r.customers[0];assert.equal(r.invalidDates,2);assert.equal(c.periodValue,5500);assert.equal(c.lifetimeValue,5700);assert.deepEqual(c.annual.map(x=>x.value),[3000,2000,500]);assert.equal(c.candidate,true);
});
test('six month boundary and DTF activity prevent false lapsed recommendations',()=>{
 assert.equal(build(snap([job(1,'2026-04-28',6000)])).customers[0].candidate,false);
 const s=snap([job(1,'2026-04-27',6000,{contact_email:'a@example.com'})]);assert.equal(build(s).customers[0].candidate,true);
 s.dtf=[{customer_name:'Different label',customer_email:'A@example.com',last_order:'2026-10-02'}];const c=build(s).customers[0];assert.equal(c.candidate,false);assert.equal(c.lastActivity,'2026-10-02');assert.equal(c.periodValue,6000);
});
test('shared email identity review blocks recommendations; contacts never change financial totals',()=>{
 const s=snap([job(1,'2025-01-01',6000,{contact_email:'shared@example.com'}),job(2,'2026-10-01',100,{customer_id:2,customer_name:'Other',contact_email:'shared@example.com'})]);
 s.contacts=[{customer_id:1,customer_name:'Acme',contact_email:'extra@example.com'},{customer_id:1,customer_name:'Acme',contact_email:'third@example.com'}];
 const c=build(s).customers.find(c=>c.name==='Acme');assert.equal(c.sharedContact,true);assert.equal(c.candidate,false);assert.equal(c.periodValue,6000);
});
test('order volume qualifies low spend, cadence uses distinct dates, and presets paginate',()=>{
 const jobs=Array.from({length:10},(_,i)=>job(i,`2025-${String(i+1).padStart(2,'0')}-01`,10));jobs.push(job(11,'2025-10-01',0));
 jobs.push(job(12,'2026-10-01',10000,{customer_id:2,customer_name:'Big'}));const result=build(snap(jobs));
 const c=result.customers.find(c=>c.name==='Acme');assert.equal(c.candidate,true);assert.ok(c.cadence>=28&&c.cadence<=31);assert.ok(c.score>0);
 assert.equal(selectCustomers(result,{preset:'contact'}).total,1);assert.equal(selectCustomers(result,{preset:'value'}).customers[0].name,'Big');assert.equal(selectCustomers(result,{preset:'orders'}).customers[0].name,'Acme');
 const selected=selectCustomers(result,{preset:'all',page:99,pageSize:1});assert.equal(selected.page,2);assert.equal(selected.summary.orders,12);
 assert.equal(selectCustomers(result,{preset:'all',search:'no match'}).total,0);
});
test('SQL excludes internal lines and counts missing prices while retaining unpriced orders',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE database_jobs(source_order_id int,order_no int,customer_id int,customer_name text,order_date timestamp,job_title text,order_type text,contact_name text,contact_email text,contact_phone text,contact_mobile text); CREATE TABLE database_job_line_items(source_order_id int,quantity int,unit_price numeric,is_internal boolean); INSERT INTO database_jobs(source_order_id,order_date) VALUES(1,\'2026-01-01\'),(2,\'2026-02-01\'); INSERT INTO database_job_line_items VALUES(1,2,10,false),(1,5,100,true),(1,3,NULL,false);');
 const rows=(await db.query(JOBS_SQL)).rows.sort((a,b)=>a.source_order_id-b.source_order_id);assert.equal(rows[0].net,20);assert.equal(rows[0].missing,1);assert.equal(rows[1].net,0);
 }finally{await db.close();}
});
test('route guards unauthenticated/uploader-only users and rejects invalid filters before reads',async()=>{
 let reads=0;const router=createRouter({},async()=>{reads++;return snap([])});const stack=router.stack.find(l=>l.route).route.stack;
 function response(){return{statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this},set(){return this}};}
 for(const [user,code]of[[null,401],[{access_scope:'dtf_only'},403]]){const res=response();stack[0].handle({hubUser:user},res,()=>assert.fail('Access granted'));assert.equal(res.statusCode,code)}
 for(const query of [{years:'99'},{page:'-1'},{years:['3']},{search:['x']},{preset:'invalid'}]){const res=response();await stack[1].handle({query},res,e=>{throw e});assert.equal(res.statusCode,400)}
 assert.equal(reads,0);const res=response();await stack[1].handle({query:{}},res,e=>{throw e});assert.equal(res.statusCode,200);assert.equal(res.body.total,0);
});
test('snapshot loader coalesces requests and uses a read-only transaction',async()=>{
 const calls=[];let connections=0;const client={async query(sql){calls.push(sql);return{rows:[]}},release(){calls.push('release')}};
 const load=createSnapshotLoader({async connect(){connections++;return client}});await Promise.all([load(),load()]);await load();assert.equal(connections,1);assert.match(calls[0],/REPEATABLE READ READ ONLY/);assert.ok(calls.includes('COMMIT'));assert.equal(calls.at(-1),'release');
});
test('business-domain overlap flags related active accounts, while personal providers do not',()=>{
 for(const [domain,expected] of [['example.com',true],['gmail.com',false]]){
 const s=snap([job(1,'2025-01-01',6000,{contact_email:`old@${domain}`}),job(2,'2026-10-01',100,{customer_id:2,customer_name:'Other',contact_email:`new@${domain}`})]);const c=build(s).customers.find(c=>c.name==='Acme');assert.equal(c.sharedDomain,expected);assert.equal(c.candidate,!expected);
 }
});
test('closed Special Wear identity is excluded from every preset and summary without affecting other customers',()=>{
 const r=build(snap([job(1,'2025-01-01',6000,{customer_id:469,customer_name:'Special Wear UK Ltd'}),job(2,'2025-02-01',100,{customer_id:470,customer_name:'Special Wear UK Ltd'}),job(3,'2025-01-01',8000,{customer_id:999,customer_name:'Special Events Ltd'})]));
 for(const preset of ['contact','value','orders','all','lapsed','dormant']){const result=selectCustomers(r,{preset});assert.equal(result.total,1);assert.equal(result.summary.value,8000);assert.equal(result.customers[0].name,'Special Events Ltd');}
});
test('Insights order buttons invoke DATABASE Order Info in the current tab',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let click;const feedback={textContent:''};
 const root={addEventListener(type,handler){if(type==='click')click=handler},contains(){return true},querySelector(){return feedback}};
 const calls=[],button={dataset:{insOrder:'50604'},disabled:false};
 const source=fs.readFileSync(require.resolve('../public/insights.js'),'utf8');
 vm.runInNewContext(source,{document:{getElementById:()=>root},window:{async ultimateHubOpenDatabaseOrder(...args){calls.push(args)}},localStorage:{getItem:()=>null},Intl,Date,Number});
 await click({target:{closest:()=>button}});assert.deepEqual(calls,[[50604,'details']]);assert.equal(button.disabled,false);
 assert.doesNotMatch(source,/target="_blank"|database-job\.html|window\.open/);
 assert.match(source,/class="ins-open-order" data-ins-order=/);assert.match(source,/class="ins-history-order" data-ins-order=/);
});
