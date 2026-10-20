const {randomUUID}=require('node:crypto');
const {createService:designService,UUID}=require('./proofDesignJobs');
const {assess,inspect}=require('./proofPreflight');
const {repairRetainedDimensions}=require('./proofLayout');

// A durable one-to-one mapping makes allocation, retries and ambiguous responses safe.
function createService(pool, {enrich=require('./proofProductVisuals').enrichProofProducts,
  generateViews=require('./proofGeneratedViews').ensureGeneratedViews,
  build=require('./proofPdfGenerator').buildProof,
  thumbnail=require('./proofThumbnail').proofThumbnail,
  links=require('./proofJobLinks').createService(pool)}={}) {
  const designs=designService(pool);
  async function row(id) {
    if(!UUID.test(id||''))throw Error('Invalid test proof ID.');
    const result=await pool.query('SELECT * FROM proof_test_jobs WHERE id=$1',[id]);
    if(!result.rows[0])throw Error('Test proof not found.');
    return result.rows[0];
  }
  const filesFor=artworks=>artworks.map(a=>({originalname:a.name,mimetype:a.type,buffer:Buffer.from(a.data,'base64')}));
  const detailsFor=artworks=>artworks.map(a=>({...a,data:undefined,originalName:a.name}));
  async function check(source, originals, files, renderCheck=true) {
    const brief=structuredClone(source.brief);
    if(!brief?.products?.length||brief.products.length>20)throw Error('A proof needs 1-20 products.');
    for(const key of ['testProofId','proofDesignId','proofSourceOrderId','proofRevision','proofSaveKey'])delete brief[key];
    brief.reference='';brief.customer=source.customer;brief.jobTitle=source.jobTitle;
    repairRetainedDimensions(brief,source);
    const retained=structuredClone(brief.products);
    await enrich(brief);
    for(const [i,p] of brief.products.entries())if(retained[i]?.visual?.matched)p.visual=retained[i].visual;
    await require('./proofHeadwearViews').restorePreparedHeadwearViews(brief,retained);
    const details=detailsFor(originals);
    const assets=await Promise.all(files.map((file,i)=>inspect(file,details[i])));
    brief.preflightVersion=1;brief.preflightRequest=[source.request,source.instructions].filter(Boolean).join('\n');
    const review=assess(brief,assets,brief.preflightRequest);
    if(!review.ready)throw Error(review.issues.map(i=>i.message).join(' '));
    await generateViews(brief,{allowGenerate:true});
    // Use the same strict renderer before allocating a live identity.
    if(renderCheck){
      const result=await build(brief,files.map((file,i)=>({file,...details[i]})),{strict:true});
      if(result.issues.some(i=>i.blocking))throw Error('Resolve the proof issues before adding it to live.');
    }
    return brief;
  }
  async function promote(id, files=[], expectedUpdatedAt) {
    let saved=await row(id);
    if(!saved.live_design_id){
      if(!saved.ready)throw Error('Regenerate this test proof and resolve its issues before adding it to live.');
      if(new Date(expectedUpdatedAt).getTime()!==new Date(saved.updated_at).getTime())throw Error('The test proof changed. Refresh the test proofs and try again.');
      if(!files.length||files.length!==saved.source_artworks.length||files.length>20||files.reduce((n,f)=>n+f.buffer.length,0)>50*1024*1024)throw Error('Prepared artwork files do not match the test proof.');
      if(files.some(f=>! /\.(png|jpe?g|webp|pdf|ttf|otf)$/i.test(f.originalname)))throw Error('Prepare the original artwork before adding this proof to live.');
      const brief=await check(saved.source,saved.source_artworks,files);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const locked=(await client.query('SELECT * FROM proof_test_jobs WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!locked.live_design_id){
          if(new Date(locked.updated_at).getTime()!==new Date(saved.updated_at).getTime())throw Error('The test proof changed. Refresh and try again.');
          const liveId=randomUUID(),service=designService(client);
          await service.reserve(liveId,saved.source.customer,saved.source.jobTitle,true);
          await service.saveSource(liveId,{...saved.source,brief},filesFor(saved.source_artworks),detailsFor(saved.source_artworks));
          await client.query('UPDATE proof_test_jobs SET live_design_id=$2,live_prepared_artworks=$3 WHERE id=$1',[id,liveId,JSON.stringify(files.map(f=>({name:f.originalname,type:f.mimetype,data:f.buffer.toString('base64')})))]);
        }
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      saved=await row(id);
    }
    let design=await designs.get(saved.live_design_id);
    if(design.status==='error')design=await designs.retry(design.id);
    if(design.status==='preparing')design=await designs.reserve(design.id,design.customer,design.jobTitle);
    if(design.status==='saved'){
      await links.sync(design.id);
      const migrated=await complete(pool,design.id);
      return {design:await designs.get(design.id),complete:migrated};
    }
    if(design.revision>0||!design.designNumber||!design.folderName)return {design,complete:false};
    const retained=await designs.source(design.id),source=retained.source;
    const prepared=filesFor(saved.live_prepared_artworks||[]);
    const brief=await check(source,retained.artworks,prepared,false);
    brief.proofDesignId=design.id;brief.reference=design.designNumber;brief.proofSourceOrderId=design.sourceOrderId;
    brief.proofRevision=0;brief.proofSaveKey=design.id;
    const result=await build(brief,prepared.map((file,i)=>({file,...detailsFor(retained.artworks)[i]})),{strict:true,garmentLoader:await designs.garmentLoader(design.id)});
    if(result.issues.some(i=>i.blocking))throw Error('Resolve the proof issues before saving.');
    design=await designs.queueSave(design.id,design.id,0,result.bytes,brief,filesFor(retained.artworks),await thumbnail(result.bytes));
    return {design,complete:false};
  }
  return {promote};
}
async function complete(pool,liveId){
  // Called only after the normal workstation save and job publication succeed.
  await pool.query(`UPDATE proof_test_jobs SET migrated_at=NOW(),live_prepared_artworks=NULL
    WHERE live_design_id=$1 AND migrated_at IS NULL
    AND EXISTS(SELECT 1 FROM proof_design_jobs WHERE id=$1 AND status='saved')
    AND NOT EXISTS(SELECT 1 FROM proof_job_links l JOIN proof_design_jobs p ON p.id=l.proof_id
      WHERE p.id=$1 AND l.source_order_id=p.publish_source_order_id AND l.saved_revision<p.saved_revision)`,[liveId]);
  return !!(await pool.query('SELECT migrated_at FROM proof_test_jobs WHERE live_design_id=$1',[liveId])).rows[0]?.migrated_at;
}
module.exports={createService,complete};
