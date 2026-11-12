#!/usr/bin/env node
require('dotenv').config();
const fs=require('node:fs'),dns=require('node:dns').promises;
const {Pool}=require('pg');const {audience}=require('../src/services/emailCampaignDelivery');
async function main(){
 const db=new Pool({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
 try{
  const {emails}=await audience(db),domains=[...new Set(emails.map(e=>e.split('@')[1]))],results=[];
  let index=0;
  await Promise.all(Array.from({length:12},async()=>{while(index<domains.length){const domain=domains[index++];let status='unknown';
   try{const mx=await dns.resolveMx(domain);status=mx.some(x=>x.exchange&&x.exchange!=='.')?'mail_server':mx.some(x=>x.exchange===''||x.exchange==='.')?'null_mx':'unknown';}
   catch(e){if(e.code==='ENOTFOUND')status='nonexistent';else if(e.code==='ENODATA'){const a=await Promise.allSettled([dns.resolve4(domain),dns.resolve6(domain)]);status=a.some(r=>r.status==='fulfilled'&&r.value.length)?'address_fallback':a.every(r=>r.status==='rejected'&&['ENODATA','ENOTFOUND'].includes(r.reason.code))?'no_mail_route':'unknown';}}
   results.push({domain,status});
  }}));
  const bad=new Set(results.filter(r=>['nonexistent','null_mx','no_mail_route'].includes(r.status)).map(r=>r.domain));
  const report={checkedAt:new Date().toISOString(),domains:results,counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),affectedEmails:emails.filter(e=>bad.has(e.split('@')[1])).length};
  const file=process.env.CAMPAIGN_DOMAIN_REPORT||'/tmp/ultimate-campaign-domains.json';fs.writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({domains:domains.length,counts:report.counts,affectedEmails:report.affectedEmails,report:file}));
 }finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
