const {analyseGarment} = require('./proofArtwork');
const {placementProfile} = require('./proofPlacementProfiles');

// Conservative geometry checks, not a physical measurement or a certification
// of garment construction. Side views deliberately have asymmetric silhouettes.
async function assessPlacementImage(bytes, product, view) {
  const profile = placementProfile(product);
  if (!['front','back'].includes(view) || ['headwear','shorts'].includes(profile.family)) return {suitable:true};
  const garment = await analyseGarment(bytes);
  if (!garment.confident) return {suitable:false,reason:'The garment outline cannot be isolated reliably.'};
  const {width,height,mask} = garment;
  const rows = [];
  for (let y=Math.floor(height*.50); y<height*.80; y+=Math.max(1,Math.floor(height*.025))) {
    const xs=[];
    for(let x=0;x<width;x++)if(mask[y*width+x])xs.push(x);
    if(!xs.length || !mask[y*width+Math.floor(width/2)])continue;
    const left=xs[0],right=xs.at(-1);
    rows.push({span:right-left+1,centre:(left+right)/2});
  }
  if(rows.length<10)return {suitable:false,reason:'The torso is obscured or separated in this view.'};
  const spans=rows.map(r=>r.span).sort((a,b)=>a-b), median=spans[Math.floor(spans.length/2)];
  const centres=rows.map(r=>r.centre);
  const drift=(Math.max(...centres)-Math.min(...centres))/median;
  const taper=(spans.at(-1)-spans[0])/median;
  let different=0,total=0;
  const centre=centres.reduce((a,b)=>a+b,0)/centres.length;
  for(let y=Math.floor(height*.15);y<height*.80;y+=3)for(let dx=0;dx<median*.6;dx+=3){
    const l=Math.round(centre-dx),r=Math.round(centre+dx);
    const a=l>=0&&l<width?mask[y*width+l]:0,b=r>=0&&r<width?mask[y*width+r]:0;
    if(a||b){total++;if(a!==b)different++;}
  }
  if(drift>.08 || taper>.35 || different/Math.max(1,total)>.18)
    return {suitable:false,reason:'The torso is skewed, folded or too asymmetric for automatic placement.'};
  // YK102 yellow chest guides must actually contain yellow fabric, not tape,
  // the V opening or background. Shadows may darken fabric without desaturating it.
  if(String(product.code).toUpperCase()==='YK102' && /yellow/i.test(product.colour) && view==='front') {
    const {data}=await require('sharp')(garment.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(const region of Object.values(profile.printableRegions)) {
      let fabric=0,total=0;
      for(let y=Math.ceil(region.top*height);y<(region.top+region.height)*height;y+=2)
        for(let x=Math.ceil(region.left*width);x<(region.left+region.width)*width;x+=2){
          const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
          if(data[i+3]>80 && Math.min(r,g)>45 && b<Math.min(r,g)*.75)fabric++;
          total++;
        }
      if(!total || fabric/total<.97)return {suitable:false,reason:'The YK102 chest guide overlaps reflective tape, an opening or obscured fabric.'};
    }
  }
  return {suitable:true};
}

module.exports={assessPlacementImage};
