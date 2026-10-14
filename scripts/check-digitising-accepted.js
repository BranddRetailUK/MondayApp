// Frozen source-only plans isolate engine regressions from new AI decisions.
// Private fixtures and production references must remain outside Git.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const accepted=require('../docs/digitising-studio/accepted-designs.json');
const run=promisify(execFile),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function validateManifest(entries){
  if(!Array.isArray(entries)||entries.length!==accepted.designs.length)throw Error('Every accepted design must be included exactly once.');
  for(const design of accepted.designs){
    const matches=entries.filter(e=>e.id===design.id);
    if(matches.length!==1)throw Error(`Missing or duplicate accepted design: ${design.id}`);
    const e=matches[0];
    if(!e.png||!e.config||!e.strokePlan||!e.baseline||(design.minimumScore!==null&&!e.reference))throw Error(`Incomplete private fixture: ${design.id}`);
  }
}
function assess(design,score,identical){
  if(design.minimumScore===null)return identical;
  return score?.method==='physical-field-v1'&&score.minimumScore>=Math.max(accepted.minimumTarget,design.minimumScore)
    &&['colourSequence','size','shortStitches'].every(k=>score.gates?.[k]===true);
}
async function check(manifest,directory,python='python3'){
  const entries=JSON.parse(await fs.readFile(manifest,'utf8'));validateManifest(entries);
  const resolve=p=>path.resolve(path.dirname(path.resolve(manifest)),p);
  const output=path.resolve(directory);
  for(const e of entries)for(const key of ['png','config','strokePlan','baseline','reference'])if(e[key]){
    const file=resolve(e[key]);if(file===output||file.startsWith(output+path.sep))throw Error('Output would overwrite a fixture.');
    await fs.access(file);
  }
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
  const report={minimumTarget:accepted.minimumTarget,referenceUsedForGeneration:false,results:[]};
  try{report.gitRevision=(await run('git',['rev-parse','HEAD'])).stdout.trim();}catch{}
  const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  for(const design of accepted.designs){
    const e=entries.find(e=>e.id===design.id),result={id:e.id,passed:false};report.results.push(result);
    try{
      const png=await fs.readFile(resolve(e.png)),config=JSON.parse(await fs.readFile(resolve(e.config))),strokePlan=JSON.parse(await fs.readFile(resolve(e.strokePlan)));
      result.sourceSha256=hash(png);
      const proposal=await require('../src/services/digitisingObjectPlan').propose(png,config,{strokePlan});
      const compiled=require('../src/services/digitisingCompiler').compile(proposal.project),bytes=Buffer.from(compiled.dst,'base64');
      const folder=path.join(output,e.id);await fs.mkdir(folder);
      const candidate=path.join(folder,'candidate.dst');await fs.writeFile(candidate,bytes);
      result.candidateSha256=hash(bytes);result.stats=compiled.stats;
      // Evaluation inputs are opened only after source-only generation completes.
      const baseline=await fs.readFile(resolve(e.baseline));result.baselineSha256=hash(baseline);
      if(result.baselineSha256!==design.baselineSha256)throw Error('Accepted baseline hash changed. Review acceptance explicitly before replacing it.');
      result.identical=bytes.equals(baseline);
      if(e.reference){
        result.referenceSha256=hash(await fs.readFile(resolve(e.reference)));
        if(result.referenceSha256!==design.referenceSha256)throw Error('Designer reference hash changed.');
        const scoreFile=path.join(folder,'score.json');
        await run(python,[path.join(__dirname,'evaluate-digitising-quality.py'),candidate,resolve(e.reference),scoreFile]);
        result.score=JSON.parse(await fs.readFile(scoreFile));
      }
      result.passed=assess(design,result.score,result.identical);
    }catch(error){result.error=error.message;}
    await save();console.log(`${e.id}: ${result.passed?'PASS':'FAIL'}${result.score?' '+result.score.minimumScore+'%':''}${result.identical?' (identical)':''}`);
  }
  report.passed=report.results.every(r=>r.passed);await save();return report;
}
if(require.main===module){
  const [manifest,directory,python]=process.argv.slice(2);
  if(!manifest||!directory){console.error('Usage: node scripts/check-digitising-accepted.js private-manifest.json fresh-output-directory [python]');process.exitCode=1;}
  else check(manifest,directory,python).then(r=>{if(!r.passed)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={validateManifest,assess,check};
