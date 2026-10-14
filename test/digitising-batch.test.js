const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const {batch}=require('../scripts/benchmark-digitising-batch');
test('batch rejects duplicate design families across calibration and holdout',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'digitising-batch-'));
  try{
    const entry={source:'unused.png',reference:'unused.dst',family:'same-artwork',settings:{widthMm:30}};
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify([{...entry,id:'one',split:'calibration'},{...entry,id:'two',split:'holdout'}]));
    await assert.rejects(batch(path.join(dir,'manifest.json'),path.join(dir,'out')),/cannot cross dataset splits/);
    await assert.rejects(fs.access(path.join(dir,'out')));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('local batch exports before reading references and records failures without dropping entries',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'digitising-batch-')),oldFetch=global.fetch;
  global.fetch=()=>{throw Error('Local benchmark must not send artwork');};
  try{
    const source=path.join(dir,'source.png');await sharp(Buffer.from('<svg width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="red"/></svg>')).png().toFile(source);
    const entry={source,reference:path.join(dir,'missing-reference.dst'),settings:{widthMm:30},split:'calibration'};
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify([{...entry,id:'one',family:'one'},{...entry,id:'two',family:'two',source:path.join(dir,'missing-source.png')}]));
    const report=await batch(path.join(dir,'manifest.json'),path.join(dir,'out'));
    assert.equal(report.results.length,2);assert.equal(report.counts.errors,2);assert.equal(report.counts.generated,1);
    assert.match(report.results[0].error,/missing-reference/);assert.ok(report.results[0].candidateSha256);
    assert.equal((await fs.readFile(path.join(dir,'out/one/candidate.dst'))).subarray(0,3).toString(),'LA:');
    assert.equal(report.results[1].candidateSha256,undefined);
    assert.equal(report.interpret,false);assert.equal(report.referenceUsedForGeneration,false);
  }finally{global.fetch=oldFetch;await fs.rm(dir,{recursive:true,force:true});}
});
test('batch refuses output directories containing a source or production reference',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'digitising-batch-'));
  try{
    const entry={id:'one',family:'one',split:'calibration',source:'unused.png',reference:path.join(dir,'out/one/candidate.dst'),settings:{widthMm:30}};
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify([entry]));
    await assert.rejects(batch(path.join(dir,'manifest.json'),path.join(dir,'out')),/overwrite source\/reference/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('batch refuses reusing a run directory so stale candidates cannot appear current',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'digitising-batch-'));
  try{
    await fs.mkdir(path.join(dir,'out'));await fs.writeFile(path.join(dir,'out/stale.txt'),'keep');
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify([{id:'one',family:'one',split:'calibration',source:'unused.png',reference:'unused.dst',settings:{widthMm:30}}]));
    await assert.rejects(batch(path.join(dir,'manifest.json'),path.join(dir,'out')),/EEXIST/);
    assert.equal(await fs.readFile(path.join(dir,'out/stale.txt'),'utf8'),'keep');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
