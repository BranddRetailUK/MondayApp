require('dotenv').config({quiet:true});
const {Client}=require('pg');
const {psgNumbers,addPsgPositions}=require('../src/services/proofPsgNumbers');
(async()=>{
  const order=Number(process.argv.find(arg=>arg.startsWith('--order='))?.split('=')[1]);
  if(!Number.isSafeInteger(order)||order<1)throw Error('Supply --order=<job number> and optionally --apply');
  const db=new Client({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try{
    await db.query('BEGIN');
    const rows=(await db.query(`SELECT j.source_order_id,j.order_no,l.snapshot,p.design_number
      FROM database_jobs j JOIN proof_job_links l USING(source_order_id) JOIN proof_design_jobs p ON p.id=l.proof_id
      WHERE j.order_no=$1 AND l.saved_revision>0 FOR UPDATE OF j,l`,[order])).rows;
    if(rows.length!==1||!rows[0].snapshot)throw Error('Expected one linked published proof snapshot');
    const job=rows[0],{source,source_artworks:artworks}=job.snapshot;
    const numbers=psgNumbers(source,artworks);
    if(process.argv.includes('--apply'))await addPsgPositions(db,job.source_order_id,source,artworks);
    const positions=(await db.query('SELECT design_ref FROM database_job_positions WHERE source_order_id=$1 ORDER BY position_sort_order,source_order_position_id',[job.source_order_id])).rows;
    await db.query('COMMIT');
    console.log(JSON.stringify({order,sourceOrderId:job.source_order_id,designNumber:job.design_number,psgNumbers:numbers,dstFilenames:artworks.filter(a=>/\.dst$/i.test(a.name)).map(a=>a.name),applied:process.argv.includes('--apply'),positions},null,2));
  }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
