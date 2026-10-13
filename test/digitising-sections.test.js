const {test}=require('node:test'),assert=require('node:assert/strict');
const {partition,spans,sectionAngle}=require('../src/services/digitisingSections');
test('section partition preserves every source pixel exactly once',()=>{
 const ids=new Int16Array(100*100).fill(-1);for(let y=10;y<90;y++)for(let x=10;x<90;x++)ids[y*100+x]=0;
 const elements=[{id:0,colour:'#000000',x:10,y:10,width:80,height:80,pixels:6400}];
 partition(ids,elements,100,100,{0:[[[10,10],[50,50]],[[50,50],[90,10]]]});
 assert.equal(elements.reduce((n,e)=>n+e.pixels,0),6400);assert.equal([...ids].filter(v=>v>=0).length,6400);assert.equal(elements.length,2);
 assert.ok(elements.every(e=>Number.isFinite(sectionAngle(e))));
 for(const e of elements)for(const pair of spans(ids,100,e,.2,.42,sectionAngle(e)))for(const [x,y]of pair)assert.equal(ids[Math.round(y)*100+Math.round(x)],e.id);
});
test('directional rows retain millimetre spacing when size changes',()=>{
 const ids=new Int16Array(10000),e={id:0,x:0,y:0,width:100,height:100};
 for(const scale of [.7,1]){const rows=spans(ids,100,e,scale,.42,30);const normal=p=>-p[0]*.5+p[1]*Math.sqrt(3)/2;
 const gaps=rows.slice(1).map((r,i)=>(normal(r[0])-normal(rows[i][0]))*scale);assert.ok(gaps.every(d=>Math.abs(d-.42)<1e-8));}
});
test('automatic AI guides reach the exported stitch file without customer settings',async()=>{
 const {plan}=require('../src/services/digitisingAuto'),engine=require('../src/services/digitisingStudio');
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 try{
  const art=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M10 90L50 10L90 90L80 90L50 30L20 90Z" fill="red"/></svg>');
  const p=await plan(art,{widthMm:70},{interpret:true,fetchImpl:async(url,args)=>{const body=JSON.parse(args.body),ctx=JSON.parse(body.input[0].content[0].text),r=ctx.regions[0],w=ctx.width,h=ctx.height;return{ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({regions:[{id:r.id,colour:r.colour,include:true,role:'shape',sections:[{startX:w*.15,startY:h*.89,endX:w*.5,endY:h*.2},{startX:w*.5,startY:h*.2,endX:w*.85,endY:h*.89}]}]})}]}]})};}});
  const out=await engine.generate(p.png,p.config);assert.equal(out.threadPlan.length,2);assert.equal(out.threads.length,1);assert.ok(out.threadPlan.every(p=>p.role==='directional section'));assert.ok(Math.abs(out.threadPlan[0].angle-out.threadPlan[1].angle)>90);
  const {parseDst}=await import('../public/embroidery-viewer.mjs'),d=parseDst(Buffer.from(out.dst,'base64'));assert.ok(d.segments.length>100);assert.ok(d.segments.every(s=>Math.hypot(s[2]-s[0],s[3]-s[1])<=111));
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('boundary tracing returns closed loops and simplification retains pointed corners',()=>{
 const {contours,simplify}=require('../src/services/digitisingSections');const ids=new Int16Array(400).fill(-1);
 for(let y=2;y<18;y++)for(let x=2;x<18;x++)if(!(x>7&&x<12&&y>7&&y<12))ids[y*20+x]=0;
 const loops=contours(ids,20,{id:0,x:2,y:2,width:16,height:16});assert.equal(loops.length,2);
 for(const loop of loops){assert.deepEqual(loop[0],loop.at(-1));const clean=simplify(loop,.1);assert.ok(clean.length<=6);for(const axis of [0,1]){assert.equal(Math.min(...clean.map(p=>p[axis])),Math.min(...loop.map(p=>p[axis])));assert.equal(Math.max(...clean.map(p=>p[axis])),Math.max(...loop.map(p=>p[axis])));}assert.deepEqual(clean[0],clean.at(-1));}
});
test('thin tapered features receive locally crosswise rails down to the tip',()=>{
 const {thinColumns}=require('../src/services/digitisingColumns');const w=120,h=60,ids=new Int16Array(w*h).fill(-1);
 // Horizontal 0.2–0.8 mm taper: crosswise stitches must be vertical, not horizontal.
 for(let x=5;x<115;x++){const half=1+Math.floor((114-x)/40);for(let y=30-half;y<=30+half;y++)ids[y*w+x]=0;}
 const columns=thinColumns(ids,w,{id:0,x:5,y:27,width:110,height:7},.1,.34,.3);
 assert.ok(columns.length>0);const pairs=columns.flat();assert.ok(pairs.length>30);
 for(const pair of pairs){assert.ok(Math.abs(pair[1][1]-pair[0][1])>Math.abs(pair[1][0]-pair[0][0])*2);assert.ok(Math.hypot(pair[1][0]-pair[0][0],pair[1][1]-pair[0][1])*.1>=.299);}
 assert.ok(Math.max(...pairs.flat().map(p=>p[0]))>108,'cross-stitches must continue through the tapered tip');
});
