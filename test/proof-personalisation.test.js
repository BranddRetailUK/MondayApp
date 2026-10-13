const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PDFDocument}=require('pdf-lib');
const {renderName}=require('../src/services/proofPersonalisation');
const artworks=[{id:'font',file:{originalname:'Liberation.ttf',buffer:fs.readFileSync(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'))}}];
test('individual names use retained vector font and explicit colour; changed text changes artwork',async()=>{
 const a=await renderName({text:'Saul',fontArtworkId:'font',textColour:'#B76D3A'},artworks);
 const b=await renderName({text:'Taylor',fontArtworkId:'font',textColour:'#B76D3A'},artworks);
 assert.equal((await PDFDocument.load(a)).getPageCount(),1);
 assert.notEqual((await PDFDocument.load(a)).getPage(0).getWidth(),(await PDFDocument.load(b)).getPage(0).getWidth());
 for(const override of [{fontArtworkId:'missing'},{textColour:'copper'},{text:'a\nb'}])await assert.rejects(renderName({text:'Saul',fontArtworkId:'font',textColour:'#B76D3A',...override},artworks));
});
