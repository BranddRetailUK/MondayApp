#!/usr/bin/env node
'use strict';
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg');
const {audience,suppressions,importSuppressions}=require('../src/services/emailCampaignDelivery');
const {sendMarketingEmail}=require('../src/services/sendgrid');
const ID='christmas-2026-first-shot';
async function main() {
 const apply=process.argv.includes('--prepare');
 if(apply&&!process.argv.includes('--consent-confirmed'))throw Error('Confirm the customer marketing basis with --consent-confirmed.');
 const db=new Pool({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
 try {
  const list=await audience(db),provider=await suppressions();
  const local=(await db.query('SELECT email,kind FROM hub_email_suppressions')).rows;
  const blocked=new Set([...provider,...local].map(r=>r.email));
  const recipients=list.emails.filter(email=>!blocked.has(email));
  const template=require('../emails/christmas-2026/campaigns.json')[0];
  const dir=path.resolve(__dirname,'../emails/christmas-2026');
  const html=fs.readFileSync(path.join(dir,template.html),'utf8'),text=fs.readFileSync(path.join(dir,template.text),'utf8');
  const review={uniqueValid:list.emails.length,malformed:list.invalid.length,excluded:list.emails.length-recipients.length,recipients:recipients.length,consent:'User confirmed all customer emails opted in, 12 November 2026',preparedAt:new Date().toISOString(),products:template.products};
  console.log(JSON.stringify(review,null,2));
  if(!apply)return;
  await sendMarketingEmail({to:'scott@brandd.co.uk',subject:template.subject,html,text,sandbox:true,campaignId:ID,batchId:ID+'-0'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73104262)');
   const existing=await client.query('SELECT * FROM hub_email_campaigns WHERE id=$1 FOR UPDATE',[ID]);
   if(existing.rows.length&&existing.rows[0].status!=='draft')throw Error('Only an unsent draft can be prepared again.');
   const prior=(await client.query('SELECT * FROM hub_email_recipients WHERE campaign_id=$1',[ID])).rows;
   if(prior.some(r=>r.status!=='pending'||r.sent_at))throw Error('Existing delivery attempts prevent re-preparation.');
   const backup=path.resolve(process.env.CAMPAIGN_BACKUP_DIR||'/tmp/ultimate-campaign-backups');fs.mkdirSync(backup,{recursive:true,mode:0o700});
   fs.writeFileSync(path.join(backup,`${Date.now()}-before-prepare.json`),JSON.stringify({campaign:existing.rows,recipients:prior}),{mode:0o600});
   await importSuppressions(client,provider,new Set(list.emails));
   await client.query(`INSERT INTO hub_email_campaigns(id,name,subject,html,body_text,audience_review) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET subject=EXCLUDED.subject,html=EXCLUDED.html,body_text=EXCLUDED.body_text,audience_review=EXCLUDED.audience_review`,[ID,'Christmas hampers · First email',template.subject,html,text,review]);
   await client.query('DELETE FROM hub_email_recipients WHERE campaign_id=$1',[ID]);
   await client.query('DELETE FROM hub_email_batches WHERE campaign_id=$1',[ID]);
   for(let i=0;i<recipients.length;i+=500) {
    const batch=ID+'-'+Math.floor(i/500);
    await client.query('INSERT INTO hub_email_batches(id,campaign_id) VALUES($1,$2)',[batch,ID]);
    await client.query('INSERT INTO hub_email_recipients(campaign_id,email,tracking_batch) SELECT $1,unnest($2::text[]),$3',[ID,recipients.slice(i,i+500),batch]);
   }
   const saved=(await client.query('SELECT COUNT(*)::int AS count FROM hub_email_recipients WHERE campaign_id=$1',[ID])).rows[0].count;
   if(saved!==recipients.length)throw Error('Recipient read-back mismatch.');
   await client.query('COMMIT');console.log(JSON.stringify({prepared:true,campaignId:ID,recipients:saved,sent:0}));
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
