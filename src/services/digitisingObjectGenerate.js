// Adapter for the existing Create response and independently decoded preview.
async function generate(png,config,options={}){
  const proposal=await require('./digitisingObjectPlan').propose(png,config,{...options,interpret:true});
  const result=require('./digitisingCompiler').compile(proposal.project);
  const {parseDst}=await import('../../public/embroidery-viewer.mjs');
  const decoded=parseDst(Buffer.from(result.dst,'base64'));
  if(Math.max(decoded.widthMm,decoded.heightMm)>config.hoopMm-10)throw Error('Generated satin or outline exceeds the hoop clearance.');
  return {...result,pipeline:'objects-v1',config,reviewRequired:proposal.reviewRequired,
    warnings:[...proposal.warnings,...result.warnings],
    stats:{...result.stats,widthMm:decoded.widthMm,heightMm:decoded.heightMm},strokePlan:proposal.strokePlan};
}
module.exports={generate};
