const sharp=require('sharp');
const {dimension}=require('./proofLayout');
// A finished composite image is indivisible. Multiple depicted views of the
// same product/colour must not duplicate that image onto multiple sheets.
function normalize(brief){
  if(brief?.uploadMode!=='mockup'||!Array.isArray(brief.products))return brief;
  const groups=new Map(),products=[];
  for(const p of brief.products){
    p.decorations=require('./proofLayout').resolveDecorations(brief,p).map(d=>({...d,method:d.method||p.method||brief.method||''}));
    const ids=[...new Set(p.decorations.map(d=>d.artworkId))];
    const key=ids.length===1&&ids[0]?JSON.stringify([String(p.code||'').trim().toUpperCase(),String(p.colour||'').trim().toLowerCase(),ids[0]]):null;
    const existing=key&&groups.get(key);
    if(!existing){products.push(p);if(key)groups.set(key,p);continue;}
    const signature=d=>JSON.stringify([d.artworkId,d.method||p.method||brief.method||'',d.widthMm||'',d.heightMm||'']);
    for(const d of p.decorations)if(!existing.decorations.some(mark=>signature(mark)===signature(d)))existing.decorations.push({...d,method:d.method||p.method||brief.method||''});
    if(!existing.mockupPlacement&&p.mockupPlacement)existing.mockupPlacement=p.mockupPlacement;
  }
  brief.products=products;brief.sharedDecorations=[];
  return brief;
}
function sizeLabel(d){
  const width=dimension(d.widthMm),height=dimension(d.heightMm);
  if(width&&height)return `${width} x ${height} mm`;
  if(width)return `${width} mm wide`;
  if(height)return `${height} mm high`;
  return 'TBC';
}
function assess(brief,assets){
  const issues=[];
  const add=(path,message,options)=>issues.push({path,message,...(options?{options}:{})});
  if(!brief.products?.length)add('products','Add at least one product.');
  for(const [pi,p] of (brief.products||[]).entries()){
    const base=`products.${pi}`;
    if(!p.code)add(`${base}.code`,'Enter the product code.');
    if(!p.decorations?.length)add(base,'Specify the print type and mock up for this product.');
    const ids=new Set();
    for(const [di,d] of (p.decorations||[]).entries()){
      const path=`${base}.decorations.${di}`;
      if(!d.method&&!p.method&&!brief.method)add(`${path}.method`,'Specify the print type.',['embroidery','transfer print']);
      try{sizeLabel(d);if(d.dimensionIssues?.length)throw Error();}catch{add(`${path}.widthMm`,'Enter a valid print size in mm or leave it blank for TBC.');}
      const asset=assets.find(a=>a.id===d.artworkId);
      if(!asset)add(`${path}.artworkId`,'Choose the finished mock up.',assets.map(a=>({value:a.id,label:a.originalName})));
      else {ids.add(asset.id);if(asset.error||asset.blank||! /\.(png|jpe?g|webp)$/i.test(asset.originalName||asset.file?.originalname||''))add(`${path}.artworkId`,asset.error||'Upload a visible PNG, JPG or WebP mock up.');}
    }
    if(ids.size>1)add(base,'Use one finished mock up per product sheet; add another product sheet for another mock up.');
  }
  return {issues,ready:issues.length===0};
}
async function prepare(pdf,artwork){
  const bytes=await sharp(artwork.file.buffer,{limitInputPixels:40_000_000}).rotate().flatten({background:'#ffffff'}).resize(1600,1600,{fit:'contain',background:'#ffffff'}).png().toBuffer();
  return {kind:'image',image:await pdf.embedPng(bytes),width:1600,height:1600,preview:`data:image/png;base64,${bytes.toString('base64')}`};
}
module.exports={assess,prepare,sizeLabel,normalize};
