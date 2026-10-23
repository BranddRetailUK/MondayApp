const { randomUUID } = require('node:crypto');
const { TEST_DASHBOARD_COLUMN_IDS: COL } = require('./testDashboardDefaults');
const CUSTOMER_ID = 3446;
async function ensureTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS madeblunt_design_jobs (
      source_order_id INTEGER PRIMARY KEY, proof_id UUID NOT NULL REFERENCES proof_design_jobs(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await db.query(`CREATE TABLE IF NOT EXISTS madeblunt_visual_files (
      id UUID PRIMARY KEY, source_order_id INTEGER NOT NULL REFERENCES madeblunt_design_jobs(source_order_id),
      file_id INTEGER NOT NULL, public_id TEXT NOT NULL, secure_url TEXT NOT NULL,
      filename TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      claim_token UUID, lease_until TIMESTAMPTZ, message TEXT NOT NULL DEFAULT '', hash TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(source_order_id,file_id,secure_url)
    )`);
  await db.query('ALTER TABLE madeblunt_visual_files ADD COLUMN IF NOT EXISTS legacy_filename TEXT');
}
// Called inside the order transaction. Customer identity is authoritative, not a name substring.
async function enroll(db, job, existingProofId=null) {
  if (Number(job.customer_id) !== CUSTOMER_ID) return null;
  await db.query('SELECT pg_advisory_xact_lock(731094,$1)',[job.source_order_id]);
  const existing = (await db.query('SELECT proof_id FROM madeblunt_design_jobs WHERE source_order_id=$1', [job.source_order_id])).rows[0];
  if (existing) return existing.proof_id;
  const id = existingProofId || randomUUID();
  if(!existingProofId) await db.query(`INSERT INTO proof_design_jobs(id,customer,job_title,pipeline)
    VALUES($1,$2,$3,'madeblunt')`, [id, job.customer_name || '', job.job_title || '']);
  await db.query('INSERT INTO madeblunt_design_jobs(source_order_id,proof_id) VALUES($1,$2)', [job.source_order_id,id]);
  return id;
}
async function transaction(pool, fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result=await fn(db); await db.query('COMMIT'); return result; }
  catch(error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
async function reconcile(pool) {
  return transaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(731093)');
    // Use the same position-table lock as existing design writers before allocating IDs.
    const ready=(await db.query(`SELECT m.source_order_id,p.design_number FROM madeblunt_design_jobs m
      JOIN proof_design_jobs p ON p.id=m.proof_id JOIN database_jobs j USING(source_order_id)
      WHERE p.folder_name IS NOT NULL AND p.design_number IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM database_job_positions d WHERE d.source_order_id=m.source_order_id AND BTRIM(d.design_ref)=p.design_number::text)`)).rows;
    if(ready.length)await db.query('LOCK TABLE database_job_positions IN SHARE ROW EXCLUSIVE MODE');
    for(const row of ready) {
      await db.query(`INSERT INTO database_job_positions(source_order_position_id,source_order_id,position_sort_order,design_ref,created_at_source,updated_at_source)
        SELECT (SELECT COALESCE(MAX(source_order_position_id),0)+1 FROM database_job_positions),$1,
        (SELECT COALESCE(MAX(position_sort_order),0)+1 FROM database_job_positions WHERE source_order_id=$1),$2,NOW(),NOW()
        WHERE NOT EXISTS(SELECT 1 FROM database_job_positions WHERE source_order_id=$1 AND BTRIM(design_ref)=$2)`,[row.source_order_id,String(row.design_number)]);
    }
    await db.query(`UPDATE madeblunt_visual_files v SET status='cancelled',message='Visual removed from job' WHERE status IN ('queued','error')
      AND NOT EXISTS(SELECT 1 FROM test_dashboard_files f WHERE f.id=v.file_id AND f.source_order_id=v.source_order_id AND f.secure_url=v.secure_url)`);
    // Requeue old prefixed copies once; the new worker verifies their bytes before removing the old name.
    await db.query(`UPDATE madeblunt_visual_files v SET legacy_filename=v.filename,filename=f.original_filename,
      status='queued',claim_token=NULL,lease_until=NULL,message='',updated_at=NOW()
      FROM test_dashboard_files f WHERE f.id=v.file_id AND f.source_order_id=v.source_order_id AND f.secure_url=v.secure_url
      AND v.legacy_filename IS NULL AND v.filename ~ '^Visual [0-9]+-[a-f0-9]{8} - '
      AND v.filename IS DISTINCT FROM f.original_filename AND f.original_filename IS NOT NULL
      AND v.status IN ('saved','queued','error')`);
    const files=(await db.query(`SELECT f.* FROM test_dashboard_files f JOIN madeblunt_design_jobs m USING(source_order_id)
      JOIN proof_design_jobs p ON p.id=m.proof_id WHERE p.folder_name IS NOT NULL
      AND (f.column_id=$1 OR UPPER(BTRIM(f.column_title)) IN ('PROOF','VISUAL'))
      AND NOT EXISTS(SELECT 1 FROM madeblunt_visual_files v WHERE v.source_order_id=f.source_order_id AND v.file_id=f.id AND v.secure_url=f.secure_url)`,[COL.PROOF])).rows;
    for(const file of files) {
      const filename=String(file.original_filename||'');
      await db.query(`INSERT INTO madeblunt_visual_files(id,source_order_id,file_id,public_id,secure_url,filename)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[randomUUID(),file.source_order_id,file.id,file.public_id,file.secure_url,filename]);
    }
  });
}
async function claim(pool, version=7) {
  if(version<7)return null;
  return transaction(pool,async db=>{
    const row=(await db.query(`SELECT v.*,p.design_number,p.folder_name FROM madeblunt_visual_files v
      JOIN madeblunt_design_jobs m USING(source_order_id) JOIN proof_design_jobs p ON p.id=m.proof_id
      JOIN test_dashboard_files f ON f.id=v.file_id AND f.source_order_id=v.source_order_id AND f.secure_url=v.secure_url
      WHERE v.status='queued' OR (v.status='saving' AND v.lease_until<NOW())
      ORDER BY v.updated_at LIMIT 1 FOR UPDATE OF v SKIP LOCKED`)).rows[0];
    if(!row)return null;
    const token=randomUUID();
    await db.query("UPDATE madeblunt_visual_files SET status='saving',claim_token=$2,lease_until=NOW()+INTERVAL '120 seconds',updated_at=NOW() WHERE id=$1",[row.id,token]);
    return {id:row.id,claimToken:token,operation:'visual',designNumber:String(row.design_number),folderName:row.folder_name,url:row.secure_url,filename:row.filename,legacyFilename:row.legacy_filename};
  });
}
async function report(pool,id,token,result) {
  if(result.status==='heartbeat')return {accepted:!!(await pool.query("UPDATE madeblunt_visual_files SET lease_until=NOW()+INTERVAL '120 seconds' WHERE id=$1 AND claim_token=$2 AND status='saving' AND lease_until>NOW() RETURNING id",[id,token])).rows.length};
  if(!['saved','error'].includes(result.status))throw new Error('Invalid visual result');
  if(result.status==='saved'&&!/^[a-f0-9]{64}$/.test(result.hash||''))throw new Error('Invalid visual hash');
  const r=await pool.query(`UPDATE madeblunt_visual_files SET status=$3,hash=$4,message=$5,lease_until=NULL,updated_at=NOW()
    WHERE id=$1 AND claim_token=$2 AND status IN ('saving',$3) RETURNING id`,[id,token,result.status,result.hash||null,String(result.message||'').slice(0,1000)]);
  return {accepted:!!r.rows.length};
}
async function status(pool,sourceOrderId) {
  const folder=(await pool.query(`SELECT p.id,p.design_number,p.folder_name,p.status,p.message FROM madeblunt_design_jobs m JOIN proof_design_jobs p ON p.id=m.proof_id WHERE m.source_order_id=$1`,[sourceOrderId])).rows[0];
  if(!folder)return null;
  return {...folder,visuals:(await pool.query('SELECT id,filename,status,message FROM madeblunt_visual_files WHERE source_order_id=$1 ORDER BY updated_at',[sourceOrderId])).rows};
}
module.exports={CUSTOMER_ID,ensureTables,enroll,reconcile,claim,report,status};
