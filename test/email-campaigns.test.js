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
