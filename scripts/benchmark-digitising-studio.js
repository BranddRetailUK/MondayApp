// Local, private benchmark: source artwork + settings generate the candidate.
// Reference stitches are used only after generation, never as generator input.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const engine=require('../src/services/digitisingStudio');
(async()=>{
  const [source,setup,reference,directory]=process.argv.slice(2);
  if(!directory)throw Error('Usage: node scripts/benchmark-digitising-studio.js source.png setup.json reference.dst output-directory');
  const [artwork,settingsFile,proven]=await Promise.all([fs.readFile(source),fs.readFile(setup,'utf8'),fs.readFile(reference)]);
  const saved=JSON.parse(settingsFile),raw=saved.config||saved;
  const config=engine.settings({...raw,elementColours:JSON.stringify(raw.elementColours||{}),elementOptions:JSON.stringify(raw.elementOptions||{}),threadNotes:JSON.stringify(raw.threadNotes||{}),removeWhite:String(raw.removeWhite),border:String(raw.border)});
  const generated=await engine.generate(await engine.artwork(artwork),config);
  const candidate=Buffer.from(generated.dst,'base64');
  const {parseDst}=await import('../public/embroidery-viewer.mjs');
  const actual=parseDst(candidate),expected=parseDst(proven);
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const commandStream=bytes=>{const commands=[];for(let i=512;i+2<bytes.length;i+=3){commands.push(bytes.subarray(i,i+3).toString('hex'));if(bytes[i+2]===243)break;}return commands;};
  const a=commandStream(candidate),b=commandStream(proven);
  const checks={dimensions:actual.widthMm===expected.widthMm&&actual.heightMm===expected.heightMm,colourChanges:actual.colourChanges===expected.colourChanges,stitchPaths:JSON.stringify(actual.segments)===JSON.stringify(expected.segments),commands:JSON.stringify(a)===JSON.stringify(b)};
  const report={passed:Object.values(checks).every(Boolean),checks,sourceSha256:hash(artwork),referenceSha256:hash(proven),candidateSha256:hash(candidate),actual:generated.stats,expected:{widthMm:expected.widthMm,heightMm:expected.heightMm,stitches:expected.stitches,colourChanges:expected.colourChanges},machineSewOut:'not verified'};
  await fs.mkdir(directory,{recursive:true});await Promise.all([fs.writeFile(path.join(directory,'candidate.dst'),candidate),fs.writeFile(path.join(directory,'setup.json'),JSON.stringify({...generated,dst:undefined},null,2)),fs.writeFile(path.join(directory,'benchmark.json'),JSON.stringify(report,null,2))]);
  console.log(JSON.stringify({passed:report.passed,report:path.resolve(directory,'benchmark.json')}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
