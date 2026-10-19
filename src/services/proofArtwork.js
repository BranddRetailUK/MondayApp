const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { placementProfile, garmentSizeProfile } = require('./proofPlacementProfiles');
// Shared visual reference for unmeasured images (29140 screenshot and the
// user's 100 mm sleeve-width cue). Never applies to supplied measurements.
const UNMEASURED_REFERENCE_SCALE = 1.55;

// Auto crops rectangular white margins without erasing white inside the artwork.
// Only explicit white mode flood-fills edge-connected white (also used for garments).
// The original upload is never changed; callers may explicitly keep its background.
function visibleBounds(data, width, height, mode = 'auto') {
  const transparent = data.some((value, index) => index % 4 === 3 && value < 250);
  if(mode==='auto' && !transparent){
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(Math.min(data[i],data[i+1],data[i+2])<250){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    }
    // An opaque all-white design is artwork too; keep its full rectangle.
    if(right<left)return {left:0,top:0,width,height,removedWhite:false};
    return {left,top,width:right-left+1,height:bottom-top+1,removedWhite:false};
  }
  const removeWhite = mode === 'white';
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
  const standardFontDataUrl=require('path').join(require('path').dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts/');
  const task = pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,standardFontDataUrl});
  const doc = await task.promise;
  try {
    if(doc.numPages!==1) throw new Error('Upload one artwork per PDF page. Multi-page artwork must be split before upload.');
    const page=await doc.getPage(1);
    // Render upright unrotated page coordinates so pdf-lib can embed the original vectors.
    const base=page.getViewport({scale:1,rotation:0});
    const source=await PDFDocument.load(bytes);
    const media=source.getPage(0).getMediaBox();
    const [left,bottom,right,top]=page.view;
    const cropped=left!==0 || bottom!==0 || left!==media.x || bottom!==media.y
      || right!==media.x+media.width || top!==media.y+media.height;
    // PDF text extraction ignores clipping inconsistently between readers.
    // Render cropped pages so old off-artboard labels cannot
    // leak into a repeat proof. Ordinary PDF artwork still retains vectors.
    const viewport=page.getViewport({scale:cropped ? 1600/Math.max(base.width,base.height) : Math.min(3,1600/Math.max(base.width,base.height)),rotation:0});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const ctx=canvas.getContext('2d');
    await page.render({canvasContext:ctx,viewport,background:'rgba(0,0,0,0)'}).promise;
    const data=Buffer.from(ctx.getImageData(0,0,canvas.width,canvas.height).data);
    return {data,width:canvas.width,height:canvas.height,view:page.view,rotation:page.rotate,clippedPage:cropped};
  } finally { await doc.destroy(); }
}

async function prepareArtwork(pdf, artwork, {embroideryFinish=false} = {}) {
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
  let visible=0,light=0;
  for(let i=0;i<rendered.data.length;i+=4)if(rendered.data[i+3]>80){visible++;if(Math.min(...rendered.data.subarray(i,i+3))>190)light++;}
  const needsContrast=visible>0 && light/visible>.03;
  let cropped=await sharp(rendered.data,{raw:{width:rendered.width,height:rendered.height,channels:4}}).extract({left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}).png().toBuffer();
  if(embroideryFinish&&!isPdf)cropped=await require('./proofEmbroideryFinish').finishEmbroidery(cropped);
  const preview=await sharp(cropped).resize({width:500,height:500,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const warnings=[];
  if(bounds.removedWhite) warnings.push('White edge background removed. Select Keep background if this is intentional artwork.');
  let asset;
  if(isPdf && !bounds.removedWhite && !rendered.rotation && !rendered.clippedPage) {
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
    if(rendered.clippedPage) warnings.push('Cropped PDF artwork uses a rendered preview to exclude hidden source text; the original artwork is unchanged.');
  }
  const previewBytes=isPdf && rendered.rotation ? await sharp(preview).rotate(rendered.rotation).png().toBuffer() : preview;
  return {...asset,needsContrast,preview:`data:image/png;base64,${previewBytes.toString('base64')}`,warnings,bounds};
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
  const channels=[[],[],[]];
  for(let i=0;i<mask.length;i+=7)if(mask[i])for(let c=0;c<3;c++)channels[c].push(crop.data[i*4+c]);
  const colour=channels.map(values=>{values.sort((a,b)=>a-b);return (values[Math.floor(values.length/2)] ?? 128)/255;});
  // Dark garments can enclose white background between sleeve and body. The
  // outer-edge flood fill cannot reach those holes. Exclude them from torso
  // measurement only; preserve image pixels and the historical mask.
  const torsoMask=mask.slice();
  if(Math.max(...colour)<.75)for(let i=0;i<torsoMask.length;i++){
    if(Math.min(crop.data[i*4],crop.data[i*4+1],crop.data[i*4+2])>=245)torsoMask[i]=0;
  }
  return {colour,torsoMask,bytes:png,width:crop.info.width,height:crop.info.height,mask,confident,bounds};
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
  if(profile.family==='headwear'){
    const template=garment.headwearTemplate;
    const pxPerMm=garment.width/(template?.flatWidthMm || 200);
    return {placementProfile:profile,headwear:true,headwearRegion:template?.region,estimatedPxPerMm:pxPerMm,unrefinedPxPerMm:pxPerMm,referencePxPerMm:pxPerMm,legacyPxPerMm:pxPerMm,scaleSource:template?.builtin?'accepted-headwear-reference':'estimated-headwear-width',estimatedFlatWidthMm:template?.flatWidthMm || 200,landmarks:{}};
  }
  const hood=['hoodie','hoodedOuterwear'].includes(profile.family), outer=['outerwear','hoodedOuterwear'].includes(profile.family);
  const sizing=garmentSizeProfile(product);
  // Representative flat body widths, not supplier-confirmed measurements.
  const supplied=product.measurements?.flatChestWidthMm;
  const measured=supplied!==undefined && supplied!==null && supplied!=='';
  const torsoMm=measured ? Number(supplied) : 550*sizing.garmentScale;
  if(!Number.isFinite(torsoMm) || torsoMm<150 || torsoMm>1500)throw new Error('Flat chest width must be between 150 and 1500 mm.');
  const measureTorso=mask=>{
  const rows=[],centres=[];
  for(let y=Math.floor(garment.height*.5);y<garment.height*.66;y+=Math.max(1,Math.floor(garment.height*.025))){
    const runs=[];let start=-1;
    for(let x=0;x<=garment.width;x++){
      const on=x<garment.width&&mask[y*garment.width+x];
      if(on&&start<0)start=x;
      if(!on&&start>=0){runs.push({start,end:x});start=-1;}
    }
    const central=runs.find(r=>r.start<=garment.width*.5&&r.end>=garment.width*.5);
    if(central){rows.push(central.end-central.start);centres.push((central.start+central.end)/2);}
  }
  rows.sort((a,b)=>a-b);
  const torsoPx=rows[Math.floor(rows.length/2)];
  centres.sort((a,b)=>a-b);
  const torsoCentre=centres[Math.floor(centres.length/2)];
  return {torsoPx,torsoCentre};
  };
  const {torsoPx,torsoCentre}=measureTorso(garment.torsoMask || garment.mask);
  const legacyTorsoPx=measureTorso(garment.mask).torsoPx;
  const torsoRegion=garment.confident && torsoPx && ['front','back'].includes(view) ? {
    left:(torsoCentre-torsoPx*.45)/garment.width,width:torsoPx*.9/garment.width
  } : undefined;
  // A compact silhouette exposes the chest panel edges without projecting sleeves.
  const exposedPanels=torsoPx/garment.width>.85;
  const breastFraction=!measured && view==='front' && profile.breastPanelFraction != null
    ? profile.breastPanelFraction : exposedPanels ? .25 : .15;
  const chestPanels=exposedPanels && garment.confident && view==='front' ? {
    'left breast':{left:(torsoCentre+torsoPx*.02)/garment.width,width:torsoPx*.46/garment.width},
    'right breast':{left:(torsoCentre-torsoPx*.48)/garment.width,width:torsoPx*.46/garment.width}
  } : undefined;
  const breastAnchors=garment.confident && torsoPx && ['front','back'].includes(view) ? {
    leftBreast:{x:(torsoCentre+torsoPx*breastFraction)/garment.width},
    rightBreast:{x:(torsoCentre-torsoPx*breastFraction)/garment.width}
  } : {};
  // Historical manual placements had no scale snapshot. Preserve their old
  // conversion only during migration; new automatic proofs never use it.
  let legacyPxPerMm=garment.confident&&legacyTorsoPx&&['front','back'].includes(view)?legacyTorsoPx/((outer?600:550)*sizing.garmentScale):garment.width/(700*sizing.garmentScale);
  let scaleSource=measured && garment.confident && torsoPx && ['front','back'].includes(view) ? 'flat-chest-measurement' : 'estimated';
  // Side views use an explicit estimate; a torso width cannot calibrate depth.
  let estimatedPxPerMm=garment.confident&&torsoPx&&['front','back'].includes(view)?torsoPx/torsoMm:garment.width/(700*sizing.garmentScale);
  let unrefinedPxPerMm=estimatedPxPerMm;
  let referencePxPerMm=estimatedPxPerMm*(scaleSource==='estimated'?UNMEASURED_REFERENCE_SCALE:1);
  if(scaleSource==='estimated'){
    // Shared height guard prevents unusually broad silhouettes inflating the
    // width-only estimate. Confirmed tee/hoodie ratios remain below this limit.
    if(garment.confident && torsoPx && ['front','back'].includes(view))estimatedPxPerMm=Math.min(torsoPx,garment.height*.46)/torsoMm;
    estimatedPxPerMm*=UNMEASURED_REFERENCE_SCALE;
  }
  // Full-length views depict the same physical garment height. Transfer the
  // front estimate by height; a side silhouette's width represents depth.
  if(['left','right'].includes(view)&&garment.confident&&referenceGarment?.confident&&referenceGarment.height>0&&referenceGarment.estimatedPxPerMm>0){
    estimatedPxPerMm=referenceGarment.estimatedPxPerMm*garment.height/referenceGarment.height;
    unrefinedPxPerMm=(referenceGarment.unrefinedPxPerMm || referenceGarment.estimatedPxPerMm)*garment.height/referenceGarment.height;
    referencePxPerMm=(referenceGarment.referencePxPerMm || referenceGarment.estimatedPxPerMm)*garment.height/referenceGarment.height;
    legacyPxPerMm=(referenceGarment.legacyPxPerMm || referenceGarment.estimatedPxPerMm)*garment.height/referenceGarment.height;
    // Transferring scale to a generated/different angle remains an estimate.
    scaleSource='front-height-estimate';
  }
  let collarY = hood ? 0.22 : outer ? 0.14 : 0.09;
  if(!hood&&garment.confident&&['front','back'].includes(view)){
    for(let y=0;y<garment.height*.2;y++){
      if(garment.mask[y*garment.width+Math.floor(garment.width*.5)]){collarY=y/garment.height;break;}
    }
  }
  return {torsoRegion,chestPanels,referencePxPerMm,estimatedPxPerMm,unrefinedPxPerMm,legacyPxPerMm,scaleSource,estimatedTorsoMm:torsoMm,...sizing,placementProfile:profile,landmarks:{...breastAnchors,neckRight:{x:profile.neckRight,y:collarY},collar:{x:.5,y:collarY},hem:{x:.5,y:.97}}};
}
module.exports={visibleBounds,rasterPdf,prepareArtwork,analyseGarment,coverage,fitSleeve,automaticGarmentProfile};
