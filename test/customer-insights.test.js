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
 assert.match(source,/class="ins-open-order" data-ins-order=/);assert.doesNotMatch(source,/ins-history-order|View order history and details|Add a note/);
});
test('calendar years are inclusive and gift filtering only sums matching orders; activity stays cross-type',()=>{
 const s=snap([job(1,'2022-12-31',999,{order_type:'Business gifts'}),job(2,'2023-01-01',2000,{order_type:'Business gifts'}),job(3,'2024-12-31',3000,{order_type:'Business Gifts'}),job(4,'2024-06-01',500,{order_type:'Printing'}),job(5,'2025-01-01',999,{order_type:'Business gifts'}),job(6,'2026-10-01',200,{order_type:'Embroidery'}),job(7,'2024-01-01',800,{customer_id:2,customer_name:'Print only',order_type:'Printing'})]);
 const r=buildCustomers(s,{fromYear:2023,toYear:2024,jobType:'gifts',today:'2026-10-28'});assert.equal(r.customers.length,1);const c=r.customers[0];assert.equal(c.periodValue,5000);assert.equal(c.periodOrders,2);assert.equal(c.lifetimeValue,7698);assert.equal(c.candidate,false);assert.equal(c.lastOrderDate,'2026-10-01');assert.deepEqual(c.annual.map(p=>p.value),[2000,3000]);assert.equal(r.end,'2024-12-31');
});
test('print, embroidery and combined orders remain distinct job-type filters',()=>{
 const s=snap([job(1,'2024-01-01',10,{order_type:'Printing'}),job(2,'2024-01-02',20,{order_type:'Embroidery'}),job(3,'2024-01-03',30,{order_type:'Print + Emb'})]);
 for(const [jobType,value]of[['print',10],['embroidery',20],['combined',30],['all',60]])assert.equal(buildCustomers(s,{jobType,today:'2026-10-28'}).customers[0].periodValue,value);
 assert.equal(buildCustomers(s,{jobType:'gifts',today:'2026-10-28'}).customers.length,0);
});
test('sales notes persist, retain concurrent authors, retry idempotently and follow merged identities',async()=>{
 const {ensureCustomerInsightsTables}=require('../src/db/customerInsightsSchema');const {addNote,attachNotes}=require('../src/services/customerInsightNotes');const db=new PGlite();
 try{
 await db.exec("CREATE TABLE hub_users(id int PRIMARY KEY); INSERT INTO hub_users VALUES(1),(2); CREATE TABLE database_jobs(source_order_id int,customer_id int,customer_name text); INSERT INTO database_jobs VALUES(10,1,'Acme'),(11,2,'Acme');");await ensureCustomerInsightsTables(db);await ensureCustomerInsightsTables(db);
 const first={sourceOrderId:10,body:'Called 28 October. Follow up next week.',requestId:'11111111-1111-4111-8111-111111111111',user:{id:1,first_name:'Sales',last_name:'One'}};
 assert.equal((await addNote(db,first)).status,201);assert.equal((await addNote(db,first)).status,200);
 assert.equal((await addNote(db,{...first,body:'Changed payload'})).status,409);
 assert.equal((await addNote(db,{sourceOrderId:11,body:'Customer replied.',requestId:'22222222-2222-4222-8222-222222222222',user:{id:2,first_name:'Sales',last_name:'Two'}})).status,201);
 const r=await attachNotes(db,selectCustomers(build(snap([job(10,'2025-01-01',6000),job(11,'2025-02-01',100,{customer_id:2})])),{preset:'all'}));assert.equal(r.customers[0].salesNotes.length,2);assert.equal(r.customers[0].salesNotes[0].created_by_name,'Sales Two');assert.equal(r.customers[0].noteKeys,undefined);assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM customer_insight_notes')).rows[0].n,2);
 assert.equal((await addNote(db,{...first,sourceOrderId:999})).status,404);
 }finally{await db.close()}
});
test('notes endpoint rejects unauthorized or invalid writes before accessing the database',async()=>{
 const router=createRouter({query(){assert.fail('Unexpected database access')}},async()=>snap([]));const route=router.stack.find(l=>l.route?.path==='/api/insights/notes').route.stack;
 const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
 for(const [user,status]of[[null,401],[{access_scope:'dtf_only'},403]]){const response=res();route[0].handle({hubUser:user},response,()=>assert.fail('Access granted'));assert.equal(response.statusCode,status)}
 for(const body of [{},{sourceOrderId:1,body:' '},{sourceOrderId:1,body:'x'.repeat(4001),requestId:'11111111-1111-4111-8111-111111111111'}]){const response=res();await route[1].handle({body},response,e=>{throw e});assert.equal(response.statusCode,400)}
});
test('year ranges and job types reject malformed filters',async()=>{
 const route=createRouter({},async()=>{assert.fail('Unexpected snapshot read')}).stack.find(l=>l.route?.path==='/api/insights/customers').route.stack[1].handle;
 for(const query of [{fromYear:'2024'},{fromYear:'2024',toYear:'2023'},{fromYear:'1999',toYear:'2024'},{fromYear:'2023',toYear:'9999'},{jobType:'sql'},{fromYear:['2023'],toYear:'2024'}]){let code;await route({query},{status(n){code=n;return this},json(){}},e=>{throw e});assert.equal(code,400)}
});
test('single sales-note field preserves legacy text, saves edits, rejects stale versions and can clear',async()=>{
 const {ensureCustomerInsightsTables}=require('../src/db/customerInsightsSchema');const {addNote,attachNotes,saveNoteDocument}=require('../src/services/customerInsightNotes');const db=new PGlite();
 const client={query(sql,args){if(sql.includes('pg_advisory_xact_lock'))return Promise.resolve({rows:[]});return db.query(sql,args)},release(){}};const pool={connect:async()=>client};
 try{
 await db.exec("CREATE TABLE hub_users(id int PRIMARY KEY);INSERT INTO hub_users VALUES(1),(2);CREATE TABLE database_jobs(source_order_id int,customer_id int,customer_name text);INSERT INTO database_jobs VALUES(10,1,'Acme')");await ensureCustomerInsightsTables(db);
 await addNote(db,{sourceOrderId:10,body:'Earlier contact record',requestId:'11111111-1111-4111-8111-111111111111',user:{id:1,first_name:'First'}});
 const result=()=>selectCustomers(build(snap([job(10,'2025-01-01',6000)])),{preset:'all'});
 assert.match((await attachNotes(db,result())).customers[0].salesNote.body,/Earlier contact record/);
 const args={noteKeys:['id:1'],body:'Earlier contact record\nFollow-up booked',version:0,documentKey:null,user:{id:1,first_name:'First'}};
 const saved=await saveNoteDocument(pool,args);assert.equal(saved.status,200);assert.equal(saved.salesNote.version,1);assert.equal((await saveNoteDocument(pool,args)).status,200);
 assert.equal((await saveNoteDocument(pool,{...args,body:'Stale edit',user:{id:2,first_name:'Second'}})).status,409);
 assert.equal((await attachNotes(db,result())).customers[0].salesNote.body,args.body);
 const cleared=await saveNoteDocument(pool,{...args,body:'',version:1,documentKey:'id:1'});assert.equal(cleared.salesNote.version,2);assert.equal((await attachNotes(db,result())).customers[0].salesNote.body,'');
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM customer_insight_notes')).rows[0].n,1);
 }finally{await db.close()}
});
test('single notes endpoint guards writes and rejects invalid versions before reading data',async()=>{
 const router=createRouter({},async()=>assert.fail('Unexpected snapshot read'));
 const route=router.stack.find(l=>l.route?.path==='/api/insights/notes'&&l.route.methods.put).route.stack;
 const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
 for(const [user,status]of[[null,401],[{access_scope:'dtf_only'},403]]){const response=res();route[0].handle({hubUser:user},response,()=>assert.fail('Access granted'));assert.equal(response.statusCode,status)}
 for(const body of [{},{sourceOrderId:1,body:'text',version:-1},{sourceOrderId:1,body:'x'.repeat(20001),version:0},{sourceOrderId:1,body:'text',version:0,documentKey:{bad:true}}]){const response=res();await route[1].handle({body},response,e=>{throw e});assert.equal(response.statusCode,400)}
});
