const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {prepare,settings}=require('../src/services/digitisingStudio');
const {recover}=require('../src/services/digitisingRoundedColumns');
const {compile}=require('../src/services/digitisingCompiler');
async function source(art,widthMm=100){
  const png=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 100 100">${art}</svg>`)).png().toBuffer();
  const config={...settings({widthMm:100,hoopMm:200,colours:1,spacing:.4,length:3}),widthMm,sourceAspect:1,preserveWhiteArtwork:true};
  const p=await prepare(png,config);const el=p.elements.slice().sort((a,b)=>b.pixels-a.pixels)[0];
  const project={version:1,units:'mm',garment:'tshirt',widthMm,heightMm:widthMm,objects:[]};
  return {p,el,project,objects:(overrides={})=>recover(p.ids,p.info.width,el,p.scale,{id:'synthetic',colour:'#000000',...overrides},project)};
}
test('rounded islands recover source-fitted split satin without widening the limits',async()=>{
  for(const angle of [0,27,113]){
    const f=await source(`<ellipse cx="50" cy="50" rx="5" ry="10" transform="rotate(${angle} 50 50)"/>`);
    const objects=f.objects();assert.ok(objects?.length);assert.ok(objects.every(o=>o.type==='satin'));assert.ok(objects.some(o=>o.splitSatin));
    const c=compile({...f.project,objects});assert.ok(c.stats.stitches>80);assert.equal(c.stats.colourChanges,0);
  }
  const wide=await source('<ellipse cx="50" cy="50" rx="10" ry="20"/>');assert.equal(wide.objects(),null);
  const tiny=await source('<ellipse cx="50" cy="50" rx="1" ry="2"/>');assert.equal(tiny.objects(),null);
});
test('closed curves retain counters and sew attached branches before the ring',async()=>{
  for(const angle of [0,37]){
    const f=await source(`<g transform="rotate(${angle} 50 50)"><ellipse cx="50" cy="45" rx="27" ry="23" fill="none" stroke="black" stroke-width="4"/><path d="M43 67V81H47V67Z"/></g>`);
    const objects=f.objects();assert.ok(objects?.some(o=>o.closed));assert.ok(objects.length>1);assert.equal(objects.at(-1).closed,true);
    const c=compile({...f.project,objects});assert.ok(c.stats.stitches>400);
    const {parseDst}=await import('../public/embroidery-viewer.mjs');const d=parseDst(Buffer.from(c.dst,'base64'));
    // The central disk is empty at every tested rotation, including travel.
    for(const [x,y,a,b]of d.segments)assert.ok(Math.hypot((x+a)/20,(y+b)/20)>12);
  }
});
test('open curved bands with flared caps recover smooth crosswise satin',async()=>{
  const f=await source('<path d="M25 40A25 25 0 0 0 75 40" fill="none" stroke="black" stroke-width="4"/><ellipse cx="25" cy="40" rx="4" ry="2.5"/><ellipse cx="75" cy="40" rx="4" ry="2.5"/>');
  const objects=f.objects();assert.ok(objects?.some(o=>o.id.endsWith('-arc')));assert.ok(objects.every(o=>o.type==='satin'));
  const c=compile({...f.project,objects});assert.ok(c.stats.stitches>300);assert.ok(c.stats.shortStitches/c.stats.stitches<.05);
});

test('rounded density calibration respects explicit object settings and other fabrics',async()=>{
  const f=await source('<ellipse cx="50" cy="50" rx="3" ry="10"/>');
  const normal=compile({...f.project,objects:f.objects()});
  assert.equal(normal.project.objects[0].settings.satinSpacing,.31);
  const custom=compile({...f.project,objects:f.objects({settings:{satinSpacing:.4}})});
  assert.equal(custom.project.objects[0].settings.satinSpacing,.4);
  assert.ok(custom.stats.stitches<normal.stats.stitches);
  f.project.garment='hoodie';
  assert.equal(compile({...f.project,objects:f.objects()}).project.objects[0].settings.satinSpacing,.3);
});
