const sharp=require('sharp');
const engine=require('./digitisingStudio');
const {interpret}=require('./digitisingInterpretation');
const {sourceSize}=require('./digitisingSize');
const {column,branchedColumns}=require('./digitisingColumns');
const {sameThreadColour}=require('./digitisingPalette');

// Remove only near-white pixels connected to the image edge; enclosed white artwork stays.
async function removeBackground(png){
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Transparency already identifies the background; white pixels are artwork.
  for(let p=3;p<data.length;p+=4)if(data[p]<128)return png;
  const {width:w,height:h}=info,seen=new Uint8Array(w*h),queue=[];
  const add=k=>{if(seen[k])return;seen[k]=1;const p=k*4;if(data[p+3]<128||Math.min(data[p],data[p+1],data[p+2])>235)queue.push(k);};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  for(let q=0;q<queue.length;q++){const k=queue[q],x=k%w,y=Math.floor(k/w);data[k*4+3]=0;if(x)add(k-1);if(x<w-1)add(k+1);if(y)add(k-w);if(y<h-1)add(k+w);}
  return sharp(data,{raw:info}).png().toBuffer();
}
function sectionPlan(regions,sectionCount){
  const sections={},planningWarnings=[];
  for(const region of regions.filter(r=>r.include&&r.sections.length)){
    const extra=region.sections.length-1;
    if(sectionCount+extra>128){planningWarnings.push(`region-${region.id}: model section guides exceed the section budget; source geometry retained for automatic construction.`);continue;}
    sections[region.id]=region.sections.map(g=>[[g.startX,g.startY],[g.endX,g.endY]]);sectionCount+=extra;
  }
  return {sections,planningWarnings};
}
async function plan(input,body={},options={}){
  const garment=body.garment||'tshirt';
  if(!engine.PRESETS[garment])throw Error('Choose a garment.');
  if(garment==='cap')throw Error('Cap digitising is not available yet.');
  const source=await engine.artwork(input,{maxSide:2000});
  const size=await sourceSize(input);
  const png=await removeBackground(source);
  const config=engine.settings({garment,border:String(body.border)==='true'?'true':'false',widthMm:100,hoopMm:360,spacing:engine.PRESETS[garment].spacing,length:3.8,colours:8,removeWhite:'false'});
  config.sourceAspect=size.aspect;
  config.preserveWhiteArtwork=png===source; // Existing alpha already defines negative space.
  config.hoopMm=Math.max(360,Math.ceil(100*size.aspect+10));
  config.whiteMatte=true;
  // Dense coverage is a server policy; never accept customer density overrides.
  config.satinSpacing={tshirt:.34,hoodie:.32,woven:.36}[garment];
  config.coverageMargin={tshirt:.15,hoodie:.2,woven:.1}[garment];
  config.pullCompensation={tshirt:.10,hoodie:.15,woven:.08}[garment];
  const raw=await sharp(png).ensureAlpha().raw().toBuffer(),counts=new Map();let visible=0;
  for(let p=0;p<raw.length;p+=4)if(raw[p+3]>=128){const key=[raw[p],raw[p+1],raw[p+2]].join(',');counts.set(key,(counts.get(key)||0)+1);visible++;}
  const dominant=[];
  for(const [key,count] of [...counts].sort((a,b)=>b[1]-a[1])){if(count<visible*.005)break;const colour=key.split(',').map(Number);if(!dominant.some(c=>sameThreadColour(c,colour)))dominant.push(colour);if(dominant.length===8)break;}
  if((counts.get('255,255,255')||0)>0&&!dominant.some(c=>Math.min(...c)>235)&&dominant.length<8)dominant.push([255,255,255]);
  config.colours=Math.max(1,dominant.length);
  config.palette=dominant.map(c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join(''));
  if(!config.palette.length)delete config.palette;
  let prepared=await engine.prepare(png,config);
  let interpretation=null;
  if(options.interpret){
    interpretation=await interpret(png,prepared,options);
    for(const region of interpretation.regions){if(!region.include)config.elementOptions[region.id]={type:'skip',order:region.id};else config.elementColours[region.id]=region.colour;}
    Object.assign(config,sectionPlan(interpretation.regions,prepared.elements.length));
    prepared=await engine.prepare(png,config);
  }
  const aspect=size.aspect;
  const dimension=(value,name)=>{if(value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error(`${name} must be greater than zero.`);return n;};
  const width=dimension(body.widthMm,'Width'),height=dimension(body.heightMm,'Height');
  if(width&&height&&Math.abs(width*aspect-height)>.25)throw Error('Width and height must preserve the artwork proportions.');
  config.widthMm=width||(height?height/aspect:Math.min(300,size.widthMm));
  if(config.widthMm>300)throw Error('Width must be no more than 300 mm.');
  // The automatic hoop must contain the sewn result, not just the source canvas.
  // Reserve 1 mm per edge for satin compensation (up to 0.3 mm), contour
  // placement and 0.1 mm DST quantisation, in addition to the 5 mm clearance.
  // Keep the independent output-bounds check so excessive expansion still fails.
  config.hoopMm=Math.max(150,Math.ceil(Math.max(config.widthMm,config.widthMm*aspect)+12));
  config.autoSections=true;
  config.fillAngle=35;
  prepared=await engine.prepare(png,config);
  if(config.border&&body.outlineColour!==undefined&&!/^#[0-9a-f]{6}$/i.test(body.outlineColour))throw Error('Choose an outline colour.');
  config.garmentColour=body.outlineColour||'#000000';
  const ordered=prepared.elements.filter(el=>config.elementOptions[el.sourceId??el.id]?.type!=='skip');
  // Sew spatial bands in order, permitting a return to a thread colour. A shared
  // colour above and below a large object is not necessarily one sewing block.
  const bands=[];
  for(const el of ordered.filter(e=>e.pixels*prepared.scale**2>=.3).sort((a,b)=>a.y+a.height/2-b.y-b.height/2)){
    const cy=el.y+el.height/2;
    const band=bands.find(b=>Math.abs(cy-b.cy)<Math.min(el.height,b.height)*.6);
    if(band){band.items.push(el);band.cy=band.items.reduce((n,e)=>n+e.y+e.height/2,0)/band.items.length;band.height=Math.min(band.height,el.height);}
    else bands.push({cy,height:el.height,items:[el]});
  }
  for(const el of ordered.filter(e=>e.pixels*prepared.scale**2<.3)){
    const same=bands.filter(b=>b.items.some(e=>e.colour===el.colour));
    const band=(same.length?same:bands).slice().sort((a,b)=>Math.abs(a.cy-el.y-el.height/2)-Math.abs(b.cy-el.y-el.height/2))[0];
    if(band)band.items.push(el);else bands.push({cy:el.y+el.height/2,height:el.height,items:[el]});
  }
  const sequence=bands.sort((a,b)=>a.cy-b.cy).flatMap(b=>b.items.sort((a,b)=>a.x-b.x));
  sequence.forEach((el,order)=>{config.elementOptions[el.id]={order,type:el.guide?'fill':column(prepared.ids,prepared.info.width,el,prepared.scale,config.satinSpacing)?'satin':branchedColumns(prepared.ids,prepared.info.width,el,prepared.scale,config.satinSpacing)?'satin-branches':'fill'};});
  return {png,config,interpretation,preview:source};
}
module.exports={plan,removeBackground,sectionPlan};
