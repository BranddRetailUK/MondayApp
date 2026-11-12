#!/usr/bin/env node
'use strict';
require('dotenv').config();
const {Pool}=require('pg');
const {sendMarketingEmail}=require('../src/services/sendgrid');
const {suppressions,importSuppressions,providerGet}=require('../src/services/emailCampaignDelivery');
async function main(){
 if(!process.argv.includes('--send'))throw Error('Explicit --send is required. This command delivers real marketing email.');
 const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]||25);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Choose a batch limit from 1 to 100.');
 if(process.env.SENDGRID_SENDING_ENABLED!=='true'||process.env.SENDGRID_CAMPAIGN_POLL_ENABLED!=='true')throw Error('Marketing sending and activity tracking must be enabled explicitly.');
 const db=new Pool({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
 const client=await db.connect(),id='christmas-2026-first-shot';let sent=0;
 try{
  if(!(await client.query('SELECT pg_try_advisory_lock(73104262) AS locked')).rows[0].locked)throw Error('Another campaign operation is running.');
  const campaign=(await client.query('SELECT * FROM hub_email_campaigns WHERE id=$1',[id])).rows[0];
  if(!campaign||!['draft','sending','paused'].includes(campaign.status))throw Error('A prepared, unsent or partially sent campaign is required.');
  const attempts=await client.query("SELECT COUNT(*) FILTER(WHERE status IN ('sending','unknown','failed'))::int AS uncertain,MAX(sent_at) AS latest FROM hub_email_recipients WHERE campaign_id=$1",[id]);
  if(attempts.rows[0].uncertain)throw Error('Review uncertain or failed delivery attempts before continuing. No automatic retries.');
  if(attempts.rows[0].latest&&Date.now()-new Date(attempts.rows[0].latest).getTime()<30*60*1000)throw Error('Allow 30 minutes for delivery results before the next batch.');
  if(attempts.rows[0].latest&&(!campaign.sync_at||new Date(campaign.sync_at)<new Date(attempts.rows[0].latest)||campaign.sync_error))throw Error('Wait for delivery tracking to refresh before continuing.');
  const health=(await client.query(`SELECT COUNT(DISTINCT email) FILTER(WHERE event='delivered')::int AS delivered,COUNT(DISTINCT email) FILTER(WHERE event IN ('bounce','dropped'))::int AS issues,COUNT(DISTINCT email) FILTER(WHERE event='spamreport')::int AS complaints FROM hub_email_events WHERE campaign_id=$1`,[id])).rows[0];
  if(health.complaints>0||health.issues>=2&&health.issues/Math.max(1,health.delivered+health.issues)>=0.05)throw Error('Delivery problems require review before more emails are sent.');
  // Verify API access now; never launch a batch with unavailable tracking or suppression data.
  await providerGet('/v3/messages?limit=1');
  const all=(await client.query('SELECT email FROM hub_email_recipients WHERE campaign_id=$1',[id])).rows;
  await importSuppressions(client,await suppressions(),new Set(all.map(r=>r.email)));
  const recipients=(await client.query(`SELECT r.* FROM hub_email_recipients r WHERE campaign_id=$1 AND status='pending'
   AND NOT EXISTS(SELECT 1 FROM hub_email_suppressions s WHERE s.email=r.email) ORDER BY email LIMIT $2`,[id,limit])).rows;
  if(!recipients.length){console.log(JSON.stringify({sent:0,message:'No eligible pending recipients.'}));return;}
  await client.query("UPDATE hub_email_campaigns SET status='sending' WHERE id=$1",[id]);
  for(const r of recipients){
   const claim=await client.query(`UPDATE hub_email_recipients SET status='sending' WHERE campaign_id=$1 AND email=$2 AND status='pending'
    AND NOT EXISTS(SELECT 1 FROM hub_email_suppressions WHERE email=$2) RETURNING email`,[id,r.email]);
   if(!claim.rows.length)continue;
   try{
    const result=await sendMarketingEmail({to:r.email,subject:campaign.subject,html:campaign.html,text:campaign.body_text,sandbox:false,campaignId:id,batchId:r.tracking_batch});
    await client.query("UPDATE hub_email_recipients SET status='sent',message_id=$3,sent_at=NOW() WHERE campaign_id=$1 AND email=$2",[id,r.email,result.messageId]);sent++;
   }catch(e){await client.query("UPDATE hub_email_recipients SET status='unknown' WHERE campaign_id=$1 AND email=$2",[id,r.email]);throw Error('Delivery attempt needs operator review; stopped without retrying.');}
  }
  const remaining=(await client.query("SELECT COUNT(*)::int AS count FROM hub_email_recipients r WHERE campaign_id=$1 AND status='pending' AND NOT EXISTS(SELECT 1 FROM hub_email_suppressions s WHERE s.email=r.email)",[id])).rows[0].count;
  await client.query('UPDATE hub_email_campaigns SET status=$2 WHERE id=$1',[id,remaining?'paused':'sent']);
  console.log(JSON.stringify({sent,remaining,status:remaining?'paused':'sent'}));
 }catch(e){await client.query("UPDATE hub_email_campaigns SET status='paused' WHERE id=$1 AND status='sending'",[id]);throw e;}
 finally{await client.query('SELECT pg_advisory_unlock(73104262)').catch(()=>{});client.release();await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
