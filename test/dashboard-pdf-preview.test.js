const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/script.js'),'utf8');
const delivery = source.slice(source.indexOf('const CLOUDINARY_PREVIEW_PROFILES'), source.indexOf('function buildCloudinaryPdfDeliveryUrl('));
const pdfType = source.slice(source.indexOf('function isPdfFile('), source.indexOf('function isCloudinaryDeliveryUrl('));
const download = source.slice(source.indexOf('async function fetchProofDownloadBlob('),source.indexOf('function downloadProofBlobWithBrowser('));
const render = source.slice(source.indexOf('async function renderProofPdf('),source.indexOf('async function renderProofPdfPage('));
for(const [url,credentials] of [['https://res.cloudinary.com/example/run-sheet.pdf','omit'],['/api/run-sheet.pdf','include']]){
 test(`PDF preview fetches ${url.startsWith('/')?'Hub':'Cloudinary'} files with appropriate credentials`,async()=>{
  let rendered=false,requested;
  const data=new Uint8Array([37,80,68,70]).buffer;
  const context=vm.createContext({URL,window:{location:{href:'https://www.ultimatehub.co.uk/',origin:'https://www.ultimatehub.co.uk'}},
   fetch:async(src,options)=>{requested={src,options};return{ok:true,blob:async()=>({arrayBuffer:async()=>data})};},
   setProofLoading(){},buildAssetSrc:()=>url,__proofModalState:{renderToken:1},
   ensurePdfJs:async()=>({getDocument:options=>{assert.equal(options.data,data);return{promise:Promise.resolve({numPages:3})};}}),
   renderProofPdfPage:async()=>{rendered=true;},renderProofNativeViewer(){throw Error('Unexpected fallback');},console});
  vm.runInContext(delivery+'\n'+download+'\n'+render,context);
  await context.renderProofPdf({name:'run-sheet.pdf'},1);
  assert.equal(requested.options.credentials,credentials);assert.equal(requested.src,url);assert.equal(rendered,true);assert.equal(context.__proofModalState.pageCount,3);
 });
}

const hover=source.slice(source.indexOf('function clearDashboardFileHoverSource('),source.indexOf('function showDashboardFileHoverPreview('));
function hoverContext(fetcher){
 const urls=[],revoked=[];
 class TestURL extends URL {
  static createObjectURL(blob){const url=`blob:${blob.revision}`;urls.push(url);return url;}
  static revokeObjectURL(url){revoked.push(url);}
 }
 const context=vm.createContext({URL:TestURL,
  fetchProofDownloadBlob:fetcher,buildAssetSrc:file=>file.url,document:{createElement:tag=>({tag})}});
 vm.runInContext('let __dashboardFileHoverToken=0;let __dashboardFileHoverUrl=null;\n'+delivery+'\n'+pdfType+'\n'+hover,context);
 return {context,urls,revoked};
}
test('hover uses a fresh blob for every PDF revision and revokes superseded previews',async()=>{
 let revision=1;const requests=[];
 const {context,revoked}=hoverContext(async url=>{requests.push(url);return{revision:revision++};});
 const frame={replaceChildren(node){this.viewer=node;}};
 await context.loadDashboardFileHover({name:'proof.pdf',url:'/proof.pdf'},frame,0);
 assert.match(frame.viewer.src,/^blob:1#/);
 context.clearDashboardFileHoverSource();
 await context.loadDashboardFileHover({name:'proof.pdf',url:'/proof.pdf'},frame,1);
 assert.match(frame.viewer.src,/^blob:2#/);assert.deepEqual(requests,['/proof.pdf','/proof.pdf']);
 context.clearDashboardFileHoverSource();assert.deepEqual(revoked,['blob:1','blob:2']);
});
test('late hover response cannot replace a newer preview or leak a blob URL',async()=>{
 let finish;const {context,urls}=hoverContext(()=>new Promise(resolve=>{finish=resolve;}));
 const frame={replaceChildren(){throw Error('Stale preview rendered');}};
 const pending=context.loadDashboardFileHover({url:'/old.pdf'},frame,0);
 context.clearDashboardFileHoverSource();finish({revision:1});await pending;
 assert.deepEqual(urls,[]);
});
test('hover fetch failure displays a fallback without loading a cached native URL',async()=>{
 const {context,urls}=hoverContext(async()=>{throw Error('Network failure');});const frame={};
 await context.loadDashboardFileHover({url:'/proof.pdf'},frame,0);
 assert.match(frame.textContent,/Preview unavailable/);assert.deepEqual(urls,[]);
});

const publicPdf = 'https://res.cloudinary.com/brandduk/image/upload/v1780000000/proofs/order.pdf';
test('public PDF hover requests only a bounded first page; explicit download keeps the original', async () => {
 const requests=[];
 const {context,revoked}=hoverContext(async url=>{requests.push(url);return {revision:1};});
 const frame={replaceChildren(node){this.viewer=node;}};
 await context.loadDashboardFileHover({name:'order.pdf',url:publicPdf},frame,0);
 assert.equal(frame.viewer.tag,'img');
 assert.equal(requests[0],'https://res.cloudinary.com/brandduk/image/upload/f_jpg,q_auto:good,c_limit,w_840,h_600,pg_1/v1780000000/proofs/order.jpg');
 context.clearDashboardFileHoverSource();
 await context.loadDashboardFileHover({name:'order.pdf',url:publicPdf},frame,1);
 assert.equal(requests[1],requests[0]);
 assert.deepEqual(revoked,['blob:1']);
 // URL construction for explicit opening/downloading must remain separate from display profiles.
 const asset=source.slice(source.indexOf('function buildCloudinaryPdfDeliveryUrl('),source.indexOf('let __pdfJsPromise'));
 vm.runInContext("function isCloudinaryDeliveryUrl(url){return url.startsWith('https://res.cloudinary.com/');}\n"+asset,context);
 assert.equal(context.buildAssetSrc({name:'order.pdf',url:publicPdf}),publicPdf);
});

test('image hover preserves transparency via auto format and does not request the original', async () => {
 const requests=[];const {context}=hoverContext(async url=>{requests.push(url);return {revision:1};});
 const frame={replaceChildren(node){this.viewer=node;}};
 await context.loadDashboardFileHover({name:'logo.png',url:publicPdf.replace('.pdf','.png')},frame,0);
 assert.equal(frame.viewer.tag,'img');
 assert.match(requests[0],/f_auto,q_auto:good,c_limit,w_840,h_600\/v1780000000\/proofs\/order.png$/);
});

test('managed display profiles are idempotent and replace each other without stacked transforms', () => {
 const {context}=hoverContext();
 for(const profile of ['hover','visual','removal']) {
  const first=context.buildCloudinaryPreviewUrl(publicPdf,{profile,pdf:true});
  assert.equal(context.buildCloudinaryPreviewUrl(first,{profile,pdf:true}),first);
  const other=context.buildCloudinaryPreviewUrl(first,{profile:'hover',pdf:true});
  assert.equal(other,context.buildCloudinaryPreviewUrl(publicPdf,{profile:'hover',pdf:true}));
 }
});

test('only recognized versioned public delivery permits HTTP cache reuse', async () => {
 const {context}=hoverContext();
 const urls=[
  [publicPdf,'default','omit'],
  [context.buildCloudinaryPreviewUrl(publicPdf,{pdf:true}),'default','omit'],
  [publicPdf.replace('/v1780000000',''),'no-store','omit'],
  [publicPdf.replace('/upload/','/authenticated/'),'no-store','omit'],
  [publicPdf.replace('/upload/','/private/'),'no-store','omit'],
  [publicPdf.replace('/upload/','/upload/s--signature--/'),'no-store','omit'],
  [publicPdf.replace('/upload/','/upload/c_crop,w_50/'),'no-store','omit'],
  [publicPdf+'?token=secret','no-store','omit'],
  [publicPdf.replace('res.cloudinary.com','res.cloudinary.com.example.com'),'no-store','omit'],
  ['/api/proof-generator/designs/123/pdf','no-store','include']
 ];
 let requested;
 context.window={location:{href:'https://www.ultimatehub.co.uk/',origin:'https://www.ultimatehub.co.uk'}};
 context.fetch=async (url,options)=>{requested={url,options};return {ok:true,blob:async()=>({})};};
 vm.runInContext(download,context);
 for(const [url,cache,credentials] of urls) {
  await context.fetchProofDownloadBlob(url);
  assert.equal(requested.url,url);assert.equal(requested.options.cache,cache,url);
  assert.equal(requested.options.credentials,credentials,url);
  if(cache==='no-store') assert.equal(context.buildCloudinaryPreviewUrl(url,{pdf:true}),'');
 }
});

test('failed derivatives never trigger original downloads and decoding failure releases the blob', async () => {
 const requests=[];const {context}=hoverContext(async url=>{requests.push(url);throw Error('Unavailable');});
 const frame={};await context.loadDashboardFileHover({name:'order.pdf',url:publicPdf},frame,0);
 assert.equal(requests.length,1);assert.notEqual(requests[0],publicPdf);
 assert.match(frame.textContent,/Preview unavailable/);
 const successful=hoverContext(async()=>({revision:1}));
 const imageFrame={replaceChildren(node){this.viewer=node;}};
 await successful.context.loadDashboardFileHover({name:'order.pdf',url:publicPdf},imageFrame,0);
 imageFrame.viewer.onerror();
 assert.deepEqual(successful.revoked,['blob:1']);assert.match(imageFrame.textContent,/Preview unavailable/);
});
