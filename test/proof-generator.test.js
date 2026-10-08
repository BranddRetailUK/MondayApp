const test=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {PDFDocument,rgb}=require('pdf-lib');
const layout=require('../src/services/proofLayout');
const artwork=require('../src/services/proofArtwork');
const {buildProof}=require('../src/services/proofPdfGenerator');
const {selectPencarrieVisual}=require('../src/services/proofProductVisuals');
const {createRouter}=require('../src/routes/proof-generator');
const express=require('express');

function mark(overrides={}){return {id:'mark',artworkId:'art',artwork:'logo.png',position:'left breast',widthMm:'100',heightMm:'',printColours:[],threadColours:[],...overrides};}
function brief(decorations=[mark()]){return {customer:'Local test',reference:'TEST',jobTitle:'Placement regression',sharedDecorations:[],products:[{code:'TEST',name:'Test shirt',colour:'Navy',decorations,visual:{matched:true,source:'PenCarrie',views:['front','back','left','right'].map(view=>({view,url:`https://www.pencarrie.com/storage/test-${view}.png`}))}}]};}
async function artFile({width=200,height=100,padding=0}={}){
 const buffer=await sharp({create:{width:width+padding*2,height:height+padding*2,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width,height,channels:4,background:'#ef3324'}}).png().toBuffer(),left:padding,top:padding}]).png().toBuffer();
 return {id:'art',file:{originalname:'logo.png',buffer},backgroundMode:'auto'};
}
async function garmentBytes(colour='#263953'){
 return sharp(Buffer.from(`<svg width="700" height="850"><path fill="${colour}" d="M200 60 L290 30 Q350 100 410 30 L500 60 L680 160 L630 340 L530 290 L530 800 L170 800 L170 290 L70 340 L20 160 Z"/></svg>`)).png().toBuffer();
}
async function fixtureFetch(){const bytes=await garmentBytes();return async()=>({ok:true,arrayBuffer:async()=>bytes});}

test('normalises all audited aliases without guessing unknown positions',()=>{
 assert.equal(layout.positionName('RB'),'right breast');assert.equal(layout.positionName('LS'),'left sleeve');assert.equal(layout.positionName('back neck'),'nape');assert.equal(layout.regionFor('ankle','front'),null);
});
test('unit conversion and signed offsets are validated',()=>{
 assert.equal(layout.dimension('10 cm'),100);assert.equal(layout.dimension('2 in'),50.8);assert.equal(layout.dimension('-3 cm',{signed:true}),-30);
 for(const value of ['0','-1','Infinity','100 px','100 wide','3001'])assert.throws(()=>layout.dimension(value));
});
test('extracts dimensions by axis and never mistakes height or offsets for width',()=>{
 assert.deepEqual(layout.dimensionsInText('50 mm high, 100 mm wide'),{width:[100],height:[50]});
 assert.deepEqual(layout.dimensionsInText('30 mm below collar'),{width:[],height:[]});
 assert.deepEqual(layout.dimensionsInText('10 x 5 cm'),{width:[100],height:[50]});
 assert.deepEqual(layout.dimensionsInText('width: 4 inches height: 2 in'),{width:[101.6],height:[50.8]});
});
test('same-line positions recover their own sizes',()=>{
 const input={requestText:'Left breast 100 mm wide; right sleeve 80 mm wide'};
 const left=mark({widthMm:''}),right=mark({position:'right sleeve',widthMm:''});
 layout.recoverDimensions(left,input);layout.recoverDimensions(right,input);
 assert.equal(left.widthMm,'100');assert.equal(right.widthMm,'80');
});
test('conflicts are retained for review rather than first-match wins',()=>{
 const d=mark({notes:'80 mm wide'});layout.recoverDimensions(d,{});assert.match(d.dimensionIssues[0],/Conflicting widths/);
});
test('height-only sizing preserves actual proportions',()=>{
 const size=layout.artworkSize(mark({widthMm:'',heightMm:'40'}),2);assert.equal(size.width,80);assert.equal(size.height,40);
 assert.throws(()=>layout.artworkSize(mark({widthMm:'100',heightMm:'100'}),2),/proportions/);
});
test('large and tall artwork have no silent width or height caps',()=>{
 const g={width:700,height:850,view:'front'};const a={width:100,height:400};
 const p=layout.placementFor(mark(),a,g);assert.equal(p.width*700,100);assert.equal(p.height*850,400);
 const p2=layout.placementFor(mark({widthMm:'300'}),a,g);assert.equal(p2.width/p.width,3);
 assert.equal(layout.fitsRegion(p2),false);
});
test('calibration sets scale and landmarks apply signed physical offsets',()=>{
 const g={width:700,height:850,view:'front'},a={width:200,height:100};
 const c={start:{x:0,y:.5},end:{x:1,y:.5},referenceMm:'350',collar:{x:.5,y:.1}};
 const p=layout.placementFor(mark({anchor:'collar',offsetYmm:'30',offsetXmm:'-10'}),a,g,c);
 assert.equal(p.width*700,200);assert.equal(p.calibrated,true);assert.ok(Math.abs(p.y-(.1+60/850))<1e-8);assert.equal(p.x,.5-20/700);
 const estimated=layout.placementFor(mark({offsetYmm:'30'}),a,g);assert.equal(estimated.calibrated,false);assert.ok(estimated.y>.23);
});
test('ambiguous uploads do not depend on order and explicit ids are authoritative',()=>{
 const files=[{id:'a',fileName:'alpha.png',assignment:'left breast'},{id:'b',fileName:'beta.png',assignment:'left breast'}];
 assert.equal(layout.findArtwork(mark({artworkId:'',artwork:'crest'}),files),null);
 assert.equal(layout.findArtwork(mark({artworkId:'',artwork:'crest'}),files.reverse()),null);
 assert.equal(layout.findArtwork(mark({artworkId:'b'}),files).id,'b');
 assert.equal(layout.findArtwork(mark({artworkId:'missing'}),files),null);
});
test('product exceptions replace shared positions and allow explicit removal',()=>{
 const b=brief([mark({position:'LB',method:'Print',widthMm:'75'})]);b.sharedDecorations=[mark({method:'Embroidery'})];
 assert.equal(layout.resolveDecorations(b,b.products[0]).length,1);assert.equal(layout.resolveDecorations(b,b.products[0])[0].widthMm,'75');
 b.products[0].decorations[0].omit=true;assert.equal(layout.resolveDecorations(b,b.products[0]).length,0);
});
test('back and side views are selected independently and both supplier sides survive',()=>{
 const views=brief().products[0].visual.views;
 assert.equal(layout.preferredView(mark({position:'nape'}),views),'back');assert.equal(layout.preferredView(mark({position:'RS'}),views),'right');
 assert.equal(layout.preferredView(mark({position:'right sleeve'}),[{view:'front'}]),'front');
 const v=selectPencarrieVisual({brandcolour_details:[{id:1,name:'Navy'}],assets:['LEFT','RIGHT','BACK','FRONT'].map(type=>({brandColour:1,type:`IMAGE/${type}`,paths:{ProductCarouselMain:`/storage/${type}`}}))},'Navy');
 assert.equal(v.views.length,4);
});
test('transparent artwork padding does not change visible size',async()=>{
 const pdf=await PDFDocument.create();const a=await artwork.prepareArtwork(pdf,await artFile({padding:120}));assert.equal(a.width,200);assert.equal(a.height,100);
});
test('PDF visible bounds preserve vectors and ignore empty artboards',async()=>{
 const src=await PDFDocument.create();src.addPage([400,400]).drawRectangle({x:100,y:150,width:200,height:100,color:rgb(1,0,0)});
 const dest=await PDFDocument.create();const a=await artwork.prepareArtwork(dest,{file:{buffer:Buffer.from(await src.save())}});assert.equal(a.kind,'page');assert.equal(a.width,200);assert.equal(a.height,100);
});
test('multiple PDF pages are rejected rather than silently taking the first',async()=>{
 const src=await PDFDocument.create();src.addPage();src.addPage();
 const bytes=Buffer.from(await src.save());const dest=await PDFDocument.create();await assert.rejects(()=>artwork.prepareArtwork(dest,{file:{buffer:bytes}}),/one artwork per PDF/);
});
test('white garments on transparency have a usable mask',async()=>{
 const garment=await artwork.analyseGarment(await garmentBytes('#ffffff'));assert.equal(garment.confident,true);assert.ok(garment.mask.some(v=>v===1));assert.ok(garment.mask.some(v=>v===0));
});
test('side scale follows full garment height rather than treating depth as flat chest width',async()=>{
 const front=await artwork.analyseGarment(await garmentBytes());
 Object.assign(front,artwork.automaticGarmentProfile({name:'Hoodie'},front,'front'));
 const side={...front,width:Math.floor(front.width/2)};
 // Keep a valid side mask while narrowing the silhouette's width.
 side.mask=new Uint8Array(side.width*side.height).fill(1);
 const profile=artwork.automaticGarmentProfile({name:'Hoodie'},side,'right',front);
 assert.equal(profile.estimatedPxPerMm,front.estimatedPxPerMm);
 const resized={...side,height:side.height*2,mask:new Uint8Array(side.width*side.height*2).fill(1)};
 assert.equal(artwork.automaticGarmentProfile({name:'Hoodie'},resized,'right',front).estimatedPxPerMm,front.estimatedPxPerMm*2);
});
test('sleeve fitting never changes size and does not override manual positions',async()=>{
 const g=await artwork.analyseGarment(await garmentBytes());g.view='front';const p=layout.placementFor(mark({position:'RS',widthMm:'50'}),{width:200,height:100},g);
 const fitted=artwork.fitSleeve(g,p);assert.equal(fitted.width,p.width);assert.equal(fitted.height,p.height);
 const explicit={...p,explicit:true};assert.equal(artwork.fitSleeve(g,explicit),explicit);
});
test('front and back share one product sheet while keeping separate placement geometry',async()=>{
 const b=brief([mark(),mark({id:'back',position:'back',widthMm:'250'})]);
 const out=await buildProof(b,[await artFile({padding:100})],{fetchImpl:await fixtureFetch(),strict:true});
 assert.equal((await PDFDocument.load(out.bytes)).getPageCount(),1);assert.deepEqual(out.pages.map(p=>p.view),['front','back']);
 assert.equal(out.documents.length,1);assert.equal((await PDFDocument.load(out.documents[0].bytes)).getPageCount(),1);
 assert.equal(out.pages[1].placements[0].size.width,250);assert.equal(out.issues.some(i=>i.blocking),false);
});
test('each product gets one sheet and its own PDF, and the combined PDF preserves product order',async()=>{
 const b=brief([mark(),mark({id:'back',position:'back',widthMm:'250'}),mark({id:'sleeve',position:'right sleeve',widthMm:'50'})]);
 b.products.push({...structuredClone(b.products[0]),code:'SECOND',colour:'Red'});
 const out=await buildProof(b,[await artFile()],{fetchImpl:await fixtureFetch()});
 assert.equal((await PDFDocument.load(out.bytes)).getPageCount(),2);
 assert.deepEqual(out.documents.map(d=>d.code),['TEST','SECOND']);
 assert.deepEqual(out.pages.map(p=>p.pdfPageIndex),[0,0,0,1,1,1]);
 for(const document of out.documents){assert.equal((await PDFDocument.load(document.bytes)).getPageCount(),1);assert.equal(document.fileName,'TEST - Local test - Placement regression - PROOF.pdf');}

});
test('missing artwork, unsupported positions and oversize regions block final output',async()=>{
 const fetchImpl=await fixtureFetch();const files=[await artFile()];
 for(const d of [mark({artworkId:'unknown'}),mark({position:'ankle'}),mark({widthMm:'1000'})]){
  const out=await buildProof(brief([d]),files,{fetchImpl});assert.ok(out.issues.some(i=>i.blocking));
  await assert.rejects(()=>buildProof(brief([d]),files,{fetchImpl,strict:true}));
 }
});
test('stale image calibrations cannot be used',async()=>{
 const b=brief();b.products[0].calibrations={front:{sourceHash:'old',referenceMm:100,start:{x:0,y:0},end:{x:1,y:0}}};
 const out=await buildProof(b,[await artFile()],{fetchImpl:await fixtureFetch()});assert.ok(out.issues.some(i=>i.blocking&&/different supplier image/.test(i.message)));
});
test('route authorisation protects parse, preview and create',async()=>{
 const app=express();app.use(express.json());app.use('/api/proof-generator',createRouter());
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const url=`http://127.0.0.1:${server.address().port}/api/proof-generator`;
  for(const route of ['parse','preview','create']){const res=await fetch(`${url}/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(res.status,401);}
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('preview route returns issues and PDF without production writes',async()=>{
 const app=express();app.use(express.json());const fetchImpl=await fixtureFetch();
 app.use('/api/proof-generator',createRouter({requireProduction:false,enrich:async b=>b,build:(b,a,o)=>buildProof(b,a,{...o,fetchImpl})}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const file=await artFile();const form=new FormData();form.append('brief',JSON.stringify(brief()));form.append('artworkDetails',JSON.stringify([{id:'art'}]));form.append('artworks',new Blob([file.file.buffer],{type:'image/png'}),'logo.png');
  const res=await fetch(`http://127.0.0.1:${server.address().port}/api/proof-generator/preview`,{method:'POST',body:form});assert.equal(res.status,200);const body=await res.json();assert.equal(body.pages.length,1);assert.equal(Buffer.from(body.pdf,'base64').subarray(0,4).toString(),'%PDF');
 }finally{await new Promise(resolve=>server.close(resolve));}
});


test('automatic placement uses garment landmarks without operator input',async()=>{
 const g=await artwork.analyseGarment(await garmentBytes());g.view='front';Object.assign(g,artwork.automaticGarmentProfile({name:'T-shirt'},g,'front'));
 assert.ok(g.estimatedPxPerMm>0);assert.ok(g.landmarks.collar.y<.2);
 const p=layout.placementFor(mark({anchor:'collar',offsetYmm:'30'}),{width:200,height:100},g);
 assert.equal(p.calibrated,false);assert.ok(p.y>g.landmarks.collar.y);

});
test('recovery scopes artwork notes, garment codes and compound positions',()=>{
 const input={requestText:'AA1 left breast 100 mm wide; BB2 left breast 80 mm wide',artworks:[{id:'art',notes:'left breast 100 mm wide; back 250 mm wide'}]};
 const d=mark({widthMm:''});layout.recoverDimensions(d,input,{code:'AA1'},[{code:'AA1'},{code:'BB2'}]);assert.equal(d.widthMm,'100');assert.deepEqual(d.dimensionIssues,[]);
 const back=mark({position:'upper back',widthMm:''});layout.recoverDimensions(back,{requestText:'upper back 200 mm wide'});assert.equal(back.widthMm,'200');
});
test('white-background detection is edge connected and keep mode preserves intentional backgrounds',async()=>{
 const bytes=await sharp({create:{width:100,height:100,channels:4,background:'#fff'}}).composite([{input:await sharp({create:{width:40,height:20,channels:4,background:'#222'}}).png().toBuffer(),left:30,top:40}]).png().toBuffer();
 const pdf=await PDFDocument.create();
 const clean=await artwork.prepareArtwork(pdf,{file:{buffer:bytes},backgroundMode:'auto'});assert.equal(clean.width,40);assert.equal(clean.height,20);assert.ok(clean.warnings.some(w=>/White edge/.test(w)));
 const keep=await artwork.prepareArtwork(pdf,{file:{buffer:bytes},backgroundMode:'keep'});assert.equal(keep.width,100);assert.equal(keep.height,100);
});
test('rotated PDFs retain the intended visible aspect ratio',async()=>{
 const {degrees}=require('pdf-lib');const src=await PDFDocument.create();const page=src.addPage([400,400]);page.drawRectangle({x:100,y:150,width:200,height:100,color:rgb(1,0,0)});page.setRotation(degrees(90));
 const dest=await PDFDocument.create();const asset=await artwork.prepareArtwork(dest,{file:{buffer:Buffer.from(await src.save())}});assert.equal(asset.width/asset.height,.5);assert.ok(asset.warnings.some(w=>/rasterised/.test(w)));
});
test('an explicit manual position is not moved by automatic anchors or sleeve fitting',async()=>{
 const g=await artwork.analyseGarment(await garmentBytes());g.view='front';
 const p=layout.placementFor(mark({position:'right sleeve',placement:{x:.2,y:.24}}),{width:200,height:100},g);
 assert.equal(p.x,.2);assert.equal(p.y,.24);assert.equal(artwork.fitSleeve(g,p),p);
});
test('unknown upload IDs and overlapping decorations cannot produce final proofs',async()=>{
 const files=[await artFile()];const fetchImpl=await fixtureFetch();
 await assert.rejects(()=>buildProof(brief(),[{...files[0],id:''}],{fetchImpl,strict:true}),/unique ID/);
 await assert.rejects(()=>buildProof(brief([mark(),mark({id:'second'})]),files,{fetchImpl,strict:true}),/overlap/);
});
test('literal garment codes survive an incomplete model extraction without guessing brands',()=>{
 const b={products:[{code:'',name:'RX350 hoodie'},{code:'',name:'Brand hoodie'},{code:'',name:'03824 fleece'},{code:'',name:'AA1 or BB2'}]};
 layout.recoverProductCodes(b,{requestText:'RX350 hoodie, Navy; 03824 fleece; AA1 or BB2'});
 assert.equal(b.products[0].code,'RX350');assert.equal(b.products[1].code,'');assert.equal(b.products[2].code,'03824');assert.equal(b.products[3].code,'');
});

test('automatic vertical anchors match the supplied reference proofs',()=>{
 const {placementProfile,automaticTop}=require('../src/services/proofPlacementProfiles');
 const refs=require('./fixtures/proof-placement-references.json');
 for(const sample of [...refs.smallMarks,...refs.compositions]){
  const h=sample.garmentY[1]-sample.garmentY[0];
  const artworkHeight=(sample.artworkY[1]-sample.artworkY[0])/h;
  const expected=(sample.artworkY[0]-sample.garmentY[0])/h;
  const actual=automaticTop(sample.position,sample.view||'front',artworkHeight,placementProfile(sample));
  assert.ok(Math.abs(actual-expected)<=sample.tolerance,`${sample.source} ${sample.position}: ${actual} vs ${expected}`);
 }
});
test('breast logo centres stay aligned across artwork shapes and garment types',()=>{
 const {placementProfile}=require('../src/services/proofPlacementProfiles');
 const g={view:'front',width:700,height:850,placementProfile:placementProfile({code:'RX350'})};
 const wide=layout.placementFor(mark(),{width:200,height:50},g);
 const square=layout.placementFor(mark(),{width:100,height:100},g);
 assert.ok(Math.abs((wide.y+wide.height/2)-(square.y+square.height/2))<1e-10);
 assert.ok(wide.y>.30);assert.ok(square.y>.28);
 const manual=layout.placementFor(mark({placement:{x:.65,y:.23}}),{width:200,height:50},g);
 assert.equal(manual.y,.23);
 const custom=layout.placementFor(mark(),{width:200,height:50},g,{regions:{'left breast':{...layout.regionFor('left breast','front'),y:.25}}});
 assert.equal(custom.y,.25);
});
test('sleeve edge fitting cannot undo the reference height with a large upward move',async()=>{
 const {placementProfile}=require('../src/services/proofPlacementProfiles');
 const g=await artwork.analyseGarment(await garmentBytes());g.view='front';g.placementProfile=placementProfile({code:'RX350'});
 const p=layout.placementFor(mark({position:'right sleeve',widthMm:'50'}),{width:200,height:50},g);
 const fitted=artwork.fitSleeve(g,p);assert.ok(Math.abs(fitted.y-p.y)<=.020001);assert.equal(fitted.height,p.height);
});

test('descriptive or ambiguous model code fields cannot break supplier lookup',()=>{
 const b={products:[{code:'RX350 hoodie',name:'Hoodie'},{code:'rx350',name:'Hoodie'},{code:'AA1 or BB2',name:'Shirt'},{code:'RX350 hoodie',name:'Hoodie'}]};
 layout.recoverProductCodes(b,{requestText:'RX350 hoodie and AA1 or BB2'});
 assert.equal(b.products[0].code,'RX350');assert.equal(b.products[1].code,'RX350');assert.equal(b.products[2].code,'');
 const absent={products:[{code:'ZZ999 hoodie',name:'Hoodie'}]};layout.recoverProductCodes(absent,{requestText:'A navy hoodie'});assert.equal(absent.products[0].code,'');
});
test('supplier outage is one cause, not cascading colour and view errors',async()=>{
 const b=brief([mark(),mark({id:'back',position:'back',widthMm:'250'})]);
 b.products[0].visual={matched:false,views:[],lookupIssue:'supplier_unavailable'};
 const out=await buildProof(b,[await artFile()],{fetchImpl:await fixtureFetch()});
 const blocking=out.issues.filter(i=>i.blocking);
 assert.equal(blocking.length,1);assert.match(blocking[0].message,/supplier connection/);
 assert.equal(out.pages.every(p=>!p.image),true);
 await assert.rejects(()=>buildProof(b,[],{strict:true}),/supplier connection/);
});
test('an actual catalogue mismatch still reports missing views and colour',async()=>{
 const b=brief();b.products[0].visual={matched:false,views:[]};
 const out=await buildProof(b,[await artFile()],{fetchImpl:await fixtureFetch()});
 assert.ok(out.issues.some(i=>/No verified front/.test(i.message)));
 assert.ok(out.issues.some(i=>/colour/.test(i.message)));
});
test('supplier HTTP failure survives enrichment for actionable error reporting',async()=>{
 const {enrichProofProducts}=require('../src/services/proofProductVisuals');
 const b=brief();await enrichProofProducts(b,{fetchImpl:async()=>({ok:false,status:403})});
 assert.equal(b.products[0].visual.lookupIssue,'supplier_unavailable');
});

test('each garment view shows only its own print methods',async()=>{
 const b=brief([mark({method:'embroidery'}),mark({id:'back',position:'back',method:'print',widthMm:'250'})]);
 b.products[0].colour='Navy*';
 const out=await buildProof(b,[await artFile()],{fetchImpl:await fixtureFetch()});
 assert.deepEqual(out.pages.map(p=>[p.view,p.printMethods]),[['front',['Embroidery']],['back',['Transfer print']]]);
 assert.equal(b.products[0].colour,'Navy*');
});

test('PNG preparation preserves faint and disconnected marks at every canvas edge',async()=>{
 const width=80,height=60,data=Buffer.alloc(width*height*4);
 for(const [x,y,alpha] of [[0,0,1],[79,0,255],[0,59,255],[79,59,1],[40,30,255]]){
  const i=(y*width+x)*4;data[i]=228;data[i+1]=35;data[i+2]=19;data[i+3]=alpha;
 }
 const buffer=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer();
 const asset=await artwork.prepareArtwork(await PDFDocument.create(),{file:{originalname:'edge-marks.png',buffer}});
 assert.equal(asset.width,width);assert.equal(asset.height,height);
 const preview=Buffer.from(asset.preview.split(',')[1],'base64');
 assert.deepEqual(await sharp(preview).raw().toBuffer(),data);
});
