// Private manifests/artwork stay outside Git. References are evaluation-only.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
require('dotenv').config({quiet:true});
const {plan}=require('../src/services/digitisingAuto');
const {propose}=require('../src/services/digitisingObjectPlan');
const {compile,preview}=require('../src/services/digitisingCompiler');
const run=promisify(execFile),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function batch(manifest,directory,{interpret=false,split='calibration',python='python3'}={}){
  const entries=JSON.parse(await fs.readFile(manifest,'utf8'));
  if(!Array.isArray(entries)||!entries.length)throw Error('Manifest must contain entries.');
  const names=new Set(),families=new Map();
  for(const e of entries){
    if(!e||!/^[-a-z0-9]+$/.test(e.id)||names.has(e.id))throw Error('Use unique lowercase ids.');names.add(e.id);
    if(!['calibration','holdout','diagnostic'].includes(e.split))throw Error('Each entry needs a calibration, holdout or diagnostic split.');
    if(!e.source||!e.reference||!e.settings||Object.keys(e.settings).some(k=>!['garment','widthMm','heightMm','border','outlineColour'].includes(k)))throw Error('Source, reference and customer settings are required.');
    if(!e.family)throw Error('Each entry needs a design family to prevent duplicate-design leakage.');
    if(families.has(e.family)&&families.get(e.family)!==e.split)throw Error('A design family cannot cross dataset splits.');families.set(e.family,e.split);
  }
  if(!['calibration','holdout','diagnostic'].includes(split))throw Error('Choose one dataset split.');
  for(const e of entries){
    const target=path.resolve(directory,e.id)+path.sep;
    if(entries.some(r=>[r.source,r.reference].some(p=>path.resolve(p).startsWith(target))))throw Error('Output directory would overwrite source/reference inputs.');
  }
  if(!entries.some(e=>e.split===split))throw Error('No entries in the selected split.');
  await fs.mkdir(path.dirname(path.resolve(directory)),{recursive:true});
  // Fresh run folders prevent old DSTs/scores surviving a failed rerun.
  await fs.mkdir(directory);
  const report={startedAt:new Date().toISOString(),interpret,split,referenceUsedForGeneration:false,manifestSha256:hash(await fs.readFile(manifest)),results:[]};
  const services=path.join(__dirname,'../src/services');
  const engineFiles=(await fs.readdir(services)).filter(n=>/^digitising.*\.js$/.test(n)).sort();
  report.engineSha256=hash(Buffer.concat(await Promise.all(engineFiles.map(async name=>Buffer.concat([Buffer.from(name+'\n'),await fs.readFile(path.join(services,name))])))));
  report.evaluatorSha256=hash(await fs.readFile(path.join(__dirname,'evaluate-digitising-quality.py')));
  try{report.gitRevision=(await run('git',['rev-parse','HEAD'])).stdout.trim();}catch{}
  const save=()=>fs.writeFile(path.join(directory,'batch.json'),JSON.stringify(report,null,2));
  for(const e of entries.filter(e=>e.split===split)){
    const folder=path.join(directory,e.id);await fs.mkdir(folder,{recursive:true});
    const result={id:e.id,family:e.family,split:e.split,status:'running',settings:e.settings};report.results.push(result);await save();
    try{
      const artwork=await fs.readFile(e.source);result.sourceSha256=hash(artwork);
      const options={interpret,cacheDirectory:path.join(path.dirname(path.resolve(manifest)),'interpretations')};
      const planned=await plan(artwork,e.settings,options),proposal=await propose(planned.png,planned.config,options);
      await fs.writeFile(path.join(folder,'proposal.json'),JSON.stringify(proposal,null,2));
      const candidate=compile(proposal.project),bytes=Buffer.from(candidate.dst,'base64');
      await fs.writeFile(path.join(folder,'candidate.dst'),bytes);
      await fs.writeFile(path.join(folder,'compile.json'),JSON.stringify({...candidate,dst:undefined},null,2));
      await fs.writeFile(path.join(folder,'preview.svg'),preview(candidate));
      result.candidateSha256=hash(bytes);result.reviewRequired=proposal.reviewRequired;result.warnings=[...proposal.warnings,...candidate.warnings];
      // Only now open a production reference. Nothing derived from it enters plan/propose/compile.
      result.referenceSha256=hash(await fs.readFile(e.reference));
      await run(python,[path.join(__dirname,'evaluate-digitising-quality.py'),path.join(folder,'candidate.dst'),e.reference,path.join(folder,'score.json')],{maxBuffer:1024*1024});
      result.score=JSON.parse(await fs.readFile(path.join(folder,'score.json'),'utf8'));
      result.status=result.score.passed?'passed90':'below90';
      result.passed95=result.score.minimumScore>=95&&Object.values(result.score.gates).every(Boolean);
    }catch(error){result.status='error';result.error=error.message;await fs.writeFile(path.join(folder,'error.txt'),error.stack||error.message);}
    await save();console.log(`${e.id}: ${result.status}${result.score?' ('+result.score.minimumScore+'%)':''}`);
  }
  report.finishedAt=new Date().toISOString();report.counts={total:report.results.length,generated:report.results.filter(r=>r.candidateSha256).length,passed90:report.results.filter(r=>r.status==='passed90').length,passed95:report.results.filter(r=>r.passed95).length,errors:report.results.filter(r=>r.status==='error').length};await save();return report;
}
if(require.main===module){
  const [manifest,directory,...flags]=process.argv.slice(2);
  if(!directory||flags.some(f=>f!=='--interpret'&&!/^--split=(calibration|holdout|diagnostic)$/.test(f)&&!f.startsWith('--python='))){console.error('Usage: node scripts/benchmark-digitising-batch.js manifest.json output-dir [--interpret] [--split=calibration|holdout|diagnostic] [--python=/path/to/python]');process.exitCode=1;}
  else batch(manifest,directory,{interpret:flags.includes('--interpret'),split:flags.find(f=>f.startsWith('--split='))?.slice(8)||'calibration',python:flags.find(f=>f.startsWith('--python='))?.slice(9)||'python3'}).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
module.exports={batch};
