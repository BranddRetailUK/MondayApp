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
    for (const [headers, expected] of [[{}, 401], [{ 'x-test-email': 'office@ultimatepromotions.co.uk' }, 403], [{ ...production, 'x-test-scope': 'dtf_only' }, 403], [{ 'x-test-email': 'production@ultimatepromotions.co.uk.attacker.test' }, 403]]) {
      for (const endpoint of ['products?q=RX350', 'designs', 'designs/unknown', 'designs/unknown/retry', 'save', 'status', 'views/unknown', 'views', 'renderer/pdf.mjs', 'renderer/pdf.worker.mjs', 'parse', 'preview', 'create']) {
        const res = await fetch(`${url}/${endpoint}`, { method: ['parse', 'preview', 'create', 'views', 'designs', 'save','designs/unknown/retry'].includes(endpoint) ? 'POST' : 'GET', headers });
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
