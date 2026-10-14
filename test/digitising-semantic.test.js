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
test('large italic ribbon fallback and diagonal stems remain source-fitted at multiple rotations',async()=>{
 for(const rotation of [-9,0,9])for(const [markup,tool]of [
  ['<path d="M90 30H130L98 220H235L228 260H48Z"/>','stem-foot'],
  ['<path d="M65 40H105L170 180L195 40H235L195 260H155L90 120L65 260H25Z"/>','stems-diagonal']
 ]){
  const source=await shape(markup,rotation),parts=fit(source.ids,source.w,source.e,.18,tool);
  const p={version:1,units:'mm',garment:'tshirt',widthMm:54,heightMm:54,objects:parts.map((o,i)=>({...o,id:`part-${i}`,colour:'#ffffff',type:'satin',splitSatin:o.rungs.some(r=>Math.hypot(r[1][0]-r[0][0],r[1][1]-r[0][1])>9),rungs:simplifyRungs(o.rungs)}))};
  const result=compile(p);assert.ok(result.stats.stitches>200);assert.ok(result.stats.shortStitches/result.stats.stitches<.05);
  let total=0,covered=0;for(let k=0;k<source.ids.length;k+=11)if(source.ids[k]===0){total++;if(p.objects.some(o=>inside([(k%300+.5)*.18,(Math.floor(k/300)+.5)*.18],o,.3)))covered++;}
  assert.ok(covered/total>.97,`retain source silhouette: ${covered/total}`);
  let last={x:0,y:0};for(const c of result.commands){if(c.kind==='colour')continue;if(c.kind==='stitch')assert.ok(Math.hypot(c.x-last.x,c.y-last.y)<=97);last=c;}
 }
});
test('finished panels derive rotated edges from source and keep broad ground continuous',async()=>{
 const {measure,construct}=require('../src/services/digitisingPanel');
 for(const rotation of [-12,0,12])for(const scale of [.1,.15]){
  const s=await shape('<path fill-rule="evenodd" d="M25 70H275V230H25Z M60 110V190H100V110Z M180 110V190H220V110Z"/>',rotation);
  const prepared={ids:s.ids,info:{width:300},scale,elements:[s.e,{id:1,x:65,y:135,width:20,height:20,colour:'#ff0000'},{id:2,x:185,y:135,width:20,height:20,colour:'#ff0000'}]};
  const panel=measure(prepared,s.e);assert.ok(panel);
  const objects=construct(panel,{id:'ground',colour:'#0044aa'}),result=compile({version:1,units:'mm',garment:'tshirt',widthMm:300*scale,heightMm:300*scale,objects});
  assert.equal(objects[0].holes.length,0);assert.equal(objects[1].closed,true);assert.equal(result.threads.length,1);
  assert.ok(result.commands.some(c=>c.objectId==='ground-edge'&&c.phase==='satin'));
  assert.equal(measure({...prepared,elements:[s.e]},s.e),null,'standalone counter is not silently filled');
 }
});
test('broad open curves use measured end caps without ragged skeleton tips',async()=>{
 for(const rotation of [-8,8]){
  const s=await shape('<path d="M220.71 79.29 A100 100 0 1 0 250 150 H160 V180 H213.25 A70 70 0 1 1 199.5 100.5Z"/>',rotation);
  const parts=fit(s.ids,s.w,s.e,.2,'open-curve-bars');assert.ok(parts?.length,'exercise explicit cap fallback');
  const p={version:1,units:'mm',garment:'tshirt',widthMm:60,heightMm:60,objects:parts.map((o,i)=>({...o,id:`curve-${i}`,type:'satin',colour:'#ffffff',splitSatin:true,rungs:simplifyRungs(o.rungs)}))};
  const result=compile(p);assert.equal(parts.length,1);assert.ok(result.stats.shortStitches/result.stats.stitches<.03);
  const o=result.project.objects[0];let total=0,covered=0;
  for(let k=0;k<s.ids.length;k+=7)if(s.ids[k]===0){total++;if(inside([(k%300+.5)*.2,(Math.floor(k/300)+.5)*.2],o,.2))covered++;}
  assert.ok(covered/total>.97,`source coverage ${covered/total}`);
 }
});
test('source-specific tool schema prevents impossible counter and panel choices',()=>{
  const {sourceSchema,validate}=require('../src/services/digitisingStrokePlanner');
  const regions=[{id:4,counterCount:0,satinSuitable:true,panelSuitable:false},{id:8,counterCount:2,satinSuitable:false,panelSuitable:false},{id:12,counterCount:1,satinSuitable:false,panelSuitable:true}];
  const alternatives=sourceSchema(regions).properties.regions.items.anyOf;
  assert.deepEqual(alternatives.map(a=>a.properties.id.enum),[[4],[8],[12]]);
  for(const [i,region]of regions.entries()){
    const allowed=alternatives[i].properties.tool.enum;
    for(const tool of allowed)assert.doesNotThrow(()=>validate({regions:[{id:region.id,tool}]},[region]));
    assert.ok(allowed.includes('auto-column'));
  }
  assert.ok(!alternatives[0].properties.tool.enum.includes('legs-crossbar'));
  assert.ok(!alternatives[0].properties.tool.enum.includes('fill'));
  assert.ok(!alternatives[1].properties.tool.enum.includes('stem-bowl'));
  assert.ok(alternatives[1].properties.tool.enum.includes('closed-columns'));
  assert.ok(alternatives[2].properties.tool.enum.includes('finished-panel'));
});
test('invalid optional shared boundaries retain valid satin with jumps, never unsafe hidden sewing',()=>{
  const {attachSharedTravel}=require('../src/services/digitisingObjectPlan');
  const project={version:1,units:'mm',garment:'tshirt',widthMm:40,heightMm:30,objects:[],travelRegions:[]};
  const parts=[{id:'a',type:'satin',colour:'#ffffff',rungs:[[[2,2],[6,2]],[[2,12],[6,12]]]},{id:'b',type:'satin',colour:'#ffffff',rungs:[[[20,2],[24,2]],[[20,12],[24,12]]]}];
  const warnings=[];attachSharedTravel(project,parts,{id:'pinch',outline:[[0,0],[30,25],[0,25],[30,0]],holes:[]},warnings);
  assert.equal(project.travelRegions.length,0);assert.ok(parts.every(p=>!p.regionId));assert.equal(warnings.length,1);
  const result=compile({...project,objects:parts});assert.ok(result.stats.trims>=2);
  assert.ok(!result.commands.some(c=>c.phase==='connection'));
  assert.throws(()=>attachSharedTravel(project,[{...parts[0],rungs:[]}],{id:'bad',outline:[],holes:[]},[]),/satin/);
});
test('unfittable named construction retries validated source geometry with an explicit review flag',async()=>{
  const {plan}=require('../src/services/digitisingAuto'),{propose}=require('../src/services/digitisingObjectPlan');
  const png=await sharp(Buffer.from('<svg width="100" height="200"><rect x="40" y="10" width="20" height="180" fill="red"/></svg>')).png().toBuffer();
  const planned=await plan(png,{widthMm:20});
  const result=await propose(planned.png,planned.config,{strokePlan:{regions:[{id:0,tool:'stems-diagonal'}]}});
  assert.equal(result.reviewRequired,true);assert.ok(result.warnings.some(w=>w.includes('does not fit source geometry')));
  assert.ok(result.project.objects.every(o=>o.type==='satin'));assert.ok(compile(result.project).stats.stitches>100);
});
test('large source schemas group equivalent tool constraints',()=>{
  const {sourceSchema}=require('../src/services/digitisingStrokePlanner');
  const regions=Array.from({length:128},(_,id)=>({id,counterCount:0,satinSuitable:true,panelSuitable:false}));
  const groups=sourceSchema(regions).properties.regions.items.anyOf;
  assert.equal(groups.length,1);assert.equal(groups[0].properties.id.enum.length,128);
});
test('continuous same-colour joins tie off at cuts rather than every column',()=>{
  const p={version:1,units:'mm',garment:'tshirt',widthMm:40,heightMm:30,travelRegions:[{id:'joined',outline:[[2,2],[30,2],[30,22],[2,22]],holes:[]}],objects:[
    {id:'a',regionId:'joined',type:'satin',colour:'#ffffff',rungs:[[[4,4],[8,4]],[[4,20],[8,20]]]},
    {id:'b',regionId:'joined',type:'satin',colour:'#ffffff',rungs:[[[12,4],[16,4]],[[12,20],[16,20]]]},
    {id:'c',type:'satin',colour:'#ff0000',rungs:[[[24,4],[28,4]],[[24,20],[28,20]]]}
  ]};
  const result=compile(p),locks=result.commands.filter(c=>c.phase==='lock');
  assert.equal(result.stats.trims,2);assert.equal(locks.length,4);
  assert.ok(!locks.some(c=>c.objectId==='a'),'no unnecessary tie at a sewn continuation');
  for(let i=0;i<result.commands.length;i++)if(result.commands[i].phase==='trim'&&result.commands[i-1]?.phase!=='trim')assert.equal(result.commands[i-1].phase,'lock','each actual cut remains tied off');
  assert.equal(result.threads.length,2);
});
test('branch ownership preserves all source pixels and leaves counters empty',async()=>{
  const {partition}=require('../src/services/digitisingBranchSections');
  const source=await shape('<path fill-rule="evenodd" d="M30 30H270V270H30Z M90 90H210V210H90Z"/>');
  const paths=[[[[40,40],[70,40]],[[40,260],[70,260]]],[[[230,40],[260,40]],[[230,260],[260,260]]],[[[100,40],[100,70]],[[200,40],[200,70]]]];
  const result=partition(source.ids,source.w,source.e,paths);
  assert.equal(result.elements.reduce((s,e)=>s+e.pixels,0),source.e.pixels);
  for(let i=0;i<source.ids.length;i++)assert.equal(result.ids[i]>=0,source.ids[i]>=0);
  assert.ok(result.elements.every(e=>e.pixels>0&&e.width>0&&e.height>0));
  assert.throws(()=>partition(source.ids,source.w,source.e,[]),/unowned/);
});
test('diagonal contour contacts can be traced as separate simple source boundaries',()=>{
  const {contours}=require('../src/services/digitisingSections');
  const ids=new Int16Array(16).fill(-1);for(const k of [0,1,4,5,10,11,14,15])ids[k]=0;
  const rings=contours(ids,4,{id:0,x:0,y:0,width:4,height:4},true);
  assert.equal(rings.length,2);
  for(const ring of rings){assert.deepEqual(ring[0],ring.at(-1));assert.equal(new Set(ring.slice(0,-1).map(p=>p.join(','))).size,ring.length-1);}
});
test('oversized source-fitted columns become bounded directional fill without widening satin limits',async()=>{
  const {plan}=require('../src/services/digitisingAuto'),{propose}=require('../src/services/digitisingObjectPlan');
  const png=await sharp(Buffer.from('<svg width="100" height="250"><rect width="100" height="250" fill="red"/></svg>')).png().toBuffer();
  const planned=await plan(png,{widthMm:20});
  const result=await propose(planned.png,planned.config,{strokePlan:{regions:[{id:0,tool:'straight-column'}]}});
  assert.ok(result.project.objects.every(o=>o.type==='fill'));
  assert.ok(result.warnings.some(w=>w.includes('exceeds split-satin width')));
  assert.ok(compile(result.project).stats.stitches>100);
  assert.throws(()=>validate({version:1,units:'mm',garment:'tshirt',widthMm:30,heightMm:30,objects:[{id:'too-wide',type:'satin',colour:'#ffffff',splitSatin:true,rungs:[[[2,2],[20,2]],[[2,20],[20,20]]]}]}),/width/);
});
test('measured three-prong forks retain turning shoulders at multiple physical sizes',async()=>{
  const fork=require('../src/services/digitisingFork');
  const left='<path d="M70 60 L85 190 Q85 218 145 230" fill="none" stroke="white" stroke-width="20" stroke-linecap="round"/>';
  const source=await shape('<path d="M150 10L164 80H158V240L150 290L142 240V80H136Z"/>'+left+'<g transform="translate(300 0) scale(-1 1)">'+left+'</g>');
  const measured=fork.measure(source.ids,source.w,source.e);assert.ok(measured);
  assert.equal(measured.parts.reduce((n,p)=>n+p.pixels,0),source.e.pixels);
  for(const scale of [.15]){
    const parts=fork.fit(measured,source.w,scale),p={version:1,units:'mm',garment:'tshirt',widthMm:300*scale,heightMm:300*scale,objects:parts.map((o,i)=>({...o,id:'fork-'+i,type:'satin',colour:'#ffffff',splitSatin:true,rungs:simplifyRungs(o.rungs)}))};
    const result=compile(p);assert.ok(result.stats.stitches>200);assert.ok(result.stats.shortStitches/result.stats.stitches<.05);
    for(const o of [p.objects[0],p.objects.at(-1)]){const angles=o.rungs.map(([a,b])=>Math.atan2(b[1]-a[1],b[0]-a[0]));assert.ok(Math.max(...angles)-Math.min(...angles)>.5,'shoulder direction must turn');}
  }
  const rgba=Buffer.alloc(source.ids.length*4);for(let i=0;i<source.ids.length;i++)if(source.ids[i]>=0)rgba.fill(255,i*4,i*4+4);
  const png=await sharp(rgba,{raw:{width:300,height:300,channels:4}}).png().toBuffer();
  const {plan}=require('../src/services/digitisingAuto'),{propose}=require('../src/services/digitisingObjectPlan');
  for(const widthMm of [60,90]){
    const planned=await plan(png,{widthMm}),proposal=await propose(planned.png,planned.config,{strokePlan:{regions:[{id:0,tool:'auto-column'}]}});
    assert.ok(proposal.project.objects.every(o=>o.id.startsWith('source-0-fork')));
    assert.ok(compile(proposal.project).stats.stitches>200);
  }
  const plain=await shape('<rect x="100" y="10" width="100" height="280"/>');assert.equal(fork.measure(plain.ids,plain.w,plain.e),null);
  const ring=await shape('<path fill-rule="evenodd" d="M70 10H230V290H70Z M110 80H190V220H110Z"/>');assert.equal(fork.measure(ring.ids,ring.w,ring.e),null);
});
test('perforated texture follows its crosswise grain while solid fills keep the configured angle',async()=>{
  const {plan}=require('../src/services/digitisingAuto'),{propose}=require('../src/services/digitisingObjectPlan');
  for(const perforated of [false,true]){
    const holes=perforated?Array.from({length:7},(_,i)=>{const x=75+i*25;return `M${x-4} 150a4 14 0 1 0 8 0a4 14 0 1 0 -8 0Z`;}).join(' '):'';
    const png=await sharp(Buffer.from(`<svg width="300" height="300"><g transform="rotate(12 150 150)"><path fill="red" fill-rule="evenodd" d="M30 150a120 60 0 1 0 240 0a120 60 0 1 0 -240 0Z ${holes}"/></g></svg>`)).png().toBuffer();
    const planned=await plan(png,{widthMm:60}),result=await propose(planned.png,planned.config,{strokePlan:{regions:[{id:0,tool:'fill'}]}});
    assert.equal(result.project.objects.length,1);const o=result.project.objects[0];assert.equal(o.type,'fill');
    if(perforated){assert.equal(o.holes.length,7);assert.ok(Math.abs(o.angle-102)<2);}else assert.equal(o.angle,35);
    assert.ok(compile(result.project).stats.stitches>100);
  }
});
test('barbed forks keep blade directions distinct from stems and shoulders',async()=>{
  const fork=require('../src/services/digitisingFork');
  const left='<path d="M50 40L110 95L75 105Z"/><path d="M85 105L85 190Q85 218 145 230" fill="none" stroke="white" stroke-width="20"/>';
  const source=await shape('<path d="M150 10L164 80H158V240L150 290L142 240V80H136Z"/>'+left+'<g transform="translate(300 0) scale(-1 1)">'+left+'</g>');
  const measured=fork.measure(source.ids,source.w,source.e);assert.ok(measured);
  for(const scale of [.15]){
    const variants=fork.constructions(measured,source.w,scale,'tshirt');assert.equal(variants.length,2,'retain a basic fallback alongside detailed head construction');
    const v=variants[0],objects=v.parts.map((p,i)=>({id:'fork-'+i,type:'satin',colour:'#ffffff',splitSatin:true,rungs:simplifyRungs(p.rungs),...(v.compact?{settings:{satinSpacing:.24,pullCompensation:.3}}:{})}));
    for(const [i,path]of v.paths.entries())objects.push({id:'tip-'+i,type:'run',colour:'#ffffff',passes:3,path});
    assert.ok(v.parts.length>=5);assert.ok(v.paths.length>=2);
    const result=compile({version:1,units:'mm',garment:'tshirt',widthMm:300*scale,heightMm:300*scale,objects});
    assert.ok(result.stats.stitches>200);assert.ok(result.stats.shortStitches/result.stats.stitches<.05);
    const blade=v.parts.find(p=>p.role==='blade').rungs,body=v.parts.find(p=>p.role==='shoulder').rungs;
    const angle=([a,b])=>Math.atan2(b[1]-a[1],b[0]-a[0]);
    const difference=Math.max(...body.map(row=>Math.abs(Math.sin(angle(blade[Math.floor(blade.length/2)])-angle(row)))));
    assert.ok(difference>.15,'a head seam must not flatten the whole prong to one angle');
  }
});

test('optical panel centring is bounded, reviewable and preserves the input project',()=>{
  const {opticalProposal}=require('../src/services/digitisingPanel');
  const ids=new Int16Array(300*300).fill(0);
  for(let y=110;y<190;y++)for(let x=40;x<260;x++)if(x<65||x>=236)ids[y*300+x]=x<65?1:2;
  const prepared={ids,info:{width:300},scale:40/300,elements:[{id:0,colour:'#ff0000'},{id:1,colour:'#ffffff'},{id:2,colour:'#ffffff'}]};
  const panel={points:[[10,70],[290,70],[290,230],[10,230]].map(p=>p.map(v=>v*prepared.scale)),enclosed:[1,2]};
  const objects=[1,2].map((id)=>({id:'letter'+id,type:'satin',colour:'#ffffff',rungs:[[[id===1?6:32,15],[id===1?8:34,15]],[[id===1?6:32,24],[id===1?8:34,24]]]}));
  const project={version:1,units:'mm',garment:'tshirt',widthMm:40,heightMm:40,objects,travelRegions:[]},original=JSON.stringify(project),owners=new Map([['letter1',1],['letter2',2]]);
  const proposed=opticalProposal(prepared,panel,0,project,owners);assert.ok(proposed);assert.ok(proposed.shift[0]>.05&&proposed.shift[0]<.4);assert.ok(Math.abs(proposed.shift[1])<.001);
  assert.equal(JSON.stringify(project),original);assert.equal(proposed.project.objects[0].settings.satinSpacing,.24);assert.ok(compile(proposed.project).stats.stitches>100);
  assert.equal(opticalProposal(prepared,panel,0,{...project,garment:'cap'},owners),null);
  assert.equal(opticalProposal({...prepared,elements:[prepared.elements[0],prepared.elements[1],{id:2,colour:'#000000'}]},panel,0,project,owners),null);
  const offset={...panel,points:panel.points.map(([x,y])=>[x+1,y])};assert.equal(opticalProposal(prepared,offset,0,project,owners),null);
});
