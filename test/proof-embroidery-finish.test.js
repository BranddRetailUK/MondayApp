const test=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp');
const {PDFDocument}=require('pdf-lib');
const {finishEmbroidery}=require('../src/services/proofEmbroideryFinish');
const {prepareArtwork}=require('../src/services/proofArtwork');
const {buildProof}=require('../src/services/proofPdfGenerator');
async function source(){
  // Counter, thin detail, separate dot, antialiased edges and multiple colours.
  return sharp(Buffer.from('<svg width="240" height="120"><path fill="#d73706" fill-rule="evenodd" d="M10 10H100V110H10Z M35 35H75V85H35Z"/><path fill="#6b7278" d="M120 10h12v100h-12z M150 10h10v10h-10z"/><path fill="#3d474d" d="M150 40h60v15h-60z"/></svg>')).png().toBuffer();
}
test('thread finish preserves every alpha byte, counters, separate parts and exact pixel bounds',async()=>{
  const bytes=await source(),before=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const finished=await finishEmbroidery(bytes),after=await sharp(finished).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual(after.info,before.info);let changed=0;
  for(let i=0;i<before.data.length;i+=4){assert.equal(after.data[i+3],before.data[i+3],`alpha pixel ${i/4}`);if(before.data[i+3]&&after.data[i]!==before.data[i])changed++;}
  assert.ok(changed>100);assert.deepEqual(await finishEmbroidery(bytes),finished);
  const pdf=await PDFDocument.create(),art={file:{buffer:bytes,originalname:'logo.png'},backgroundMode:'auto'};
  const plain=await prepareArtwork(pdf,art),enhanced=await prepareArtwork(pdf,art,{embroideryFinish:true});
  assert.deepEqual(enhanced.bounds,plain.bounds);assert.equal(enhanced.width,plain.width);assert.equal(enhanced.height,plain.height);
});
test('only DST embroidery uses the finish; print and non-DST proofs retain their source appearance and placements',async()=>{
  const bytes=await source();
  const garment=await sharp(Buffer.from('<svg width="700" height="850"><path fill="#ddd" d="M200 60L290 30Q350 100 410 30L500 60L680 160L630 340L530 290L530 800L170 800L170 290L70 340L20 160Z"/></svg>')).png().toBuffer();
  const make=(method)=>({products:[{code:'TEST',colour:'Grey',decorations:[{id:'mark',artworkId:'logo',position:'front',method,widthMm:'90.7',heightMm:'',placement:{x:.5,y:.25},manualScale:undefined}],visual:{matched:true,source:'PenCarrie',views:[{view:'front',url:'https://www.pencarrie.com/storage/test.png'}]}}]});
  const art=name=>[{id:'logo',originalName:name,file:{originalname:'logo.png',buffer:bytes}}];
  const options={fetchImpl:async()=>({ok:true,arrayBuffer:async()=>garment})};
  const raw=await buildProof(make('embroidery'),art('logo.png'),options);
  const enhanced=await buildProof(make('embroidery'),art('logo.dst'),options);
  const print=await buildProof(make('transfer print'),art('logo.dst'),options);
  const geometry=result=>result.pages[0].placements.map(({preview,...placement})=>placement);
  assert.deepEqual(geometry(enhanced),geometry(raw));
  assert.deepEqual(geometry(print),geometry(raw));
  assert.equal(enhanced.issues.some(i=>i.blocking),false);
  // Overlay images change only for DST embroidery, including the editor preview.
  assert.notDeepEqual(enhanced.pages[0].placements[0].preview,raw.pages[0].placements[0].preview);
  assert.deepEqual(print.pages[0].placements[0].preview,raw.pages[0].placements[0].preview);
});
