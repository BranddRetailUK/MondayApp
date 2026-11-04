const test=require('node:test'),assert=require('node:assert/strict');
const {assess,inspect}=require('../src/services/proofPreflight');
const {repairRetainedDimensions}=require('../src/services/proofLayout');
const sharp=require('sharp');
const brief=()=>({products:[{code:'JH001',colour:'Jet Black',visual:{matched:true},decorations:[{id:'sleeve',position:'right sleeve',method:'embroidery',artworkId:'sleeve',widthMm:'90'},{id:'back',position:'back',method:'transfer print',artworkId:'back',widthMm:'240'}]}]});
const assets=[{id:'sleeve',originalName:'psg5547_PXF.PNG',digest:'correct'},{id:'back',originalName:'westway climbing team_240mm WHITE.eps'}];
test('confirmed Westway brief passes without changing dimensions, placement or artwork',()=>{
 const b=brief(),before=structuredClone(b);assert.equal(assess(b,assets,'Right sleeve – PSG 5547\nBACK: CLIMBING TEAM - WHITE PRINT').ready,true);assert.deepEqual(b,before);
});
test('all missing details and conflicting reference are collected in a single response',()=>{
 const b=brief(),p=b.products[0],d=p.decorations[0];p.colour='Black';p.visual={matched:false,lookupIssue:'colour_ambiguous',availableColours:['Jet Black','Deep Black','Black Smoke']};d.widthMm='';d.method='';p.decorations[1].artworkId='';
 const a=[{...assets[0],originalName:'psg5543.PXF',lowResolution:true,opaqueLightBackground:true},assets[1],{id:'dst',originalName:'test.dst',threadColours:['','#ffffff']}];
 const result=assess(b,a,'Right sleeve – Everyone Active – PSG 5547');
 assert.equal(result.issues.length,7);assert.equal(result.ready,false);
 assert.ok(result.issues.some(i=>i.options?.includes('Jet Black')));assert.ok(result.issues.some(i=>i.message.includes('PSG5547')));
});
test('acknowledgements are tied to the file content and requested reference',()=>{
 const b=brief(),a=[{...assets[0],originalName:'psg5543.PXF'},assets[1]];
 const first=assess(b,a,'Right sleeve PSG5547');b.preflightAcknowledgements=first.issues.map(i=>i.ack);
 assert.equal(assess(b,a,'Right sleeve PSG5547').ready,true);
 assert.equal(assess(b,[{...a[0],digest:'replacement'},a[1]],'Right sleeve PSG5547').ready,false);
 assert.equal(assess(b,a,'Right sleeve PSG5550').ready,false);
});
test('PXF thumbnail pixels never supply missing physical dimensions',async()=>{
 const file={originalname:'preview.png',buffer:await sharp({create:{width:200,height:200,channels:4,background:'#ffffff'}}).png().toBuffer()};
 const inspected=await inspect(file,{id:'sleeve',originalName:'psg5547.PXF'});
 assert.equal(inspected.lowResolution,true);assert.equal(inspected.opaqueLightBackground,true);assert.equal(inspected.widthMm,undefined);
 const b=brief();b.products[0].decorations[0].widthMm='';assert.ok(assess(b,[inspected,assets[1]]).issues.some(i=>i.path.endsWith('widthMm')));
});
test('transparent white artwork remains valid; fully transparent artwork is blocked',async()=>{
 const white=await sharp({create:{width:600,height:300,channels:4,background:'#ffffff'}}).extend({top:10,bottom:10,left:10,right:10,background:'#00000000'}).png().toBuffer();
 const a=await inspect({originalname:'art.png',buffer:white},{...assets[0]});assert.equal(a.blank,false);assert.equal(a.opaqueLightBackground,false);
 const blank=await inspect({originalname:'art.png',buffer:await sharp({create:{width:2,height:2,channels:4,background:'#00000000'}}).png().toBuffer()},assets[0]);
 assert.equal(blank.blank,true);assert.equal(assess(brief(),[blank,assets[1]]).ready,false);
});
test('explicit review corrections survive retained brief recovery',()=>{
 const b=brief(),d=b.products[0].decorations[0];d.dimensionSource='user-confirmed';
 repairRetainedDimensions(b,{request:'JH001 Right sleeve width 100mm'});assert.equal(d.widthMm,'90');assert.equal(d.heightMm,undefined);
});
test('one confirmed height is sufficient; invalid axes and missing typed font/colour are grouped',()=>{
 const b=brief(),d=b.products[0].decorations[0];d.widthMm='';d.heightMm='40';assert.equal(assess(b,assets).ready,true);
 d.widthMm='-1';d.artworkId='';d.text='Alice';assert.equal(assess(b,assets).issues.length,3);
});
test('quality acknowledgement and size can be answered together without a second quality question',()=>{
 const b=brief(),a=[{...assets[0],originalName:'psg5547.PXF',lowResolution:true},assets[1]];b.products[0].decorations[0].widthMm='';
 const first=assess(b,a);b.preflightAcknowledgements=first.issues.filter(i=>i.ack).map(i=>i.ack);b.products[0].decorations[0].widthMm='90';
 assert.equal(assess(b,a).ready,true);
});

test('TBC exempts only absent sizes and missing-method options exclude screen print',()=>{
 const b=brief(),d=b.products[0].decorations[0];d.widthMm='';d.sizeTbc=true;assert.equal(assess(b,assets).ready,true);
 d.widthMm='bad';assert.ok(assess(b,assets).issues.some(i=>i.path.endsWith('widthMm')));
 d.widthMm='';d.sizeTbc=false;assert.ok(assess(b,assets).issues.some(i=>i.path.endsWith('widthMm')));
 d.method='';assert.deepEqual(assess(b,assets).issues.find(i=>i.path.endsWith('method')).options,['embroidery','transfer print']);
 d.method='screen print';d.widthMm='90';assert.equal(assess(b,assets).ready,true);
});

test('shorts position review offers pocket and outer-hem choices instead of top positions',()=>{
 const b=brief(),p=b.products[0];p.name='Kids fashion cycling shorts';p.code='SM427';p.decorations=[{...p.decorations[0],position:''}];
 const issue=assess(b,assets).issues.find(i=>i.path.endsWith('.position'));
 assert.deepEqual(issue.options,[{value:'left leg',label:'Left'},{value:'right leg',label:'Right'},{value:'bottom left leg',label:'Bottom left'},{value:'bottom right leg',label:'Bottom right'}]);
 for(const {value} of issue.options){p.decorations[0].position=value;assert.equal(assess(b,assets).ready,true);}
 p.decorations[0].position='left hem';assert.equal(assess(b,assets).ready,true,'legacy proofs remain editable');
 p.name='T-shirt';p.decorations[0].position='';assert.ok(assess(b,assets).issues.find(i=>i.path.endsWith('.position')).options.includes('left breast'));
});

test('RX700 pocket brief resolves breast positions and keeps all supplied widths',()=>{
 const {prepareBrief}=require('../src/services/proofLayout');
 const b={products:[{code:'RX700',name:'Waistcoat',colour:'HV Yellow',decorations:[
  {position:'right pocket',artworkId:'mwa'}, {position:'left pocket',artworkId:'360'}, {position:'back',artworkId:'combined',method:'transfer print'}
 ]}]};
 const a=[{id:'mwa',originalName:'MWA Logo Redraw.png'},{id:'360',originalName:'360.png'},{id:'combined',originalName:'MWA 360 BACK.png'}];
 prepareBrief(b,{requestText:'RX700 - Waistcoat (Ralawise), HV Yellow\nmwa logo to right pocket 90mm wide\n360 logo to left pocket 70mm wide\nmwa 360 back artwork to back 220mm wide',artworks:a});
 assert.deepEqual(b.products[0].decorations.map(d=>[d.position,d.widthMm]),[['right breast','90'],['left breast','70'],['back','220']]);
 const issues=assess(b,a).issues;
 assert.deepEqual(issues.map(i=>i.path),['products.0.decorations.0.method','products.0.decorations.1.method']);
 b.products[0].decorations.slice(0,2).forEach(d=>d.method='embroidery');
 assert.equal(assess(b,a).ready,true);
});

test('shared pockets resolve per garment and canonical product overrides win',()=>{
 const {prepareBrief,positionName}=require('../src/services/proofLayout');
 const b={method:'transfer print',sharedDecorations:[{position:'left pocket',artworkId:'shared',widthMm:'70'}],products:[
  {name:'Hi vis jacket',decorations:[{position:'left breast',artworkId:'override',widthMm:'90'}]},
  {name:'Cycling shorts',decorations:[]}, {name:'Unknown item',decorations:[]}
 ]};
 prepareBrief(b);
 assert.deepEqual(b.products.map(p=>p.decorations.map(d=>[d.position,d.artworkId])),[[['left breast','override']],[['left leg','shared']],[['left pocket','shared']]]);
 assert.equal(positionName('right pocket'),'right pocket');
 assert.equal(positionName('right',{name:'Jacket'}),'right');
 assert.equal(positionName('right',{name:'Shorts'}),'right leg');
 assert.equal(positionName('right leg',{name:'Jacket'}),'right leg','explicit incompatible positions still require review');
});

test('one requested version per artwork recovers a merged front as two independent sheets',()=>{
  const {prepareBrief}=require('../src/services/proofLayout');
  const p={code:'R369X',name:'HDI Quest knitted hat',colour:'Black',decorations:['colour','white'].map(artworkId=>({artworkId,method:'embroidery',position:'front',widthMm:'100'}))};
  const input={requestText:'R369X Black\n2 VERSIONS 1 FOR EACH ARTWORK. BOTH EMBROIDERED 100MM WIDE ON FRONT OF BEANIE',artworks:[{id:'colour'},{id:'white'}]};
  const run=(product=p,body=input,extra={})=>prepareBrief({products:[structuredClone(product)],...extra},body).products;
  const pages=run();
  assert.deepEqual(pages.map(page=>page.decorations.map(d=>[d.artworkId,d.widthMm])),[[['colour','100']],[['white','100']]]);
  assert.notEqual(pages[0].instanceId,pages[1].instanceId);
  assert.equal(run(p,{...input,requestText:'Both logos on the same front'}).length,1);
  assert.equal(run(p,{...input,requestText:'Do not make one proof per artwork'}).length,1);
  assert.equal(run(p,{...input,requestText:'3 versions 1 for each artwork'}).length,1);
  assert.equal(run(p,input,{proofDesignId:'retained'}).length,1);
  assert.equal(run({...p,decorations:[p.decorations[0],{...p.decorations[1],position:'back'}]}).length,1);
  assert.equal(run({...p,decorations:[p.decorations[0],p.decorations[0]]}).length,1);
});

test('headwear review catches unsupported surfaces, missing photos and correctable views before allocation',()=>{
  const {headwearKind}=require('../src/services/proofHeadwear');
  const b=brief(),p=b.products[0];
  p.code='K1';p.name='Bobble hat';p.decorations=[{...p.decorations[0],position:'front'}];
  p.visual.views=[{view:'front',url:'supplier'}];
  assert.equal(headwearKind(p),'beanie');
  assert.equal(assess(b,assets).ready,true);
  p.name='Cuffed knitted hat';assert.equal(headwearKind(p),'cuffed-beanie');
  p.name='Knitted bucket hat';assert.match(assess(b,assets).issues[0].message,/reviewed decoration template/);
  p.name='Knitted hat';p.visual.views=[];assert.match(assess(b,assets).issues[0].message,/supplier image/);
  p.visual.views=[{view:'front',url:'supplier'}];p.decorations[0].view='back';p.decorations[0].position='left breast';
  assert.deepEqual(assess(b,assets).issues.map(i=>[i.path,i.options]),[
    ['products.0.decorations.0.position',['front']],['products.0.decorations.0.view',['front']]]);
  p.decorations[0].position='front';p.decorations[0].view='front';assert.equal(assess(b,assets).ready,true);
});

test('preflight flags an omitted or repeated alternative even if the remaining logo renders',()=>{
  const request='Two versions, one for each artwork', b=brief(),p=b.products[0];
  p.decorations=[p.decorations[0]];
  assert.match(assess(b,assets,request).issues[0].message,/each supplied artwork/);
  b.products.push(structuredClone(p));
  assert.match(assess(b,assets,request).issues[0].message,/each supplied artwork/);
  b.products[1].decorations[0].artworkId=assets[1].id;
  assert.equal(assess(b,assets,request).ready,true);
  assert.match(assess(b,assets,'3 versions 1 for each artwork').issues[0].message,/3 versions for 2 artwork files/);
});
