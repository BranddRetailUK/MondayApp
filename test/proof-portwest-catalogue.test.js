const test=require('node:test'),assert=require('node:assert/strict');
const {products}=require('../data/proof-generator/portwest.json');
const {searchPortwestProducts,isPortwestCatalogueImage}=require('../src/services/proofPortwestCatalogue');
const {searchProofProducts}=require('../src/services/proofPencarrieVisuals');
const {enrichProofProducts}=require('../src/services/proofProductVisuals');
const {fetchGarment}=require('../src/services/proofImageFetch');

test('all five manufacturer styles and eleven colourways are searchable and enrich with the correct front/rear images',async()=>{
 assert.deepEqual(products.map(p=>p.code),['CD861','T500','PW318','DX483','PW312']);
 assert.equal(products.reduce((n,p)=>n+p.colours.length,0),11);
 const pool={query:async()=>({rows:[]})};
 for(const p of products){
  const search=await searchProofProducts(p.code,pool);assert.equal(search[0].supplier,'portwest');assert.deepEqual(search[0].colours,p.colours.map(c=>c.name));
  for(const colour of p.colours){
   const brief={products:[{code:p.code.toLowerCase(),colour:colour.name.toLowerCase(),supplier:'auto'}]};
   await enrichProofProducts(brief,{pool:{query(){throw Error('Direct Portwest lookup must not depend on another supplier');}}});
   const product=brief.products[0];assert.equal(product.supplier,'portwest');assert.equal(product.colour,colour.name);assert.equal(product.visual.matched,true);
   assert.deepEqual(product.visual.views.map(i=>i.view),['front','back']);
   for(const i of product.visual.views){assert.ok(i.url.includes(p.code+colour.code));assert.equal(isPortwestCatalogueImage(i.url),true);}
  }
 }
 assert.equal(searchPortwestProducts('Portwest').length,5);
 assert.equal(searchPortwestProducts('Eco Hi Vis')[0].code,'CD861');
});

test('Portwest missing styles/colours fail closed and explicit supplier selection is preserved',async()=>{
 const pool={query:async()=>({rows:[]})};
 const brief={products:[{code:'CD861',colour:'Navy',supplier:'portwest'},{code:'UNKNOWN',colour:'Yellow',supplier:'portwest'},{code:'T500',colour:'Yellow/Black',supplier:'ralawise'},{code:'PW318',colour:'Orange/Black',supplier:'pencarrie'},{code:'DX483',colour:'Yellow/Black',supplier:'portwest'}]};
 await enrichProofProducts(brief,{pool});
 assert.deepEqual(brief.products.map(p=>p.code),['CD861','UNKNOWN','T500','PW318','DX483']);
 assert.equal(brief.products[0].visual.matched,false);assert.deepEqual(brief.products[0].visual.availableColours,['Orange/Black','Yellow/Black']);
 assert.equal(brief.products[1].visual.lookupIssue,'portwest_product_not_found');
 assert.equal(brief.products[2].visual.source,'Ralawise catalog');assert.equal(brief.products[2].visual.matched,false);
 assert.equal(brief.products[3].visual.source,'PenCarrie');assert.equal(brief.products[3].visual.matched,false);
 assert.equal(brief.products[4].visual.matched,true);
});

test('Portwest image downloads accept only exact verified URLs for the matching source',async()=>{
 const url=products[0].colours[0].images[0].url;
 const bytes=await fetchGarment(url,'Portwest',async(u,options)=>{assert.equal(u,url);assert.equal(options.redirect,'error');return {ok:true,arrayBuffer:async()=>Buffer.from('image')};});assert.equal(bytes.toString(),'image');
 for(const invalid of [url+'?x=1',url.replace('https:','http:'),url.replace('CD861','OTHER'),url.replace('cloudfront.net','evil.test')])await assert.rejects(()=>fetchGarment(invalid,'Portwest'),/safe garment/);
 await assert.rejects(()=>fetchGarment(url,'PenCarrie'),/safe garment/);
});
