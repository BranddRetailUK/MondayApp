const test=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {headwearKind,builtinFor,validateSurface,BUILTIN_URL}=require('../src/services/proofHeadwear');
const {readTemplate,prepareHeadwearViews,templateGeometry,assessSurface,restorePreparedHeadwearViews}=require('../src/services/proofHeadwearViews');
const {ensureGeneratedViews,generateView}=require('../src/services/proofGeneratedViews');
const {analyseGarment,automaticGarmentProfile}=require('../src/services/proofArtwork');
const {placementFor,fitsRegion}=require('../src/services/proofLayout');
const {buildProof}=require('../src/services/proofPdfGenerator');
const supplier='https://www.pencarrie.com/storage/b45.jpg';
const product=(overrides={})=>({code:'BB45',name:'Beechfield Original Cuffed Beanie',colour:'Black',visual:{source:'PenCarrie',matched:true,garmentType:'Headwear',views:[{view:'front',url:supplier}]},decorations:[{id:'logo',artworkId:'logo',position:'front',widthMm:116,method:'embroidery'}],...overrides});
const surface={suitable:true,confidence:.98,angleDegrees:0,region:{left:.12,top:.65,width:.76,height:.30}};
const asset=async()=>({id:'logo',file:{originalname:'logo.png',buffer:await sharp({create:{width:1160,height:391,channels:4,background:'#eee'}}).png().toBuffer()}});

test('reviewed B45 aliases use only the verified black product; tops retain their families',()=>{
  for(const code of ['B45','BB45','BC045','BC45'])assert.equal(builtinFor(product({code})),BUILTIN_URL);
  assert.equal(builtinFor(product({colour:'Black/White'})),null);
  assert.equal(builtinFor(product({code:'BB450'})),null);
  assert.equal(headwearKind({code:'RX350',name:'Hoodie'}),null);
  assert.equal(headwearKind({name:'Ladies cap sleeve T-shirt'}),null);
  assert.equal(require('../src/services/proofPlacementProfiles').placementProfile(product()).family,'headwear');
  assert.equal(require('../src/services/proofPlacementProfiles').placementProfile({code:'RX350'}).family,'hoodie');
});
test('native view preparation replaces the angled B45 front without download or GPT, and is idempotent',async()=>{
  const brief={products:[product()]};const never=async()=>{throw Error('Unexpected network/AI');};
  await ensureGeneratedViews(brief,{allowGenerate:true,download:never,generate:never});
  assert.equal(brief.products[0].visual.views[0].url,BUILTIN_URL);
  await ensureGeneratedViews(brief,{allowGenerate:false,download:never,generate:never});
  assert.equal(brief.products[0].visual.views.length,1);
  const unavailable={products:[product()]};unavailable.products[0].visual.matched=false;
  await ensureGeneratedViews(unavailable,{allowGenerate:true,download:never,generate:never});
  assert.equal(unavailable.products[0].visual.views[0].url,supplier);
});
test('116 mm artwork uses the accepted Plastic Head scale and is centred inside the turn-up',async()=>{
  const record=await readTemplate(BUILTIN_URL),p=product();
  const g=await analyseGarment(record.bytes);g.headwearTemplate=record.meta;g.view='front';Object.assign(g,automaticGarmentProfile(p,g,'front'));
  const placement=placementFor(p.decorations[0],{width:1160,height:391},g);
  assert.equal(placement.width,.58);assert.ok(Math.abs(placement.y+placement.height/2-.8075)<1e-12);
  assert.equal(fitsRegion(placement),true);assert.equal(g.scaleSource,'accepted-headwear-reference');
  assert.equal(fitsRegion(placementFor({...p.decorations[0],widthMm:190},{width:1160,height:391},g)),false);
  const manual=placementFor({...p.decorations[0],placement:{x:.48,y:.7},scaleVersion:4},{width:1160,height:391},g);
  assert.equal(manual.x,.48);assert.equal(manual.y,.7);assert.equal(manual.width,.58);
});
test('strict PDF render uses the native template and rejects oversize or mismatched template images',async()=>{
  const brief={customer:'Test',products:[product()]};await ensureGeneratedViews(brief);
  const art=await asset(),out=await buildProof(brief,[art],{strict:true});
  assert.equal(out.pages.length,1);assert.equal(out.pages[0].placements[0].width,.58);assert.equal(out.issues.some(i=>i.blocking),false);
  assert.equal(out.pages[0].flatChestWidthMm,undefined);
  assert.match(out.issues[0].message,/accepted B45/);
  brief.products[0].decorations[0].widthMm=190;
  await assert.rejects(()=>buildProof(brief,[art],{strict:true}),/printable region/);
  await assert.rejects(()=>templateGeometry(product(),{url:BUILTIN_URL},'incorrect-hash'),/retained garment image/);
  const record=await readTemplate(BUILTIN_URL);
  await assert.rejects(()=>templateGeometry(product({colour:'Red'}),{url:BUILTIN_URL},record.meta.imageHash),/different product/);
});
test('old manual placement is not silently migrated, and untemplated headwear cannot use tee geometry',async()=>{
  const p=product();p.decorations[0].placement={x:.5,y:.2};
  await ensureGeneratedViews({products:[p]});assert.equal(p.visual.views[0].url,supplier);
  const g={width:700,height:700,view:'front',mask:new Uint8Array(490000),confident:false};Object.assign(g,automaticGarmentProfile(p,g,'front'));
  assert.throws(()=>placementFor(p.decorations[0],{width:116,height:39},g),/reviewed front template/);
  const c={referenceMm:200,start:{x:0,y:.5},end:{x:1,y:.5},regions:{front:{x:.5,y:.6,left:.1,top:.5,width:.8,height:.4}}};
  const legacy=placementFor({...p.decorations[0],placement:{x:.5,y:.6}},{width:116,height:39},g,c);assert.equal(legacy.calibrated,true);assert.equal(legacy.width,.58);
});
test('prepared templates survive catalogue refresh and manual edits without trusting client geometry',async()=>{
  const p=product();await ensureGeneratedViews({products:[p]});p.visual.views[0].region={left:0,top:0,width:1,height:1};
  const next=product();next.decorations[0].placement={x:.5,y:.7};
  await restorePreparedHeadwearViews({products:[next]},[p]);await ensureGeneratedViews({products:[next]});
  assert.equal(next.visual.views[0].url,BUILTIN_URL);assert.equal(next.visual.views[0].region,undefined);
});
test('other headwear assesses suitability, normalises unsuitable fronts once, and reuses image plus geometry',async()=>{
  const cache=new Map();let generations=0,assessments=0;
  const bytes=Buffer.from('supplier'),normal=Buffer.from('normalised');
  const options={allowGenerate:true,download:async()=>bytes,read:async url=>cache.get(url.replace('proof-headwear:','')),save:async(k,r)=>cache.set(k,r),generate:async()=>{generations++;return normal;},assess:async image=>{assessments++;if(image===bytes)throw Error('Headwear decoration surface could not be verified');return surface;}};
  const p=product({code:'BB99',colour:'Red'});await prepareHeadwearViews({products:[p]},options);
  assert.equal(generations,1);assert.equal(assessments,2);assert.equal(cache.size,1);
  const again=product({code:'BB99',colour:'Red'});await prepareHeadwearViews({products:[again]},{...options,allowGenerate:false});
  assert.equal(generations,1);assert.equal(assessments,2);assert.deepEqual(p.visual.views,again.visual.views);
  const changed=product({code:'BB99',colour:'Navy'});await assert.rejects(()=>prepareHeadwearViews({products:[changed]},{...options,allowGenerate:false}),/needs preparing/);
  assert.equal(generations,1);
});
test('suitable supplier headwear is cached unchanged; API failures do not trigger paid image generation',async()=>{
  const cache=new Map(),bytes=Buffer.from('upright');let calls=0;
  const options={allowGenerate:true,download:async()=>bytes,read:async u=>cache.get(u.slice(15)),save:async(k,r)=>cache.set(k,r),generate:async()=>{calls++;throw Error('Unexpected generation');},assess:async()=>surface};
  const p=product({code:'BB99'});await prepareHeadwearViews({products:[p]},options);assert.equal(calls,0);assert.equal([...cache.values()][0].bytes,bytes);
  await assert.rejects(()=>prepareHeadwearViews({products:[product({code:'BB100'})]},{...options,assess:async()=>{throw Error('Headwear view assessment failed (429).');}}),/429/);assert.equal(calls,0);
});
test('uncertain, angled, crown and invalid regions fail closed',()=>{
  for(const patch of [{suitable:false},{confidence:.5},{confidence:undefined},{angleDegrees:12},{region:{left:.1,top:.2,width:.8,height:.2}},{region:{left:.8,top:.65,width:.7,height:.3}}])assert.throws(()=>validateSurface({...surface,...patch},'cuffed-beanie'),/could not be verified/);
});
test('unsupported headwear positions fail rather than using a chest/back/sleeve anchor',async()=>{
  const p=product();p.decorations[0].position='left breast';await assert.rejects(()=>ensureGeneratedViews({products:[p]}),/front decoration/);
});
test('headwear GPT prompt contains only product data and no clothing anatomy or customer logo',async()=>{
  const record=await readTemplate(BUILTIN_URL);
  await generateView(record.bytes,{...product(),customer:'PRIVATE_CUSTOMER',request:'SECRET_ARTWORK'},'front',{apiKey:'test',fetchImpl:async(url,options)=>{
    const prompt=options.body.get('prompt');assert.match(prompt,/turn-up horizontal/);assert.doesNotMatch(prompt,/shoulders|sleeves|PRIVATE_CUSTOMER|SECRET_ARTWORK/);
    return {ok:true,json:async()=>({data:[{b64_json:record.bytes.toString('base64')}]})};
  }});
});
test('surface assessment validates the cropped image and keeps artwork out of vision requests',async()=>{
  const record=await readTemplate(BUILTIN_URL);
  await assessSurface(record.bytes,{...product(),customer:'PRIVATE_CUSTOMER',decorations:[{artwork:'SECRET_ARTWORK'}]},{apiKey:'test',fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.text.format.strict,true);assert.doesNotMatch(options.body,/PRIVATE_CUSTOMER|SECRET_ARTWORK/);
    return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(surface)}]}]})};
  }});
});


test('headwear cache schema migration is additive and repeatable',async()=>{
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
  try {
    const pool={query:(sql,args)=>db.query(sql,args)};
    await require('../src/db/proofGeneratorSchema').ensureProofGeneratorTables(pool);
    await require('../src/db/proofGeneratorSchema').ensureProofGeneratorTables(pool);
    const result=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='proof_generated_garment_views' AND column_name='headwear_geometry'");
    assert.equal(result.rows.length,1);
  }finally{await db.close();}
});

test('normalised generated images with uncertain surfaces are never cached or used',async()=>{
  let saved=0,calls=0;
  await assert.rejects(()=>prepareHeadwearViews({products:[product({code:'BB99'})]},{allowGenerate:true,download:async()=>Buffer.from('angled'),read:async()=>null,save:async()=>{saved++;},generate:async()=>Buffer.from('still-angled'),assess:async()=>{calls++;return validateSurface({...surface,angleDegrees:20},'cuffed-beanie');}}),/could not be verified/);
  assert.equal(saved,0);assert.equal(calls,2);
});


test('headwear never generates a front image for a requested back or side view',async()=>{
  const record=await readTemplate(BUILTIN_URL);
  await assert.rejects(()=>generateView(record.bytes,product(),'back',{apiKey:'test',fetchImpl:async()=>{throw Error('Unexpected AI call');}}),/side and back views require/);
});
