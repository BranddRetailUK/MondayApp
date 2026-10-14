const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createRouter}=require('../src/routes/digitising-studio');
const {canUseStudio}=require('../src/services/digitisingAccess');
const fs=require('node:fs');
test('studio is production-only, including direct API calls and client-spoofed identity',async()=>{
 const app=express();const users={production:{email:'production@ultimatepromotions.co.uk',access_scope:'full'},other:{email:'other@ultimatepromotions.co.uk',access_scope:'full'},limited:{email:'production@ultimatepromotions.co.uk',access_scope:'dtf_only'}};
 app.use((req,res,next)=>{req.hubUser=users[req.headers['test-identity']];next();});app.use('/api/digitising-studio',createRouter());
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/digitising-studio`;
 try{
  for(const [identity,status] of [['',401],['other',403],['limited',403],['production',200]]){const response=await fetch(base+'/status',{headers:{'test-identity':identity}});assert.equal(response.status,status);}
  assert.equal((await fetch(base+'/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:users.production.email})})).status,401);
  for(const endpoint of ['/project','/compile-project'])assert.equal((await fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  const project=require('./fixtures/digitising/object-tools.json');
  const compiled=await fetch(base+'/compile-project',{method:'POST',headers:{'test-identity':'production','content-type':'application/json'},body:JSON.stringify(project)});
  assert.equal(compiled.status,200);assert.ok((await compiled.json()).dst);
  const invalid=await fetch(base+'/compile-project',{method:'POST',headers:{'test-identity':'production','content-type':'application/json'},body:'{}'});
  assert.equal(invalid.status,400);
  const png=await require('sharp')({create:{width:100,height:50,channels:4,background:'#ff0000'}}).png().toBuffer();
  const form=new FormData();form.append('artwork',new Blob([png],{type:'image/png'}),'design.png');
  const response=await fetch(base+'/prepare',{method:'POST',headers:{'test-identity':'production'},body:form}),data=await response.json();assert.equal(response.status,200);assert.ok(data.widthMm>0&&data.heightMm>0&&data.png);
 }finally{await new Promise(resolve=>server.close(resolve));}
 assert.equal(canUseStudio({email:' PRODUCTION@ULTIMATEPROMOTIONS.CO.UK ',access_scope:'full'}),true);
});
test('live app mounts studio API and authentication precedes studio initialization',()=>{
 const app=fs.readFileSync('src/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8');
 assert.match(app,/app.use\('\/api\/digitising-studio', require\('\.\/routes\/digitising-studio'\).createRouter\(\{ history:.*\}\)\)/);
 assert.ok(html.indexOf('src="auth-session.js"')<html.indexOf('src="digitising-studio.js"'));
});
test('upload preview persists and width/height edits stay locked to source proportions',async()=>{
 const vm=require('node:vm'),elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{},listeners:{},children:[],addEventListener(event,fn){this.listeners[event]=fn;},replaceChildren(...children){this.children=children;},append(child){this.children.push(child);},querySelectorAll(){return [];}});return elements.get(id);};
 let submitted;
 const context={document:{getElementById:get},window:{ultimateHubUserPromise:Promise.resolve({email:'production@ultimatepromotions.co.uk'})},Image:class {},FormData,URL:{createObjectURL:()=> 'blob:source',revokeObjectURL(){}},fetch:async(url,options)=>{
  if(url.includes('/jobs?'))return {ok:true,json:async()=>({jobs:[],hasMore:false})};
  if(url.endsWith('/status'))return {ok:true,json:async()=>({enabled:true})};
  if(url.endsWith('/prepare'))return {ok:true,json:async()=>({widthMm:270,heightMm:213.6,png:'preserved-source'})};
  submitted=options.body;return {ok:false,json:async()=>({error:'Stopped after validating request'})};
 }};
 await vm.runInNewContext(fs.readFileSync('public/digitising-studio.js','utf8'),context);
 get('ds-create').listeners.click();assert.equal(get('ds-editor').hidden,false);assert.equal(get('ds-history').hidden,true);
 get('ds-previous').listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(get('ds-editor').hidden,true);assert.equal(get('ds-history').hidden,false);
 get('ds-garment').value='tshirt';get('ds-file').files=[Object.assign(new Blob(['image']),{name:'art.png'})];
 get('ds-file').listeners.change();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('ds-width').value,'270.0');assert.equal(get('ds-height').value,'213.6');
 const preview=()=>get('ds-stage').children[0].src;
 assert.equal(preview(),'data:image/png;base64,preserved-source');
 get('ds-width').value='150';get('ds-width').listeners.input();assert.equal(get('ds-height').value,'118.7');assert.equal(preview(),'data:image/png;base64,preserved-source');
 get('ds-height').value='158.2';get('ds-height').listeners.input();assert.equal(get('ds-width').value,'200.0');
 await get('ds-form').listeners.submit({preventDefault(){}});
 assert.equal(Number(submitted.get('heightMm'))/Number(submitted.get('widthMm')),213.6/270);
 assert.equal(preview(),'data:image/png;base64,preserved-source');
});
