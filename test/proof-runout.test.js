const {test}=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument,rgb}=require('pdf-lib');
async function fixture({colours=['#d73706','#6b7278','#3d474d'],numbers=[1,2,3],swatches=true,duplicate=false}={}){
  const pdf=await PDFDocument.create(),page=pdf.addPage([600,800]);
  page.drawText('Design: PSG1234',{x:20,y:770,size:12});
  colours.forEach((hex,i)=>{const x=20+i*180;
    page.drawText(String(numbers[i]),{x,y:150,size:12});
    page.drawText(`Needle ${15-i}`,{x:x+50,y:150,size:12});
    page.drawText(String(1000+i),{x:x+50,y:124,size:12});
    const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
    if(swatches){page.drawRectangle({x:x+50,y:134,width:13,height:13,color:rgb(...c)});if(duplicate)page.drawRectangle({x:x+51,y:134,width:13,height:13,color:rgb(...c)});}
  });
  return new File([await pdf.save()],'runout.pdf',{type:'application/pdf'});
}
async function read(file,count=3,name='PSG1234.dst'){
  const {readRunoutPdf}=await import('../public/proof-runout.mjs'),pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  return readRunoutPdf(file,count,name,pdfjs);
}
test('reads vector swatches in numbered sewing order rather than needle order, including repeats',async()=>{
  const blocks=await read(await fixture());assert.deepEqual(blocks.map(b=>b.colour),['#d73706','#6b7278','#3d474d']);assert.deepEqual(blocks.map(b=>b.code),['1000','1001','1002']);
  const repeated=await read(await fixture({colours:['#ffffff','#000000','#ffffff']}));assert.deepEqual(repeated.map(b=>b.colour),['#ffffff','#000000','#ffffff']);
});
test('rejects mismatched references, counts, repeated sequence numbers and missing or ambiguous swatches',async()=>{
  const file=await fixture();
  await assert.rejects(()=>read(file,2),/3 thread blocks.*2/);
  await assert.rejects(()=>read(file,3,'PSG9999.dst'),/reference does not match/);
  await assert.rejects(()=>fixture({numbers:[1,1,3]}).then(f=>read(f)),/complete sewing sequence/);
  await assert.rejects(()=>fixture({swatches:false}).then(f=>read(f)),/one colour swatch/);
  await assert.rejects(()=>fixture({duplicate:true}).then(f=>read(f)),/one colour swatch/);
});
test('rejects unsupported documents and oversized uploads without applying colours',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage().drawText('No thread table');
  const file=new File([await pdf.save()],'scan.pdf');
  await assert.rejects(()=>read(file),/No readable/);
  await assert.rejects(()=>read({name:'runout.pdf',size:11*1024*1024}),/10 MB/);
  await assert.rejects(()=>read({name:'runout.png',size:10}),/PDF/);
});

test('DST sewn dimensions default only absent request dimensions and never apply to PXF previews',()=>{
  const {prepareBrief}=require('../src/services/proofLayout');
  const {normalizeProofRequest}=require('../src/services/proofBriefParser');
  const input={requestText:'JH001 Jet Black left breast embroidery',artworks:[{id:'logo',fileName:'PSG1234.dst',dstSize:{widthMm:90.7,heightMm:43.9}}]};
  assert.deepEqual(normalizeProofRequest(input).artworks[0].dstSize,{widthMm:90.7,heightMm:43.9});
  const make=(dimensions={})=>({products:[{code:'JH001',decorations:[{position:'left breast',artworkId:'logo',method:'embroidery',widthMm:'',heightMm:'',...dimensions}]}],questions:[]});
  const result=prepareBrief(make(),input);assert.equal(result.questions.length,0);
  assert.equal(result.products[0].decorations[0].widthMm,'90.7');assert.equal(result.products[0].decorations[0].heightMm,'43.9');
  for(const [text,dimensions,expected] of [
    ['left breast 120mm wide',{widthMm:'120'},['120','']],
    ['left breast 50mm high',{heightMm:'50'},['','50']],
    ['left breast 100 x 48.4mm',{widthMm:'100',heightMm:'48.4'},['100','48.4']],
    ['left breast 120mm wide',{},['120','']],
  ]){
    const b=prepareBrief(make(dimensions),{...input,requestText:'JH001 '+text});const d=b.products[0].decorations[0];
    assert.deepEqual([d.widthMm,d.heightMm],expected);assert.notEqual(d.dimensionSource,'dst-native');
  }
  const pxf={...input,artworks:[{...input.artworks[0],fileName:'PSG1234.PXF'}]};
  assert.equal(normalizeProofRequest(pxf).artworks[0].dstSize,undefined);assert.equal(prepareBrief(make(),pxf).questions.length,1);
  const bad={...input,artworks:[{...input.artworks[0],dstSize:{widthMm:-1,heightMm:40}}]};assert.equal(prepareBrief(make(),bad).questions.length,1);
});
