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
