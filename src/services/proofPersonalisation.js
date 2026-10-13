const {PDFDocument,rgb}=require('pdf-lib');
const fontkit=require('@pdf-lib/fontkit');
const isFont=file=>/\.(ttf|otf)$/i.test(file?.originalname||'');

// Text stays in the brief; only this temporary vector artwork is rasterised for previews.
async function renderName(decoration,artworks){
  const text=String(decoration.text||'').trim();
  if(!text||text.length>100||/[\r\n\x00-\x1f]/.test(text))throw new Error('An individual name must contain 1–100 characters on one line.');
  const upload=artworks.find(a=>a.id===decoration.fontArtworkId);
  if(!upload||!isFont(upload.file))throw new Error('Attach and select the TTF or OTF font for each individual name.');
  const bytes=upload.file.buffer;
  if(bytes.length>10*1024*1024)throw new Error('The name font must be smaller than 10 MB.');
  const colour=String(decoration.textColour||'');
  if(!/^#[a-f\d]{6}$/i.test(colour))throw new Error('Choose an explicit six-digit hex colour for the individual name.');
  let face;
  try{face=fontkit.create(bytes);}catch(_){throw new Error('The selected name font is not a valid TTF or OTF file.');}
  for(const c of text)if(!face.hasGlyphForCodePoint(c.codePointAt(0)))throw new Error(`The selected font has no character ${c}.`);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  // Literal names match desktop text without discretionary ligature substitutions.
  const features={liga:false,clig:false,calt:false,kern:false,aalt:false};
  const font=await pdf.embedFont(bytes,{subset:true,features});
  const size=100,scale=size/face.unitsPerEm,run=face.layout(text,features);
  let cursor=0,minX=0,maxX=0,minY=0,maxY=0;
  // pdf-lib positions encoded glyphs using advanceWidth (not the shaping run advances).
  run.glyphs.forEach(glyph=>{const b=glyph.bbox;minX=Math.min(minX,cursor+b.minX);maxX=Math.max(maxX,cursor+b.maxX);minY=Math.min(minY,b.minY);maxY=Math.max(maxY,b.maxY);cursor+=glyph.advanceWidth;});
  const page=pdf.addPage([Math.max(1,(maxX-minX)*scale+2),Math.max(1,(maxY-minY)*scale+2)]);
  page.drawText(text,{font,size,x:1-minX*scale,y:1-minY*scale,color:rgb(...[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)/255))});
  return Buffer.from(await pdf.save());
}
module.exports={isFont,renderName};
