// The reference is held out until generation has finished. Never fit geometry to it.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
require('dotenv').config({quiet:true});
const {plan}=require('../src/services/digitisingAuto');
const {propose}=require('../src/services/digitisingObjectPlan');
const {compile,preview}=require('../src/services/digitisingCompiler');
(async()=>{
  const [source,setup,previous,reference,directory,cacheDirectory]=process.argv.slice(2);
  if(!directory)throw Error('Usage: node scripts/benchmark-digitising-project.js source.png setup.json previous.dst reference.dst output-directory [interpretation-cache]');
  const request=JSON.parse(await fs.readFile(setup,'utf8')),allowed=['garment','widthMm','heightMm','border','outlineColour'];
  if(!request||Array.isArray(request)||Object.keys(request).some(k=>!allowed.includes(k)))throw Error('Use customer inputs only.');
  const artwork=await fs.readFile(source);
  const planned=await plan(artwork,request,{interpret:true,cacheDirectory:cacheDirectory||path.join(directory,'interpretations')});
  const proposal=await propose(planned.png,planned.config,{interpret:true,cacheDirectory:cacheDirectory||path.join(directory,'interpretations')});
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'proposal.json'),JSON.stringify(proposal,null,2));
  await fs.writeFile(path.join(directory,'project.json'),JSON.stringify(proposal.project,null,2));
  const candidate=compile(proposal.project),dst=Buffer.from(candidate.dst,'base64');
  await Promise.all([
    fs.writeFile(path.join(directory,'candidate.dst'),dst),
    fs.writeFile(path.join(directory,'preview.svg'),preview(candidate)),
    fs.writeFile(path.join(directory,'compile.json'),JSON.stringify({...candidate,dst:undefined},null,2))
  ]);
  const {parseDst}=await import('../public/embroidery-viewer.mjs');
  const metrics=bytes=>{const d=parseDst(bytes);let jumps=0,jumpSequences=0,lastJump=false;
    for(let i=512;i+2<bytes.length;i+=3){const c=bytes[i+2];if(c===243)break;const jump=(c&195)===131;if(jump){jumps++;if(!lastJump)jumpSequences++;}lastJump=jump;}
    return {stitches:d.stitches,widthMm:d.widthMm,heightMm:d.heightMm,colourChanges:d.colourChanges,jumps,jumpSequences,shortStitches:d.segments.filter(([x,y,a,b])=>Math.hypot(a-x,b-y)<5).length};
  };
  const report={request,referenceUsedForGeneration:false,sourceSha256:crypto.createHash('sha256').update(artwork).digest('hex'),candidate:metrics(dst),previous:metrics(await fs.readFile(previous)),reference:metrics(await fs.readFile(reference)),objects:candidate.objectStats.map(o=>({id:o.id,type:o.type})),reviewRequired:proposal.reviewRequired,warnings:[...proposal.warnings,...candidate.warnings],machineSewOut:'not verified'};
  await fs.writeFile(path.join(directory,'benchmark.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
