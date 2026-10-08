// Render a compact first-sheet image for the proof history list.
async function proofThumbnail(bytes){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const {createCanvas}=require('@napi-rs/canvas');
 const standardFontDataUrl=require('node:path').join(require('node:path').dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+require('node:path').sep;
 const document=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,standardFontDataUrl}).promise;
 try{
  const page=await document.getPage(1),base=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:1000/Math.max(base.width,base.height)});
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  return canvas.toBuffer('image/png');
 }finally{await document.destroy();}
}
module.exports={proofThumbnail};
