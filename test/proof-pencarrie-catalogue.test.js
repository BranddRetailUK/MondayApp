const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {applyCatalogue,catalogueImages,isPencarrieCatalogueImage}=require('../src/services/proofPencarrieCatalogue');
const {fetchPencarrieRows,selectPencarrieCatalogueVisual,searchPencarrieProducts}=require('../src/services/proofPencarrieVisuals');
const {matchColour,enrichProofProducts}=require('../src/services/proofProductVisuals');
const {fetchGarment}=require('../src/services/proofImageFetch');
const url='https://www.fullcollection.com/storage/phoenix/2026/01436%20NAV%20LEFT.jpg';
const data=()=>({hash:'fixture',counts:{styles:1,colours:1,variants:1},styles:[{code:'01436',name:"SOL'S Wave Bodywarmer",brand:"SOL'S",gender:'Mens',garment_type:'Gilet',supplier_code:'Wave'}],colours:[{style_code:'01436',code:'NAV',name:'Navy',rgb:'#000',images:[{view:'left',url}]}],variants:[{sku:'01436 NAV S',style_code:'01436',colour_code:'NAV',size:'S',size_conversions:'Chest (to fit):36/38',list_price:'17.6000',discontinued:false,special_order:false,is_active:true}]});
function adapter(db){return {query:(q,v)=>typeof q==='string'&&q.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):typeof q==='string'?db.query(q,v):db.query(q.text,q.values)};}
test('proof catalogue import is repeatable, preserves numeric codes, and never changes DATABASE tables',async()=>{
 const db=new PGlite();const pool=adapter(db);
 try {
  await db.exec("CREATE TABLE database_products(id int,name text);INSERT INTO database_products VALUES(1,'unchanged');");
  await applyCatalogue(pool,data(),'products.csv');await applyCatalogue(pool,data(),'products.csv');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM proof_pencarrie_variants')).rows[0].n,1);
  assert.deepEqual((await db.query('SELECT * FROM database_products')).rows,[{id:1,name:'unchanged'}]);
  const products=await searchPencarrieProducts('01436',pool);assert.equal(products[0].code,'01436');assert.deepEqual(products[0].colours,['Navy']);
  const brief={products:[{code:'01436',colour:'Navy',supplier:'pencarrie'}]};
  await enrichProofProducts(brief,{pool,fetchImpl:async()=>{throw Error('Website lookup must not run');}});
  assert.equal(brief.products[0].visual.matched,true);assert.equal(brief.products[0].visual.views[0].view,'left');
  const rows=await fetchPencarrieRows([{name:"SOL'S Wave Bodywarmer"}],pool);
  assert.equal(selectPencarrieCatalogueVisual(rows,{name:"SOL'S Wave Bodywarmer",colour:'Navy'},matchColour).matched,true);
  const bad=data();bad.variants[0].colour_code='MISSING';await assert.rejects(()=>applyCatalogue(pool,bad,'invalid.csv'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM proof_pencarrie_imports')).rows[0].n,2);
  const discontinued=data();discontinued.variants[0].is_active=false;discontinued.variants[0].discontinued=true;
  await applyCatalogue(pool,discontinued,'next.csv');assert.deepEqual(await searchPencarrieProducts('01436',pool),[]);
 } finally{await db.close();}
});
test('fullcollection imagery is restricted to supplier paths and side filenames identify the angle',async()=>{
 assert.deepEqual(catalogueImages({'Side Image':url}),[{view:'left',url}]);
 assert.deepEqual(catalogueImages({'Side Image':url.replace('LEFT','SIDE')}),[]);
 for(const invalid of [url.replace('www.fullcollection.com','evil.test'),url.replace('/storage/phoenix/','/other/'),url.replace('https:','http:'),url.replace('www.fullcollection.com','user:pass@www.fullcollection.com')])assert.equal(isPencarrieCatalogueImage(invalid),false);
 const result=await fetchGarment(url,'PenCarrie',async(_u,options)=>{assert.equal(options.redirect,'error');return {ok:true,arrayBuffer:async()=>Buffer.from('image')};});assert.equal(result.toString(),'image');
 await assert.rejects(()=>fetchGarment(url,'Ralawise catalog'),/safe garment/);
});

test('proof picker finds PenCarrie brands and multiword names alongside Ralawise codes',async()=>{
 const db=new PGlite(),pool=adapter(db);
 try {
  const fixture=data();fixture.styles[0].brand='Portwest';fixture.styles[0].name='Hi-Vis Bodywarmer';
  await applyCatalogue(pool,fixture,'products.csv');
  await db.exec(`CREATE TABLE database_ralawise_catalog_styles(id int,style_code text,manufacturer_style_code text,style_name text,brand text);
   CREATE TABLE database_ralawise_catalog_colours(id int,style_id int,colour_name text);
   CREATE TABLE database_ralawise_catalog_variants(style_id int,colour_id int,is_active bool);
   INSERT INTO database_ralawise_catalog_styles VALUES(1,'PW001','S001','Safety Jacket','Portwest');
   INSERT INTO database_ralawise_catalog_colours VALUES(1,1,'Yellow');
   INSERT INTO database_ralawise_catalog_variants VALUES(1,1,true);`);
  const {searchProofProducts}=require('../src/services/proofPencarrieVisuals');
  const results=await searchProofProducts(' portwest ',pool);
  assert.deepEqual(results.filter(p=>p.supplier!=='portwest').map(p=>[p.code,p.supplier]),[['01436','pencarrie'],['PW001','ralawise']]);
  assert.deepEqual(results[0].colours,['Navy']);
  for(const query of ['hi vis','Portwest Hi Vis'])assert.equal((await searchProofProducts(query,pool))[0].code,'01436');
  assert.equal((await searchProofProducts('safety jacket',pool))[0].code,'PW001');
  assert.equal((await searchProofProducts('01436',pool))[0].code,'01436');
  await db.exec('UPDATE proof_pencarrie_variants SET is_active=false');
  assert.deepEqual((await searchProofProducts('Portwest',pool)).filter(p=>p.supplier!=='portwest').map(p=>p.supplier),['ralawise']);
  for(const query of ['%','PW_','x'.repeat(65)])assert.deepEqual(await searchProofProducts(query,pool),[]);
 }finally{await db.close();}
});
