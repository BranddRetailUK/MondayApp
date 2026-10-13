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
  await assert.rejects(plan(art,{widthMm:80,heightMm:80}),/proportions/);await assert.rejects(plan(art,{widthMm:250}),/Width/);await assert.rejects(plan(art,{border:'true',outlineColour:'bad'}),/outline colour/);
});
