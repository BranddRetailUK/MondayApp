const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {ensureEmailCampaignTables}=require('../src/db/emailCampaignSchema');
const {verifySignature,suppressionKind,recordEvents,overview}=require('../src/services/emailCampaigns');
test('signed webhook authenticates raw bytes and rejects forged or absent signatures',()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),body=Buffer.from('[{"event":"open"}]'),timestamp='1794480000';
 const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
 const signature=crypto.sign('sha256',Buffer.concat([Buffer.from(timestamp),body]),privateKey).toString('base64');
 assert.equal(verifySignature(body,signature,timestamp,key),true);
 assert.equal(verifySignature(Buffer.from('[]'),signature,timestamp,key),false);
 assert.equal(verifySignature(body,signature,timestamp,''),false);
});
test('only definitive invalid-address evidence classifies dead emails',()=>{
 assert.equal(suppressionKind({event:'bounce',status:'5.1.1'}),'invalid');
 assert.equal(suppressionKind({event:'bounce',status:'5.7.1'}),'undeliverable');
 assert.equal(suppressionKind({event:'bounce',type:'blocked',status:'5.1.1'}),'undeliverable');
 assert.equal(suppressionKind({event:'deferred'}),null);
});
test('duplicate and unrelated account events cannot inflate unique analytics or suppress strangers',async()=>{
 const pg=new PGlite(),db={query:async(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};
 await ensureEmailCampaignTables(db);await ensureEmailCampaignTables(db);
 await db.query("INSERT INTO hub_email_campaigns(id,name,subject) VALUES('test','Test','Subject')");
 await db.query("INSERT INTO hub_email_recipients(campaign_id,email) VALUES('test','one@example.com')");
 const event={ultimate_campaign_id:'test',email:'ONE@example.com',event:'open',timestamp:1794480000,sg_event_id:'1'};
 assert.equal(await recordEvents(db,[event,event,{...event,sg_event_id:'2'},{...event,sg_event_id:'3',email:'stranger@example.com',event:'unsubscribe'}]),2);
 await recordEvents(db,[{...event,sg_event_id:'4',event:'group_unsubscribe'},{...event,sg_event_id:'5',event:'unsubscribe'}]);
 const data=await overview(db);assert.equal(data.campaigns[0].metrics.open,1);assert.equal(data.campaigns[0].metrics.unsubscribe_count,1);
 assert.equal((await db.query('SELECT * FROM hub_email_suppressions')).rows.length,1);
 await pg.close();
});
test('activity polling preserves unique recipients across repeated snapshots and scopes every request',async()=>{
 const {pollBatch}=require('../src/services/emailCampaignDelivery');
 const pg=new PGlite(),db={query:async(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};await ensureEmailCampaignTables(db);
 await db.query("INSERT INTO hub_email_campaigns(id,name,subject) VALUES('test','Test','Subject')");
 await db.query("INSERT INTO hub_email_batches(id,campaign_id) VALUES('test-0','test')");
 await db.query("INSERT INTO hub_email_recipients(campaign_id,email,tracking_batch) VALUES('test','one@example.com','test-0')");
 const fetchImpl=async url=>{assert.match(decodeURIComponent(url),/ultimate_campaign_id.*test/);assert.match(decodeURIComponent(url),/ultimate_batch_id.*test-0/);return{ok:true,json:async()=>({messages:[{msg_id:'message',to_email:'one@example.com',status:'delivered',opens_count:6,clicks_count:2,last_event_time:'2026-11-12T10:00:00Z'}]})};};
 await pollBatch(db,{id:'test-0',campaign_id:'test',poll_step:0},{},fetchImpl);await pollBatch(db,{id:'test-0',campaign_id:'test',poll_step:0},{},fetchImpl);
 const data=await overview(db);assert.equal(data.campaigns[0].metrics.open,1);assert.equal(data.campaigns[0].metrics.click,1);assert.equal(data.campaigns[0].metrics.delivered,1);await pg.close();
});
test('confirmed post-send opt-outs count before activity polling catches up, without duplicates or unrelated exclusions',async()=>{
 const pg=new PGlite(),db={query:async(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};
 await ensureEmailCampaignTables(db);
 await db.query("INSERT INTO hub_email_campaigns(id,name,subject) VALUES('test','Test','Subject')");
 for(const email of ['delayed@example.com','both@example.com','old@example.com']) await db.query("INSERT INTO hub_email_recipients(campaign_id,email,status,sent_at) VALUES('test',$1,'sent','2026-11-12T10:00:00Z')",[email]);
 await db.query("INSERT INTO hub_email_recipients(campaign_id,email) VALUES('test','pending@example.com')");
 for(const email of ['delayed@example.com','both@example.com','pending@example.com','unrelated@example.com']) await db.query("INSERT INTO hub_email_suppressions(email,kind,source,occurred_at) VALUES($1,'unsubscribed','sendgrid','2026-11-12T11:00:00Z')",[email]);
 await db.query("INSERT INTO hub_email_suppressions(email,kind,source,occurred_at) VALUES('old@example.com','unsubscribed','sendgrid','2026-11-11T11:00:00Z')");
 await recordEvents(db,[{ultimate_campaign_id:'test',email:'both@example.com',event:'unsubscribe',timestamp:1794481200,sg_event_id:'both'}]);
 assert.equal((await overview(db)).campaigns[0].metrics.unsubscribe_count,2);
 await recordEvents(db,[{ultimate_campaign_id:'test',email:'delayed@example.com',event:'group_unsubscribe',timestamp:1794481200,sg_event_id:'later'}]);
 assert.equal((await overview(db)).campaigns[0].metrics.unsubscribe_count,2);
 await pg.close();
});
test('audience splits multiple addresses, deduplicates case and holds malformed entries',async()=>{
 const {audience}=require('../src/services/emailCampaignDelivery');
 const result=await audience({query:async()=>({rows:[{contact_email:'One@example.com; two@example.com'},{contact_email:'one@EXAMPLE.com'},{contact_email:'bad @example.com'}]})});
 assert.deepEqual(result.emails,['one@example.com','two@example.com']);assert.equal(result.invalid.length,1);
});
test('tracking is explicitly scoped to campaign messages; ordinary sends remain untracked',async()=>{
 const {sendMarketingEmail}=require('../src/services/sendgrid');let payload;
 await sendMarketingEmail({to:'one@example.com',subject:'Test',html:'<p>Test</p>',text:'Test',campaignId:'test',batchId:'test-0'},{env:{SENDGRID_API_KEY:'key',SENDGRID_FROM_EMAIL:'sender@example.com'},fetchImpl:async(_,o)=>{payload=JSON.parse(o.body);return{status:200,headers:new Headers()};}});
 assert.deepEqual(payload.custom_args,{ultimate_campaign_id:'test',ultimate_batch_id:'test-0'});assert.equal(payload.tracking_settings.open_tracking.enable,true);
});

test('a scheduled campaign queues individually addressed messages with the correct schedule and tracking', async () => {
 const {scheduleMarketingBatch}=require('../src/services/sendgrid');
 const sendAt=1795086000;
 const input={
  recipients:['first@example.com','second@example.com'], subject:'Winter',
  html:'<p>Winter</p><a href="<%asm_group_unsubscribe_raw_url%>">Unsubscribe</a>',
  text:'Winter\nUnsubscribe: <%asm_group_unsubscribe_raw_url%>', sandbox:false,
  campaignId:'winter-test', batchId:'winter-test-0', providerBatchId:'test-provider-batch', sendAt,
 };
 const env={SENDGRID_API_KEY:'key',SENDGRID_FROM_EMAIL:'sales@example.com',SENDGRID_UNSUBSCRIBE_GROUP_ID:'17',SENDGRID_SENDING_ENABLED:'true'};
 let requests=0;
 const options={env,now:()=>sendAt*1000-60000,fetchImpl:async (_url, request)=>{
  requests++;
  const payload=JSON.parse(request.body);
  assert.deepEqual(payload.personalizations,[{to:[{email:'first@example.com'}]},{to:[{email:'second@example.com'}]}]);
  assert.equal(payload.send_at,sendAt);
  assert.equal(payload.batch_id,'test-provider-batch');
  assert.equal(payload.from.email,'sales@example.com');
  assert.equal(payload.asm.group_id,17);
  assert.deepEqual(payload.custom_args,{ultimate_campaign_id:'winter-test',ultimate_batch_id:'winter-test-0'});
  return {status:202,headers:new Headers({'x-message-id':'message'})};
 }};
 assert.deepEqual(await scheduleMarketingBatch(input,options),{accepted:true,sandbox:false,validated:false,messageId:'message'});
 await assert.rejects(scheduleMarketingBatch({...input,recipients:['first@example.com','first@example.com']},options),/unique/);
 await assert.rejects(scheduleMarketingBatch(input,{...options,now:()=>sendAt*1000}),/send time/);
 assert.equal(requests,1);
});

test('recent summaries keep their normal polling step and explicit delivery events count even after a later status change',async()=>{
 const {pollBatch}=require('../src/services/emailCampaignDelivery');
 const pg=new PGlite(),db={query:(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};
 await ensureEmailCampaignTables(db);
 await db.query("INSERT INTO hub_email_campaigns(id,name,subject) VALUES('test','Test','Subject')");
 await db.query("INSERT INTO hub_email_batches(id,campaign_id,poll_step) VALUES('test-0','test',3)");
 await db.query("INSERT INTO hub_email_recipients(campaign_id,email,tracking_batch) VALUES('test','one@example.com','test-0')");
 const batch={id:'test-0',campaign_id:'test',poll_step:3,refresh_summary:true};
 const fetchImpl=async url=>{
  const query=new URL(url).searchParams.get('query');
  assert.ok(!query.includes('dropped'));
  return {ok:true,json:async()=>({messages:[
   {msg_id:'message',to_email:'one@example.com',status:'not_delivered',last_event_time:'2026-11-12T10:00:00Z'},
   {msg_id:'foreign',to_email:'outside@example.com',status:'delivered',last_event_time:'2026-11-12T10:00:00Z'},
  ]})};
 };
 await pollBatch(db,batch,{},fetchImpl);
 const saved=(await db.query("SELECT poll_step,summary_polled_at FROM hub_email_batches WHERE id='test-0'")).rows[0];
 assert.equal(saved.poll_step,3);assert(saved.summary_polled_at);
 assert.equal((await overview(db)).campaigns[0].metrics.delivered,undefined);
 await pollBatch(db,batch,{},async requested=>{
  assert.match(new URL(requested).searchParams.get('query'),/Contains\(events,"delivered"\)/);
  return fetchImpl(requested);
 },{filter:'delivered',recordOnly:true});
 assert.equal((await overview(db)).campaigns[0].metrics.delivered,1);
 await pg.close();
});

test('site click lookups are scoped, drop off-site links and deduplicate repeated reads',async()=>{
 const {rememberSiteClickMessages,refreshSiteClick}=require('../src/services/emailCampaignSiteClicks');
 const pg=new PGlite(),db={query:(s,p)=>!p&&s.includes('CREATE TABLE')?pg.exec(s):pg.query(s,p)};
 await ensureEmailCampaignTables(db);
 await db.query(`INSERT INTO hub_email_campaigns(id,name,subject,audience_review)
  VALUES ('winter','Winter','Subject','{"siteClickTracking":true}')`);
 await db.query(`INSERT INTO hub_email_recipients(campaign_id,email,tracking_batch,status,sent_at)
  VALUES ('winter','one@example.com','winter-0','sent',NOW()-INTERVAL '5 minutes')`);
 const batch={id:'winter-0',campaign_id:'winter'};
 const message={msg_id:'message-token',to_email:'ONE@example.com',clicks_count:3};
 await rememberSiteClickMessages(db,{...batch,id:'wrong-batch'},[message]);
 assert.equal(await refreshSiteClick(db,async()=>assert.fail('Wrong batch was queued')),0);
 await rememberSiteClickMessages(db,batch,[message]);
 const now=new Date().toISOString();
 const detail={
  msg_id:message.msg_id,to_email:message.to_email,
  unique_args:JSON.stringify({ultimate_campaign_id:'winter',ultimate_batch_id:'winter-0'}),
  events:[
   {event_name:'click',processed:now,url:'https://christmashampers.ultimatepromotions.co.uk/?secret=value'},
   {event_name:'click',processed:now,url:'https://christmashampers.ultimatepromotions.co.uk/index.html'},
   {event_name:'click',processed:now,url:'https://sendgrid.example/unsubscribe'},
  ],
 };
 const get=async endpoint=>{assert.equal(endpoint,'/v3/messages/message-token');return detail;};
 assert.equal(await refreshSiteClick(db,get),2);
 assert.equal(await refreshSiteClick(db,async()=>assert.fail('Rate limit was bypassed')),0);
 const clicks=(await db.query('SELECT path FROM hub_email_site_clicks ORDER BY id')).rows;
 assert.deepEqual(clicks,[{path:'/'},{path:'/'}]);
 await db.query("UPDATE hub_email_recipients SET site_click_checked_at=NOW()-INTERVAL '40 seconds'");
 await rememberSiteClickMessages(db,batch,[{...message,clicks_count:4}]);
 assert.equal(await refreshSiteClick(db,get),2);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM hub_email_site_clicks')).rows[0].count,2);
 await pg.close();
});
