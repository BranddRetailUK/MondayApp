const {randomUUID}=require('node:crypto');
const DESIGN=/^[1-9]\d{0,9}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function ensureTables(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS design_folder_workers (id TEXT PRIMARY KEY, seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS design_folder_requests (id UUID PRIMARY KEY, design_number TEXT NOT NULL, worker_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', claim_token UUID, message TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
}
async function request(pool,number){
  const workers=await pool.query("SELECT id FROM design_folder_workers WHERE seen_at>NOW()-INTERVAL '15 seconds'");
  if(workers.rows.length!==1)throw new Error(workers.rows.length?'More than one folder worker is connected. Stop the extra worker and try again.':'Folder worker is offline. Start worker 1.22 on the Windows design computer.');
  const id=randomUUID();
  await pool.query('INSERT INTO design_folder_requests(id,design_number,worker_id) VALUES($1,$2,$3)',[id,number,workers.rows[0].id]);
  return {id,status:'queued'};
}
async function claim(pool,worker){
  await pool.query('INSERT INTO design_folder_workers(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET seen_at=NOW()',[worker]);
  await pool.query("DELETE FROM design_folder_requests WHERE created_at<NOW()-INTERVAL '1 day'");
  const result=await pool.query(`UPDATE design_folder_requests SET status='opening',claim_token=$2 WHERE id=(SELECT id FROM design_folder_requests
    WHERE worker_id=$1 AND status='queued' AND created_at>NOW()-INTERVAL '60 seconds' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id,design_number AS "designNumber",claim_token AS "claimToken",created_at+INTERVAL '60 seconds' AS "expiresAt"`,[worker,randomUUID()]);
  return result.rows[0]||null;
}
async function status(pool,id){
  const result=await pool.query(`SELECT CASE WHEN status IN ('queued','opening') AND created_at<NOW()-INTERVAL '60 seconds' THEN 'expired' ELSE status END AS status,message FROM design_folder_requests WHERE id=$1`,[id]);
  return result.rows[0];
}
async function report(pool,id,token,state,message){
  return (await pool.query("UPDATE design_folder_requests SET status=$3,message=$4 WHERE id=$1 AND claim_token=$2 AND status='opening' RETURNING id",[id,token,state,message])).rows.length===1;
}
module.exports={DESIGN,UUID,ensureTables,request,claim,status,report};
