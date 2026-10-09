const { TEST_DASHBOARD_COLUMN_IDS: COL, TEST_DASHBOARD_GROUP_IDS: GROUP } = require('./testDashboardDefaults');
const { proofFileName } = require('../../tools/print-worker/proof-filename');
const VISUAL = `(column_id = '${COL.PROOF}' OR UPPER(BTRIM(column_title)) IN ('PROOF','VISUAL'))`;
const eligible = `j.is_complete IS NOT TRUE AND COALESCE(j.dashboard_status,'') NOT IN ('COMPLETED','INVOICED')
  AND NOT EXISTS (SELECT 1 FROM test_dashboard_job_state s WHERE s.source_order_id=j.source_order_id AND s.archived)
  AND (j.order_type IN ('Printing','Embroidery','Print + Emb') OR j.order_type_abbr IN ('P','E','PE','EP'))`;
const snapshotFields = ['source','source_artworks','garment_assets','customer','job_title'];
const isProduction = user => user?.access_scope !== 'dtf_only' && String(user?.email || '').trim().toLowerCase() === 'production@ultimatepromotions.co.uk';
function orderId(value) { const id=Number(value); if(!Number.isSafeInteger(id)||id<=0)throw new Error('Invalid job number.');return id; }
function createService(pool, {upload = require('./cloudinaryDashboard').uploadBuffer} = {}) {
  async function transaction(fn) {
    const db=await pool.connect();
    try { await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(71060216)');const result=await fn(db);await db.query('COMMIT');return result; }
    catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  async function jobs(q='') {
    return (await pool.query(`SELECT j.source_order_id,j.order_no,j.customer_name,j.job_title FROM database_jobs j
      WHERE ${eligible} AND NOT EXISTS (SELECT 1 FROM test_dashboard_files WHERE source_order_id=j.source_order_id AND ${VISUAL})
      AND NOT EXISTS (SELECT 1 FROM proof_job_links l WHERE l.source_order_id=j.source_order_id)
      AND ($1='' OR concat_ws(' ',j.order_no,j.customer_name,j.job_title) ILIKE '%' || $1 || '%')
      ORDER BY j.source_order_id DESC LIMIT 100`,[String(q).trim().slice(0,200)])).rows;
  }
  async function job(id) {
    id=orderId(id);
    const row=(await pool.query(`SELECT j.source_order_id,j.order_no,j.customer_name,j.job_title,j.proof_approved,
      l.proof_id, l.saved_revision, EXISTS(SELECT 1 FROM test_dashboard_files WHERE source_order_id=j.source_order_id AND ${VISUAL}) AS has_visual
      FROM database_jobs j LEFT JOIN proof_job_links l USING(source_order_id) WHERE j.source_order_id=$1`,[id])).rows[0];
    if(!row)throw new Error('Job not found.');return row;
  }
  async function checkTargetSwitch(db,proof,id){
    if(proof.publish_source_order_id && proof.publish_source_order_id!==id){
      const pending=(await db.query('SELECT saved_revision FROM proof_job_links WHERE source_order_id=$1 AND proof_id=$2',[proof.publish_source_order_id,proof.id])).rows[0];
      if(pending && pending.saved_revision<proof.saved_revision)throw new Error('Finish syncing the current saved proof before selecting another job.');
    }
    if(proof.active_source_order_id && proof.active_source_order_id!==id && !proof.saved_revision)throw new Error('Finish the current linked proof before selecting another job.');
  }
  async function linkWithClient(db, proofId, id) {
    id=orderId(id);
    const proof=(await db.query('SELECT * FROM proof_design_jobs WHERE id=$1 AND status<>\'archived\' FOR UPDATE',[proofId])).rows[0];
    if(!proof)throw new Error('Proof not found.');
    await checkTargetSwitch(db,proof,id);
    const target=(await db.query(`SELECT j.* FROM database_jobs j WHERE j.source_order_id=$1 AND ${eligible} FOR UPDATE`,[id])).rows[0];
    if(!target)throw new Error('Select an open printing or embroidery job.');
    const existing=(await db.query('SELECT * FROM proof_job_links WHERE source_order_id=$1',[id])).rows[0];
    if(existing?.proof_id===proofId)return;
    if(existing)throw new Error('This job already has a linked proof.');
    if((await db.query(`SELECT id FROM test_dashboard_files WHERE source_order_id=$1 AND ${VISUAL} LIMIT 1`,[id])).rows.length)throw new Error('This job already has a visual. Select a job without visuals.');
    if(['saving','save_queued','allocating'].includes(proof.status) || (proof.generation_status==='generating'&&Date.now()-new Date(proof.generation_updated_at).getTime()<120000))throw new Error('Wait for the proof to finish saving before linking it.');
    await db.query('INSERT INTO proof_job_links(source_order_id,proof_id,order_no) VALUES($1,$2,$3)',[id,proofId,target.order_no]);
    await db.query("UPDATE proof_design_jobs SET active_source_order_id=$2,publish_source_order_id=CASE WHEN status='saved' THEN $2 ELSE publish_source_order_id END WHERE id=$1",[proofId,id]);
  }
  async function link(proofId,id) {
    await transaction(db=>linkWithClient(db,proofId,id));
    // Association remains durable if Cloudinary is temporarily unavailable. Retry is safe.
    await publish(proofId);return job(id);
  }
  async function activate(id) {
    id=orderId(id);
    return transaction(async db=>{
      const link=(await db.query('SELECT * FROM proof_job_links WHERE source_order_id=$1',[id])).rows[0];
      if(!link)throw new Error('This visual was uploaded manually and has no editable generator source.');
      const proof=(await db.query('SELECT * FROM proof_design_jobs WHERE id=$1 FOR UPDATE',[link.proof_id])).rows[0];
      if(['saving','save_queued','allocating'].includes(proof.status) || (proof.generation_status==='generating' && Date.now()-new Date(proof.generation_updated_at).getTime()<120000))throw new Error('This proof is currently being generated or saved. Try again when it finishes.');
      const target=(await db.query('SELECT * FROM database_jobs WHERE source_order_id=$1 FOR UPDATE',[id])).rows[0];
      if(!target)throw new Error('Job not found.');
      await checkTargetSwitch(db,proof,id);
      if(target.proof_approved)throw new Error('Clear JOB approval before editing this proof. The changed proof will need approval again.');
      if(proof.active_source_order_id!==id && link.snapshot){
        const s=link.snapshot;
        await db.query(`UPDATE proof_design_jobs SET source=$2,source_artworks=$3,garment_assets=$4,
          customer=$5,job_title=$6 WHERE id=$1`,[proof.id,{...s.source,jobTitle:target.job_title||s.job_title||''},JSON.stringify(s.source_artworks||[]),JSON.stringify(s.garment_assets||{}),s.customer||'',target.job_title||s.job_title||'']);
      }
      await db.query('UPDATE proof_design_jobs SET active_source_order_id=$2 WHERE id=$1',[proof.id,id]);
      return proof.id;
    });
  }
  async function autoLink(proofId){
    return transaction(async db=>{
      const proof=(await db.query('SELECT * FROM proof_design_jobs WHERE id=$1 FOR UPDATE',[proofId])).rows[0];
      if(!proof||proof.status!=='saved'||!proof.saved_revision||proof.active_source_order_id)return null;
      if((await db.query('SELECT 1 FROM proof_job_links WHERE proof_id=$1 LIMIT 1',[proofId])).rows.length)return null;
      const name=String(proof.saved_snapshot?.customer||proof.customer||'').trim().replace(/\s+/g,' ').toLowerCase();
      if(!name)return null;
      const candidates=(await db.query(`SELECT j.*,s.group_id,s.column_values,s.archived
        FROM database_jobs j LEFT JOIN test_dashboard_job_state s USING(source_order_id)
        WHERE ${eligible} AND (s.source_order_id IS NOT NULL OR j.dashboard_status IS NOT NULL)
        AND LOWER(REGEXP_REPLACE(BTRIM(j.customer_name),'[[:space:]]+',' ','g'))=$1
        AND NOT EXISTS(SELECT 1 FROM test_dashboard_files WHERE source_order_id=j.source_order_id AND ${VISUAL})
        AND NOT EXISTS(SELECT 1 FROM proof_job_links l WHERE l.source_order_id=j.source_order_id)
        FOR UPDATE OF j`,[name])).rows;
      const {resolveDashboardGroupId,resolveJobApproved}=require('./dashboardAutomation');
      const matches=candidates.filter(job=>!resolveJobApproved(job,job.column_values||{}) && resolveDashboardGroupId(job,job,null)===GROUP.OFFICE);
      if(matches.length!==1)return null;
      await linkWithClient(db,proofId,matches[0].source_order_id);
      return matches[0].source_order_id;
    });
  }
  async function sync(proofId){await autoLink(proofId);await publish(proofId);}
  async function publish(proofId) {
    // Nothing to do for ordinary standalone proofs; no dashboard tables are needed.
    const pending=await pool.query(`SELECT l.source_order_id FROM proof_job_links l JOIN proof_design_jobs p ON p.id=l.proof_id
      WHERE p.id=$1 AND p.status='saved' AND l.source_order_id=p.publish_source_order_id AND l.saved_revision<p.saved_revision`,[proofId]);
    if(!pending.rows.length)return;
    return transaction(async db=>{
      await db.query('LOCK TABLE database_job_positions IN SHARE ROW EXCLUSIVE MODE');
      const proof=(await db.query('SELECT * FROM proof_design_jobs WHERE id=$1 FOR UPDATE',[proofId])).rows[0];
      const link=(await db.query('SELECT * FROM proof_job_links WHERE source_order_id=$1 AND proof_id=$2 FOR UPDATE',[proof.publish_source_order_id,proofId])).rows[0];
      if(!link||proof.status!=='saved'||link.saved_revision>=proof.saved_revision)return;
      const target=(await db.query('SELECT * FROM database_jobs WHERE source_order_id=$1 FOR UPDATE',[link.source_order_id])).rows[0];
      if(!target)throw new Error('The linked job no longer exists.');
      if(target.proof_approved)throw new Error('Clear JOB approval before updating its visual, then retry linking.');
      const files=(await db.query(`SELECT * FROM test_dashboard_files WHERE source_order_id=$1 AND ${VISUAL} FOR UPDATE`,[link.source_order_id])).rows;
      if(files.some(file=>file.public_id!==link.file_public_id))throw new Error('The job visual has changed. Remove the unrelated visual before retrying.');
      if(!proof.saved_proof_pdf)throw new Error('The saved PDF is unavailable.');
      const filename=proofFileName({designNumber:String(proof.design_number),customer:proof.saved_snapshot?.customer||proof.customer,jobTitle:proof.saved_snapshot?.job_title||proof.job_title});
      const asset=await upload(Buffer.from(proof.saved_proof_pdf),{folder:`ultimate-hub/test-dashboard/proof/${link.source_order_id}`,publicId:`generated-${proof.id}-${proof.saved_revision}`,filename,resourceType:'image'});
      if(!asset.public_id||!asset.secure_url)throw new Error('Proof upload failed.');
      // Revision-specific assets preserve previous/repeat order visuals.
      await db.query(`DELETE FROM test_dashboard_files WHERE source_order_id=$1 AND ${VISUAL}`,[link.source_order_id]);
      await db.query(`INSERT INTO test_dashboard_files(source_order_id,column_id,column_title,public_id,secure_url,resource_type,format,original_filename,bytes,metadata)
        VALUES($1,$2,'PROOF',$3,$4,$5,'pdf',$6,$7,$8)`,[link.source_order_id,COL.PROOF,asset.public_id,asset.secure_url,asset.resource_type||'image',filename,asset.bytes||proof.saved_proof_pdf.length,JSON.stringify({proofId,revision:proof.saved_revision})]);
      const insertedPosition=await db.query(`INSERT INTO database_job_positions(source_order_position_id,source_order_id,position_sort_order,design_ref,created_at_source,updated_at_source)
        SELECT (SELECT COALESCE(MAX(source_order_position_id),0)+1 FROM database_job_positions),$1,
          (SELECT COALESCE(MAX(position_sort_order),0)+1 FROM database_job_positions WHERE source_order_id=$1),$2,NOW(),NOW()
        WHERE NOT EXISTS(SELECT 1 FROM database_job_positions WHERE source_order_id=$1 AND BTRIM(design_ref)=$2) RETURNING source_order_position_id`,[link.source_order_id,String(proof.design_number)]);
      const snapshot=proof.saved_snapshot||Object.fromEntries(snapshotFields.map(key=>[key,proof[key]]));
      await db.query('UPDATE proof_job_links SET saved_revision=$2,file_public_id=$3,snapshot=$4,created_position_id=COALESCE(created_position_id,$5) WHERE source_order_id=$1',[link.source_order_id,proof.saved_revision,asset.public_id,JSON.stringify(snapshot),insertedPosition.rows[0]?.source_order_position_id||null]);
    });
  }
  async function unlink(id){
    id=orderId(id);
    return transaction(async db=>{
      const link=(await db.query('SELECT * FROM proof_job_links WHERE source_order_id=$1',[id])).rows[0];if(!link)return;
      const proof=(await db.query('SELECT * FROM proof_design_jobs WHERE id=$1 FOR UPDATE',[link.proof_id])).rows[0];
      if(['saving','save_queued','allocating'].includes(proof.status))throw new Error('Wait until proof saving finishes before unlinking.');
      const target=(await db.query('SELECT * FROM database_jobs WHERE source_order_id=$1 FOR UPDATE',[id])).rows[0];
      if(target?.proof_approved)throw new Error('Clear JOB approval before unlinking its proof.');
      await db.query('DELETE FROM test_dashboard_files WHERE source_order_id=$1 AND public_id=$2',[id,link.file_public_id]);
      await db.query(`DELETE FROM database_job_positions WHERE source_order_id=$1 AND source_order_position_id=$2
        AND BTRIM(design_ref)=$3 AND COALESCE(position_name,'')='' AND COALESCE(colour_notes,'')=''`,[id,link.created_position_id,String(proof.design_number)]);
      await db.query('DELETE FROM proof_job_links WHERE source_order_id=$1',[id]);
      await db.query('UPDATE proof_design_jobs SET active_source_order_id=NULL WHERE id=$1 AND active_source_order_id=$2',[proof.id,id]);
    });
  }
  return {jobs,job,link,linkWithClient,activate,publish,unlink,autoLink,sync};
}
module.exports={createService,isProduction,VISUAL};
