const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/script.js'),'utf8');
const download = source.slice(source.indexOf('async function fetchProofDownloadBlob('),source.indexOf('function downloadProofBlobWithBrowser('));
const render = source.slice(source.indexOf('async function renderProofPdf('),source.indexOf('async function renderProofPdfPage('));
for(const [url,credentials] of [['https://res.cloudinary.com/example/run-sheet.pdf','omit'],['/api/run-sheet.pdf','include']]){
 test(`PDF preview fetches ${url.startsWith('/')?'Hub':'Cloudinary'} files with appropriate credentials`,async()=>{
  let rendered=false,requested;
  const data=new Uint8Array([37,80,68,70]).buffer;
  const context=vm.createContext({URL,window:{location:{href:'https://www.ultimatehub.co.uk/',origin:'https://www.ultimatehub.co.uk'}},
   fetch:async(src,options)=>{requested={src,options};return{ok:true,blob:async()=>({arrayBuffer:async()=>data})};},
   setProofLoading(){},buildAssetSrc:()=>url,__proofModalState:{renderToken:1},
   ensurePdfJs:async()=>({getDocument:options=>{assert.equal(options.data,data);return{promise:Promise.resolve({numPages:1})};}}),
   renderProofPdfPage:async()=>{rendered=true;},renderProofNativeViewer(){throw Error('Unexpected fallback');},console});
  vm.runInContext(download+'\n'+render,context);
  await context.renderProofPdf({name:'run-sheet.pdf'},1);
  assert.equal(requested.options.credentials,credentials);assert.equal(requested.src,url);assert.equal(rendered,true);
 });
}
