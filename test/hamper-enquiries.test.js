const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require(require('node:path').resolve(__dirname,'../node_modules/@electric-sql/pglite'));
const {ensureTables,submit,validate}=require('../src/services/hamperEnquiries');
const {ensureHamperTables}=require('../src/db/hamperSchema');
const input=()=>({id:crypto.randomUUID(),name:'Customer',email:'customer@example.com',phone:'',message:'Please help with delivery.',items:[{sku:'H26002',quantity:20}]});
test('enquiries validate fields and resolve product details from the catalogue',()=>{
 assert.equal(validate(input()).items[0].name,'Christmas Treats Basket');
 for(const change of [{email:'x@example.com\r\nBcc:evil@example.com'},{message:''},{name:'x\nY'},{items:[{sku:'fake',quantity:20}]},{items:[{sku:'H26002',quantity:-1}]}])assert.throws(()=>validate({...input(),...change}));
});
test('enquiries use a fixed recipient, customer reply-to, durable deduplication and rate limits',async()=>{
 const pg=new PGlite(),db={query:async(s,p)=>{const r=await (!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p));return r;}};await ensureHamperTables(db);await ensureTables(db);
 let calls=0,payload;const options={env:{SENDGRID_API_KEY:'test'},fetchImpl:async(_url,options)=>{calls++;payload=JSON.parse(options.body);return{status:202,headers:new Headers({'x-message-id':'accepted'})};}};
 const data=input();assert.deepEqual(await submit(db,data,'ip',options),{received:true});assert.deepEqual(payload.personalizations,[{to:[{email:'charlie@ultimatepromotions.co.uk'}]}]);assert.equal(payload.reply_to.email,data.email);assert.match(payload.content[0].value,/20 × Christmas Treats Basket/);
 await submit(db,data,'ip',options);assert.equal(calls,1);await assert.rejects(submit(db,{...data,message:'changed'},'ip',options),e=>e.status===409);
 for(let i=0;i<4;i++)await submit(db,input(),'ip',options);await assert.rejects(submit(db,input(),'ip',options),e=>e.status===429);
 const timed=input();await assert.rejects(submit(db,timed,'other',{...options,fetchImpl:async()=>{throw Error('timeout');}}));await assert.rejects(submit(db,timed,'other',options));assert.equal(calls,5);assert.equal((await db.query('SELECT status FROM hamper_enquiries WHERE id=$1',[timed.id])).rows[0].status,'unknown');
 assert.deepEqual(await submit(db,{website:'spam'},'ip',options),{received:true});assert.equal(calls,5);await pg.close();
});
test('public enquiry route restricts origins and reports invalid input in plain language',async t=>{
 const express=require('express'),app=express();let queries=0;
 app.use('/enquiries',require('../src/routes/hamper-enquiries').createRouter({query:async()=>{queries++;throw Error('No database call expected');}}));
 const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}/enquiries`,origin='https://christmashampers.ultimatepromotions.co.uk';
 assert.equal((await fetch(url,{method:'POST',headers:{origin:'https://elsewhere.example','Content-Type':'application/json'},body:'{}'})).status,403);
 const preflight=await fetch(url,{method:'OPTIONS',headers:{origin}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 const bad=await fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,400);assert.match((await bad.json()).error,/refresh/);
 const malformed=await fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);assert.ok((await malformed.json()).error);
 assert.equal(queries,0);
});
