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
  const png=await require('sharp')({create:{width:100,height:50,channels:4,background:'#ff0000'}}).png().toBuffer();
  const form=new FormData();form.append('artwork',new Blob([png],{type:'image/png'}),'design.png');
  const response=await fetch(base+'/prepare',{method:'POST',headers:{'test-identity':'production'},body:form}),data=await response.json();assert.equal(response.status,200);assert.ok(data.widthMm>0&&data.heightMm>0&&data.png);
 }finally{await new Promise(resolve=>server.close(resolve));}
 assert.equal(canUseStudio({email:' PRODUCTION@ULTIMATEPROMOTIONS.CO.UK ',access_scope:'full'}),true);
});
test('live app mounts studio API and authentication precedes studio initialization',()=>{
 const app=fs.readFileSync('src/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8');
 assert.match(app,/app.use\('\/api\/digitising-studio', require\('\.\/routes\/digitising-studio'\).createRouter\(\)\)/);
 assert.ok(html.indexOf('src="auth-session.js"')<html.indexOf('src="digitising-studio.js"'));
});
