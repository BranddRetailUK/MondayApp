const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/database.js'),'utf8');
function ui(fetcher) {
  const requests=[],renders=[];
  const state={orderMode:'all',orderSearchQuery:'',activeGroup:'all',activeSort:'order',orderLoadToken:0,outstandingJobs:[],loadedOrderKey:'',outstandingTotal:0};
  const context=vm.createContext({state,AbortController,URLSearchParams,PAGE_LIMIT:100,
    els:{outstandingBody:{innerHTML:''}},
    window:{requestAnimationFrame(){}},console,
    ensureCustomerUsers:async()=>{},syncOutstandingTableMode(){},scheduleOutstandingTableLayout(){},
    renderStatusRow:message=>message,outstandingTableColumnCount:()=>9,storeDashboardStatusColors(){},
    renderOutstandingOrders:()=>renders.push(state.outstandingJobs.length),maybeExtendVisibleOrders(){},
    fetchJson:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}
  });
  vm.runInContext('let orderLoadController = null;\n'+source.slice(source.indexOf('  function currentOrderQueryKey('),source.indexOf('  function renderOutstandingOrders(')),context);
  return {context,state,requests,renders};
}
function page(offset,more=true){return {jobs:Array.from({length:100},(_,n)=>({source_order_id:offset+n+1})),limit:100,total:null,hasMore:more};}

test('first page appears without draining history; scroll requests exactly one next page and preserves filters',async()=>{
  const {context,state,requests}=ui(async url=>page(Number(new URL(url,'http://test').searchParams.get('offset'))));
  state.activeGroup='gifts';state.activeSort='delivery';state.orderSearchQuery='example';
  await context.loadOutstandingOrders();
  assert.equal(requests.length,1);assert.equal(state.outstandingJobs.length,100);
  assert.equal(state.loadingOrders,false);assert.equal(state.orderLoadComplete,false);
  assert.equal(state.outstandingTotal,101,'null total must not become zero');
  await context.loadNextOrdersPage();
  assert.equal(requests.length,2);assert.equal(state.outstandingJobs.length,200);
  const params=new URL(requests[1].url,'http://test').searchParams;
  assert.equal(params.get('offset'),'100');assert.equal(params.get('q'),'example');
  assert.equal(params.get('group'),'gifts');assert.equal(params.get('sort'),'delivery');
  assert.equal(params.get('includeTotal'),'false');
});

test('new search aborts obsolete requests and late responses never overwrite current results',async()=>{
  let finish;
  const {context,state,requests}=ui(async url=>url.includes('q=new')?{jobs:[{source_order_id:999}],hasMore:false,total:null}:new Promise(r=>finish=r));
  const old=context.loadOutstandingOrders();
  state.orderSearchQuery='new';
  await context.loadOutstandingOrders({force:true});
  assert.equal(requests[0].options.signal.aborted,true);
  finish(page(0));await old;
  assert.deepEqual(Array.from(state.outstandingJobs,j=>j.source_order_id),[999]);
  assert.equal(state.orderLoadComplete,true);
});

test('only one next-page request runs at once; failure keeps rows and can retry',async()=>{
  let fail=true,finish;
  const {context,state,requests}=ui(async url=>{
    if(!url.includes('offset=100'))return page(0);
    if(fail)return new Promise((resolve,reject)=>finish=()=>reject(Error('temporary')));
    return page(100,false);
  });
  await context.loadOutstandingOrders();
  const next=context.loadNextOrdersPage();await context.loadNextOrdersPage();
  assert.equal(requests.length,2);finish();await next;
  assert.equal(state.outstandingJobs.length,100);assert.match(state.orderLoadError,/Retry/);
  fail=false;await context.loadNextOrdersPage();
  assert.equal(state.outstandingJobs.length,200);assert.equal(state.orderLoadComplete,true);
});

test('server-side categories, approval filters and sorting apply before pagination',async()=>{
  const {PGlite}=require('@electric-sql/pglite');
  const db=new PGlite();
  const {buildJobFilters}=require('../src/services/databaseJobFilters');
  try {
    await db.exec(`CREATE TABLE jobs(source_order_id int,order_no int,order_type text,order_type_abbr text,
      dashboard_status text,proof_approved boolean,delivery_date date);
      INSERT INTO jobs SELECT n,n,'Printing','P','STOCK ORDERED',false,'2026-11-01' FROM generate_series(1,120)n;
      INSERT INTO jobs VALUES(200,200,'Business Gifts','G','STOCK ORDERED',true,'2026-12-01'),
      (201,201,'Business Gifts','G','STOCK ORDERED',true,'2026-10-01'),
      (202,202,'Emb','E','COMPLETED',true,NULL),(203,203,'Print + Emb','PE','READY TO PRINT',true,NULL);`);
    const read=async query=>{const f=buildJobFilters(query);return (await db.query(`SELECT source_order_id FROM jobs j ${f.whereSql} ${f.orderSql} LIMIT 100`,f.params)).rows.map(r=>r.source_order_id);};
    assert.deepEqual(await read({group:'gifts',sort:'delivery'}),[201,200]);
    assert.deepEqual(await read({group:'embroidery',sort:'order'}),[202]);
    assert.deepEqual(await read({group:'ready',sort:'order'}),[203,201,200]);
    assert.equal((await read({group:'not-ready',sort:'order'})).length,100);
    assert.deepEqual(await read({group:'print_embroidery',sort:'order'}),[203]);
  } finally {await db.close();}
});

test('printing explicitly fetches every matching page without changing the browsing list',async()=>{
  const calls=[];let printed;
  const context=vm.createContext({state:{orderMode:'all'},currentOrderQueryKey:()=> 'same-query',
    fetchJobsPage:async(mode,offset,options)=>{calls.push({mode,offset,options});return {...page(offset,offset===0),nextOffset:offset+100};},
    buildOutstandingReportSnapshot:jobs=>({jobs}),showOutstandingReportDocument:snapshot=>printed=snapshot,
    alert:message=>assert.fail(message)});
  vm.runInContext(source.slice(source.indexOf('  async function openOutstandingReportDocument('),source.indexOf('  function showOutstandingReportDocument(')),context);
  await context.openOutstandingReportDocument();
  assert.deepEqual(calls.map(c=>c.offset),[0,100]);
  assert.equal(printed.jobs.length,200);
});
