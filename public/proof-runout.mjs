// Read numbered Needle blocks and their actual vector swatches. No thread-code
// lookup or artwork-colour guessing: unsupported/scanned sheets stay manual.
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function extractRunoutPage(items, operators, OPS) {
  const text=items.filter(i=>i.str?.trim()).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5],height:Math.abs(i.height)||Math.abs(i.transform[3])}));
  const swatches=[],stack=[];
  let matrix=[1,0,0,1,0,0],colour='#000000',rect=null;
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];
    if(op===OPS.save)stack.push({matrix:[...matrix],colour});
    else if(op===OPS.restore){const state=stack.pop();if(state)({matrix,colour}=state);rect=null;}
    else if(op===OPS.transform)matrix=multiply(matrix,args);
    else if(op===OPS.setFillRGBColor)colour='#'+Array.from(args).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
    else if([OPS.setFillColor,OPS.setFillColorN,OPS.setFillGray,OPS.setFillCMYKColor].includes(op))colour=null;
    else if(op===OPS.constructPath){
      rect=null;
      let bounds=null;
      if(args[0].length===1&&args[0][0]===OPS.rectangle)bounds=args[1];
      else if(args[0][0]===OPS.moveTo&&args[0].slice(1).every(op=>op===OPS.lineTo||op===OPS.closePath)&&[8,10].includes(args[1].length)){
        const points=[];for(let n=0;n<args[1].length;n+=2)points.push([args[1][n],args[1][n+1]]);
        if(points.length===5&&points[4][0]===points[0][0]&&points[4][1]===points[0][1])points.pop();
        const xs=[...new Set(points.map(p=>p[0]))],ys=[...new Set(points.map(p=>p[1]))];
        if(points.length===4&&xs.length===2&&ys.length===2&&new Set(points.map(p=>p.join(','))).size===4&&points.every((p,n)=>{const q=points[(n+1)%4];return p[0]===q[0]||p[1]===q[1];}))bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
      }
      if(bounds&&Math.abs(matrix[1])+Math.abs(matrix[2])<1e-6){
        const [x,y,w,h]=bounds,x1=matrix[0]*x+matrix[4],y1=matrix[3]*y+matrix[5],x2=x1+matrix[0]*w,y2=y1+matrix[3]*h;
        const width=Math.abs(x2-x1),height=Math.abs(y2-y1);
        if(width>=3&&width<=40&&height>=3&&height<=40&&Math.abs(width-height)<Math.max(width,height)*.15)rect={x:Math.min(x1,x2),y:Math.min(y1,y2),width,height};
      }
    }else if([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke].includes(op)){
      if(rect&&colour&&/^#[a-f\d]{6}$/i.test(colour))swatches.push({...rect,colour});rect=null;
    }else if([OPS.stroke,OPS.endPath].includes(op))rect=null;
  }
  const blocks=[];
  for(const needle of text.filter(t=>/^Needle\s+\d+$/i.test(t.text))){
    const h=needle.height;
    const sequence=text.filter(t=>/^\d{1,3}$/.test(t.text)&&Math.abs(t.y-needle.y)<h*.4&&needle.x-t.x>h&&needle.x-t.x<h*8);
    const matches=swatches.filter(s=>Math.abs(s.x-needle.x)<h*.4&&needle.y-s.y>h*.5&&needle.y-s.y<h*2&&Math.abs(s.width-h)<h*.5);
    if(sequence.length!==1||matches.length!==1)throw Error('Could not match every numbered thread block to one colour swatch. Select colours manually.');
    const swatch=matches[0];
    const codes=text.filter(t=>/^[\w-]+$/.test(t.text)&&Math.abs(t.x-needle.x)<h*.4&&swatch.y-t.y>0&&swatch.y-t.y<h*1.5);
    blocks.push({sequence:Number(sequence[0].text),colour:swatch.colour,code:codes.length===1?codes[0].text:''});
  }
  return {blocks,designNames:text.filter(t=>/^Design:\s*\S+/i.test(t.text)).map(t=>t.text.replace(/^Design:\s*/i,''))};
}
export function validateRunout(pages, expectedCount, filename='') {
  const blocks=pages.flatMap(p=>p.blocks).sort((a,b)=>a.sequence-b.sequence);
  if(!blocks.length)throw Error('No readable numbered thread swatches found. Use an original runout PDF with Needle blocks, or select colours manually.');
  if(blocks.length!==expectedCount)throw Error(`Runout has ${blocks.length} thread blocks; this DST has ${expectedCount}. Upload the matching runout or select colours manually.`);
  if(blocks.some((b,i)=>b.sequence!==i+1))throw Error('Runout thread numbers must form one complete sewing sequence. Select colours manually.');
  const ref=name=>String(name).match(/psg[\s_-]*0*(\d+)/i)?.[1];
  const target=ref(filename),refs=pages.flatMap(p=>p.designNames).map(ref).filter(Boolean);
  if(target&&refs.some(r=>r!==target))throw Error('The runout design reference does not match this DST. Upload the matching runout.');
  return blocks;
}
export async function readRunoutPdf(file,expectedCount,filename='',pdfjsOverride) {
  if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024)throw Error('Choose a runout PDF up to 10 MB.');
  const pdfjs=pdfjsOverride||await import('/api/proof-generator/renderer/pdf.mjs');
  if(!pdfjsOverride)pdfjs.GlobalWorkerOptions.workerSrc='/api/proof-generator/renderer/pdf.worker.mjs';
  const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  try{
    if(doc.numPages>10)throw Error('Runout PDFs can contain up to 10 pages.');
    const pages=[];
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),text=await page.getTextContent(),operators=await page.getOperatorList();
      pages.push(extractRunoutPage(text.items,operators,pdfjs.OPS));page.cleanup();
    }
    return validateRunout(pages,expectedCount,filename);
  }finally{await doc.destroy();}
}
