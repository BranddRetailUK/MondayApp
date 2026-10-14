const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateManifest,assess}=require('../scripts/check-digitising-accepted');
const registry=require('../docs/digitising-studio/accepted-designs.json');
test('accepted suite cannot silently omit, duplicate or replace a design',()=>{
 const entries=registry.designs.map(d=>({id:d.id,png:'source',config:'config',strokePlan:'plan',baseline:'baseline',reference:'reference'}));
 validateManifest(entries);
 assert.throws(()=>validateManifest(entries.slice(1)));
 assert.throws(()=>validateManifest([...entries.slice(1),entries[1]]));
 assert.throws(()=>validateManifest(entries.map(e=>e.id==='smiley'?{...e,reference:null}:e)));
});
test('90 percent floor does not permit regression below an accepted baseline',()=>{
 const score={method:'physical-field-v1',minimumScore:90.922,gates:{colourSequence:true,size:true,shortStitches:true}};
 const smiley=registry.designs.find(d=>d.id==='smiley');
 assert.equal(assess(smiley,score,false),true);
 assert.equal(assess(smiley,{...score,minimumScore:90.5},false),false);
 assert.equal(assess({minimumScore:89},{...score,minimumScore:89.999},false),false);
 assert.equal(assess(smiley,{...score,gates:{...score.gates,shortStitches:false}},false),false);
 assert.equal(assess(smiley,{...score,method:'changed-metric'},true),false);
 assert.equal(assess({minimumScore:null},null,false),false);
 assert.equal(assess({minimumScore:null},null,true),true);
});
