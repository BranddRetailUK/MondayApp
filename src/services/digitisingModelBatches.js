// Bound structured-output work per request. A truncated batch is retried as
// smaller requests; partial JSON is never accepted as a complete plan.
async function mapRegions(regions,request,size=24){
  const chunks=[];for(let i=0;i<regions.length;i+=size)chunks.push(regions.slice(i,i+size));
  async function run(chunk){
    try{return await request(chunk);}catch(error){
      if(error.code!=='DIGITISING_OUTPUT_LIMIT'||chunk.length<2)throw error;
      const mid=Math.ceil(chunk.length/2);
      return [...await run(chunk.slice(0,mid)),...await run(chunk.slice(mid))];
    }
  }
  const results=new Array(chunks.length);let next=0,failed=false;
  async function worker(){try{while(!failed&&next<chunks.length){const i=next++;results[i]=await run(chunks[i]);}}catch(error){failed=true;throw error;}}
  await Promise.all(Array.from({length:Math.min(2,chunks.length)},worker));
  return results.flat();
}
function complete(payload,label){
  if(payload.status!=='incomplete')return;
  const error=Error(`${label} was incomplete (${payload.incomplete_details?.reason||'unknown reason'}). Please retry.`);
  if(payload.incomplete_details?.reason==='max_output_tokens')error.code='DIGITISING_OUTPUT_LIMIT';
  throw error;
}
module.exports={mapRegions,complete};
