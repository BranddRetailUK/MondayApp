const {createHash}=require('crypto');
const {positionOptions,positionName,dimension,textClauses,artworkPageRequest}=require('./proofLayout');
const refs=text=>[...String(text||'').matchAll(/\bPSG\s*[-_]?\s*(\d+)(?!\d)/gi)].map(m=>`PSG${m[1]}`);
const positive=value=>{try{return dimension(value)>0;}catch{return false;}};

// A simple one-page-per-file brief must account for every uploaded logo once.
function checkArtworkPages(brief,artworks,request) {
  const intent=artworkPageRequest(request),products=brief.products||[];
  if(!intent || !products.length || !artworks.length || artworks.some(a=>/\.(ttf|otf)$/i.test(a.originalName)))return null;
  const first=products[0];
  if(products.some(p=>p.code!==first.code || p.colour!==first.colour || p.personalisation))return null;
  if(intent.count!==null && intent.count!==artworks.length)return `The request specifies ${intent.count} versions for ${artworks.length} artwork files. Check the version count and uploads.`;
  const marks=products.flatMap(p=>p.decorations||[]);
  if(marks.some(d=>d.text || !d.artworkId) || new Set(marks.map(d=>positionName(d.position))).size>1)return null;
  const ids=new Set(marks.map(d=>d.artworkId));
  if(products.length!==artworks.length || products.some(p=>p.decorations?.length!==1) || !artworks.every(a=>ids.has(a.id))){
    return 'The brief does not assign one proof page to each supplied artwork. List each version with its artwork filename in the request and check again.';
  }
  return null;
}

// Read-only checks: never repair a brief by guessing or replace supplied artwork.
function assess(brief,artworks=[],request='') {
  const issues=[];
  const add=(path,message,options)=>issues.push({path,message,...(options?{options}:{})});
  const ack=(path,message,evidence)=>{
    const key=createHash('sha256').update(JSON.stringify([path,evidence])).digest('hex');
    if(!brief.preflightAcknowledgements?.includes(key))issues.push({path,message,ack:key});
  };
  if(!brief.products?.length)add('products','Add at least one garment to the request.');
  const pageIssue=checkArtworkPages(brief,artworks,request);
  if(pageIssue)add('products',pageIssue);
  (brief.products||[]).forEach((p,pi)=>{
    const base=`products.${pi}`,label=p.code||`Garment ${pi+1}`;
    if(!p.code)add(`${base}.code`,`${label}: enter the supplier product code.`);
    if(!p.colour||p.visual?.matched===false)add(`${base}.colour`,`${label}: select the exact catalogue colour${p.visual?.lookupIssue?' ('+p.visual.lookupIssue.replaceAll('_',' ')+')':''}.`,p.visual?.availableColours);
    if(!p.decorations?.length)add(base,`${label}: add decoration details to the request.`);
    const headwearIssues=require('./proofHeadwearViews').headwearIssues(p,p.decorations||[]);
    for(const issue of headwearIssues)add(issue.path?base+'.'+issue.path:base,issue.message,issue.options);
    (p.decorations||[]).forEach((d,di)=>{
      const path=`${base}.decorations.${di}`,name=`${label} · ${d.position||'decoration '+(di+1)}`;
      const options=positionOptions(p), allowed=options.map(option=>typeof option==='string'?option:option.value);
      const legacyShortsHem=typeof options[0]==='object' && ['left hem','right hem'].includes(positionName(d.position));
      if(!allowed.includes(positionName(d.position))&&!legacyShortsHem&&!headwearIssues.some(issue=>issue.path===`decorations.${di}.position`))add(`${path}.position`,`${name}: select the position as worn.`,options);
      if(!d.method)add(`${path}.method`,`${name}: specify the decoration method.`,['embroidery','transfer print']);
      const sizeValid=positive(d.widthMm)||positive(d.heightMm);
      if((!sizeValid&&d.sizeTbc!==true)|| (d.widthMm&&!positive(d.widthMm)) || (d.heightMm&&!positive(d.heightMm)) || d.dimensionIssues?.length)add(`${path}.widthMm`,`${name}: confirm artwork width or height in mm; one axis is sufficient.`);
      const asset=artworks.find(a=>a.id===d.artworkId&&!/\.(ttf|otf)$/i.test(a.originalName));
      if(!asset&&!d.text)add(`${path}.artworkId`,`${name}: choose the supplied artwork.`,artworks.filter(a=>! /\.(ttf|otf)$/i.test(a.originalName)).map(a=>({value:a.id,label:a.originalName})));
      if(!asset&&d.text){
        if(!artworks.some(a=>a.id===d.fontArtworkId&&/\.(ttf|otf)$/i.test(a.originalName)))add(`${path}.fontArtworkId`,`${name}: choose the uploaded name font.`,artworks.filter(a=>/\.(ttf|otf)$/i.test(a.originalName)).map(a=>({value:a.id,label:a.originalName})));
        if(!/^#[a-f\d]{6}$/i.test(d.textColour||''))add(`${path}.textColour`,`${name}: enter the name print colour as #RRGGBB.`);
      }
      if(asset){
        const clauses=textClauses(request).filter(c=>c.toLowerCase().includes(d.position));
        const expected=[...new Set(refs([d.artwork,d.notes,...clauses].join(' ')))],actual=refs(asset.originalName);
        if(expected.length&&actual.length&&!expected.some(r=>actual.includes(r)))ack(path,`${name}: request references ${expected.join(', ')} but selected file is ${asset.originalName}. Replace it or explicitly confirm this substitution.`,[expected,asset.id,asset.digest,asset.originalName]);
        if(asset.blank)add(`${path}.artworkId`,`${name}: selected artwork has no visible pixels; replace it.`,artworks.filter(a=>!a.blank).map(a=>({value:a.id,label:a.originalName})));
        if(asset.lowResolution||asset.opaqueLightBackground)ack(path,`${name}: ${asset.originalName} has ${[asset.lowResolution?'a low-resolution preview':'',asset.opaqueLightBackground?'an opaque light background':''].filter(Boolean).join(' and ')}. Upload a better transparent preview, or confirm use of this file.`,[asset.digest,asset.id,asset.lowResolution,asset.opaqueLightBackground]);
      }
    });
  });
  for(const a of artworks){
    if(a.error)add(`artworks.${a.id}`,`${a.originalName}: ${a.error}`);
    if(/\.dst$/i.test(a.originalName)&&(!a.threadColours?.length||a.threadColours.some(c=>!/^#[a-f\d]{6}$/i.test(c))))add(`artworks.${a.id}`,`${a.originalName}: select every DST thread colour in the artwork card. Colours are not stored in DST.`);
  }
  return {issues,ready:issues.length===0};
}
async function inspect(file,details){
  const result={...details,digest:createHash('sha256').update(file.buffer).digest('hex')};
  if(/\.(ttf|otf)$/i.test(file.originalname))return result;
  if(/\.pdf$/i.test(file.originalname)){
    const pdf=await require('pdf-lib').PDFDocument.create();
    const asset=await require('./proofArtwork').prepareArtwork(pdf,{file,backgroundMode:details.backgroundMode||'auto'});
    const inspected=await inspect({originalname:'preview.png',buffer:Buffer.from(asset.preview.split(',')[1],'base64')},details);
    return {...inspected,digest:result.digest};
  }
  const sharp=require('sharp');
  const metadata=await sharp(file.buffer,{limitInputPixels:40_000_000}).metadata();
  const {data,info}=await sharp(file.buffer,{limitInputPixels:40_000_000}).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(details.backgroundMode==='white')require('./proofArtwork').visibleBounds(data,info.width,info.height,'white');
  let visible=0,light=0;
  for(let i=0;i<data.length;i+=info.channels){if(data[i+info.channels-1]>8)visible++;if(data[i]>240&&data[i+1]>240&&data[i+2]>240&&data[i+info.channels-1]>250)light++;}
  result.blank=visible===0;
  result.lowResolution=/\.pxf$/i.test(details.originalName)&&Math.max(metadata.width,metadata.height)<512;
  // Large white margins are suspicious for embedded thumbnails; white transparent logos are valid.
  result.opaqueLightBackground=/\.pxf$/i.test(details.originalName)&&light/(info.width*info.height)>.35&&visible===info.width*info.height;
  return result;
}
module.exports={assess,inspect};
