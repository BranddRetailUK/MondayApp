// Reviewed manufacturer additions for proofs only; never stock/order offers.
const catalogue=require('../../data/proof-generator/portwest.json');
const normalise=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,' ');
const imageUrls=new Set(catalogue.products.flatMap(p=>p.colours.flatMap(c=>c.images.map(i=>i.url))));
function isPortwestCatalogueImage(url){return imageUrls.has(url);}
function findPortwestProduct(product){
 const code=String(product.code||'').trim().toUpperCase();
 return catalogue.products.find(p=>code?p.code===code:normalise(p.name)===normalise(product.name));
}
function searchPortwestProducts(query){
 const q=String(query||'').trim().toUpperCase();
 if(!/^[A-Z0-9 -]{2,64}$/.test(q))return [];
 return catalogue.products.filter(p=>p.code.startsWith(q)||normalise(`${p.brand} ${p.name}`).includes(normalise(q)))
  .map(p=>({code:p.code,name:p.name,brand:p.brand,supplier:'portwest',colours:p.colours.map(c=>c.name)}));
}
function enrichPortwestProducts(products,matchColour){
 for(const item of products){
  const product=findPortwestProduct(item);
  const base={source:'Portwest',matched:false,views:[]};
  if(!product){item.visual={...base,lookupIssue:'portwest_product_not_found'};continue;}
  const colour=matchColour(product.colours,item.colour);
  if(!colour){item.visual={...base,name:product.name,lookupIssue:'portwest_colour_not_found',availableColours:product.colours.map(c=>c.name)};continue;}
  item.requestedName ||= item.name;
  item.code=product.code;item.name=product.name;item.colour=colour.name;item.supplier='portwest';
  item.visual={...base,matched:true,name:product.name,styleCode:product.code,colour:colour.name,colourCode:colour.code,productUrl:colour.sourceUrl,views:colour.images.map(({view,url})=>({view,url}))};
 }
}
module.exports={findPortwestProduct,searchPortwestProducts,enrichPortwestProducts,isPortwestCatalogueImage};
