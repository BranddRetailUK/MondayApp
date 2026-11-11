const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');const {ensureHamperTables}=require('../src/db/hamperSchema');
const {quoteCart}=require('../src/services/hamperCheckout');const {render,send,drain}=require('../src/services/hamperEmail');
const order={id:crypto.randomUUID(),po_number:3,mode:'live',status:'paid',created_at:new Date().toISOString(),snapshot:quoteCart([{sku:'H26002',quantity:1}]),delivery:{name:'Scott <Preview>',email:'scott@brandd.co.uk',line1:'Unicorn House',city:'Berkhamsted',postcode:'HP4 1EH'}};
const env={HAMPER_EMAIL_ENABLED:'true',SENDGRID_API_KEY:'test-key',HAMPER_EMAIL_MONITOR_ENABLED:'true',HAMPER_EMAIL_MONITOR_BCC:'charlie@ultimatepromotions.co.uk'};
test('confirmation uses branded sender, hidden optional monitor, escaped content and PDF attachment',async()=>{
 let payload;const fetchImpl=async(_,o)=>{payload=JSON.parse(o.body);return {status:202,headers:new Headers({'x-message-id':'test-id'})};};
 const r=await send(order,{env,fetchImpl});assert.equal(r.messageId,'test-id');assert.equal(payload.from.email,'hampers@ultimatepromotions.co.uk');assert.deepEqual(payload.personalizations[0].bcc,[{email:'charlie@ultimatepromotions.co.uk'}]);assert.equal(payload.personalizations[0].cc,undefined);assert.equal(payload.asm,undefined);assert.equal(payload.attachments[0].filename,'HINV-000003.pdf');assert.match(Buffer.from(payload.attachments[0].content,'base64').toString('ascii',0,4),/%PDF/);assert.ok(payload.content[1].value.includes('Scott &lt;Preview&gt;'));assert.ok(!payload.content[1].value.includes('charlie@'));assert.ok(payload.content[0].value.includes('£41.15'));
 await send(order,{env:{...env,HAMPER_EMAIL_MONITOR_ENABLED:'false'},fetchImpl});assert.equal(payload.personalizations[0].bcc,undefined);
 await assert.rejects(send({...order,status:'pending'},{env,fetchImpl}),/paid live/);
 await assert.rejects(send({...order,mode:'sandbox'},{env,fetchImpl}),/paid live/);
 await assert.rejects(send(order,{env:{...env,HAMPER_EMAIL_ENABLED:'false'},fetchImpl}),/disabled/);
 assert.match(render(order,{preview:true}).subject,/TEST/);
});
test('queue is claimed once across workers; accepted and uncertain sends are not automatically repeated',async()=>{
 const pg=new PGlite(),db={query:async(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};await ensureHamperTables(db);
 const add=async id=>{await db.query("INSERT INTO hamper_orders(id,request_hash,mode,status,snapshot,delivery) VALUES($1,'test','live','paid',$2,$3)",[id,order.snapshot,order.delivery]);await db.query('INSERT INTO hamper_confirmation_emails(order_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);};
 await add(order.id);let calls=0;const sendImpl=async()=>{calls++;return{messageId:'accepted'};};
 await Promise.all([drain(db,{env,sendImpl}),drain(db,{env,sendImpl})]);assert.equal(calls,1);assert.equal((await db.query('SELECT status FROM hamper_confirmation_emails WHERE order_id=$1',[order.id])).rows[0].status,'sent');
 const other=crypto.randomUUID();await add(other);const fail=async()=>{calls++;throw Error('unknown network result');};await drain(db,{env,sendImpl:fail});await drain(db,{env,sendImpl:fail});assert.equal(calls,2);assert.equal((await db.query('SELECT status FROM hamper_confirmation_emails WHERE order_id=$1',[other])).rows[0].status,'unknown');await pg.close();
});
test('provider failures are redacted and distinguished from unknown timeouts',async()=>{
 await assert.rejects(send(order,{env,fetchImpl:async()=>({status:403})}),e=>e.deliveryState==='failed'&&/HTTP 403/.test(e.message));
 await assert.rejects(send(order,{env,fetchImpl:async()=>{throw Error('private provider detail');}}),e=>e.deliveryState==='unknown'&&!e.message.includes('private'));
});
