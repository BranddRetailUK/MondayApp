const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {fit}=require('../src/services/digitisingSemanticTools');
const {simplifyRungs}=require('../src/services/digitisingObjectPlan');
const {validate,segmentInside,inside}=require('../src/services/digitisingProject');
const {compile}=require('../src/services/digitisingCompiler');
async function shape(markup,rotation=0){
  const {data,info}=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><g transform="rotate(${rotation} 150 150)" fill="white">${markup}</g></svg>`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const ids=new Int16Array(90000).fill(-1);let x=300,y=300,right=0,bottom=0,pixels=0;
  for(let i=0;i<ids.length;i++)if(data[i*4+3]>=128){ids[i]=0;pixels++;x=Math.min(x,i%300);y=Math.min(y,Math.floor(i/300));right=Math.max(right,i%300);bottom=Math.max(bottom,Math.floor(i/300));}
  return {ids,w:info.width,e:{id:0,x,y,width:right-x+1,height:bottom-y+1,pixels,colour:'#ffffff'}};
}
function project(shape,tool,scale=.1){
  const parts=fit(shape.ids,shape.w,shape.e,scale,tool);
  return validate({version:1,units:'mm',garment:'tshirt',widthMm:300*scale,heightMm:300*scale,objects:parts.map((p,i)=>({...p,id:`part-${i}`,colour:'#ffffff',type:'satin',rungs:simplifyRungs(p.rungs)}))});
}
test('source-fitted ribbon turns remain valid at different rotations and physical sizes',async()=>{
  for(const rotation of [-12,0,12])for(const scale of [.07,.1]){
    const s=await shape('<path d="M80 50 H120 V200 H210 V240 H80Z"/>',rotation),p=project(s,'stem-foot',scale),result=compile(p);
    assert.equal(p.objects.length,1);assert.ok(result.stats.stitches>100);assert.ok(result.stats.trims<=2);
    const r=p.objects[0].rungs,angles=r.map(([a,b])=>Math.atan2(b[1]-a[1],b[0]-a[0]));
    assert.ok(Math.max(...angles)-Math.min(...angles)>.7,'turn must spread through the rails');
    for(const row of r)assert.ok(segmentInside(...row,p.objects[0],.08));
    let total=0,covered=0;for(let k=0;k<s.ids.length;k+=13)if(s.ids[k]===0){total++;if(p.objects.some(o=>inside([(k%300+.5)*scale,(Math.floor(k/300)+.5)*scale],o,.12)))covered++;}
    assert.ok(covered/total>.98,'retain the uploaded ribbon silhouette');
  }
});
test('counter tools separate touching loops and preserve both negative spaces',async()=>{
  const s=await shape('<path fill-rule="evenodd" d="M150 150 A55 70 0 1 1 40 150 A55 70 0 1 1 150 150 M125 150 A30 45 0 1 0 65 150 A30 45 0 1 0 125 150 M260 150 A55 70 0 1 1 150 150 A55 70 0 1 1 260 150 M235 150 A30 45 0 1 0 175 150 A30 45 0 1 0 235 150"/>');
  const p=project(s,'closed-columns');assert.equal(p.objects.length,2);assert.ok(p.objects.every(o=>o.closed));
  const result=compile(p);assert.ok(result.stats.stitches>150);
  for(const o of p.objects)for(const r of o.rungs)assert.ok(segmentInside(...r,o,.08));
});
test('three-arm tool makes curved outer corners and a crosswise middle arm',async()=>{
  const s=await shape('<path d="M75 50 H215 V85 H115 V125 H200 V160 H115 V215 H215 V250 H75Z"/>');
  const p=project(s,'stem-three-arms'),r=compile(p);assert.equal(p.objects.length,3);assert.ok(r.stats.stitches>200);
  assert.ok(p.objects[1].rungs.every(([a,b])=>Math.abs(a[0]-b[0])<.01));
});
test('tool planner rejects invented regions, raw geometry and fill for measured narrow strokes',()=>{
  const {validate}=require('../src/services/digitisingStrokePlanner'),regions=[{id:7,satinSuitable:true}];
  assert.deepEqual(validate({regions:[{id:7,tool:'stem-foot'}]},regions),{regions:[{id:7,tool:'stem-foot'}]});
  for(const r of [{id:8,tool:'stem-foot'},{id:7,tool:'fill'},{id:7,tool:'stem-foot',points:[[1,2]]}])assert.throws(()=>validate({regions:[r]},regions));
});
test('AI tool request contains labelled source crops, excludes references and is reusable from cache',async()=>{
  const {planStrokes}=require('../src/services/digitisingStrokePlanner'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const s=await shape('<path d="M80 50 H120 V200 H210 V240 H80Z"/>'),data=Buffer.alloc(300*300*4);
  for(let i=0;i<s.ids.length;i++)if(s.ids[i]>=0)data.fill(255,i*4,i*4+4);
  const png=await sharp(data,{raw:{width:300,height:300,channels:4}}).png().toBuffer(),prepared={ids:s.ids,elements:[s.e],info:{width:300,height:300},scale:.1};
  const cacheDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'stroke-planner-')),old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';let calls=0;
  try{
    const options={cacheDirectory,reference:'DO_NOT_SEND_REFERENCE',fetchImpl:async(url,request)=>{
      calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.body);assert.equal(body.store,false);assert.ok(!request.body.includes('DO_NOT_SEND_REFERENCE'));
      assert.equal(body.input[0].content.filter(c=>c.type==='input_image').length,2);
      return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({regions:[{id:0,tool:'stem-foot'}]})}]}]})};
    }};
    const result=await planStrokes(png,prepared,options);assert.equal(result.regions[0].tool,'stem-foot');assert.deepEqual(await planStrokes(png,prepared,options),result);assert.equal(calls,1);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;await fs.rm(cacheDirectory,{recursive:true,force:true});}
});
test('shared source travel connects sibling columns without crossing a counter',()=>{
  const p={version:1,units:'mm',garment:'tshirt',widthMm:40,heightMm:30,travelRegions:[{id:'ribbon',outline:[[5,5],[9,5],[9,20],[20,20],[20,24],[5,24]],holes:[]}],objects:[
    {id:'stem',regionId:'ribbon',type:'satin',colour:'#ffffff',rungs:[[[5,5],[9,5]],[[5,20],[9,20]]]},
    {id:'foot',regionId:'ribbon',type:'satin',colour:'#ffffff',rungs:[[[9,20],[9,24]],[[20,20],[20,24]]]}
  ]};
  const result=compile(p);assert.equal(result.stats.trims,1);assert.ok(result.commands.some(c=>c.phase==='connection'));
  const bad=structuredClone(p);bad.travelRegions[0].holes=[[[1,1],[2,1],[2,2],[1,2]]];assert.throws(()=>compile(bad),/hole must/);
});
