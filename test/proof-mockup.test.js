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
