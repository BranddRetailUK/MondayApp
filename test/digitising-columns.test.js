const {test}=require('node:test'),assert=require('node:assert/strict');
const {plan}=require('../src/services/digitisingAuto'),engine=require('../src/services/digitisingStudio');
const {segmentInside}=require('../src/services/digitisingTravel');
const svg=body=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">${body}</svg>`);

test('closed satin loops retain counters at different physical sizes and rotations',async()=>{
  for(const [width,rotation] of [[24,0],[48,37]]){
    const input=svg(`<g transform="rotate(${rotation} 60 60)"><ellipse cx="60" cy="60" rx="35" ry="45" fill="none" stroke="white" stroke-width="4"/></g>`);
    const p=await plan(input,{widthMm:width}),g=await engine.generate(p.png,p.config),mask=await engine.prepare(p.png,p.config);
    assert.equal(p.config.elementOptions[0].type,'satin-branches');
    assert.equal(g.stats.thinColumns,0,'satin must not receive a duplicate thin-feature overlay');
    assert.ok(g.stats.trims<=3,'closed loops should sew continuously');
    const {parseDst}=await import('../public/embroidery-viewer.mjs'),d=parseDst(Buffer.from(g.dst,'base64'));
    for(const [x,y,a,b]of d.segments){
      const point=(x,y)=>[x/(mask.scale*10)+(mask.left+mask.right)/2,y/(mask.scale*10)+(mask.top+mask.bottom)/2];
      assert.ok(segmentInside(mask.sourceIds,mask.info.width,0,point(x,y),point(a,b),mask.scale,.3),'top stitch, underlay or travel crossed the counter');
    }
    assert.ok(d.stitches>100);
  }
});
test('branched strokes work independently of colour and orientation; disconnected pieces stay separate',async()=>{
  for(const [colour,rotation]of [['#ffffff',0],['#123456',65]]){
    const input=svg(`<g transform="rotate(${rotation} 60 60)" fill="none" stroke="${colour}" stroke-width="4"><path d="M35 90V25H75M35 55H70"/><path d="M92 30V85"/></g>`);
    const p=await plan(input,{widthMm:36,garment:'hoodie'}),g=await engine.generate(p.png,p.config);
    assert.ok(Object.values(p.config.elementOptions).every(o=>o.type.startsWith('satin')));
    assert.equal(g.threads.length,1);assert.equal(g.stats.thinColumns,0);assert.ok(g.stats.trims<=6);
    assert.ok(g.stats.stitches>100);
  }
});
test('wide filled shapes retain fill and white transparency remains artwork',async()=>{
  const p=await plan(svg('<rect x="10" y="15" width="100" height="90" fill="white"/>'),{widthMm:60});
  assert.equal(p.config.elementOptions[0].type,'fill');
  const m=await engine.prepare(p.png,p.config);assert.equal(m.elements[0].colour,'#ffffff');
});
test('narrow curved strokes retain both limbs and crosswise top stitches',async()=>{
  const p=await plan(svg('<path d="M20 95C110 105 10 10 100 25" fill="none" stroke="red" stroke-width="3"/>'),{widthMm:36});
  assert.ok(p.config.elementOptions[0].type.startsWith('satin'));
  const g=await engine.generate(p.png,p.config);assert.equal(g.stats.shortRuns,0);assert.equal(g.stats.thinColumns,0);assert.ok(g.stats.trims<5);
});
test('L columns turn their top-stitch rails perpendicular to each arm',()=>{
  const {branchedColumns}=require('../src/services/digitisingColumns');
  const w=120,ids=new Int16Array(w*w).fill(-1);
  for(let y=10;y<92;y++)for(let x=20;x<100;x++)if(x<32||y>=80)ids[y*w+x]=0;
  const paths=branchedColumns(ids,w,{id:0,x:20,y:10,width:80,height:82},.1,.34);
  assert.ok(paths?.length);let verticalStem=0,horizontalArm=0;
  for(const [a,b]of paths.flat()){
    const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);
    if(y<65){assert.ok(dx>dy*5,'vertical stem needs horizontal top stitches');verticalStem++;}
    if(x>48){assert.ok(dy>dx*5,'horizontal arm needs vertical top stitches');horizontalArm++;}
  }
  assert.ok(verticalStem>15&&horizontalArm>15);
});
test('curved script-like loops turn stitch rails with the local tangent',()=>{
  const {branchedColumns}=require('../src/services/digitisingColumns');const w=140,ids=new Int16Array(w*w).fill(-1);
  for(let y=0;y<w;y++)for(let x=0;x<w;x++){const r=Math.hypot(x-70,y-70);if(r>=42&&r<=50)ids[y*w+x]=0;}
  const paths=branchedColumns(ids,w,{id:0,x:20,y:20,width:101,height:101},.1,.34);assert.ok(paths?.length);
  for(const [a,b]of paths.flat()){
    const nx=b[0]-a[0],ny=b[1]-a[1],rx=(a[0]+b[0])/2-70,ry=(a[1]+b[1])/2-70;
    const alignment=Math.abs(nx*rx+ny*ry)/(Math.hypot(nx,ny)*Math.hypot(rx,ry));
    assert.ok(alignment>.94,'top rails should point across the curve, not along it');
  }
});
test('sub-thread closed details fail cleanly without invalid tangent indexes',()=>{
  const {branchedColumns}=require('../src/services/digitisingColumns');const w=30,ids=new Int16Array(w*w).fill(-1);
  for(let y=0;y<w;y++)for(let x=0;x<w;x++){const r=Math.hypot(x-15,y-15);if(r>=6&&r<=8)ids[y*w+x]=0;}
  assert.doesNotThrow(()=>branchedColumns(ids,w,{id:0,x:7,y:7,width:17,height:17},.001,.34));
});

test('thin necks separate broad and satin regions without changing source pixels',async()=>{
  for(const rotation of [0,90]){
    const input=svg(`<g transform="rotate(${rotation} 60 60)" fill="#123456"><rect x="10" y="10" width="45" height="85"/><rect x="80" y="10" width="8" height="85"/><rect x="50" y="52" width="35" height=".5"/></g>`);
    const p=await plan(input,{widthMm:48}),m=await engine.prepare(p.png,p.config);
    assert.ok(m.elements.length>=2);assert.ok(Object.values(p.config.elementOptions).some(o=>o.type==='fill'));assert.ok(Object.values(p.config.elementOptions).some(o=>o.type.startsWith('satin')));
    for(let k=0;k<m.ids.length;k++)assert.equal(m.ids[k]>=0,m.sourceIds[k]>=0,'partition must not erode or add pixels');
  }
});
test('medium-width loops remain satin while enlarged broad strokes become fill',async()=>{
  const input=svg('<ellipse cx="60" cy="60" rx="36" ry="42" fill="none" stroke="red" stroke-width="16"/>');
  const a=await plan(input,{widthMm:60}),b=await plan(input,{widthMm:120});
  assert.equal(a.config.elementOptions[0].type,'satin-branches');assert.equal(b.config.elementOptions[0].type,'fill');
});
test('spatial thread sequencing can return to a colour without artwork-specific labels',async()=>{
  const input=svg('<rect x="15" y="5" width="70" height="6" fill="red"/><rect x="10" y="30" width="90" height="45" fill="blue"/><rect x="15" y="98" width="70" height="6" fill="red"/>');
  const p=await plan(input,{widthMm:48}),g=await engine.generate(p.png,p.config);
  assert.deepEqual(g.threads,['#ff0000','#0000ff','#ff0000']);assert.equal(g.stats.colourChanges,2);
});
test('diagonal fill remains inside counters and connects nearby rows without repeated trims',async()=>{
  const input=svg('<path fill="red" fill-rule="evenodd" d="M10 10H110V110H10Z M40 40H80V80H40Z"/>');
  const p=await plan(input,{widthMm:60}),g=await engine.generate(p.png,p.config),m=await engine.prepare(p.png,p.config);
  assert.ok(g.stats.trims<10);const {parseDst}=await import('../public/embroidery-viewer.mjs'),d=parseDst(Buffer.from(g.dst,'base64'));
  for(const [x,y,a,b]of d.segments){const point=(x,y)=>[x/(m.scale*10)+(m.left+m.right)/2,y/(m.scale*10)+(m.top+m.bottom)/2];assert.ok(segmentInside(m.sourceIds,m.info.width,0,point(x,y),point(a,b),m.scale,.2),'fill or connecting travel crossed a counter');}
});
test('segmentation invalidates original geometry and retains exclusions',()=>{
  const {separate}=require('../src/services/digitisingSegmentation'),{skeleton}=require('../src/services/digitisingColumns');
  const w=90,ids=new Int16Array(w*50).fill(-1);
  for(let y=5;y<45;y++)for(let x=5;x<85;x++)if(x<30||x>59||y===25)ids[y*w+x]=0;
  const element={id:0,colour:'#ff0000',x:5,y:5,width:80,height:40,pixels:ids.filter(v=>v===0).length},els=[{...element}];
  const before=skeleton(ids,w,element);separate(ids,els,w,.1);
  assert.equal(els.length,2);const after=skeleton(ids,w,els[0]);assert.notEqual(after,before);
  assert.ok(after.W<before.W);assert.equal(els.reduce((sum,e)=>sum+e.pixels,0),element.pixels);
  const excluded=new Int16Array(w*50).fill(-1);for(let y=5;y<45;y++)for(let x=5;x<85;x++)if(x<30||x>59||y===25)excluded[y*w+x]=0;
  const skipped=[{...element}];separate(excluded,skipped,w,.1,{0:{type:'skip'}});assert.equal(skipped.length,1);
});
