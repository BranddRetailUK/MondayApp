const test=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {isRalawiseImageUrl,imageView,selectRalawiseVisual,searchRalawiseProducts}=require('../src/services/proofRalawiseVisuals');
const {enrichProofProducts,matchColour}=require('../src/services/proofProductVisuals');
const {ensureGeneratedViews,requiredViews,generateView,validateGeneratedView}=require('../src/services/proofGeneratedViews');
const {fetchGarment}=require('../src/services/proofImageFetch');
const url='https://cdn.pimber.ly/public/asset/raw/571f95845f13380f0056d06a/asset/opaque.jpg';
const row={style_id:1,style_code:'RX350',manufacturer_style_code:'RX350',style_name:'Pro hoodie',colour_id:2,colour_code:'NAVY',colour_name:'Navy*',colour_image_url:url,colour_image_filename:'RX350_Navy_FT.jpg',images:[]};
const makeBrief=()=>({products:[{code:'RX350',name:'Hoodie',colour:'Navy',decorations:[{position:'left breast'},{position:'back'},{position:'right sleeve'}],visual:{source:'Ralawise catalog',matched:true,views:[{view:'front',url}]}}]});

test('Ralawise colour-specific filenames preserve front views and reject lifestyle imagery',()=>{
 const visual=selectRalawiseVisual([row],'RX350','Navy',matchColour);
 assert.equal(visual.matched,true);assert.equal(visual.views[0].view,'front');assert.equal(visual.views[0].url,url);
 assert.equal(imageView('RX350_LS00_2026.jpg'),null);assert.equal(imageView('RX350_Navy_FT .jpg'),'front');assert.equal(imageView('unknown.jpg'),null);
 const wrong={...row,images:[{colour_id:99,url,filename:'RX350_Red_BK.jpg'}]};
 assert.equal(selectRalawiseVisual([wrong],'RX350','Navy',matchColour).views.length,1);
});
test('only the Ralawise Pimberly tenant and supplier asset paths are allowed',async()=>{
 assert.equal(isRalawiseImageUrl(url),true);
 for(const value of [url.replace('571f95845f13380f0056d06a','other-tenant'),url.replace('cdn.pimber.ly','evil.test'),url.replace('https:','http:'),'https://shop.ralawise.com/login'])assert.equal(isRalawiseImageUrl(value),false);
 const image=await fetchGarment(url,'Ralawise catalog',async()=>({ok:true,arrayBuffer:async()=>Buffer.from('bytes')}));assert.equal(image.toString(),'bytes');
 await assert.rejects(()=>fetchGarment(url,'PenCarrie'),/safe garment/);
});
test('Ralawise prefers exact codes and requires unique manufacturer mappings and colours',()=>{
 assert.equal(selectRalawiseVisual([row],'RX350','Red',matchColour).lookupIssue,'colour_not_found');
 const rows=[{...row,manufacturer_style_code:'ABC'},{...row,style_id:3,style_code:'RX351',manufacturer_style_code:'ABC'}];
 assert.equal(selectRalawiseVisual(rows,'ABC','Navy',matchColour).lookupIssue,'ambiguous_code');
 assert.equal(selectRalawiseVisual(rows,'RX350','Navy',matchColour).matched,true);
});
test('hosted supplier enrichment uses the existing database without contacting PenCarrie',async()=>{
 const brief=makeBrief();let queries=0;
 await enrichProofProducts(brief,{provider:'ralawise',pool:{query:async query=>{queries++;assert.deepEqual(query.values,[['RX350'],['RX350']]);return {rows:[row]};}},fetchImpl:async()=>{throw Error('Unexpected website lookup');}});
 assert.equal(queries,1);assert.equal(brief.products[0].visual.source,'Ralawise catalog');assert.equal(brief.products[0].visual.views[0].view,'front');
});
test('missing back and sleeve views generate once and export reuses identical cached images',async()=>{
 const cache=new Map();let generated=0;const progress=[];
 const options={allowGenerate:true,download:async()=>Buffer.from('source-front'),read:async key=>cache.get(key),save:async(key,bytes)=>cache.set(key,bytes),generate:async(_bytes,_product,view)=>{generated++;return Buffer.from(view);},onProgress:p=>progress.push(p)};
 const brief=makeBrief();assert.deepEqual(requiredViews(brief,brief.products[0]),['front','back','right']);
 await ensureGeneratedViews(brief,options);assert.equal(generated,2);assert.equal(cache.size,2);assert.equal(brief.products[0].visual.views.length,3);
 const exportBrief=makeBrief();await ensureGeneratedViews(exportBrief,{...options,allowGenerate:false});assert.equal(generated,2);
 assert.deepEqual(exportBrief.products[0].visual.views,brief.products[0].visual.views);
 assert.equal(progress.at(-1).completed,2);
 const changed=makeBrief();await ensureGeneratedViews(changed,{...options,download:async()=>Buffer.from('new-source')});assert.equal(generated,4);
});
test('AI never invents a garment when the catalogue reference or colour is missing',async()=>{
 const brief=makeBrief();brief.products[0].visual.matched=false;
 await ensureGeneratedViews(brief,{allowGenerate:true,generate:async()=>{throw Error('Must not generate');},download:async()=>{throw Error('Must not download');}});
 assert.equal(brief.products[0].visual.views.length,1);
});
const singleGarment=()=>sharp(Buffer.from('<svg width="120" height="160"><rect width="120" height="160" fill="white"/><path d="M40 20 L80 20 L110 45 L95 65 L80 50 L80 140 L40 140 L40 50 L25 65 L10 45 Z" fill="navy"/></svg>')).png().toBuffer();
test('image edits use GPT Image 2.5 with a reference and no customer artwork',async()=>{
 const png=await singleGarment();
 const out=await generateView(png,{code:'RX350',name:'Hoodie',colour:'Navy',customer:'PRIVATE_CUSTOMER'},'back',{apiKey:'test-key',fetchImpl:async(endpoint,options)=>{
   assert.equal(endpoint,'https://api.openai.com/v1/images/edits');assert.equal(options.body.get('model'),'gpt-image-2.5-flare');assert.ok(options.body.get('image[]'));
   assert.equal(options.body.get('prompt').includes('PRIVATE_CUSTOMER'),false);
   assert.match(options.body.get('prompt'),/EXACTLY ONE garment/);
   assert.equal(options.body.get('prompt').includes('For a side view'),false);
   return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})};
 }});assert.ok(out.length);
});

test('generated contact sheets and empty images are rejected; validation failure retries once',async()=>{
 const valid=await singleGarment();
 const collage=await sharp({create:{width:300,height:180,channels:4,background:'white'}}).composite([{input:valid,left:10,top:10},{input:valid,left:160,top:10}]).png().toBuffer();
 await assert.rejects(()=>validateGeneratedView(collage),/one garment/);
 const blank=await sharp({create:{width:120,height:160,channels:4,background:'white'}}).png().toBuffer();
 await assert.rejects(()=>validateGeneratedView(blank),/one garment/);
 await validateGeneratedView(valid);
 let calls=0;
 const fetchImpl=async()=>({ok:true,json:async()=>({data:[{b64_json:(++calls===1?collage:valid).toString('base64')}]})});
 await generateView(valid,{code:'RX350'},'back',{apiKey:'test',fetchImpl});assert.equal(calls,2);
 calls=0;
 await assert.rejects(()=>generateView(valid,{code:'RX350'},'back',{apiKey:'test',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({data:[{b64_json:collage.toString('base64')}]})};}}),/one garment/);
 assert.equal(calls,2);
});

test('catalogue search uses bounded code prefixes and does not interpret wildcard input',async()=>{
 let calls=0;const pool={query:async query=>{calls++;assert.deepEqual(query.values,['RX3%','RX3','RX3']);return {rows:[{code:'RX350',name:'Pro hoodie'}]};}};
 assert.deepEqual(await searchRalawiseProducts(' rx3 ',pool),[{code:'RX350',name:'Pro hoodie'}]);
 for(const query of ['','R','%','RX_','RX350\' OR TRUE'])assert.deepEqual(await searchRalawiseProducts(query,pool),[]);
 assert.equal(calls,1);
});

test('export cannot silently replace a missing generated sleeve with a front view',async()=>{
 const brief=makeBrief();
 await assert.rejects(()=>ensureGeneratedViews(brief,{allowGenerate:false,download:async()=>Buffer.from('changed-source'),read:async()=>null}),/needs preparing/);
});
test('separate verified colours expand into sheets without splitting real combined colourways',async()=>{
 const rows=['Black','White'].map((colour,i)=>({...row,colour_id:i+1,colour_code:colour,colour_name:colour}));
 const brief={products:[{code:'RX350',colour:'Black/White',decorations:[{id:'a',widthMm:300}]}]};
 await enrichProofProducts(brief,{provider:'ralawise',pool:{query:async()=>({rows})}});
 assert.deepEqual(brief.products.map(p=>p.colour),['Black','White']);assert.notEqual(brief.products[0].decorations,brief.products[1].decorations);
 rows.push({...row,colour_id:3,colour_name:'Black/White'});
 const combined={products:[{code:'RX350',colour:'Black and White',decorations:[]}]};
 await enrichProofProducts(combined,{provider:'ralawise',pool:{query:async()=>({rows})}});assert.equal(combined.products.length,1);assert.equal(combined.products[0].colour,'Black/White');
 const invalid={products:[{code:'RX350',colour:'Black and Imaginary',decorations:[]}]};
 await enrichProofProducts(invalid,{provider:'ralawise',pool:{query:async()=>({rows})}});assert.equal(invalid.products.length,1);assert.equal(invalid.products[0].visual.lookupIssue,'colour_not_found');
});
test('product picker lists sorted colours with active variants for the selected style only',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE database_ralawise_catalog_styles(id int,style_code text,manufacturer_style_code text,style_name text,brand text);
   CREATE TABLE database_ralawise_catalog_colours(id int,style_id int,colour_name text);
   CREATE TABLE database_ralawise_catalog_variants(style_id int,colour_id int,is_active bool);
   INSERT INTO database_ralawise_catalog_styles VALUES(1,'GD017','8900','Polo','Gildan'),(2,'GD002','2000','T-shirt','Gildan');
   INSERT INTO database_ralawise_catalog_colours VALUES(1,1,'White'),(2,1,'Black'),(3,1,'Red'),(4,2,'Navy');
   INSERT INTO database_ralawise_catalog_variants VALUES(1,1,true),(1,2,true),(1,2,true),(1,3,false),(2,4,true);`);
  const results=await searchRalawiseProducts('GD017',{query:({text,values})=>db.query(text,values)});
  assert.equal(results.length,1);assert.deepEqual(results[0].colours,['Black','White']);
 }finally{await db.close();}
});
test('GD01 resolves GD001 with all 53 colours before the eight-colour GD010 prefix match',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE database_ralawise_catalog_styles(id int,style_code text,manufacturer_style_code text,style_name text,brand text);
   CREATE TABLE database_ralawise_catalog_colours(id int,style_id int,colour_name text);
   CREATE TABLE database_ralawise_catalog_variants(style_id int,colour_id int,is_active bool);
   INSERT INTO database_ralawise_catalog_styles VALUES(1,'GD001','64000','Softstyle T-shirt','Gildan'),(2,'GD010','64V00','V-neck','Gildan');
   INSERT INTO database_ralawise_catalog_colours SELECT i,1,'Colour '||i FROM generate_series(1,53) AS i;
   INSERT INTO database_ralawise_catalog_colours SELECT i,2,'Colour '||i FROM generate_series(54,61) AS i;
   INSERT INTO database_ralawise_catalog_variants SELECT style_id,id,true FROM database_ralawise_catalog_colours;`);
  const pool={query:({text,values})=>db.query(text,values)};
  const results=await searchRalawiseProducts('GD01',pool);
  assert.deepEqual(results.map(x=>[x.code,x.colours.length]),[['GD001',53],['GD010',8]]);
  assert.equal((await searchRalawiseProducts('GD001',pool))[0].colours.length,53);
  const visual=selectRalawiseVisual([{style_id:1,style_code:'GD001',style_name:'T-shirt',colour_name:'Black',colour_id:1,images:[]}],'GD01','Black',(items,name)=>items.find(x=>x.name===name));
  assert.equal(visual.matched,true);assert.equal(visual.styleCode,'GD001');
 }finally{await db.close();}
});

test('Royal Blue alias is restricted to the requested Gildan styles and an actual Royal colour',()=>{
 for(const code of ['GD001','GD057','GD057B']) {
  const royal={...row,style_code:code,colour_name:'Royal*'};
  assert.equal(selectRalawiseVisual([royal],code.replace('0',''),'Royal Blue',matchColour).colour,'Royal*');
  assert.equal(selectRalawiseVisual([{...royal,colour_name:'Royal Heather'}],code,'Royal Blue',matchColour).matched,false);
 }
 assert.equal(selectRalawiseVisual([{...row,colour_name:'Royal'}],'RX350','Royal Blue',matchColour).matched,false);
});

test('mixed suppliers retain input order and route an explicitly PenCarrie-only garment separately',async()=>{
 const brief={products:[{code:'GD01',colour:'Royal Blue'},{code:'01436',colour:'Navy',supplier:'pencarrie'},{code:'GD57',colour:'Royal Blue'},{code:'GD57B',colour:'Royal Blue'}]};
 const rows=['GD001','GD057','GD057B'].map((code,i)=>({...row,style_code:code,style_id:i+1,colour_name:'Royal'}));
 let pc=0;
 await enrichProofProducts(brief,{provider:'ralawise',pool:{query:async q=>{
  if(q.text.includes('proof_pencarrie_styles')) {pc++;assert.deepEqual(q.values[0],['01436']);return {rows:[{style_code:'01436',style_name:'Wave Bodywarmer',colour_name:'Navy',colour_code:'NAV',images:[]}]};}
  assert.equal(q.values[0].includes('01436'),false);return {rows};
 }},fetchImpl:async()=>{throw Error('Hosted lookup must not call the website');}});
 assert.equal(pc,1);assert.deepEqual(brief.products.map(p=>p.code),['GD001','01436','GD057','GD057B']);
 assert.deepEqual(brief.products.map(p=>p.supplier),['ralawise','pencarrie','ralawise','ralawise']);
 assert.ok(brief.products.every(p=>p.visual.matched));
});

test('name-only lookup accepts a unique exact catalogue name and rejects ambiguous names',async()=>{
 const b={products:[{code:'',name:'Pro hoodie',colour:'Navy',supplier:'ralawise'}]};
 await enrichProofProducts(b,{provider:'ralawise',pool:{query:async q=>{assert.deepEqual(q.values[2],['pro hoodie']);return {rows:[row]};}}});
 assert.equal(b.products[0].code,'RX350');assert.equal(b.products[0].visual.matched,true);
 assert.equal(selectRalawiseVisual([row,{...row,style_id:99,style_code:'OTHER'}],'','Navy',matchColour,'Pro hoodie').lookupIssue,'ambiguous_code');
});

test('auto supplier fallback resolves a product once without duplicating its sheet',async()=>{
 const brief={products:[{code:'01436',colour:'Navy',supplier:'auto'}]};let calls=0;
 await enrichProofProducts(brief,{provider:'ralawise',pool:{query:async q=>{
  if(q.text.includes('proof_pencarrie_styles')){calls++;return {rows:[{style_code:'01436',style_name:'Wave Bodywarmer',colour_name:'Navy',images:[]}]};}
  return {rows:[]};
 }},fetchImpl:async()=>{throw Error('Hosted lookup must not call the website');}});
 assert.equal(calls,1);assert.equal(brief.products.length,1);assert.equal(brief.products[0].supplier,'pencarrie');
});

test('PenCarrie access rejection preserves the upstream status for a useful review message',async()=>{
 const brief={products:[{code:'01436',colour:'Navy',supplier:'pencarrie'}]};
 await enrichProofProducts(brief,{fetchImpl:async()=>({ok:false,status:403})});
 assert.equal(brief.products[0].visual.lookupIssue,'supplier_unavailable');
 assert.equal(brief.products[0].visual.supplierHttpStatus,403);
});
