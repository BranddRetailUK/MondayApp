import {parseDst, extractPxfPreview} from './embroidery-viewer.mjs';
export {parseDst, extractPxfPreview};

// Follow the original sewing sequence; jumps never become visible thread.
export function renderThreadPreview(design, colours, createCanvas = () => document.createElement('canvas')) {
  if(design.colourChanges>=100)throw Error('Proof embroidery supports up to 100 thread colour blocks.');
  if (!Array.isArray(colours) || colours.length !== design.colourChanges + 1 || colours.some(c => !/^#[a-f\d]{6}$/i.test(c))) throw Error('Select a thread colour for every DST colour block.');
  const canvas=createCanvas(), padding=16;
  const scale=Math.min(16,2000/Math.max(design.widthMm*10,design.heightMm*10,1));
  canvas.width=Math.ceil(design.widthMm*10*scale)+padding*2;
  canvas.height=Math.ceil(design.heightMm*10*scale)+padding*2;
  const ctx=canvas.getContext('2d');ctx.lineCap='round';
  const thickness=Math.max(.7,scale*2.5);
  for(const [x,y,ex,ey,block] of design.segments){
    if(x===ex&&y===ey)continue;
    const ax=padding+(x-design.minX)*scale,ay=padding+(y-design.minY)*scale;
    const bx=padding+(ex-design.minX)*scale,by=padding+(ey-design.minY)*scale;
    const stroke=(colour,width,offset=0)=>{ctx.beginPath();ctx.strokeStyle=colour;ctx.lineWidth=width;ctx.moveTo(ax+offset,ay+offset);ctx.lineTo(bx+offset,by+offset);ctx.stroke();};
    stroke('rgba(0,0,0,.28)',thickness+1,.5);
    stroke(colours[block],thickness);
    stroke('rgba(255,255,255,.28)',Math.max(.35,thickness*.22),-thickness*.18);
  }
  return canvas;
}

export async function prepareEmbroidery(file, colours) {
  const bytes=await file.arrayBuffer();
  if(/\.pxf$/i.test(file.name)) return new File([extractPxfPreview(bytes)],file.name.replace(/\.pxf$/i,'.png'),{type:'image/png'});
  const design=parseDst(bytes);
  const canvas=renderThreadPreview(design,colours);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Could not render embroidery preview.');
  return new File([blob],file.name.replace(/\.dst$/i,'.png'),{type:'image/png'});
}
