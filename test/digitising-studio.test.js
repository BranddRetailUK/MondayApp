const {test}=require('node:test');const assert=require('node:assert/strict');const sharp=require('sharp');
const e=require('../src/services/digitisingStudio');
const config=()=>e.settings({widthMm:100,hoopMm:150,spacing:.42,length:2.5,colours:3,removeWhite:'true',garment:'tshirt'});
const fixture=()=>e.artwork(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><path fill="red" fill-rule="evenodd" d="M10 10H140V190H10Z M40 40V160H110V40Z"/><path fill="blue" d="M180 20H290V180H180Z"/></svg>'));
test('all DST displacements round trip with independent existing decoder',async()=>{const {parseDst}=await import('../public/embroidery-viewer.mjs');for(let x=-121;x<=121;x++)for(let y=-121;y<=121;y++){const b=e.encode([{kind:'stitch',x,y}]);const d=parseDst(b);assert.deepEqual(d.segments[0].slice(2,4),[x,y]);}});
test('sample preserves dimensions, colour commands, holes and max stitch length',async()=>{const png=await fixture(),c=config(),r=await e.generate(png,c);const {parseDst}=await import('../public/embroidery-viewer.mjs');const d=parseDst(Buffer.from(r.dst,'base64'));assert.ok(Math.abs(d.widthMm-100)<1);assert.equal(d.colourChanges+1,r.threads.length);assert.ok(d.segments.every(([x,y,a,b])=>Math.hypot(a-x,b-y)<=c.length*10+1));assert.ok(d.stitches>100);assert.equal(r.elements.length,2);assert.ok(r.stats.trims<20,'nearby spans avoid repeated trims across holes');assert.ok(d.segments.every(([x,y,a,b])=>{const mx=(x+a)/20,my=(y+b)/20;return !(mx>-38&&mx< -15&&my>-20&&my<20);}), 'no stitch midpoint crosses the empty central hole');});
test('element colours, global overrides and border thread list are exported',async()=>{const png=await fixture(),c=config();c.elementColours={'0':'#123456'};c.threadNotes={'0':'Madeira 1147'};let r=await e.generate(png,c);assert.equal(r.threads[0],'#123456');assert.equal(r.threadPlan[0].thread,'Madeira 1147');c.mode='white';r=await e.generate(png,c);assert.ok(r.threads.every(x=>x==='#ffffff'));c.mode='black';c.border=true;c.garmentColour='#abcdef';r=await e.generate(png,c);assert.deepEqual(r.threads,['#000000','#abcdef','#000000','#abcdef']);assert.equal(r.stats.colourChanges+1,r.threads.length);});
test('caps, unsafe hoop, external SVG and invalid settings fail closed',async()=>{const png=await fixture();await assert.rejects(e.generate(png,{...config(),garment:'cap'}),/Cap/);await assert.rejects(e.generate(png,{...config(),hoopMm:80}),/hoop/);await assert.rejects(e.artwork(Buffer.from('<svg><image href="file:///etc/passwd"/></svg>')),/self-contained/);assert.throws(()=>e.settings({widthMm:'bad'}));await assert.rejects(e.artwork(await sharp({create:{width:10,height:10,channels:3,background:'red'}}).jpeg().toBuffer()),/PNG/);});
test('OpenAI request is image-grounded, store false, and failed responses cannot generate',async()=>{const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';try{const png=await fixture();let body;const review=await e.assess(png,config(),async(_url,args)=>{body=JSON.parse(args.body);return{ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Needs sew-out'}]}]})};});assert.equal(review,'Needs sew-out');assert.equal(body.store,false);assert.match(body.input[0].content[1].image_url,/^data:image\/png/);await assert.rejects(e.assess(png,config(),async()=>({ok:false,status:401,json:async()=>({})})),/failed/);}finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}});
test('antialiased arches stay connected and satin follows their curvature',async()=>{
  const png=await e.artwork(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="250"><path d="M30 220V110C30 10 210 10 210 110V220" fill="none" stroke="#c8566d" stroke-width="12"/></svg>'));
  const c={...config(),widthMm:70,colours:1,spacing:.4,elementOptions:{0:{type:'satin',order:0,widthMm:4.4}}};
  const p=await e.prepare(png,c);assert.equal(p.elements.length,1);
  const r=await e.generate(png,c),{parseDst}=await import('../public/embroidery-viewer.mjs'),d=parseDst(Buffer.from(r.dst,'base64'));
  assert.equal(r.threadPlan[0].role,'underlay and satin');assert.ok(r.stats.trims<=2);assert.ok(d.segments.every(s=>Math.hypot(s[2]-s[0],s[3]-s[1])<=71));
  const long=d.segments.filter(s=>Math.hypot(s[2]-s[0],s[3]-s[1])>40);assert.ok(long.length>100);
  assert.ok(long.some(s=>Math.abs(s[2]-s[0])>40));assert.ok(long.some(s=>Math.abs(s[3]-s[1])>35));
});
test('element exclusion changes bounds, sewing order controls threads, equal adjacent threads merge',async()=>{
  const png=await fixture(),c={...config(),hoopMm:200,elementOptions:{0:{type:'skip',order:0},1:{type:'fill',order:1}}};
  const p=await e.prepare(png,c);assert.ok(p.left>400);let r=await e.generate(png,c);assert.equal(r.threads.length,1);assert.equal(r.threadPlan[0].element,2);
  c.elementOptions={0:{type:'fill',order:1},1:{type:'fill',order:0}};r=await e.generate(png,c);assert.equal(r.threadPlan[0].element,2);
  c.mode='white';r=await e.generate(png,c);assert.equal(r.threads.length,1);assert.equal(r.stats.colourChanges,0);
  c.elementOptions={0:{type:'satin',order:0}};await assert.rejects(e.generate(png,c),/manual satin segmentation/);
});
test('white-matted antialias pixels do not introduce phantom palette elements',async()=>{
  const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/><circle cx="50" cy="50" r="35" fill="#c8566d"/></svg>')).png().toBuffer();
  const p=await e.prepare(await e.artwork(png),{...config(),colours:1});assert.equal(p.elements.length,1);assert.ok(p.elements[0].width<600);
});
