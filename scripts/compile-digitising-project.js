const fs=require('node:fs/promises'),path=require('node:path');
const {compile,preview}=require('../src/services/digitisingCompiler');
(async()=>{
  const [source,directory]=process.argv.slice(2);if(!directory)throw Error('Usage: node scripts/compile-digitising-project.js project.json output-directory');
  const result=compile(JSON.parse(await fs.readFile(source,'utf8')));
  await fs.mkdir(directory,{recursive:true});
  await Promise.all([
    fs.writeFile(path.join(directory,'candidate.dst'),Buffer.from(result.dst,'base64')),
    fs.writeFile(path.join(directory,'project.json'),JSON.stringify(result.project,null,2)),
    fs.writeFile(path.join(directory,'preview.svg'),preview(result)),
    fs.writeFile(path.join(directory,'compile.json'),JSON.stringify({...result,dst:undefined,project:undefined},null,2))
  ]);
  console.log(JSON.stringify({directory:path.resolve(directory),stats:result.stats,warnings:result.warnings}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
