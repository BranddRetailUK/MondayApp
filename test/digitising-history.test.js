const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../src/routes/digitising-studio');
const { createHistory } = require('../src/services/digitisingHistory');

test('history saves exact DST bytes and pages without returning file payloads', async () => {
  const calls=[];
  const rows=Array.from({length:51},(_,i)=>({id:i}));
  const store=createHistory({query:async(sql,params)=>{calls.push({sql,params});return {rows};}});
  const dst=Buffer.from([0,255,1,128]);
  const preview=Buffer.from('png');
  const id=await store.save({filename:'logo.png',garment:'tshirt',result:{dst:dst.toString('base64'),stats:{widthMm:20},threads:['#123456']},preview});
  assert.match(id,/^[0-9a-f-]{36}$/);
  assert.equal(calls[0].params[1],'logo.dst');
  assert.deepEqual(calls[0].params[5],dst);
  assert.deepEqual(calls[0].params[6],preview);
  const page=await store.list(50);
  assert.equal(page.jobs.length,50);assert.equal(page.hasMore,true);
  assert.deepEqual(calls[1].params,[50]);
  assert.match(calls[1].sql,/created_at DESC, id DESC/);
  assert.doesNotMatch(calls[1].sql,/preview_png|\bdst\b/);
});

test('history and downloads require studio access, validate inputs and preserve bytes', async()=>{
  const id='12345678-1234-1234-1234-123456789abc',dst=Buffer.from([0,255,42]);
  let reads=0;
  const app=express();app.use((req,res,next)=>{if(req.headers.identity)req.hubUser={email:req.headers.identity,access_scope:'full'};next();});
  app.use(createRouter({history:{list:async offset=>{reads++;assert.equal(offset,50);return {jobs:[{id}],hasMore:false};},file:async(key,preview)=>{reads++;return key===id?{filename:'logo.dst',bytes:preview?Buffer.from('png'):dst}:undefined;}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,headers={identity:'production@ultimatepromotions.co.uk'};
  try{
    for(const path of ['/jobs',`/jobs/${id}/download`,`/jobs/${id}/preview`]){
      assert.equal((await fetch(base+path)).status,401);
      assert.equal((await fetch(base+path,{headers:{identity:'someone@example.com'}})).status,403);
    }
    assert.equal(reads,0);
    assert.equal((await fetch(base+'/jobs?offset=-1',{headers})).status,400);
    assert.equal((await fetch(base+'/jobs/nope/download',{headers})).status,404);
    assert.equal(reads,0);
    assert.deepEqual(await (await fetch(base+'/jobs?offset=50',{headers})).json(),{jobs:[{id}],hasMore:false});
    const download=await fetch(base+`/jobs/${id}/download`,{headers});
    assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment; filename="logo.dst"/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),dst);
    const preview=await fetch(base+`/jobs/${id}/preview`,{headers});assert.match(preview.headers.get('content-type'),/image\/png/);
    assert.equal((await fetch(base+'/jobs/00000000-0000-0000-0000-000000000000/download',{headers})).status,404);
  }finally{await new Promise(r=>server.close(r));}
});

test('grid renders filenames safely, paginates and opens the existing editor',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),elements=new Map(),requests=[];
  const element=()=>({dataset:{},children:[],listeners:{},removeAttribute(name){delete this[name];},addEventListener(name,fn){this.listeners[name]=fn;},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const filename='<img onerror=bad>.dst';
  const context={document:{getElementById:get,createElement:element},window:{ultimateHubUserPromise:Promise.resolve({email:'production@ultimatepromotions.co.uk'})},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.endsWith('/status')?{enabled:true}:{jobs:[{id:'saved-id',filename,garment:'tshirt',stats:{widthMm:99,heightMm:60,stitches:12345},created_at:'2026-10-14T12:00:00Z'}],hasMore:requests.length===2}};}};
  await vm.runInNewContext(fs.readFileSync('public/digitising-studio.js','utf8'),context);
  await new Promise(r=>setImmediate(r));
  const card=get('ds-grid').children[0];
  assert.equal(card.children[1].textContent,filename);
  assert.equal(card.children[2].textContent,'Stitch count: 12,345');
  assert.equal(card.children[4].href,'/api/digitising-studio/jobs/saved-id/download');
  assert.equal(get('ds-more').hidden,false);
  await get('ds-more').listeners.click();
  assert.equal(requests.at(-1),'/api/digitising-studio/jobs?offset=1');
  assert.equal(get('ds-grid').children.length,2);assert.equal(get('ds-more').hidden,true);
  get('ds-create').listeners.click();assert.equal(get('ds-editor').hidden,false);assert.equal(get('ds-history').hidden,true);
  get('ds-stage').append(element());get('ds-stats').textContent='150 × 31.1 mm';get('ds-status').textContent='DST ready.';
  get('ds-download').disabled=false;get('ds-filename').textContent='old.png';get('ds-file').value='old.png';
  get('ds-width').value=150;get('ds-height').value=31.1;get('ds-height').max=62.2;
  get('ds-previous').listeners.click();get('ds-create').listeners.click();
  assert.equal(get('ds-stage').children.length,0);
  for(const id of ['stats','status','filename'])assert.equal(get('ds-'+id).textContent,'');
  for(const id of ['file','width','height'])assert.equal(get('ds-'+id).value,'');
  for(const id of ['download','width','height','generate'])assert.equal(get('ds-'+id).disabled,true);
  assert.equal(get('ds-height').max,undefined);
});
