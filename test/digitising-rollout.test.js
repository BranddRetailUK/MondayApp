const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),sharp=require('sharp');
const {createRouter}=require('../src/routes/digitising-studio');
// Newly authored unrelated engineering fixtures; no production reference geometry.
const designs=[
  ['counter badge','<path fill="#0088aa" fill-rule="evenodd" d="M10 10H110V90H10Z M40 30V70H80V30Z"/>'],
  ['two colour pennant','<path fill="#dd3300" d="M10 10H105L70 45H10Z"/><path fill="#0055cc" d="M10 55H70L105 90H10Z"/>'],
  ['disconnected tiles','<rect fill="#8844aa" x="10" y="10" width="35" height="30"/><rect fill="#8844aa" x="75" y="55" width="35" height="35"/>']
];
test('Create object rollout compiles unrelated uploads, source outlines, sizes and preview dimensions',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';let calls=0,saved=null;
 const app=express();app.use((req,res,next)=>{req.hubUser={email:'production@ultimatepromotions.co.uk',access_scope:'full'};next();});
 app.use('/studio',createRouter({history:{save:async value=>{saved=value;return 'saved-fixture';}},fetchImpl:async(_url,request)=>{
   calls++;const body=JSON.parse(request.body),context=JSON.parse(body.input[0].content[0].text);
   assert.equal(body.store,false);
   const stroke=body.text.format.name==='embroidery_stroke_tools';
   const regions=context.regions.map(r=>stroke?{id:r.id,tool:r.satinSuitable?(r.counterCount?'closed-columns':'auto-column'):'fill'}:{id:r.id,include:true,colour:r.colour,role:'shape',sections:[]});
   return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({regions})}]}]})};
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=async(png,fields)=>{const form=new FormData();form.append('artwork',new Blob([png]),'fixture.png');for(const [key,value]of Object.entries(fields))form.append(key,String(value));const response=await fetch(`http://127.0.0.1:${server.address().port}/studio/generate`,{method:'POST',body:form});const data=await response.json();assert.equal(response.status,200,data.error);assert.equal(data.historyId,'saved-fixture');assert.equal(saved.result.dst,data.dst);assert.equal(saved.filename,'fixture.png');assert.ok(Buffer.isBuffer(saved.preview));return data;};
 try{
  for(const [index,[name,art]]of designs.entries())for(const widthMm of [60,90])await t.test(`${name} at ${widthMm} mm`,async()=>{
   const png=await sharp(Buffer.from(`<svg width="120" height="100" xmlns="http://www.w3.org/2000/svg">${art}</svg>`)).png().toBuffer();
   const result=await request(png,{widthMm,heightMm:widthMm*100/120,garment:['tshirt','hoodie','woven'][index],border:true,outlineColour:'#22aa44'});
   assert.equal(result.pipeline,'objects-v1');assert.equal(result.project.widthMm,widthMm);assert.equal(result.reviewRequired,false);
   // The uploaded 120 px PNG has antialiased tips: allow one source pixel plus DST rounding.
   assert.ok(Math.abs(result.stats.widthMm-widthMm*(index===1?95:100)/120)<widthMm/120+.1, `sewn bounds retain source margins: ${result.stats.widthMm} versus ${widthMm*(index===1?95:100)/120}`);
   const {parseDst}=await import('../public/embroidery-viewer.mjs');const decoded=parseDst(Buffer.from(result.dst,'base64'));
   assert.equal(result.stats.widthMm,decoded.widthMm);assert.equal(result.stats.heightMm,decoded.heightMm);assert.equal(result.threads.at(-1),'#22aa44');
   const runs=result.project.objects.filter(o=>o.type==='run');assert.equal(runs.length,2);assert.ok(runs.every(o=>o.passes===3&&o.path[0].every((v,i)=>v===o.path.at(-1)[i])));
   if(index===1&&widthMm===60){
    const plain=await request(png,{widthMm,garment:'hoodie',border:false});
    assert.ok(plain.project.objects.every(o=>o.type!=='run'));
    assert.deepEqual(plain.project.objects,result.project.objects.filter(o=>o.type!=='run'));
   }
   if(index===0){assert.equal(result.project.objects.find(o=>o.type==='fill').holes.length,1);
    // Independent decoder: no sewn segment may traverse the interior counter.
    const s=widthMm/120,cx=widthMm/2,cy=result.project.heightMm/2;
    for(const [x,y,a,b]of decoded.segments){const mx=(x+a)/20+cx,my=(y+b)/20+cy;assert.ok(!(mx>40*s+.2&&mx<80*s-.2&&my>30*s+.2&&my<70*s-.2));}
   }
  });
  assert.equal(calls,14,'both source interpretation and tool selection run for every upload');
 }finally{await new Promise(r=>server.close(r));if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
