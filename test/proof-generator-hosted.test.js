const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../src/routes/proof-generator');
const { parseProofBrief } = require('../src/services/proofBriefParser');

async function serve(router, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers['x-test-email']) req.hubUser = { email: req.headers['x-test-email'], access_scope: req.headers['x-test-scope'] || 'full' };
    next();
  });
  app.use('/proof', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}/proof`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const production = { 'x-test-email': 'production@ultimatepromotions.co.uk' };

test('hosted access denies every endpoint to anonymous, ordinary and DTF-only accounts', async () => {
  let calls = 0;
  await serve(createRouter({ parse: async () => { calls++; }, status: async () => { calls++; } }), async url => {
    for (const [headers, expected] of [[{}, 401], [{ 'x-test-email': 'office@ultimatepromotions.co.uk' }, 403], [{ 'x-test-email': 'charlie@ultimatepromotions.co.uk', 'x-test-scope': 'dtf_only' }, 403], [{ 'x-test-email': 'charlie@ultimatepromotions.co.uk.attacker.test' }, 403], [{ ...production, 'x-test-scope': 'dtf_only' }, 403], [{ 'x-test-email': 'production@ultimatepromotions.co.uk.attacker.test' }, 403]]) {
      for (const endpoint of ['link-jobs', 'link-jobs/1', 'link-jobs/1/edit', 'link-jobs/1/unlink', 'designs/unknown/link', 'designs/unknown/sync', 'products?q=RX350', 'designs', 'designs/unknown', 'designs/unknown/retry', 'save', 'status', 'views/unknown', 'views', 'renderer/pdf.mjs', 'renderer/pdf.worker.mjs', 'parse', 'preflight', 'preview', 'placement-preview', 'generate', 'create']) {
        const res = await fetch(`${url}/${endpoint}`, { method: ['link-jobs/1/edit','link-jobs/1/unlink','designs/unknown/link','designs/unknown/sync','parse', 'preflight', 'preview', 'placement-preview', 'generate', 'create', 'views', 'designs', 'save','designs/unknown/retry'].includes(endpoint) ? 'POST' : 'GET', headers });
        assert.equal(res.status, expected, endpoint);
      }
    }
    assert.equal(calls, 0);
  });
});

test('production catalogue search returns product choices and handles unavailable catalogue',async()=>{
 let calls=0;
 await serve(createRouter({searchProducts:async query=>{calls++;if(query==='BAD')throw Error('offline');return [{code:'RX350',name:'Pro hoodie'}];}}),async url=>{
   const response=await fetch(`${url}/products?q=RX350`,{headers:production});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   assert.deepEqual((await response.json()).products,[{code:'RX350',name:'Pro hoodie'}]);
   assert.deepEqual(await (await fetch(`${url}/products?q=%25`,{headers:production})).json(),{products:[]});
   assert.equal(calls,1);
   assert.equal((await fetch(`${url}/products?q=BAD`,{headers:production})).status,503);
 });
});

test('exports select a product PDF or all product sheets in a single PDF',async()=>{
 await serve(createRouter({enrich:async()=>{},generateViews:async()=>{},build:async()=>({bytes:Buffer.from('combined-pdf'),documents:[{productIndex:0,fileName:'first.pdf',bytes:Buffer.from('first-pdf')},{productIndex:1,fileName:'second.pdf',bytes:Buffer.from('second-pdf')}],pages:[],issues:[]})}),async url=>{
   const form=()=>{const f=new FormData();f.append('brief',JSON.stringify({products:[{code:'ONE'},{code:'TWO'}]}));f.append('artworkDetails','[]');return f;};
   const combined=await fetch(`${url}/create`,{method:'POST',headers:production,body:form()});assert.equal(combined.status,200);assert.equal(await combined.text(),'combined-pdf');
   const selected=await fetch(`${url}/create?productIndex=1`,{method:'POST',headers:production,body:form()});assert.equal(selected.status,200);assert.equal(await selected.text(),'second-pdf');assert.match(selected.headers.get('content-disposition'),/Clothing - PROOF.pdf/);
   assert.equal((await fetch(`${url}/create?productIndex=2`,{method:'POST',headers:production,body:form()})).status,400);
   const preview=await fetch(`${url}/preview`,{method:'POST',headers:production,body:form()});const data=await preview.json();assert.equal(data.documents.length,2);assert.equal(data.documents[0].bytes,undefined);
 });
});

test('production can check readiness, use AI and load PDF renderer; responses are private', async () => {
  await serve(createRouter({
    status: async () => ({ ready: true, aiReady: true, rendererReady: true }),
    parse: async () => ({ products: [{ code: 'RX350', name: 'Hoodie', decorations: [] }], sharedDecorations: [] }),
    enrich: async () => {},
  }), async url => {
    const headers = { 'x-test-email': 'PRODUCTION@ultimatepromotions.co.uk', 'Content-Type': 'application/json' };
    const status = await fetch(`${url}/status`, { headers });
    assert.equal(status.status, 200); assert.equal(status.headers.get('cache-control'), 'no-store');
    const res = await fetch(`${url}/parse`, { method: 'POST', headers, body: JSON.stringify({ requestText: 'RX350 Hoodie' }) });
    assert.equal(res.status, 200); assert.equal((await res.json()).brief.products[0].code, 'RX350');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const renderer = await fetch(`${url}/renderer/pdf.mjs`, { headers });
    assert.equal(renderer.status, 200); await renderer.arrayBuffer();
    assert.equal((await fetch(`${url}/renderer/package.json`, { headers })).status, 404);
  });
});

test('busy proof requests are rejected before uploads and capacity recovers after failure', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  await serve(createRouter({ parse: async () => { started(); await waiting; throw new Error('Temporary test failure'); } }), async url => {
    const first = fetch(`${url}/parse`, { method: 'POST', headers: production });
    await entered;
    const busy = await fetch(`${url}/preview`, { method: 'POST', headers: production });
    assert.equal(busy.status, 429); assert.equal(busy.headers.get('retry-after'), '5');
    release(); assert.equal((await first).status, 502);
    const retry = await fetch(`${url}/preview`, { method: 'POST', headers: production, body: new FormData() });
    assert.equal(retry.status, 400);
  });
});

test('readiness reports unavailable without exposing secrets', async () => {
  await serve(createRouter({ status: async () => ({ ready: false, aiReady: false, rendererReady: true }) }), async url => {
    const res = await fetch(`${url}/status`, { headers: production });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ready: false, aiReady: false, rendererReady: true });
  });
});

test('hosted AI uses structured output and does not send uploaded file bytes', async () => {
  await parseProofBrief({ requestText: 'RX350 Navy, logo left breast 100 mm', artworks: [{ id: 'logo', fileName: 'logo.png', buffer: 'PRIVATE_FILE_BYTES' }] }, {
    apiKey: 'test-only-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.equal(options.body.includes('PRIVATE_FILE_BYTES'), false);
      return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ products: [], questions: [] }) }] }] }) };
    },
  });
});

test('background garment generation holds capacity, reports progress and releases after completion', async () => {
  let release; const work = new Promise(resolve => { release=resolve; });
  let entered; const started = new Promise(resolve=>{entered=resolve;});
  await serve(createRouter({enrich:async brief=>{brief.products[0].visual={source:'authoritative'};},generateViews:async(brief,options)=>{
    assert.equal(brief.products[0].visual.source,'authoritative');assert.equal(options.allowGenerate,true);
    options.onProgress({completed:0,total:1,message:'Preparing back view…'});entered();await work;
  }}),async url=>{
    const res=await fetch(`${url}/views`,{method:'POST',headers:{...production,'Content-Type':'application/json'},body:JSON.stringify({brief:{products:[{code:'RX350',visual:{source:'untrusted'}}]}})});
    assert.equal(res.status,202);const {jobId}=await res.json();await started;
    const progress=await fetch(`${url}/views/${jobId}`,{headers:production});assert.equal((await progress.json()).state,'running');
    assert.equal((await fetch(`${url}/parse`,{method:'POST',headers:production})).status,429);
    release();await new Promise(resolve=>setImmediate(resolve));
    const finished=await fetch(`${url}/views/${jobId}`,{headers:production});assert.equal((await finished.json()).state,'complete');
    assert.equal((await fetch(`${url}/views/unknown`,{headers:production})).status,404);
  });
});


test('save passes exact JSON Unicode filenames and original bytes through multipart upload',async()=>{
 const name='Fullers Centenary Crest 1926–2026.svg',original='<svg>original</svg>';
 let saved;
 await serve(createRouter({enrich:async()=>{},generateViews:async()=>{},build:async()=>({bytes:Buffer.from('pdf')}),designs:{
  get:async()=>({id:'design',designNumber:'29200',folderName:'29200 Test'}),
  queueSave:async(...args)=>{saved=args[5];return {status:'save_queued'};}
 }}),async url=>{
  const form=new FormData();form.append('brief',JSON.stringify({proofDesignId:'design',products:[{code:'TEST'}]}));
  form.append('artworkDetails',JSON.stringify([{id:'art',originalName:name}]));
  form.append('artworks',new Blob(['png']),'preview.png');form.append('originalArtworks',new Blob([original]),name);
  const response=await fetch(`${url}/save`,{method:'POST',headers:production,body:form});assert.equal(response.status,200);
  assert.equal(saved[0].originalname,name);assert.equal(saved[0].buffer.toString(),original);
 });
});

test('EPS previews validate uploads, preserve bytes and require production access before conversion',async()=>{
 let calls=0;
 const converted=await require('sharp')({create:{width:40,height:20,channels:4,background:'#e42313'}}).png().toBuffer();
 const original=Buffer.from('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 50\n');
 await serve(createRouter({convertEps:async bytes=>{calls++;assert.deepEqual(bytes,original);return converted;}}),async url=>{
  const form=(bytes=original)=>{const f=new FormData();f.append('artwork',new Blob([bytes]),'logo.eps');return f;};
  for(const headers of [{},{'x-test-email':'office@example.com'},{...production,'x-test-scope':'dtf_only'}]){
   assert.ok([401,403].includes((await fetch(`${url}/artwork/eps-preview`,{method:'POST',headers,body:form()})).status));
  }
  assert.equal(calls,0);
  assert.equal((await fetch(`${url}/artwork/eps-preview`,{method:'POST',headers:production,body:form('not postscript')})).status,400);
  const response=await fetch(`${url}/artwork/eps-preview`,{method:'POST',headers:production,body:form()});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await require('sharp')(Buffer.from(await response.arrayBuffer())).metadata()).width,40);assert.equal(calls,1);
 });
});

test('proof history and preview endpoints enforce production access and private responses',async()=>{
 let calls=0;const id=require('crypto').randomUUID();
 await serve(createRouter({designs:{get:async()=>({id,designNumber:'30001',customer:'History'}),document:async()=>Buffer.from('%PDF-retained'),source:async()=>({source:{request:'Saved request'},artworks:[{name:'logo.svg',data:'c3Zn'}]}),list:async offset=>{calls++;return {designs:[{id,customer:'History',hasPreview:true}],nextOffset:null};},preview:async()=>{calls++;return Buffer.from('PNG');},progress:async()=>{calls++;return {id};}}}),async url=>{
  for(const headers of [{},{'x-test-email':'office@example.com'},{...production,'x-test-scope':'dtf_only'}])for(const endpoint of ['designs',`designs/${id}/preview`,`designs/${id}/source`,`designs/${id}/pdf`,`designs/${id}/progress`]){
   assert.ok([401,403].includes((await fetch(`${url}/${endpoint}`,{headers,method:endpoint.endsWith('progress')?'POST':'GET'})).status));
  }
  assert.equal(calls,0);
  const list=await fetch(`${url}/designs`,{headers:production});assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');assert.equal((await list.json()).designs[0].customer,'History');
  const preview=await fetch(`${url}/designs/${id}/preview`,{headers:production});assert.equal(preview.headers.get('content-type'),'image/png');assert.equal(preview.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(`${url}/designs?offset=-1`,{headers:production})).status,400);
  const source=await fetch(`${url}/designs/${id}/source`,{headers:production});assert.equal(source.headers.get('cache-control'),'no-store');assert.equal((await source.json()).artworks[0].name,'logo.svg');
  const pdf=await fetch(`${url}/designs/${id}/pdf?download=1`,{headers:production});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-disposition'),/^attachment;/);assert.equal(pdf.headers.get('cache-control'),'no-store');assert.equal(await pdf.text(),'%PDF-retained');
 });
});
test('in-flight EPS thumbnails cannot block source retention or proof parsing',async()=>{
 let release,entered;const hold=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const png=await require('sharp')({create:{width:10,height:10,channels:4,background:'#f00'}}).png().toBuffer();
 await serve(createRouter({convertEps:async()=>{entered();await hold;return png;},designs:{saveSource:async()=>{}},parse:async()=>({products:[{code:'RX350',colour:'Black',decorations:[]}],sharedDecorations:[]}),enrich:async()=>{}}),async url=>{
  const eps=new FormData();eps.append('artwork',new Blob(['%!PS-Adobe-3.0 EPSF-3.0']),'logo.eps');
  const converting=fetch(`${url}/artwork/eps-preview`,{method:'POST',headers:production,body:eps});await started;
  try{
   const source=new FormData();source.append('brief',JSON.stringify({request:'test'}));source.append('artworkDetails','[]');
   assert.equal((await fetch(`${url}/designs/${require('crypto').randomUUID()}/source`,{method:'POST',headers:production,body:source})).status,200);
   assert.equal((await fetch(`${url}/parse`,{method:'POST',headers:{...production,'Content-Type':'application/json'},body:JSON.stringify({requestText:'RX350 Black',artworks:[]})})).status,200);
  }finally{release();await converting;}
 });
});

test('multipart parsing sends labelled bounded artwork previews to the parser',async()=>{
 const png=await require('sharp')({create:{width:20,height:10,channels:4,background:'#ff0000'}}).png().toBuffer();
 let calls=0;
 await serve(createRouter({parse:async(body,options)=>{
  calls++;assert.equal(body.artworks[0].id,'apg');assert.equal(options.artworkImages[0].id,'apg');
  assert.match(options.artworkImages[0].url,/^data:image\/png;base64,/);
  return {products:[{code:'GD01',colour:'Royal',decorations:[]}],sharedDecorations:[]};
 },enrich:async()=>{}}),async url=>{
  const form=new FormData();form.append('brief',JSON.stringify({requestText:'APG youth back 250mm wide',artworks:[{id:'apg',fileName:'scan.png'}]}));
  form.append('artworks',new Blob([png],{type:'image/png'}),'scan.png');
  const res=await fetch(`${url}/parse`,{method:'POST',headers:production,body:form});assert.equal(res.status,200);assert.equal(calls,1);
 });
});

test('AI input labels images and defines global method and supplier inheritance',async()=>{
 await parseProofBrief({requestText:'All print to be transfer',artworks:[{id:'apg',fileName:'scan.png'}]}, {
  apiKey:'test',artworkImages:[{id:'apg',url:'data:image/png;base64,dGVzdA=='}],fetchImpl:async(_url,options)=>{
   const body=JSON.parse(options.body);assert.match(body.instructions,/brief.method/);assert.match(body.instructions,/always as worn/);
   assert.deepEqual(body.text.format.schema.properties.products.items.properties.supplier.enum,['auto','ralawise','pencarrie']);
   assert.equal(body.input[0].content[1].text,'Artwork upload ID: apg');assert.equal(body.input[0].content[2].type,'input_image');
   return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({products:[],questions:[]})}]}]})};
  }
 });
});

test('name fonts survive multipart parsing and repeat styles retain each person’s own garment',async()=>{
 const products=[{code:'',name:'Hoodie',colour:'Black',instanceId:'adult',visual:{matched:true,views:[{view:'front',url:'adult'}]}},{code:'',name:'Hoodie',colour:'Black',instanceId:'child',visual:{matched:true,views:[{view:'front',url:'child'}]}}];
 const font=require('node:fs').readFileSync(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'));
 const form=()=>{const f=new FormData();f.append('brief',JSON.stringify({proofDesignId:'saved',products}));f.append('artworkDetails',JSON.stringify([{id:'font'}]));f.append('artworks',new Blob([font]),'name.ttf');return f;};
 await serve(createRouter({
  designs:{get:async()=>({id:'saved',designNumber:'123',folderName:'123 Test'}),source:async()=>({source:{brief:{products}}}),setPreview:async()=>{}},
  enrich:async b=>{b.products.forEach(p=>p.visual={matched:false});},generateViews:async()=>{},
  build:async(b,a)=>{assert.deepEqual(b.products.map(p=>p.visual.views[0].url),['adult','child']);assert.equal(a[0].id,'font');assert.equal(a[0].file.buffer.length,font.length);return {bytes:Buffer.from('pdf'),pages:[],issues:[]};},
  parse:async(body,{artworkImages})=>{assert.equal(artworkImages.length,0);assert.equal(body.artworks[0].id,'font');return {products:[{code:'RX350',decorations:[]}],sharedDecorations:[]};}
 }),async url=>{
  assert.equal((await fetch(url+'/preview',{method:'POST',headers:production,body:form()})).status,200);
  const f=new FormData();f.append('brief',JSON.stringify({requestText:'Names in attached font',artworks:[{id:'font',fileName:'name.ttf'}]}));f.append('artworks',new Blob([font]),'name.ttf');
  assert.equal((await fetch(url+'/parse',{method:'POST',headers:production,body:f})).status,200);
 });
});

test('proof EPS conversion preserves white artwork and transparent negative space',async()=>{
 const {rasterize}=require('../src/services/digitisingEps');
 const sharp=require('sharp');
 const eps=Buffer.from('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 50\n1 setgray\n10 10 30 30 rectfill\n60 10 30 30 rectfill\nshowpage\n%%EOF\n');
 const bytes=await rasterize(eps);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4);
 let opaque=0,transparent=0,firstOpaque=-1;
 for(let i=0;i<data.length;i+=4){if(data[i+3]===255){opaque++;if(firstOpaque<0)firstOpaque=i;assert.equal(data[i],255);}if(data[i+3]===0)transparent++;}
 assert.ok(opaque>100&&transparent>100);
 const y=Math.floor(firstOpaque/4/info.width)+2;
 const occupied=Array.from({length:info.width},(_,x)=>x).filter(x=>pixel(x,y)[3]>0);
 assert.ok(occupied.length>0);
 const middle=Math.round((occupied[0]+occupied.at(-1))/2);
 assert.equal(pixel(middle,y)[3],0);
 assert.equal(pixel(0,0)[3],0);
});

test('preflight returns all missing details without invoking generation or design storage',async()=>{
 const sharp=require('sharp');
 const image=await sharp({create:{width:20,height:20,channels:4,background:'#ff0000'}}).png().toBuffer();
 const router=createRouter({enrich:async b=>{b.products[0].visual={matched:false,lookupIssue:'colour_ambiguous',availableColours:['Jet Black','Deep Black','Black Smoke']};},generateViews:()=>{throw Error('Must not generate');},build:()=>{throw Error('Must not build');},designs:new Proxy({},{get(){throw Error('Must not access designs');}})});
 await serve(router,async url=>{
  const form=new FormData();form.append('brief',JSON.stringify({products:[{code:'JH001',colour:'Black',decorations:[{position:'right sleeve',artworkId:'logo',method:''}]}],preflightRequest:'Right sleeve PSG5547'}));
  form.append('artworkDetails',JSON.stringify([{id:'logo',originalName:'psg5543.PXF'}]));form.append('artworks',new Blob([image]),'logo.png');
  const response=await fetch(`${url}/preflight`,{method:'POST',headers:production,body:form});assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.ready,false);assert.equal(data.issues.length,5);assert.equal(data.brief.preflightVersion,1);
  assert.ok(data.issues.some(i=>i.message.includes('PSG5547')));assert.ok(data.issues.some(i=>i.path.endsWith('widthMm')));
 });
});
test('rendering a reviewed brief rechecks missing details before generating or saving',async()=>{
 const sharp=require('sharp');const image=await sharp({create:{width:20,height:20,channels:4,background:'#ff0000'}}).png().toBuffer();let calls=0;
 await serve(createRouter({enrich:async()=>{},generateViews:async()=>{calls++;},build:async()=>{calls++;}}),async url=>{
  const form=new FormData();form.append('brief',JSON.stringify({preflightVersion:1,products:[{code:'JH001',colour:'Jet Black',decorations:[{position:'right sleeve',artworkId:'logo',method:'embroidery'}]}]}));
  form.append('artworkDetails',JSON.stringify([{id:'logo',originalName:'logo.png'}]));form.append('artworks',new Blob([image]),'logo.png');
  const res=await fetch(`${url}/preview`,{method:'POST',headers:production,body:form});assert.equal(res.status,422);assert.match((await res.json()).error,/width or height/);assert.equal(calls,0);
 });
});


test('Charlie can open the sandbox renderer and generate test proofs',async()=>{
 const headers={'x-test-email':'charlie@ultimatepromotions.co.uk'};
 await serve(createRouter({status:async()=>({ready:true}),designs:{list:async()=>({designs:[],nextOffset:null})},enrich:async()=>{},build:async()=>({bytes:Buffer.from('%PDF-Charlie'),documents:[],pages:[],issues:[]})}),async url=>{
   for(const endpoint of ['status','renderer/pdf.mjs'])assert.equal((await fetch(`${url}/${endpoint}`,{headers})).status,200,endpoint);
   const form=new FormData();form.append('brief',JSON.stringify({products:[{code:'ONE'}]}));form.append('artworkDetails','[]');
   const response=await fetch(`${url}/create`,{method:'POST',headers,body:form});assert.equal(response.status,200);assert.equal(await response.text(),'%PDF-Charlie');
 });
});


test('sandbox cannot reserve, save, read or change production designs and job links',async()=>{
 const headers={'x-test-email':'charlie@ultimatepromotions.co.uk'};
 let writes=0;const designs=new Proxy({}, {get:()=>async()=>{writes++;throw Error('Production store accessed');}});
 await serve(createRouter({designs,enrich:async()=>{},generateViews:async()=>{},build:async brief=>{assert.equal(brief.reference,'SANDBOX');return {bytes:Buffer.from('%PDF-test'),pages:[],issues:[]};}}),async url=>{
  for(const path of ['designs','designs/id','designs/id/source','designs/id/preview','designs/id/pdf','designs/id/progress','designs/id/retry','designs/id/link','designs/id/sync','generate','link-jobs','link-jobs/1','link-jobs/1/edit','link-jobs/1/unlink','save']){
   for(const method of ['GET','POST'])assert.equal((await fetch(`${url}/${path}`,{method,headers})).status,403,`${method} ${path}`);
  }
  for(const endpoint of ['preview','create'])for(const key of ['proofDesignId','proofSourceOrderId']){
   const form=new FormData();form.append('brief',JSON.stringify({products:[{code:'ONE'}],[key]:'production-id'}));form.append('artworkDetails','[]');
   assert.equal((await fetch(`${url}/${endpoint}`,{method:'POST',headers,body:form})).status,422);
  }
  const form=new FormData();form.append('brief',JSON.stringify({products:[{code:'ONE'}],reference:'29149'}));form.append('artworkDetails','[]');
  const result=await fetch(`${url}/preview`,{method:'POST',headers,body:form});assert.equal(result.status,200);assert.equal((await result.json()).brief.reference,'SANDBOX');assert.equal(writes,0);
 });
});

test('sandbox view tasks are private and do not take the production generation slot',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve);
 const charlie={'x-test-email':'charlie@ultimatepromotions.co.uk','Content-Type':'application/json'};
 await serve(createRouter({enrich:async()=>{},generateViews:async()=>pending,parse:async()=>({products:[{code:'ONE'}]})}),async url=>{
  try{
   const response=await fetch(`${url}/views`,{method:'POST',headers:charlie,body:JSON.stringify({brief:{products:[{code:'ONE'}]}})});assert.equal(response.status,202);const {jobId}=await response.json();
   assert.equal((await fetch(`${url}/views/${jobId}`,{headers:production})).status,404);
   assert.equal((await fetch(`${url}/views/${jobId}`,{headers:charlie})).status,200);
   assert.equal((await fetch(`${url}/parse`,{method:'POST',headers:{...production,'Content-Type':'application/json'},body:JSON.stringify({request:'ONE navy shirt'})})).status,200);
   assert.equal((await fetch(`${url}/views`,{method:'POST',headers:charlie,body:JSON.stringify({brief:{products:[{code:'ONE'}]}})})).status,429);
  }finally{finish();}
 });
});

test('test history retains sources and regeneration renders only into the test store',async()=>{
 const id='12345678-1234-4234-8234-123456789abc';let retained,rendered,productionCalls=0;
 const tests={list:async()=>({designs:[{id,testProof:true}],nextOffset:null}),get:async()=>({id}),source:async()=>retained,
 saveSource:async(_id,owner,source,files,details)=>{retained={source,artworks:files,owner};return {id};},
 setPreview:async(_id,bytes,brief,ready)=>{rendered={id:_id,brief,ready};},asset:async()=>Buffer.from('test-pdf')};
 const designs=new Proxy({},{get(){return ()=>{productionCalls++;throw Error('Production store called');};}});
 await serve(createRouter({tests,designs,enrich:async()=>{},generateViews:async()=>{},build:async()=>({bytes:Buffer.from('pdf'),pages:[],issues:[]})}),async url=>{
  const charlie={'x-test-email':'charlie@ultimatepromotions.co.uk'};
  for(const headers of [charlie,production]){
   assert.equal((await fetch(`${url}/tests`,{headers})).status,200);
  }
  for(const headers of [{},{'x-test-email':'office@ultimatepromotions.co.uk'},{...charlie,'x-test-scope':'dtf_only'}])assert.ok([401,403].includes((await fetch(`${url}/tests`,{headers})).status));
  const source=new FormData();source.append('brief',JSON.stringify({request:'Test shirt',brief:{products:[{code:'RX350'}]}}));source.append('artworkDetails','[]');
  assert.equal((await fetch(`${url}/tests/${id}/source`,{method:'POST',headers:charlie,body:source})).status,200);
  assert.equal(retained.source.brief.reference,'SANDBOX');assert.equal(retained.source.brief.testProofId,id);
  assert.equal((await fetch(`${url}/tests/${id}/source`,{headers:production})).status,200);
  for(const [headers,query] of [[charlie,''],[production,'?test=1']]){
   const form=new FormData();form.append('brief',JSON.stringify(retained.source.brief));form.append('artworkDetails','[]');
   assert.equal((await fetch(`${url}/preview${query}`,{headers,method:'POST',body:form})).status,200);
   assert.equal(rendered.brief.reference,'SANDBOX');assert.equal(rendered.id,id);
  }
  assert.equal((await fetch(`${url}/designs?test=1`,{headers:production})).status,403);
  assert.equal(productionCalls,0);
 });
});

for(const sandbox of [false,true])test(`placement preview restores ${sandbox?'test':'production'} geometry without writes or generated views`,async()=>{
 const products=[{code:'RX350',colour:'Black',decorations:[{id:'mark',placement:{x:.4,y:.2}}]}];
 const noWrite=async()=>{throw Error('Opening a proof must not save');};
 const store={get:async()=>({id:'saved',designNumber:'123',folderName:'123 Test'}),source:async()=>({source:{brief:{products}}}),setPreview:noWrite,queueSave:noWrite};
 await serve(createRouter({designs:store,tests:store,enrich:async()=>{},generateViews:async(_brief,options)=>{assert.equal(options.allowGenerate,false);},build:async(brief,_art,options)=>{
  assert.equal(options.strict,false);assert.deepEqual(brief.products[0].decorations[0].placement,{x:.4,y:.2});
  return {bytes:Buffer.from('pdf'),pages:[{image:'garment',placements:[{id:'mark',x:.4,y:.2}]}],issues:[]};
 }}),async url=>{
  const form=new FormData();form.append('brief',JSON.stringify({[sandbox?'testProofId':'proofDesignId']:'saved',products}));form.append('artworkDetails','[]');
  const response=await fetch(url+'/placement-preview'+(sandbox?'?test=1':''),{method:'POST',headers:sandbox?{'x-test-email':'charlie@ultimatepromotions.co.uk'}:production,body:form});
  assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).pages[0].placements[0].x,.4);
 });
});

test('production generate renders once, forces the reserved number and atomically queues identical preview/PDF/originals',async()=>{
 const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage().drawText('30001 QA');const bytes=Buffer.from(await pdf.save());
 let builds=0,queued=0;
 await serve(createRouter({
  designs:{get:async()=>({id:'saved',designNumber:'30001',folderName:'30001 QA'}),source:async()=>null,queueSave:async(id,key,revision,output,brief,originals,png)=>{
   queued++;assert.equal(id,'saved');assert.equal(key,'key');assert.equal(revision,2);assert.deepEqual(output,bytes);assert.equal(brief.reference,'30001');assert.equal(originals[0].originalname,'original.svg');assert.equal(originals[0].buffer.toString(),'<svg/>');assert.ok(png.length>0);return {id,status:'save_queued',hasPdf:true,hasPreview:true,revision:3,designNumber:'30001'};
  }},enrich:async()=>{},generateViews:async()=>{},build:async(brief,_art,options)=>{builds++;assert.equal(options.strict,true);assert.equal(brief.reference,'30001');return {bytes,pages:[],issues:[]};}
 }),async url=>{
  const form=new FormData();form.append('brief',JSON.stringify({proofDesignId:'saved',reference:'WRONG',proofSaveKey:'key',proofRevision:2,products:[{code:'TEST'}]}));form.append('artworkDetails',JSON.stringify([{id:'art',originalName:'original.svg'}]));form.append('artworks',new Blob(['png']),'prepared.png');form.append('originalArtworks',new Blob(['<svg/>']),'original.svg');
  const response=await fetch(url+'/generate',{method:'POST',headers:production,body:form});assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.design.status,'save_queued');assert.equal(data.design.hasPdf,true);assert.deepEqual(Buffer.from(data.pdf,'base64'),bytes);
 });assert.equal(builds,1);assert.equal(queued,1);
});
