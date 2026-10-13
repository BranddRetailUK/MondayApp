// Explicit read-only Postgres reference lookup; writes only an optional local report.
require('dotenv').config();
const {Client}=require('pg');const fs=require('node:fs');
async function main(){
  const term=process.argv[2]||'7000';if(!/^(?:PSG)?\d{3,8}$/i.test(term))throw Error('Supply PSG7000 or a numeric design reference.');
  const c=new Client({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await c.connect();try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout = '15s'");
    const result=await c.query(`SELECT j.source_order_id,j.order_no,j.customer_name,j.job_title,j.screen_numbers,j.comments,
      (SELECT json_agg(json_build_object('design_ref',p.design_ref,'position',p.position_name,'colour_notes',p.colour_notes)) FROM database_job_positions p WHERE p.source_order_id=j.source_order_id) AS positions,
      (SELECT json_agg(l.line_description) FROM database_job_line_items l WHERE l.source_order_id=j.source_order_id) AS lines
      FROM database_jobs j WHERE concat_ws(' ',j.job_title,j.screen_numbers,j.comments,j.client_order_no) ~* $1
      OR EXISTS(SELECT 1 FROM database_job_positions p WHERE p.source_order_id=j.source_order_id AND concat_ws(' ',p.design_ref,p.position_name,p.colour_notes) ~* $1)
      OR EXISTS(SELECT 1 FROM database_job_line_items l WHERE l.source_order_id=j.source_order_id AND l.line_description ~* $1)
      ORDER BY j.order_date DESC NULLS LAST,j.order_no DESC LIMIT 50`,[/^PSG/i.test(term)?`(^|[^a-z0-9])P[\\s._/-]*S[\\s._/-]*G[\\s:#._/-]*${term.slice(3)}([^0-9]|$)`:`(^|[^0-9])${term}([^0-9]|$)`]);
    await c.query('ROLLBACK');const json=JSON.stringify(result.rows,null,2);if(process.argv[3])fs.writeFileSync(process.argv[3],json,{mode:0o600});console.log(json);
  }finally{await c.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
