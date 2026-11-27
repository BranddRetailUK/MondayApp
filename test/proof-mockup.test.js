const test=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {assess,sizeLabel,prepare}=require('../src/services/proofMockup');
const {buildProof}=require('../src/services/proofPdfGenerator');
const {PDFDocument}=require('pdf-lib');
const brief=()=>({uploadMode:'mockup',products:[{code:'B450',colour:'Black',decorations:[{artworkId:'mock',method:'transfer print',position:'',widthMm:'',heightMm:''}]}]});
test('mock ups require product, print type and an image, but no position, supplier view or print size',()=>{
 const b=brief(),assets=[{id:'mock',originalName:'mock.png'}];
 assert.equal(assess(b,assets).ready,true);assert.equal(sizeLabel(b.products[0].decorations[0]),'TBC');
 b.products[0].decorations[0].widthMm='10cm';assert.equal(sizeLabel(b.products[0].decorations[0]),'100 mm wide');
 b.products[0].code='';b.products[0].decorations[0].method='';assert.equal(assess(b,[]).issues.length,3);
});
test('square fitting retains all edge pixels and renderer never loads a garment or creates placements',async()=>{
 const file={originalname:'mock.png',buffer:await sharp({create:{width:200,height:100,channels:3,background:'#ff0000'}}).png().toBuffer()};
 const asset=await prepare(await PDFDocument.create(),{file});
 const {data,info}=await sharp(Buffer.from(asset.preview.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,info.height);
 const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3));
 assert.deepEqual(pixel(0,800),[255,0,0]);assert.deepEqual(pixel(1599,800),[255,0,0]);assert.deepEqual(pixel(800,0),[255,255,255]);
 const result=await buildProof(brief(),[{id:'mock',file}],{strict:true,garmentLoader:()=>{throw Error('Must not fetch garments');}});
 assert.equal(result.documents.length,1);assert.deepEqual(result.pages[0].placements,[]);assert.equal(result.pages[0].view,'mockup');assert.deepEqual(result.issues,[]);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const doc=await pdfjs.getDocument({data:new Uint8Array(result.bytes),useSystemFonts:true}).promise;
 const text=(await (await doc.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');await doc.destroy();
 assert.match(text,/Dimensions: TBC/);assert.match(text,/Print method:/);assert.doesNotMatch(text,/No artwork|FRONT VIEW|Estimated garment/);
});

test('composite mock ups render once and retain position independently of print dimensions',async()=>{
 const b=brief();b.products[0].mockupPlacement={x:90,y:220,size:200};b.products[0].decorations[0].widthMm='100';
 b.products.push(structuredClone(b.products[0]));b.products[1].decorations[0].notes='Second view inside the same uploaded image';
 const file={originalname:'composite.png',buffer:await sharp({create:{width:300,height:100,channels:3,background:'#ff0000'}}).png().toBuffer()};
 const result=await buildProof(b,[{id:'mock',file}],{strict:true});
 assert.equal(result.documents.length,1);assert.equal((await PDFDocument.load(result.bytes)).getPageCount(),1);assert.equal(b.products.length,1);
 assert.deepEqual(result.pages[0].mockupPlacement,{x:90,y:220,size:200});assert.equal(b.products[0].decorations[0].widthMm,'100');
 const reopened=JSON.parse(JSON.stringify(b));const again=await buildProof(reopened,[{id:'mock',file}],{strict:true});assert.deepEqual(again.pages[0].mockupPlacement,result.pages[0].mockupPlacement);
 const layout=require('../public/proof-mockup');const bounded=layout.placement({x:-100,y:999,size:900});assert.deepEqual(bounded,{x:-100,y:542,size:900});
 const distinct=brief();distinct.products.push({...structuredClone(distinct.products[0]),colour:'Blue'});require('../src/services/proofMockup').normalize(distinct);assert.equal(distinct.products.length,2);
});

test('oversized mock ups retain their scale and PDF pixels are clipped to the image area',async()=>{
 const b=brief();b.products[0].mockupPlacement={x:-400,y:-400,size:1640};
 const file={originalname:'red.png',buffer:await sharp({create:{width:100,height:100,channels:3,background:'#ff0000'}}).png().toBuffer()};
 const result=await buildProof(b,[{id:'mock',file}],{strict:true});assert.deepEqual(result.pages[0].mockupPlacement,{x:-400,y:-400,size:1640});
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const path=require('node:path');
 const doc=await pdfjs.getDocument({data:new Uint8Array(result.bytes),standardFontDataUrl:path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts/')}).promise;
 try{
  const page=await doc.getPage(1),viewport=page.getViewport({scale:1});const canvas=require('@napi-rs/canvas').createCanvas(842,596),ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx,viewport}).promise;
  const red=(x,y)=>{const p=ctx.getImageData(x,y,1,1).data;return p[0]>240&&p[1]<10&&p[2]<10;};
  for(const [x,y] of [[40,160],[800,550],[400,300]])assert.equal(red(x,y),true,`inside ${x},${y}`);
  for(const [x,y] of [[20,300],[825,300],[400,145],[400,570],[400,90]])assert.equal(red(x,y),false,`protected ${x},${y}`);
 }finally{await doc.destroy();}
});
