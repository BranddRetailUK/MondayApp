const test=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const crypto=require('node:crypto');
const {ensureHubPushTables}=require('../src/db/hubPushSchema');
const push=require('../src/services/hubPush');

test('subscriptions reject arbitrary hosts and invalid curve keys',()=>{
  const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
  const sub={endpoint:'https://web.push.apple.com/device',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  assert.deepEqual(push.validateSubscription(sub),sub);
  for(const endpoint of ['https://127.0.0.1/push','https://evil.push.apple.com.evil.test/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com:8080/a'])assert.throws(()=>push.validateSubscription({...sub,endpoint}));
  assert.throws(()=>push.validateSubscription({...sub,keys:{...sub.keys,p256dh:Buffer.alloc(65).toString('base64url')}}));
  assert.throws(()=>push.validatePreferences({completed:true}));
  assert.equal(push.configuration({}).enabled,false);
});

test('transactional events, opt-in, first-ready proofs, retries, revocation and logout',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE hub_users(id INTEGER PRIMARY KEY,access_scope TEXT);
      CREATE TABLE hub_sessions(id TEXT PRIMARY KEY,user_id INTEGER REFERENCES hub_users(id),expires_at TIMESTAMPTZ);
      CREATE TABLE database_job_status_updates(id BIGSERIAL PRIMARY KEY,event_type TEXT,status TEXT);
      CREATE TABLE test_dashboard_private_jobs(id TEXT PRIMARY KEY,column_values JSONB,archived BOOLEAN DEFAULT false);
      CREATE TABLE dashboard_production_jobs(dashboard_job_id TEXT);
      CREATE TABLE proof_design_jobs(id UUID PRIMARY KEY,proof_ready BOOLEAN DEFAULT false,revision INTEGER DEFAULT 0);
      INSERT INTO hub_users VALUES(1,'full'),(2,'dtf_only');
      INSERT INTO hub_sessions VALUES('session',1,now()+interval '1 day'),('restricted',2,now()+interval '1 day');`);
    // PGlite requires exec for schema batches; queries still use real Postgres semantics.
    await ensureHubPushTables({query:sql=>db.exec(sql)});
    await ensureHubPushTables({query:sql=>db.exec(sql)});
    await db.query("INSERT INTO database_job_status_updates(event_type,status) VALUES('status','COMPLETED')");
    const preferences={completed:true,approved:true,proof:true};
    await db.query(`INSERT INTO hub_push_subscriptions(endpoint,user_id,session_id,subscription,preferences) VALUES('device',1,'session','{}',$1),('restricted',2,'restricted','{}',$1)`,[preferences]);
    const count=async()=>Number((await db.query('SELECT count(*) AS count FROM hub_push_deliveries')).rows[0].count);
    assert.equal(await count(),0,'no historical backlog');
    await db.query("INSERT INTO database_job_status_updates(event_type,status) VALUES('status','PRINTING'),('approved','APPROVED'),('status','COMPLETED')");
    assert.equal(await count(),2,'only requested events and full users');
    await db.exec("BEGIN; INSERT INTO database_job_status_updates(event_type,status) VALUES('status','COMPLETED'); ROLLBACK;");assert.equal(await count(),2);
    const id=crypto.randomUUID();await db.query('INSERT INTO proof_design_jobs(id) VALUES($1)',[id]);assert.equal(await count(),2);
    await db.query('UPDATE proof_design_jobs SET proof_ready=true WHERE id=$1',[id]);assert.equal(await count(),3);
    await db.query('UPDATE proof_design_jobs SET proof_ready=false WHERE id=$1',[id]);await db.query('UPDATE proof_design_jobs SET proof_ready=true WHERE id=$1',[id]);assert.equal(await count(),3,'no duplicate regenerated proof');
    const client={query:(...args)=>db.query(...args),release(){}};
    const pool={connect:async()=>client};
    let sent=[];
    await push.drain(pool,async(_,data)=>sent.push(data));assert.equal(sent.length,3);assert.equal(await count(),0);
    assert.deepEqual(sent.map(s=>s.body).sort(),['A job has been approved.','A job has been completed.','A new proof has been created.'].sort());
    await db.query("INSERT INTO test_dashboard_private_jobs(id,column_values) VALUES('private','{}'),('linked','{}')");
    await db.query("INSERT INTO dashboard_production_jobs VALUES('linked')");
    await db.query(`UPDATE test_dashboard_private_jobs SET column_values=$1`,[{label__1:{text:'COMPLETED'},checkbox1__1:{text:'v'}}]);
    assert.equal(await count(),2,'standalone private jobs notify, linked children do not duplicate parent');
    await push.drain(pool,async()=>{});
    await db.query("INSERT INTO database_job_status_updates(event_type,status) VALUES('status','COMPLETED')");
    await push.drain(pool,async()=>{throw Error('offline');});assert.equal(await count(),1);
    assert.equal((await db.query('SELECT attempts FROM hub_push_deliveries')).rows[0].attempts,1);
    await db.query('UPDATE hub_push_deliveries SET available_at=now()');
    await push.drain(pool,async()=>{throw Object.assign(Error('gone'),{statusCode:410});});assert.equal(await count(),0);
    assert.equal((await db.query('SELECT * FROM hub_push_subscriptions')).rows.length,0);
    await db.query(`INSERT INTO hub_push_subscriptions(endpoint,user_id,session_id,subscription,preferences) VALUES('device',1,'session','{}',$1)`,[preferences]);
    await db.query("INSERT INTO database_job_status_updates(event_type,status) VALUES('status','COMPLETED')");
    await db.query("UPDATE hub_users SET access_scope='dtf_only' WHERE id=1");
    await push.drain(pool,async()=>assert.fail('revoked user must not receive'));assert.equal(await count(),0);
    await db.query("UPDATE hub_users SET access_scope='full' WHERE id=1");
    await db.query(`INSERT INTO hub_push_subscriptions(endpoint,user_id,session_id,subscription,preferences) VALUES('device',1,'session','{}',$1)`,[{...preferences,completed:false}]);
    await db.query("INSERT INTO database_job_status_updates(event_type,status) VALUES('status','COMPLETED')");assert.equal(await count(),0,'preference respected');
    await db.query("DELETE FROM hub_sessions WHERE id='session'");assert.equal((await db.query('SELECT * FROM hub_push_subscriptions')).rows.length,0,'logout cascades');
  }finally{await db.close();}
});

test('notification routes reject cross-origin writes and scope device reads to user/session',async()=>{
  const {createRouter}=require('../src/routes/hub-push');
  const {requireHubFullApiAccess}=require('../src/middleware/hubAuth');
  const response=()=>({code:200,status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
  for(const [hubUser,code] of [[null,401],[{access_scope:'dtf_only'},403]]){
    const res=response();requireHubFullApiAccess({hubUser},res,()=>assert.fail('must reject'));assert.equal(res.code,code);
  }
  const calls=[];const router=createRouter({query:async(...args)=>{calls.push(args);return {rows:[]};}});
  const originGuard=router.stack[1].handle;
  const res=response();originGuard({method:'POST',protocol:'https',get:key=>key==='origin'?'https://attacker.example':'www.ultimatehub.co.uk'},res,()=>assert.fail('cross origin accepted'));assert.equal(res.code,403);
  const device=router.stack.find(x=>x.route?.path==='/device').route.stack[0].handle;
  const req={body:{endpoint:'https://web.push.apple.com/device'},headers:{cookie:''},hubUser:{id:91}};
  const result=response();await device(req,result,e=>{throw e;});
  assert.equal(result.data.enabled,false);assert.match(calls[0][0],/user_id=\$2 AND session_id=\$3/);assert.equal(calls[0][1][1],91);
});
