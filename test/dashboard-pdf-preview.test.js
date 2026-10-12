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

const hover=source.slice(source.indexOf('function clearDashboardFileHoverSource('),source.indexOf('function showDashboardFileHoverPreview('));
function hoverContext(fetcher){
 const urls=[],revoked=[];
 const context=vm.createContext({URL:{createObjectURL:blob=>{const url=`blob:${blob.revision}`;urls.push(url);return url;},revokeObjectURL:url=>revoked.push(url)},
  fetchProofDownloadBlob:fetcher,buildAssetSrc:file=>file.url,document:{createElement:()=>({})}});
 vm.runInContext('let __dashboardFileHoverToken=0;let __dashboardFileHoverUrl=null;\n'+hover,context);
 return {context,urls,revoked};
}
test('hover uses a fresh blob for every PDF revision and revokes superseded previews',async()=>{
 let revision=1;const requests=[];
 const {context,revoked}=hoverContext(async url=>{requests.push(url);return{revision:revision++};});
 const frame={replaceChildren(node){this.viewer=node;}};
 await context.loadDashboardPdfHover({name:'proof.pdf',url:'/proof.pdf'},frame,0);
 assert.match(frame.viewer.src,/^blob:1#/);
 context.clearDashboardFileHoverSource();
 await context.loadDashboardPdfHover({name:'proof.pdf',url:'/proof.pdf'},frame,1);
 assert.match(frame.viewer.src,/^blob:2#/);assert.deepEqual(requests,['/proof.pdf','/proof.pdf']);
 context.clearDashboardFileHoverSource();assert.deepEqual(revoked,['blob:1','blob:2']);
});
test('late hover response cannot replace a newer preview or leak a blob URL',async()=>{
 let finish;const {context,urls}=hoverContext(()=>new Promise(resolve=>{finish=resolve;}));
 const frame={replaceChildren(){throw Error('Stale preview rendered');}};
 const pending=context.loadDashboardPdfHover({url:'/old.pdf'},frame,0);
 context.clearDashboardFileHoverSource();finish({revision:1});await pending;
 assert.deepEqual(urls,[]);
});
test('hover fetch failure displays a fallback without loading a cached native URL',async()=>{
 const {context,urls}=hoverContext(async()=>{throw Error('Network failure');});const frame={};
 await context.loadDashboardPdfHover({url:'/proof.pdf'},frame,0);
 assert.match(frame.textContent,/Preview unavailable/);assert.deepEqual(urls,[]);
});
