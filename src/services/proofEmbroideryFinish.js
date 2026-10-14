const sharp = require('sharp');
const path = require('node:path');
const MATERIAL = path.join(__dirname, '../../assets/proof-generator/embroidery/thread-material-v1.png');
let material;
async function loadMaterial() {
  if (!material) material = sharp(MATERIAL).resize(128,128,{fit:'fill'}).greyscale().raw().toBuffer().then(data=>{
    const mean=data.reduce((sum,n)=>sum+n,0)/data.length;
    return {data,mean,width:128,height:128};
  }).catch(error=>{material=null;throw error;});
  return material;
}
// AI supplies only a versioned neutral material scan. It never receives or
// redraws customer letters. Output dimensions and EVERY alpha byte are copied
// from the original, so counters, spacing, visible bounds and placement survive.
async function finishEmbroidery(bytes) {
  const {data,info}=await sharp(bytes,{limitInputPixels:40_000_000}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const texture=await loadMaterial();
  const output=Buffer.from(data);
  // Smooth only the technical preview's RGB ridges, using alpha-weighted
  // neighbours so transparent padding cannot darken the artwork. Alpha itself
  // is never blurred or replaced.
  const weighted=Buffer.alloc(info.width*info.height*3),alpha=Buffer.alloc(info.width*info.height);
  for(let p=0;p<alpha.length;p++){alpha[p]=data[p*4+3];for(let c=0;c<3;c++)weighted[p*3+c]=Math.round(data[p*4+c]*alpha[p]/255);}
  const [soft,weight]=await Promise.all([
    sharp(weighted,{raw:{width:info.width,height:info.height,channels:3}}).blur(1.5).raw().toBuffer(),
    sharp(alpha,{raw:{width:info.width,height:info.height,channels:1}}).blur(1.5).greyscale().raw().toBuffer()
  ]);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const i=(y*info.width+x)*4;
    if(!data[i+3])continue;
    // Colour-neutral fibres and softened strand shading stay inside the exact
    // original coverage. No dilation, resampling or silhouette repair.
    const grain=(texture.data[(y%texture.height)*texture.width+x%texture.width]-texture.mean)/255;
    const light=Math.max(-.12,Math.min(.12,grain*.65));
    for(let c=0;c<3;c++){
      const softened=weight[i/4]?Math.min(255,soft[i/4*3+c]*255/weight[i/4]):data[i+c];
      const base=data[i+c]*.35+softened*.65;
      output[i+c]=Math.round(light>=0?base+(255-base)*light:base*(1+light));
    }
  }
  return sharp(output,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
module.exports={finishEmbroidery};
