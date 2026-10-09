const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { placementProfile, garmentSizeProfile } = require('./proofPlacementProfiles');

// Remove only edge-connected white background. Interior white marks are retained.
// The original upload is never changed; callers may explicitly keep its background.
function visibleBounds(data, width, height, mode = 'auto') {
  const transparent = data.some((value, index) => index % 4 === 3 && value < 250);
  const removeWhite = mode === 'white' || (mode === 'auto' && !transparent);
  let removedWhite = false;
  if (removeWhite) {
    const queue = new Int32Array(width * height);
    const seen = new Uint8Array(width * height);
    let head=0, tail=0;
    const add = i => {
      if (i < 0 || i >= width*height || seen[i]) return;
      const o=i*4;
      if (data[o+3] > 0 && Math.min(data[o],data[o+1],data[o+2]) < 250) return;
      seen[i]=1; queue[tail++]=i;
    };
    for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
    for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
    while(head<tail){
      const i=queue[head++], x=i%width;
      if(data[i*4+3]) removedWhite=true;
      data[i*4+3]=0;
      if(x>0)add(i-1);if(x<width-1)add(i+1);add(i-width);add(i+width);
    }
  }
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left) throw new Error('Artwork has no visible marks. For white artwork, upload transparency or select Keep background.');
  return {left,top,width:right-left+1,height:bottom-top+1,removedWhite};
}

let pdfRenderer;
async function rasterPdf(bytes) {
  if (!pdfRenderer) pdfRenderer = import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfRenderer;
  const { createCanvas } = require('@napi-rs/canvas');
  const task = pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});
  const doc = await task.promise;
  try {
    if(doc.numPages!==1) throw new Error('Upload one artwork per PDF page. Multi-page artwork must be split before upload.');
    const page=await doc.getPage(1);
    // Render upright unrotated page coordinates so pdf-lib can embed the original vectors.
    const base=page.getViewport({scale:1,rotation:0});
    const viewport=page.getViewport({scale:Math.min(3,1600/Math.max(base.width,base.height)),rotation:0});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const ctx=canvas.getContext('2d');
    await page.render({canvasContext:ctx,viewport,background:'rgba(0,0,0,0)'}).promise;
    return {data:Buffer.from(ctx.getImageData(0,0,canvas.width,canvas.height).data),width:canvas.width,height:canvas.height,view:page.view,rotation:page.rotate};
  } finally { await doc.destroy(); }
}

async function prepareArtwork(pdf, artwork) {
  const bytes=artwork.file.buffer;
  const isPdf=bytes.subarray(0,4).toString()==='%PDF';
  let rendered;
  if(isPdf) rendered=await rasterPdf(bytes);
  else {
    const {data,info}=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
    rendered={data,width:info.width,height:info.height};
  }
  const mode=artwork.backgroundMode || 'auto';
  if(!['auto','keep','white'].includes(mode))throw new Error('Invalid artwork background mode.');
  const bounds=visibleBounds(rendered.data,rendered.width,rendered.height,mode);
  const cropped=await sharp(rendered.data,{raw:{width:rendered.width,height:rendered.height,channels:4}}).extract({left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}).png().toBuffer();
  const preview=await sharp(cropped).resize({width:500,height:500,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const warnings=[];
  if(bounds.removedWhite) warnings.push('White edge background removed. Select Keep background if this is intentional artwork.');
  let asset;
  if(isPdf && !bounds.removedWhite && !rendered.rotation) {
    const source=await PDFDocument.load(bytes);
    const [x0,y0,x1,y1]=rendered.view;
    const sx=(x1-x0)/rendered.width, sy=(y1-y0)/rendered.height;
    const crop={left:x0+bounds.left*sx,right:x0+(bounds.left+bounds.width)*sx,top:y1-bounds.top*sy,bottom:y1-(bounds.top+bounds.height)*sy};
    const image=await pdf.embedPage(source.getPage(0),crop);
    asset={kind:'page',image,width:image.width,height:image.height};
  } else {
    // Background removal and rotated PDF pages need a transparent proof composite.
    // Original bytes remain untouched; no production artwork is exported here.
    let png=cropped;
    if(isPdf && rendered.rotation) png=await sharp(cropped).rotate(rendered.rotation).png().toBuffer();
    const image=await pdf.embedPng(png);
    asset={kind:'image',image,width:image.width,height:image.height};
    if(isPdf) warnings.push('PDF proof preview is rasterised; retain the uploaded PDF for production.');
  }
  const previewBytes=isPdf && rendered.rotation ? await sharp(preview).rotate(rendered.rotation).png().toBuffer() : preview;
  return {...asset,preview:`data:image/png;base64,${previewBytes.toString('base64')}`,warnings,bounds};
}

async function analyseGarment(bytes) {
  const {data,info}=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:700,height:850,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const hasTransparency=data.some((value,index)=>index%4===3 && value<250);
  let bounds, confident=true;
  try { bounds=visibleBounds(data,info.width,info.height,hasTransparency?'keep':'white'); }
  catch (_) { bounds={left:0,top:0,width:info.width,height:info.height};confident=false; }
  const crop=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract({left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const mask=new Uint8Array(crop.info.width*crop.info.height);
  for(let i=0;i<mask.length;i++)mask[i]=crop.data[i*4+3]>80?1:0;
  const density=mask.reduce((a,b)=>a+b,0)/mask.length;
  if(density>.98 || density<.08)confident=false;
  const png=await sharp(crop.data,{raw:{width:crop.info.width,height:crop.info.height,channels:4}}).png().toBuffer();
  return {bytes:png,width:crop.info.width,height:crop.info.height,mask,confident,bounds};
}

function coverage(garment,p) {
  let hits=0,total=0;
  for(let iy=0;iy<12;iy++)for(let ix=0;ix<12;ix++){
    const x=Math.floor((p.x-p.width/2+p.width*(ix+.5)/12)*garment.width);
    const y=Math.floor((p.y+p.height*(iy+.5)/12)*garment.height);
    if(x>=0&&y>=0&&x<garment.width&&y<garment.height)hits+=garment.mask[y*garment.width+x];
    total++;
  }
  return hits/total;
}

function fitSleeve(garment,p) {
  if(p.explicit || p.calibrated || !garment.confident)return p;
  // On a side view the sleeve occupies the trailing portion of the silhouette,
  // not the centre of the entire sleeve-plus-torso image. Keep the chosen height.
  let centre=p.x;
  if(['left','right'].includes(garment.view)) {
    const y=Math.max(0,Math.min(garment.height-1,Math.round((p.y+p.height/2)*garment.height)));
    const xs=[];for(let x=0;x<garment.width;x++)if(garment.mask[y*garment.width+x])xs.push(x);
    const across=garment.placementProfile?.sideSleeveAcross ?? .42;
    if(xs.length)centre=(xs[0]+(xs.at(-1)-xs[0])*(garment.view==='right'?across:1-across))/garment.width;
  }
  let best={...p},score=-Infinity;
  for(let dx=-.08;dx<=.0801;dx+=.005){
    const candidate={...p,x:centre+dx};const r=p.region;
    if(candidate.x-p.width/2<r.left || candidate.x+p.width/2>r.left+r.width || candidate.y<r.top || candidate.y+p.height>r.top+r.height)continue;
    const next=coverage(garment,candidate)-Math.abs(dx)*.3;
    if(next>score){score=next;best=candidate;}
  }
  return best;
}

function automaticGarmentProfile(product, garment, view, referenceGarment) {
  const profile=placementProfile(product);
  const hood=['hoodie','hoodedOuterwear'].includes(profile.family), outer=['outerwear','hoodedOuterwear'].includes(profile.family);
  const sizing=garmentSizeProfile(product);
  // Representative flat body widths, not supplier-confirmed measurements.
  const torsoMm=(outer?600:550)*sizing.garmentScale;
  const rows=[];
  for(let y=Math.floor(garment.height*.5);y<garment.height*.66;y+=Math.max(1,Math.floor(garment.height*.025))){
    const runs=[];let start=-1;
    for(let x=0;x<=garment.width;x++){
      const on=x<garment.width&&garment.mask[y*garment.width+x];
      if(on&&start<0)start=x;
      if(!on&&start>=0){runs.push({start,end:x});start=-1;}
    }
    const central=runs.find(r=>r.start<=garment.width*.5&&r.end>=garment.width*.5);
    if(central)rows.push(central.end-central.start);
  }
  rows.sort((a,b)=>a-b);
  const torsoPx=rows[Math.floor(rows.length/2)];
  // Side views use an explicit estimate; a torso width cannot calibrate depth.
  let estimatedPxPerMm=garment.confident&&torsoPx&&['front','back'].includes(view)?torsoPx/torsoMm:garment.width/(700*sizing.garmentScale);
  // Full-length views depict the same physical garment height. Transfer the
  // front estimate by height; a side silhouette's width represents depth.
  if(['left','right'].includes(view)&&garment.confident&&referenceGarment?.confident&&referenceGarment.height>0&&referenceGarment.estimatedPxPerMm>0){
    estimatedPxPerMm=referenceGarment.estimatedPxPerMm*garment.height/referenceGarment.height;
  }
  let collarY = hood ? 0.22 : outer ? 0.14 : 0.09;
  if(!hood&&garment.confident&&['front','back'].includes(view)){
    for(let y=0;y<garment.height*.2;y++){
      if(garment.mask[y*garment.width+Math.floor(garment.width*.5)]){collarY=y/garment.height;break;}
    }
  }
  return {estimatedPxPerMm,estimatedTorsoMm:torsoMm,...sizing,placementProfile:profile,landmarks:{neckRight:{x:profile.neckRight,y:collarY},collar:{x:.5,y:collarY},hem:{x:.5,y:.97}}};
}
module.exports={visibleBounds,rasterPdf,prepareArtwork,analyseGarment,coverage,fitSleeve,automaticGarmentProfile};
