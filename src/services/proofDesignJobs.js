const {originalArtworkName}=require('../../tools/print-worker/proof-filename');
const {randomUUID,createHash}=require('node:crypto');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const publicJob=row=>row&&({id:row.id,customer:row.customer,jobTitle:row.job_title,designNumber:row.design_number&&String(row.design_number),folderName:row.folder_name,status:row.status,revision:row.revision,savedRevision:row.saved_revision,message:row.message,sourceOrderId:row.active_source_order_id||null,linkedOrders:row.linked_orders||[],linkedJobs:row.linked_jobs||[],linkPending:!!row.link_pending,reference:row.reference||'',createdAt:row.created_at,updatedAt:row.updated_at,hasPreview:!!row.has_preview,hasPdf:!!row.has_pdf,hasSource:!!row.has_source,generationStatus:row.generation_status==='generating'&&Date.now()-new Date(row.generation_updated_at).getTime()>120000?'interrupted':row.generation_status||'',generationMessage:row.generation_message||''});
const columns="(SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceOrderId',l.source_order_id,'orderNo',l.order_no) ORDER BY l.source_order_id), '[]'::jsonb) FROM proof_job_links l WHERE l.proof_id=proof_design_jobs.id) AS linked_orders,EXISTS(SELECT 1 FROM proof_job_links l WHERE l.proof_id=proof_design_jobs.id AND l.source_order_id=proof_design_jobs.publish_source_order_id AND l.saved_revision<proof_design_jobs.saved_revision) AS link_pending,active_source_order_id,(SELECT COALESCE(jsonb_agg(l.source_order_id ORDER BY l.source_order_id), '[]'::jsonb) FROM proof_job_links l WHERE l.proof_id=proof_design_jobs.id) AS linked_jobs,id,customer,job_title,design_number,folder_name,status,revision,saved_revision,message,save_key,pdf_hash,reference,created_at,updated_at,generation_status,generation_message,generation_updated_at,(preview_png IS NOT NULL) AS has_preview,(proof_pdf IS NOT NULL AND proof_ready) AS has_pdf,(source IS NOT NULL) AS has_source";
function createService(pool){
  const query=(text,values=[])=>pool.query(text,values);
  async function get(id){if(!UUID.test(id||''))throw new Error('Invalid proof ID.');const r=await query(`SELECT ${columns} FROM proof_design_jobs WHERE id=$1 AND status<>'archived'`,[id]);if(!r.rows[0])throw new Error('Proof design not found.');return publicJob(r.rows[0]);}
  async function list(offset=0,unlinked=false,q=''){
    const result=await query(`SELECT ${columns} FROM proof_design_jobs WHERE status<>'archived' AND (NOT $2 OR NOT EXISTS(SELECT 1 FROM proof_job_links l WHERE l.proof_id=proof_design_jobs.id)) AND ($3='' OR concat_ws(' ',customer,job_title,design_number) ILIKE '%' || $3 || '%') ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $1`,[offset,unlinked,String(q).slice(0,200)]);
    return {designs:result.rows.slice(0,50).map(publicJob),nextOffset:result.rows.length>50?offset+50:null};
  }
  async function progress(id,{state,message='',customer,jobTitle,reference}={}){
    await get(id);
    if(!['generating','review','error','complete'].includes(state))throw new Error('Invalid proof progress.');
    await query(`UPDATE proof_design_jobs SET generation_status=$2,generation_message=$3,generation_updated_at=NOW(),
      customer=COALESCE($4,customer),job_title=COALESCE($5,job_title),reference=COALESCE($6,reference) WHERE id=$1`,
      [id,state,String(message).slice(0,1000),customer==null?null:String(customer).slice(0,200),jobTitle==null?null:String(jobTitle).slice(0,200),reference==null?null:String(reference).slice(0,200)]);
    return get(id);
  }
  async function setPreview(id,bytes,brief,ready=false){
    await get(id);
    const png=await require('./proofThumbnail').proofThumbnail(bytes);
    await query("UPDATE proof_design_jobs SET preview_png=$2,proof_pdf=$3,proof_ready=$4,source=CASE WHEN source IS NULL THEN NULL ELSE jsonb_set(source,'{brief}',$5::jsonb) END,updated_at=NOW() WHERE id=$1",[id,png,bytes,ready,JSON.stringify(brief||null)]);
  }
  async function preview(id){
    await get(id);return (await query('SELECT preview_png FROM proof_design_jobs WHERE id=$1',[id])).rows[0]?.preview_png;
  }
  async function saveSource(id,source,files,details){
    const design=await get(id);
    if(String(design.sourceOrderId||'')!==String(source?.proofSourceOrderId||''))throw new Error('The linked job changed. Reopen this proof from the job.');
    if(!source||typeof source.request!=='string'||source.request.length>20000||String(source.instructions||'').length>5000)throw new Error('Invalid proof source.');
    if(!Array.isArray(details)||details.length!==files.length||files.length>20||files.reduce((sum,file)=>sum+file.buffer.length,0)>50*1024*1024)throw new Error('Artwork originals must total less than 50 MB.');
    const originals=files.map((file,index)=>({id:String(details[index].id||'').slice(0,100),name:originalArtworkName(details[index].originalName||file.originalname),type:file.mimetype,backgroundMode:details[index].backgroundMode||'auto',assignment:String(details[index].assignment||'').slice(0,500),notes:String(details[index].notes||'').slice(0,1000),data:file.buffer.toString('base64')}));
    await query('UPDATE proof_design_jobs SET source=$2::jsonb,source_artworks=$3::jsonb WHERE id=$1',[id,JSON.stringify({request:source.request,instructions:String(source.instructions||''),customer:String(source.customer||'').slice(0,200),jobTitle:String(source.jobTitle||'').slice(0,200),brief:source.brief||null}),JSON.stringify(originals)]);
  }
  async function source(id){
    await get(id);const row=(await query('SELECT source,source_artworks FROM proof_design_jobs WHERE id=$1',[id])).rows[0];
    return row.source?{source:row.source,artworks:row.source_artworks}:null;
  }
  async function garmentLoader(id){
    await get(id);
    const assets=(await query('SELECT garment_assets FROM proof_design_jobs WHERE id=$1',[id])).rows[0].garment_assets||{};
    return async(url,provider,fetchImpl)=>{
      const key=createHash('sha256').update(provider+'\n'+url).digest('hex');
      if(assets[key])return Buffer.from(assets[key],'base64');
      const bytes=await require('./proofImageFetch').fetchGarment(url,provider,fetchImpl);
      assets[key]=bytes.toString('base64');
      await query('UPDATE proof_design_jobs SET garment_assets=garment_assets || $2::jsonb WHERE id=$1',[id,JSON.stringify({[key]:assets[key]})]);
      return bytes;
    };
  }
  async function document(id){
    await get(id);return (await query('SELECT proof_pdf FROM proof_design_jobs WHERE id=$1 AND proof_ready',[id])).rows[0]?.proof_pdf;
  }
  async function reserve(id,customer='',jobTitle='',deferAllocation=false){
    if(!UUID.test(id||''))throw new Error('Invalid proof ID.');
    await query('INSERT INTO proof_design_jobs(id,customer,job_title,status) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[id,String(customer).trim().slice(0,200),String(jobTitle).trim().slice(0,200),deferAllocation?'preparing':'awaiting_folder']);
    if(!deferAllocation)await query("UPDATE proof_design_jobs SET status='awaiting_folder',customer=$2,job_title=$3 WHERE id=$1 AND status='preparing'",[id,String(customer).trim().slice(0,200),String(jobTitle).trim().slice(0,200)]);
    return get(id);
  }
  async function queueSave(id,key,expectedRevision,bytes,brief,artworks=[]){
    if(!UUID.test(key||'')||!Number.isInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid proof revision.');
    const target=(await query('SELECT active_source_order_id FROM proof_design_jobs WHERE id=$1',[id])).rows[0]?.active_source_order_id;
    if(String(target||'')!==String(brief.proofSourceOrderId||''))throw new Error('The linked job changed. Reopen this proof from the job before saving.');
    if(target && (await query('SELECT proof_approved FROM database_jobs WHERE source_order_id=$1',[target])).rows[0]?.proof_approved)throw new Error('Clear JOB approval before changing its proof.');
    if(bytes.length>50*1024*1024)throw new Error('The saved proof must be smaller than 50 MB.');
    if(artworks.length>20||artworks.reduce((sum,file)=>sum+file.buffer.length,0)>50*1024*1024)throw new Error('Artwork originals must total less than 50 MB.');
    const originals=artworks.map(file=>({name:originalArtworkName(file.originalname),hash:createHash('sha256').update(file.buffer).digest('hex'),data:file.buffer.toString('base64')}));
    const hash=createHash('sha256').update(bytes).digest('hex');
    const r=await query(`UPDATE proof_design_jobs SET pdf=$4,pdf_hash=$5,save_key=$2,revision=revision+1,status='save_queued',
      customer=$6,job_title=$7,artworks=$8::jsonb,publish_source_order_id=$10,proof_pdf=$4,proof_ready=true,source=CASE WHEN source IS NULL THEN NULL ELSE jsonb_set(source,'{brief}',$9::jsonb) END,claim_token=NULL,lease_until=NULL,message='Waiting for ARTWORK-PC to save the proof',updated_at=NOW()
      WHERE id=$1 AND design_number IS NOT NULL AND folder_name IS NOT NULL AND revision=$3 AND status IN ('folder_ready','saved','error')
      AND active_source_order_id IS NOT DISTINCT FROM $10::integer AND (save_key IS NULL OR save_key<>$2) RETURNING *`,[id,key,expectedRevision,bytes,hash,String(brief.customer||'').slice(0,200),String(brief.jobTitle||'').slice(0,200),JSON.stringify(originals),JSON.stringify(brief),target||null]);
    if(r.rows[0])return publicJob(r.rows[0]);
    const current=await query(`SELECT ${columns} FROM proof_design_jobs WHERE id=$1`,[id]);
    if(current.rows[0]?.save_key===key)return publicJob(current.rows[0]);
    throw new Error('The proof has changed or is still being saved. Wait for the current save, then regenerate.');
  }
  async function retry(id){await get(id);await query(`UPDATE proof_design_jobs SET status=CASE WHEN folder_name IS NULL THEN 'awaiting_folder' WHEN pdf IS NOT NULL THEN 'save_queued' ELSE 'folder_ready' END,message='',claim_token=NULL,lease_until=NULL WHERE id=$1 AND status='error'`,[id]);return get(id);}
  async function claim(workerId){
    const db=await pool.connect();
    try{
      await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(731092)');
      const active=await db.query("SELECT id FROM proof_design_jobs WHERE status IN ('allocating','saving') AND lease_until>NOW() LIMIT 1");
      if(active.rows.length){await db.query('COMMIT');return null;}
      const result=await db.query(`SELECT * FROM proof_design_jobs WHERE status IN ('awaiting_folder','save_queued') OR
        (status IN ('allocating','saving') AND lease_until<=NOW()) ORDER BY created_at LIMIT 1 FOR UPDATE`);
      const job=result.rows[0];if(!job){await db.query('COMMIT');return null;}
      const token=randomUUID(),operation=job.folder_name?'save':'allocate';
      await db.query(`UPDATE proof_design_jobs SET status=$2,claim_token=$3,worker_id=$4,lease_until=NOW()+INTERVAL '120 seconds',updated_at=NOW() WHERE id=$1`,[job.id,operation==='save'?'saving':'allocating',token,workerId]);
      await db.query('COMMIT');
      return {id:job.id,operation,claimToken:token,customer:job.customer,jobTitle:job.job_title,designNumber:job.design_number&&String(job.design_number),folderName:job.folder_name,revision:job.revision,hash:job.pdf_hash,artworks:job.artworks||[],pdf:job.pdf&&Buffer.from(job.pdf).toString('base64')};
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  async function reserveNumber(id,token,proposed){
    if(!/^\d{5,10}$/.test(String(proposed||'')))throw new Error('Invalid proposed design number.');
    const db=await pool.connect();
    try{
      await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(731092)');
      const row=(await db.query("SELECT design_number FROM proof_design_jobs WHERE id=$1 AND claim_token=$2 AND status='allocating' AND lease_until>NOW() FOR UPDATE",[id,token])).rows[0];
      if(!row){await db.query('COMMIT');return {accepted:false};}
      if(row.design_number){await db.query('COMMIT');return {accepted:true,designNumber:String(row.design_number)};}
      const highest=(await db.query('SELECT COALESCE(MAX(design_number),0) AS highest FROM proof_design_jobs')).rows[0].highest;
      const number=String(Math.max(Number(proposed),Number(highest)+1));
      if(!/^\d{5,10}$/.test(number))throw new Error('Design number range exhausted.');
      await db.query("UPDATE proof_design_jobs SET design_number=$3,message='Design number reserved; creating folder',updated_at=NOW() WHERE id=$1 AND claim_token=$2",[id,token,number]);
      await db.query('COMMIT');return {accepted:true,designNumber:number};
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  async function report(id,token,result){
    if(!UUID.test(id||'')||!UUID.test(token||''))throw new Error('Invalid worker claim.');
    if(result.status==='reserve')return reserveNumber(id,token,result.proposedNumber);
    const row=(await query(`SELECT ${columns} FROM proof_design_jobs WHERE id=$1 AND claim_token=$2`,[id,token])).rows[0];
    if(!row)return {accepted:false};
    if(['folder_ready','saved','error'].includes(row.status))return {accepted:true};
    if(result.status==='heartbeat'){
      const r=await query("UPDATE proof_design_jobs SET lease_until=NOW()+INTERVAL '120 seconds',message=$3 WHERE id=$1 AND claim_token=$2 AND lease_until>NOW() RETURNING id",[id,token,String(result.message||'Working on design files').slice(0,500)]);return {accepted:!!r.rows.length};
    }
    if(result.status==='error')await query("UPDATE proof_design_jobs SET status='error',message=$3,lease_until=NULL,updated_at=NOW() WHERE id=$1 AND claim_token=$2",[id,token,String(result.message||'Local file operation failed').slice(0,1000)]);
    else if(result.status==='allocated'&&row.status==='allocating'){
      const n=String(result.designNumber||''),folder=String(result.folderName||'');
      if(!/^\d{5,10}$/.test(n)||!folder.startsWith(n+' ')||/[\\/\x00-\x1f]/.test(folder)||folder.length>160)throw new Error('Invalid design folder result.');
      if(String(row.design_number||'')!==n)return {accepted:false,message:'Reserve the design number before creating its folder.'};
      await query("UPDATE proof_design_jobs SET design_number=$3,folder_name=$4,status='folder_ready',message='',lease_until=NULL,updated_at=NOW() WHERE id=$1 AND claim_token=$2",[id,token,n,folder]);
    }else if(result.status==='saved'&&row.status==='saving'&&result.hash===row.pdf_hash&&result.revision===row.revision){
      const folder=result.folderName==null?row.folder_name:String(result.folderName);
      const expected=`${row.design_number} ${require('../../tools/print-worker/proof-files').cleanCustomer(row.customer)}`;
      if(result.folderName!=null&&folder!==expected)throw new Error('Invalid saved design folder result.');
      await query("UPDATE proof_design_jobs SET folder_name=$3,status='saved',generation_status='complete',generation_message='',saved_revision=revision,saved_proof_pdf=pdf,saved_snapshot=jsonb_build_object('source',source,'source_artworks',source_artworks,'garment_assets',garment_assets,'customer',customer,'job_title',job_title),pdf=NULL,artworks='[]'::jsonb,message='Saved in DESIGN FILES',lease_until=NULL,updated_at=NOW() WHERE id=$1 AND claim_token=$2",[id,token,folder]);
    }else throw new Error('Invalid file worker result.');
    return {accepted:true};
  }
  return {get,list,progress,setPreview,garmentLoader,preview,saveSource,source,document,reserve,queueSave,retry,claim,report};
}
module.exports={createService,UUID};
