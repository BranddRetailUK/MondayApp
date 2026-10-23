const {psgNumbers,psgColumns}=require('./proofPsgNumbers');
const {UUID}=require('./proofDesignJobs');
const {originalArtworkName}=require('../../tools/print-worker/proof-filename');
const columns=psgColumns+","+`id,live_design_id,created_by,source,revision,created_at,updated_at,ready,
  (proof_pdf IS NOT NULL) AS has_pdf,(preview_png IS NOT NULL) AS has_preview`;
const publicJob=row=>({id:row.id,psgNumbers:psgNumbers(row.psg_source,row.psg_artworks||[]),createdBy:row.created_by,testProof:true,liveDesignId:row.live_design_id||null,reference:'SANDBOX',
  customer:row.source.customer||'',jobTitle:row.source.jobTitle||'',revision:row.revision,
  status:row.has_pdf?'saved':'preparing',generationStatus:row.has_pdf?(row.ready?'complete':'review'):'interrupted',
  generationMessage:row.has_pdf?'':'Reopen this test proof to continue.',
  hasPdf:!!row.has_pdf&&row.ready,hasPreview:!!row.has_preview,hasSource:true,
  createdAt:row.created_at,updatedAt:row.updated_at});
function createService(pool){
  function valid(id){if(!UUID.test(id||''))throw Error('Invalid test proof ID.');}
  async function get(id){valid(id);const {rows}=await pool.query(`SELECT ${columns} FROM proof_test_jobs WHERE id=$1`,[id]);if(!rows[0])throw Error('Test proof not found.');return publicJob(rows[0]);}
  async function list(offset=0){const {rows}=await pool.query(`SELECT ${columns} FROM proof_test_jobs WHERE migrated_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $1`,[offset]);return {designs:rows.slice(0,50).map(publicJob),nextOffset:rows.length>50?offset+50:null};}
  async function saveSource(id,owner,source,files,details){
    valid(id);
    if(typeof source.request!=='string'||source.request.length>20000||String(source.instructions||'').length>5000)throw Error('Invalid proof source.');
    if(!Array.isArray(details)||details.length!==files.length||files.length>20||files.reduce((n,f)=>n+f.buffer.length,0)>50*1024*1024)throw Error('Artwork originals must total less than 50 MB.');
    const originals=files.map((file,i)=>({id:String(details[i].id||'').slice(0,100),name:originalArtworkName(details[i].originalName||file.originalname),type:file.mimetype,backgroundMode:details[i].backgroundMode||'auto',threadColours:details[i].threadColours||[],threadCodes:Array.isArray(details[i].threadCodes)?details[i].threadCodes.slice(0,100).map(code=>String(code||'').slice(0,40)):[],runoutFilename:String(details[i].runoutFilename||'').slice(0,255),assignment:String(details[i].assignment||'').slice(0,500),notes:String(details[i].notes||'').slice(0,1000),data:file.buffer.toString('base64')}));
    const retained={request:source.request,instructions:String(source.instructions||''),customer:String(source.customer||'').slice(0,200),jobTitle:String(source.jobTitle||'').slice(0,200),brief:source.brief};
    const saved=await pool.query(`INSERT INTO proof_test_jobs(id,created_by,source,source_artworks) VALUES($1,$2,$3::jsonb,$4::jsonb)
      ON CONFLICT(id) DO UPDATE SET source=EXCLUDED.source,source_artworks=EXCLUDED.source_artworks,updated_at=NOW() WHERE proof_test_jobs.live_design_id IS NULL RETURNING id`,[id,owner,JSON.stringify(retained),JSON.stringify(originals)]);
    if(!saved.rows.length)throw Error('This test proof is being added to live. Resume ADD TO LIVE from the test proofs list.');
    return get(id);
  }
  async function remove(id,expectedUpdatedAt){
    valid(id);
    const date=new Date(expectedUpdatedAt);
    if(!Number.isFinite(date.getTime()))throw Error('Refresh the proof list before deleting.');
    const result=await pool.query(`DELETE FROM proof_test_jobs WHERE id=$1 AND live_design_id IS NULL
      AND date_trunc('milliseconds',updated_at)=date_trunc('milliseconds',$2::timestamptz) RETURNING id`,[id,date.toISOString()]);
    if(!result.rows.length){
      const existing=await pool.query('SELECT live_design_id FROM proof_test_jobs WHERE id=$1',[id]);
      if(existing.rows[0]?.live_design_id)throw Error('This proof is being added to live and cannot be deleted here.');
      if(existing.rows.length)throw Error('This proof changed. Refresh the list before deleting.');
    }
  }
  async function source(id){await get(id);const {rows}=await pool.query('SELECT source,source_artworks FROM proof_test_jobs WHERE id=$1',[id]);return {source:rows[0].source,artworks:rows[0].source_artworks};}
  async function setPreview(id,bytes,brief,ready){
    const current=await get(id);if(current.liveDesignId)throw Error('This test proof is being added to live. Resume ADD TO LIVE from the test proofs list.');if(bytes.length>50*1024*1024)throw Error('Test proof PDF must be smaller than 50 MB.');
    const png=await require('./proofThumbnail').proofThumbnail(bytes);
    await pool.query(`UPDATE proof_test_jobs SET proof_pdf=$2,preview_png=$3,ready=$4,
      source=jsonb_set(source,'{brief}',$5::jsonb),revision=revision+1,updated_at=NOW() WHERE id=$1 AND live_design_id IS NULL`,[id,bytes,png,ready,JSON.stringify(brief)]);
  }
  async function asset(id,kind){await get(id);const column=kind==='pdf'?'proof_pdf':'preview_png';const {rows}=await pool.query(`SELECT ${column} AS bytes FROM proof_test_jobs WHERE id=$1${kind==='pdf'?' AND ready':''}`,[id]);return rows[0]?.bytes;}
  return {get,list,saveSource,source,setPreview,asset,remove};
}
module.exports={createService};
