const test = require('node:test');
const assert = require('node:assert/strict');
const { dateRange, createRouter, londonToday } = require('../src/routes/holiday-board');
const { requireHubFullApiAccess } = require('../src/middleware/hubAuth');
test('holiday dates validate real dates, leap years, bounds and weekdays across years', () => {
  assert.equal(dateRange({start:'2026-02-29',end:'2026-03-01'}),null);
  assert.deepEqual(dateRange({start:'2028-02-28',end:'2028-03-01'}),['2028-02-28','2028-02-29','2028-03-01']);
  assert.equal(dateRange({start:'2026-04-02',end:'2026-04-01'}),null);
  assert.equal(dateRange({start:'2026-01-01',end:'2027-01-02'}),null);
  assert.deepEqual(dateRange({start:'2026-12-31',end:'2027-01-04',weekdaysOnly:true}),['2026-12-31','2027-01-01','2027-01-04']);
});
function response() {return {statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
function handler(db,path,method) {return createRouter(db).stack.find(l=>l.route?.path===path).route.stack.find(l=>l.method===method).handle;}
test('holiday API rejects invalid member styles without database writes',async()=>{
 const db={query(){throw new Error('Must not write');}},res=response();
 await handler(db,'/api/holiday-board/members/:id','put')({params:{id:'1'},body:{initials:'<x>',colour:'#ffffff'}},res,e=>{throw e;}); assert.equal(res.statusCode,400);
});
test('unknown member cannot receive holidays',async()=>{
 const res=response();let queries=0;
 await handler({async query(){queries++;return {rows:[],rowCount:0};}},'/api/holiday-board/days','post')({body:{userId:1,start:'2099-01-01',end:'2099-01-01',action:'add'},hubUser:{id:2}},res,e=>{throw e;});
 assert.equal(res.statusCode,404);assert.equal(queries,1);
});
test('holiday writes use authenticated creator and idempotent insert',async()=>{
 const calls=[],res=response();
 await handler({async query(sql,args){calls.push({sql,args});return {rows:[{}],rowCount:1};}},'/api/holiday-board/days','post')({body:{userId:1,start:'2099-01-01',end:'2099-01-02',action:'add'},hubUser:{id:7}},res,e=>{throw e;});
 assert.equal(res.statusCode,200);assert.deepEqual(calls[1].args,[1,['2099-01-01','2099-01-02'],7,'full']);assert.match(calls[1].sql,/ON CONFLICT\(user_id, day\) DO UPDATE/);
});
test('holiday access guard excludes anonymous and uploader-only accounts',()=>{
 for(const [hubUser,expected] of [[null,401],[{access_scope:'dtf_only'},403]]){const res=response();requireHubFullApiAccess({hubUser},res,()=>assert.fail('access granted'));assert.equal(res.statusCode,expected);}
 let allowed=false;requireHubFullApiAccess({hubUser:{access_scope:'full'}},response(),()=>{allowed=true;});assert.ok(allowed);
});
test('half days keep their portion and invalid portions cannot write',async()=>{
 const calls=[],db={async query(sql,args){calls.push({sql,args});return {rows:[{}],rowCount:1};}};
 const run=handler(db,'/api/holiday-board/days','post');
 const req={body:{userId:1,start:'2099-01-30',end:'2099-01-30',action:'add',portion:'am'},hubUser:{id:7}};
 await run(req,response(),e=>{throw e;});assert.equal(calls[1].args[3],'am');
 const res=response();req.body.portion='invalid';await run(req,res,e=>{throw e;});assert.equal(res.statusCode,400);assert.equal(calls.length,2);
});

test('past day additions, removals and mixed ranges are rejected before database access',async()=>{
 const run=handler({query(){assert.fail('Past edits must not access database');}},'/api/holiday-board/days','post');
 for (const action of ['add','remove']) {
   const res=response(); await run({body:{userId:1,start:'2000-01-01',end:'2000-01-02',action}},res,e=>{throw e;}); assert.equal(res.statusCode,403);
 }
 const today=londonToday(), yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 const res=response();await run({body:{userId:1,start:yesterday,end:today,action:'add'}},res,e=>{throw e;});assert.equal(res.statusCode,403);
});
test('London day boundary respects summer time and today stays editable',async()=>{
 assert.equal(londonToday(new Date('2026-06-01T23:30:00Z')),'2026-06-02');
 assert.equal(londonToday(new Date('2026-01-01T23:30:00Z')),'2026-01-01');
 const res=response();await handler({async query(){return {rowCount:1,rows:[{}]};}},'/api/holiday-board/days','post')({body:{userId:1,start:londonToday(),end:londonToday(),action:'add'},hubUser:{id:7}},res,e=>{throw e;});assert.equal(res.statusCode,200);
});
