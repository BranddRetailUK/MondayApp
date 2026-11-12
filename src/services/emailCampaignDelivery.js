'use strict';
const crypto=require('node:crypto');
const {recordEvents}=require('./emailCampaigns');
const EMAIL=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
async function audience(db) {
 const result=await db.query(`SELECT contact_email FROM database_customer_profiles WHERE NULLIF(TRIM(contact_email),'') IS NOT NULL
 UNION SELECT contact_email FROM database_customer_contacts WHERE NULLIF(TRIM(contact_email),'') IS NOT NULL
 UNION SELECT contact_email FROM database_jobs WHERE NULLIF(TRIM(contact_email),'') IS NOT NULL`);
 const valid=new Set(),invalid=new Set();
 for(const row of result.rows) for(const part of row.contact_email.split(/[;,\r\n]+/)) {
   const email=part.trim().toLowerCase(); if(!email)continue;
   (EMAIL.test(email)&&email.length<=254 ? valid : invalid).add(email);
 }
 return {emails:[...valid].sort(),invalid:[...invalid].sort()};
}
async function providerGet(path,env=process.env,fetchImpl=fetch) {
 const r=await fetchImpl('https://api.sendgrid.com'+path,{headers:{Authorization:`Bearer ${env.SENDGRID_API_KEY}`},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok) throw Error(`SendGrid data unavailable (HTTP ${r.status}).`);
 return r.json();
}
async function suppressions(env=process.env,fetchImpl=fetch) {
 const group=Number(env.SENDGRID_UNSUBSCRIBE_GROUP_ID);
 if(!Number.isSafeInteger(group)||group<=0)throw Error('Marketing unsubscribe group is missing.');
 const sources=[['/v3/suppression/unsubscribes','unsubscribed'],[`/v3/asm/groups/${group}/suppressions`,'unsubscribed',true],['/v3/suppression/spam_reports','complaint'],['/v3/suppression/invalid_emails','invalid'],['/v3/suppression/bounces','undeliverable'],['/v3/suppression/blocks','undeliverable']];
 const result=[];
 for(const [path,kind,unpaged] of sources) {
  for(let offset=0;;offset+=500) {
   const rows=await providerGet(path+(unpaged?'':`?limit=500&offset=${offset}`),env,fetchImpl);
   if(!Array.isArray(rows))throw Error('Unexpected SendGrid suppression response.');
   for(const row of rows)result.push({email:String(typeof row==='string'?row:row.email||'').trim().toLowerCase(),kind,reason:String(row.reason||kind),source:path,created:Number(row.created)||null});
   if(unpaged||rows.length<500)break;
   if(offset>=100000)throw Error('Suppression list exceeded safe paging limit.');
  }
 }
 return result;
}
async function importSuppressions(db,rows,allowed) {
 let count=0;
 for(const row of rows) {
  if(!allowed.has(row.email))continue;
  await db.query(`INSERT INTO hub_email_suppressions(email,kind,reason,source,occurred_at) VALUES($1,$2,$3,$4,COALESCE(to_timestamp($5),NOW()))
   ON CONFLICT(email,kind) DO UPDATE SET reason=EXCLUDED.reason,source=EXCLUDED.source`,[row.email,row.kind,row.reason.slice(0,1000),row.source,row.created]);count++;
 }
 return count;
}
const FILTERS=['summary','bounce','deferred','dropped','spamreport','unsubscribe','group_unsubscribe','processed'];
async function pollBatch(db,batch,env=process.env,fetchImpl=fetch) {
 const filter=FILTERS[batch.poll_step%FILTERS.length];
 const query=`(unique_args['ultimate_campaign_id']="${batch.campaign_id}") AND (unique_args['ultimate_batch_id']="${batch.id}")`+(filter==='summary'?'':` AND (Contains(events,"${filter}"))`);
 const data=await providerGet(`/v3/messages?limit=1000&query=${encodeURIComponent(query)}`,env,fetchImpl);
 if(!Array.isArray(data.messages)||data.messages.length>=1000)throw Error('Activity response exceeded the bounded campaign batch.');
 const events=[];
 for(const m of data.messages) {
  const types=filter==='summary'?[...(m.status==='delivered'?['delivered']:[]),...(m.opens_count>0?['open']:[]),...(m.clicks_count>0?['click']:[])]:[filter];
  for(const event of types) events.push({ultimate_campaign_id:batch.campaign_id,email:m.to_email,event,timestamp:Date.parse(m.last_event_time)/1000,sg_event_id:'activity:'+crypto.createHash('sha256').update(`${m.msg_id}:${event}`).digest('hex'),reason:event==='bounce'?'SendGrid reports a bounce; mailbox validity is unconfirmed.':''});
 }
 await recordEvents(db,events);
 await db.query('UPDATE hub_email_batches SET polled_at=NOW(),poll_step=poll_step+1 WHERE id=$1',[batch.id]);
 await db.query("UPDATE hub_email_campaigns SET sync_at=NOW(),sync_error=NULL WHERE id=$1",[batch.campaign_id]);
 return events.length;
}
function start(db,env=process.env) {
 if(env.SENDGRID_CAMPAIGN_POLL_ENABLED!=='true')return;
 let busy=false;
 const tick=async()=>{
  if(busy)return;busy=true;let client;
  try {
   client=await db.connect();
   if(!(await client.query('SELECT pg_try_advisory_lock(73104261) AS locked')).rows[0].locked)return;
   const result=await client.query(`SELECT b.* FROM hub_email_batches b JOIN hub_email_campaigns c ON c.id=b.campaign_id
     WHERE c.status IN ('sending','sent','paused') AND EXISTS(SELECT 1 FROM hub_email_recipients r WHERE r.tracking_batch=b.id AND r.sent_at IS NOT NULL)
     AND (b.polled_at IS NULL OR b.polled_at<NOW()-INTERVAL '60 seconds') ORDER BY b.polled_at NULLS FIRST,b.id LIMIT 1`);
   if(result.rows[0]) {
    try { await pollBatch(client,result.rows[0],env); }
    catch { await client.query("UPDATE hub_email_campaigns SET sync_error='Delivery analytics are temporarily unavailable; retrying automatically.' WHERE id=$1",[result.rows[0].campaign_id]); }
   }
  } catch { console.error('Campaign activity refresh failed'); }
  finally {if(client){await client.query('SELECT pg_advisory_unlock(73104261)').catch(()=>{});client.release();}busy=false;}
 };
 setInterval(tick,20000).unref();void tick();
}
module.exports={EMAIL,audience,providerGet,suppressions,importSuppressions,pollBatch,start};
