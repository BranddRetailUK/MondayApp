// Explicit, idempotent live acceptance: inspect by default; --apply enrols only the selected Madeblunt job.
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const pipeline=require('../src/services/madebluntPipeline');
(async()=>{
 const order=Number(process.argv.find(arg=>arg.startsWith('--order='))?.split('=')[1]);
 if(!Number.isSafeInteger(order)||order<1)throw new Error('Supply --order=51375 (and --apply to enrol)');
 const db=new Client({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
 await db.connect();
 try{
  await db.query('BEGIN');
  const job=(await db.query('SELECT * FROM database_jobs WHERE order_no=$1 FOR UPDATE',[order])).rows;
  if(job.length!==1||Number(job[0].customer_id)!==pipeline.CUSTOMER_ID)throw new Error('Expected exactly one Madeblunt job');
  const before={sourceOrderId:job[0].source_order_id,orderNo:order,customer:job[0].customer_name,status:job[0].dashboard_status};
  if(process.argv.includes('--apply')){
   if(String(job[0].dashboard_status||'').trim().toUpperCase()!=='TO SAMPLE')throw new Error('Only TO SAMPLE jobs can enter the Madeblunt pipeline');
   const linked=(await db.query('SELECT proof_id FROM proof_job_links WHERE source_order_id=$1',[before.sourceOrderId])).rows[0];
   const refs=(await db.query("SELECT design_ref FROM database_job_positions WHERE source_order_id=$1 AND NULLIF(BTRIM(design_ref),'') IS NOT NULL",[before.sourceOrderId])).rows;
   if(refs.length&&!linked)throw new Error('This job already has design references. Review before allocating another folder.');
   before.proofId=await pipeline.enroll(db,job[0],linked?.proof_id);
   await db.query('COMMIT');
  }else await db.query('ROLLBACK');
  console.log(JSON.stringify(before,null,2));
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
