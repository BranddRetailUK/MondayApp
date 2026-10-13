const {test}=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/digitising/object-tools.json');
const {validate,edit,resize,segmentInside}=require('../src/services/digitisingProject');
const {compile}=require('../src/services/digitisingCompiler');
const only=objects=>({...structuredClone(fixture),objects:structuredClone(objects)});
const segments=result=>{let last=[result.project.widthMm/2,result.project.heightMm/2];return result.commands.flatMap(c=>{if(c.kind==='colour')return [];const p=[c.x/10+result.project.widthMm/2,c.y/10+result.project.heightMm/2],s={...c,a:last,b:p};last=p;return [s];});};
test('physical L tools make perpendicular stitches on both arms without an API',()=>{
  const fetch=global.fetch;global.fetch=()=>{throw Error('Compiler must stay local');};
  try{
    const project=only(fixture.objects.slice(0,2)),result=compile(project);
    assert.equal(result.dst,compile(project).dst);
    for(const [id,axis]of [['l-stem',1],['l-foot',0]]){
      const top=segments(result).filter(s=>s.objectId===id&&s.phase==='satin'&&s.kind==='stitch').slice(1);
      assert.ok(top.length>50);
      assert.ok(top.every(s=>Math.abs(s.b[axis]-s.a[axis])<.3));
      assert.ok(top.every(s=>Math.abs(s.b[1-axis]-s.a[1-axis])>5.8));
    }
  }finally{global.fetch=fetch;}
});
test('curve and counter routes stay inside geometry and do not trim each fill row',()=>{
  const result=compile(fixture),objects=new Map(result.project.objects.map(o=>[o.id,o]));
  for(const s of segments(result).filter(s=>s.kind==='stitch'&&s.phase!=='lock')){
    const o=objects.get(s.objectId);if(o.type==='run')continue;
    assert.ok(segmentInside(s.a,s.b,o,o.settings.pullCompensation+.08),`${o.id} ${s.phase}`);
  }
  assert.ok(result.stats.trims<=7);assert.ok(result.stats.shortStitches<60);
});
test('analytic clipping detects a narrow counter between widely spaced endpoints',()=>{
  const object={type:'fill',outline:[[0,0],[20,0],[20,20],[0,20]],holes:[[[9.9,5],[10.1,5],[10.1,15],[9.9,15]]]};
  assert.equal(segmentInside([1,10],[19,10],object),false);
  assert.equal(segmentInside([1,2],[19,2],object),true);
});
test('closed curved satin keeps its counter, including after splitting for editing',()=>{
  const rungs=Array.from({length:37},(_,i)=>[8,12].map(r=>[30+r*Math.cos(i*Math.PI/18),30+r*Math.sin(i*Math.PI/18)]));
  const project=only([{id:'loop',type:'satin',colour:'#ffffff',rungs,closed:true}]);
  const result=compile(project);
  for(const s of segments(result).filter(c=>c.kind==='stitch'))assert.ok(segmentInside(s.a,s.b,result.project.objects[0],.2));
  const split=edit(project,'loop','split-satin',18);assert.equal(split.objects.length,2);assert.ok(split.objects.every(o=>!o.closed));assert.ok(compile(split).stats.stitches>100);
});
test('editing is immutable and changes sequence, direction, and physical density',()=>{
  const p=only(fixture.objects.slice(0,2)),before=JSON.stringify(p);
  assert.equal(edit(p,'l-stem','move',1).objects[1].id,'l-stem');
  const reversed=edit(p,'l-stem','reverse');assert.equal(reversed.objects[0].entry,'end');
  assert.notEqual(compile(p).dst,compile(reversed).dst);
  const dense=edit(p,'l-stem','settings',{satinSpacing:.2});assert.ok(compile(dense).stats.stitches>compile(p).stats.stitches);
  assert.equal(JSON.stringify(p),before);
});
test('fill angle edits and proportional project resizing regenerate physical stitches',()=>{
  const p=only([fixture.objects.find(o=>o.type==='fill')]),scaled=resize(p,150);
  assert.equal(scaled.heightMm/p.heightMm,1.5);assert.equal(scaled.objects[0].settings.fillSpacing,validate(p).objects[0].settings.fillSpacing);
  assert.ok(compile(scaled).stats.stitches>compile(p).stats.stitches);
  const horizontal=edit(p,p.objects[0].id,'geometry',{angle:0});
  const fill=segments(compile(horizontal)).filter(s=>s.phase==='fill'&&s.kind==='stitch'&&Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>2);
  assert.ok(fill.filter(s=>Math.abs(s.b[1]-s.a[1])<.25).length>fill.length*.9);
  assert.throws(()=>resize(only([fixture.objects[0]]),200),/satin width/);
});
test('unsafe, malformed, or too-small geometry fails with no machine output',()=>{
  const p=only([fixture.objects[0]]);
  for(const mutate of [p=>p.objects[0].rungs[0][0][0]=-1,p=>p.objects[0].rungs[0][1][0]=30,p=>p.objects.push(p.objects[0]),p=>p.objects[0].settings={satinSpacing:.01},p=>p.widthMm=301]){
    const bad=structuredClone(p);mutate(bad);assert.throws(()=>compile(bad),/Embroidery project/);
  }
  assert.throws(()=>validate(only([{id:'bad',colour:'#ffffff',type:'fill',angle:0,outline:[[0,0],[20,20],[0,20],[20,0]],holes:[]}])));
  assert.throws(()=>compile(only([{id:'tiny',colour:'#ffffff',type:'fill',angle:0,outline:[[1,1],[1.4,1],[1.4,1.1],[1,1.1]],holes:[],settings:{underlay:'none'}}])),/no sewable stitches/);
});
test('independent simple uploads use the same source-to-object pipeline at different sizes',async()=>{
  const sharp=require('sharp'),{plan}=require('../src/services/digitisingAuto'),{propose}=require('../src/services/digitisingObjectPlan');
  for(const [width,height]of [[70,40],[40,70]])for(const widthMm of [40,80]){
    const png=await sharp({create:{width,height,channels:4,background:'#0099aa'}}).png().toBuffer();
    const p=await plan(png,{widthMm,garment:'tshirt'}),proposal=await propose(p.png,p.config),result=compile(proposal.project);
    assert.equal(result.project.widthMm,widthMm);assert.ok(Math.abs(result.project.heightMm-widthMm*height/width)<.01);assert.ok(result.stats.stitches>100);
  }
});
