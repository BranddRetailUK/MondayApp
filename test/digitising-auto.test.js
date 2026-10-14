const {test}=require('node:test');const assert=require('node:assert/strict');const sharp=require('sharp');
const {plan,removeBackground}=require('../src/services/digitisingAuto');const engine=require('../src/services/digitisingStudio');
const art=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><path d="M20 220V70C20 10 100 10 100 70V220" stroke="red" stroke-width="8" fill="none"/></svg>');
test('automatic settings need only artwork, garment and outline; technical overrides are ignored',async()=>{
  const a=await plan(art,{garment:'hoodie',border:'true',outlineColour:'#123456',hoopMm:360,spacing:.6,elementOptions:'bad'});
  assert.equal(a.config.spacing,.4);assert.equal(a.config.underlay,1.3);assert.equal(a.config.border,true);assert.ok(a.config.widthMm<100);assert.equal(a.config.hoopMm,150);
  assert.ok(Object.values(a.config.elementOptions).some(e=>e.type==='satin'));
  const p=await engine.prepare(a.png,a.config);assert.ok(p.heightMm<=100.01);
  const r=await engine.generate(a.png,a.config);assert.equal(r.threads[1],'#123456');
  const b=await plan(art,{garment:'tshirt'});assert.equal(b.config.spacing,.42);assert.equal(b.config.border,false);
  await assert.rejects(plan(art,{garment:'cap'}),/not available/);await assert.rejects(plan(art,{garment:'unknown'}),/garment/);
});
test('automatic background removal preserves enclosed white design regions',async()=>{
  const input=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="white"/><rect x="4" y="4" width="12" height="12" fill="black"/><rect x="8" y="8" width="4" height="4" fill="white"/></svg>')).png().toBuffer();
  const raw=await sharp(await removeBackground(input)).ensureAlpha().raw().toBuffer();assert.equal(raw[3],0);assert.equal(raw[(10*20+10)*4+3],255);
});

test('customer dimensions preserve proportions and outline colour is validated',async()=>{
  const a=await plan(art,{widthMm:'40',outlineColour:'#abcdef',border:'true'});assert.equal(a.config.widthMm,40);assert.equal(a.config.garmentColour,'#abcdef');
  const b=await plan(art,{heightMm:'90'}),p=await engine.prepare(b.png,b.config);assert.ok(Math.abs(p.heightMm-90)<.01);
  await assert.rejects(plan(art,{widthMm:80,heightMm:80}),/proportions/);await assert.rejects(plan(art,{widthMm:301}),/Width/);await assert.rejects(plan(art,{border:'true',outlineColour:'bad'}),/outline colour/);
});
test('branched narrow lettering is digitised automatically without a reference',async()=>{
  const letter=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="black" d="M20 10H80V22H34V44H72V56H34V78H80V90H20Z"/></svg>');
  const p=await plan(letter,{widthMm:10});assert.equal(p.config.elementOptions[0].type,'satin-branches');
  const r=await engine.generate(p.png,p.config);assert.ok(r.stats.stitches>100);assert.equal(r.threads.length,1);assert.equal(r.stats.shortRuns,0);
});

test('resizing regenerates fill and satin at physical density instead of scaling commands',async()=>{
  const shapes=[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect x="5" y="5" width="190" height="110" fill="red"/></svg>'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><path d="M10 105V45Q100 -20 190 45V105" fill="none" stroke="red" stroke-width="5"/></svg>')];
  for(const [i,shape] of shapes.entries()){
    const outputs=[];
    for(const widthMm of [70,100]){const p=await plan(shape,{widthMm});assert.equal(p.config.elementOptions[0].type,i?'satin':'fill');outputs.push(await engine.generate(p.png,p.config));}
    const ratio=outputs[1].stats.stitches/outputs[0].stats.stitches;assert.ok(ratio>(i?1.25:1.7),`new stitch count must grow, ratio ${ratio}`);
    const {parseDst}=await import('../public/embroidery-viewer.mjs');
    if(!i)for(const output of outputs){
      const d=parseDst(Buffer.from(output.dst,'base64')),angle=output.config.fillAngle*Math.PI/180;
      const rows=d.segments.filter(([x,y,a,b])=>Math.hypot(a-x,b-y)>15&&Math.abs(-(a-x)*Math.sin(angle)+(b-y)*Math.cos(angle))<1.2).map(([x,y])=>(-x*Math.sin(angle)+y*Math.cos(angle))/10).sort((a,b)=>a-b);
      const distinct=[];for(const v of rows)if(!distinct.length||v-distinct.at(-1)>.2)distinct.push(v);
      const gaps=distinct.slice(1).map((v,j)=>v-distinct[j]).sort((a,b)=>a-b);
      assert.ok(gaps.length>20);assert.ok(Math.abs(gaps[Math.floor(gaps.length/2)]-.42)<.12,'physical row density must survive angle and size changes');
    }
  }
});
test('dense coverage policy is garment-derived and cannot be overridden by customer fields',async()=>{
 const a=await plan(art,{garment:'tshirt',satinSpacing:.01,coverageMargin:5});assert.equal(a.config.satinSpacing,.34);assert.equal(a.config.coverageMargin,.15);
 const b=await plan(art,{garment:'hoodie'});assert.equal(b.config.satinSpacing,.32);assert.equal(b.config.coverageMargin,.2);
});

test('upload sizing uses PNG resolution, caps width at 300 and keeps canvas proportions',async()=>{
  for(const [pixels,density,expected] of [[3189,300,270],[4000,300,300],[900,null,76.2]]){
    let image=sharp({create:{width:pixels,height:Math.round(pixels/2),channels:4,background:'#ff0000'}});
    if(density)image=image.withMetadata({density});
    let input=await image.png().toBuffer();
    if(!density){const chunks=[input.subarray(0,8)];for(let offset=8;offset<input.length;){const end=offset+12+input.readUInt32BE(offset);if(input.toString('ascii',offset+4,offset+8)!=='pHYs')chunks.push(input.subarray(offset,end));offset=end;}input=Buffer.concat(chunks);}
    const p=await plan(input),prepared=await engine.prepare(p.png,p.config);
    assert.ok(Math.abs(p.config.widthMm-expected)<.01);
    assert.ok(Math.abs(prepared.heightMm/p.config.widthMm-Math.round(pixels/2)/pixels)<.00001);
  }
});
test('transparent white artwork and margins survive preparation and preview',async()=>{
  const input=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect x="20" y="30" width="80" height="170" fill="white"/></svg>')).png().toBuffer();
  const source=await engine.artwork(input,{maxSide:2000});assert.deepEqual(await removeBackground(source),source);
  const p=await plan(input,{widthMm:150,heightMm:300}),prepared=await engine.prepare(p.png,p.config);
  assert.equal(prepared.preserveWhiteArtwork,true);assert.equal(prepared.heightMm,300);assert.equal(prepared.elements[0].colour,'#ffffff');assert.deepEqual(p.preview,source);
  const resized=await plan(input,{heightMm:500});assert.equal(resized.config.widthMm,250);
  await assert.rejects(plan(input,{heightMm:602}),/Width/);
  // Excluding an element cannot change the image's coordinate scale or proportions.
  assert.equal(prepared.scale,150/prepared.info.width);
});
test('SVG physical units set upload size before rasterising',async()=>{
  const input=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="270mm" height="135mm" viewBox="0 0 270 135"><rect width="270" height="135" fill="red"/></svg>');
  const p=await plan(input);assert.ok(Math.abs(p.config.widthMm-270)<.2);assert.ok(Math.abs(p.config.sourceAspect-.5)<.001);
});

test('overloaded raster cleanup merges tiny colour chatter without filling transparency',()=>{
  const {consolidate}=require('../src/services/digitisingPalette');
  const w=100,ids=new Int16Array(w*w).fill(0);for(let y=3;y<97;y+=6)for(let x=3;x<97;x+=6)ids[y*w+x]=1;
  for(let y=30;y<60;y++)for(let x=30;x<60;x++)ids[y*w+x]=-1;
  const before=ids.slice();assert.ok(consolidate(ids,w)>0);
  for(let i=0;i<ids.length;i++)if(before[i]===-1)assert.equal(ids[i],-1);
  assert.ok(ids.filter(x=>x===1).length<5);
  const simple=new Int16Array(100).fill(0);simple[55]=1;const original=simple.slice();assert.equal(consolidate(simple,10),0);assert.deepEqual(simple,original);
});
test('overloaded cleanup preserves substantial detached artwork and the region limit',async()=>{
  const w=200,ids=new Int16Array(w*w).fill(-1);
  for(let y=0;y<180;y+=12)for(let x=0;x<180;x+=12)for(let dy=0;dy<5;dy++)for(let dx=0;dx<5;dx++)ids[(y+dy)*w+x+dx]=0;
  const original=ids.slice();require('../src/services/digitisingPalette').consolidate(ids,w);assert.deepEqual(ids,original);
  const rgba=Buffer.alloc(w*w*4);for(let k=0;k<ids.length;k++)if(ids[k]>=0)rgba[k*4+3]=255;
  const png=await sharp(rgba,{raw:{width:w,height:w,channels:4}}).png().toBuffer();await assert.rejects(engine.prepare(png,engine.settings({widthMm:100,hoopMm:200,colours:1,spacing:.4,length:3})),/More than 128/);
});

test('neutral near-black variants share a thread without collapsing dark chromatic colours',()=>{
  const {sameThreadColour}=require('../src/services/digitisingPalette');
  assert.equal(sameThreadColour([1,2,4],[29,29,27]),true);
  assert.equal(sameThreadColour([0,0,0],[0,0,48]),false);
  assert.equal(sameThreadColour([0,0,0],[48,0,0]),false);
  assert.equal(sameThreadColour([0,0,0],[80,80,80]),false);
});
test('optional model guides stay within the section budget without dropping source artwork',()=>{
  const {sectionPlan}=require('../src/services/digitisingAuto'),guide={startX:0,startY:0,endX:10,endY:10};
  const regions=[{id:0,include:true,sections:[guide,guide,guide]},{id:1,include:true,sections:[guide,guide]},{id:2,include:true,sections:[guide]}];
  const before=JSON.stringify(regions),r=sectionPlan(regions,127);
  assert.equal(r.sections[0],undefined);assert.equal(r.sections[1].length,2);assert.equal(r.sections[2].length,1);assert.equal(r.planningWarnings.length,1);assert.match(r.planningWarnings[0],/source geometry retained/);assert.equal(JSON.stringify(regions),before);
});
