const test=require('node:test');
const assert=require('node:assert/strict');
const {gunzipSync}=require('node:zlib');
const {automaticGarmentProfile}=require('../src/services/proofArtwork');
const {placementFor,prepareBrief}=require('../src/services/proofLayout');
const {chestGeometry}=require('../src/services/proofChestGeometry');
const fixtures=require('./fixtures/proof-chest-silhouettes.json').samples;
const asset={width:100.1,height:20.9};
function garment(f,product={},view='front'){
 const mask=gunzipSync(Buffer.from(f.maskGzip,'base64'));
 const base={width:f.width,height:f.height,mask,torsoMask:mask,confident:true};
 return {...base,...automaticGarmentProfile({name:f.name,...product},base,view),view,sourceHash:'fixture'};
}
const mark=extra=>({position:'left breast',widthMm:100.1,placementVersion:2,...extra});
test('all seven corrected silhouettes improve without product-code rules or the accidental resize',()=>{
 for(const f of fixtures){
  const g=garment(f),old=placementFor(mark({placementVersion:undefined}),asset,g),next=placementFor(mark(),asset,g);
  assert.ok(Math.abs(old.x-f.originalX)<1e-9,f.label+' original reproduction');
  assert.ok(Math.abs(next.x-f.manual.x)<.025,f.label+' chest panel');
  assert.ok(Math.hypot(next.x-f.manual.x,next.y-f.manual.y)<Math.hypot(old.x-f.manual.x,old.y-f.manual.y)*.45,f.label+' improves overall position');
  assert.equal(next.width,old.width);assert.equal(next.height,old.height);assert.equal(next.size.width,100.1);
  if(/polo/i.test(f.name))assert.equal(next.y,old.y,'retain good polo height');
  const renamed=garment(f,{code:'UNSEEN-STYLE'});
  assert.deepEqual(placementFor(mark(),asset,renamed),next);
  const right=placementFor(mark({position:'right breast'}),asset,g);
  assert.ok(Math.abs((right.x+next.x)/2-(g.breastGeometry.body.left+g.breastGeometry.body.width/2))<1e-9);
 }
});
test('new geometry leaves manual, calibrated, offsets, other views and positions unchanged',()=>{
 for(const f of fixtures){
  const g=garment(f);
  for(const extra of [{placement:{x:.67,y:.24},manualScale:{view:'front',sourceHash:'fixture',widthPerMm:.0017}}, {anchor:'collar',offsetYmm:70}, {offsetXmm:5}, {position:'back'}, {position:'front'}, {position:'right sleeve'}]){
   assert.deepEqual(placementFor(mark(extra),asset,g),placementFor(mark({...extra,placementVersion:undefined}),asset,g));
  }
  for(const calibration of [{referenceMm:550,start:{x:0,y:.5},end:{x:1,y:.5}}, {regions:{'left breast':{x:.65,y:.2,left:.5,top:.1,width:.4,height:.4}}}])
   assert.deepEqual(placementFor(mark(),asset,g,calibration),placementFor(mark({placementVersion:undefined}),asset,g,calibration));
  assert.equal(garment(f,{measurements:{flatChestWidthMm:550}}).breastGeometry,null);
  for(const view of ['back','left','right'])assert.equal(garment(f,{},view).breastGeometry,null);
  for(const code of ['RX700','YK102','KK350'])assert.equal(garment(f,{code}).breastGeometry,null);
 }
});
test('uncertain, compact and fragmented silhouettes retain the fallback',()=>{
 const g=garment(fixtures[0]);
 assert.equal(chestGeometry({...g,confident:false},'front'),null);
 assert.equal(chestGeometry({...g,mask:new Uint8Array(g.width*g.height).fill(1),torsoMask:null},'front'),null);
 assert.equal(chestGeometry({...g,mask:new Uint8Array(g.width*g.height),torsoMask:null},'front'),null);
});
test('placement version persists and retained proofs are never silently migrated',()=>{
 const brief=extra=>({...extra,products:[{name:'Polo',decorations:[{position:'left breast',widthMm:100.1}]}]});
 const fresh=prepareBrief(brief({}));assert.equal(fresh.products[0].decorations[0].placementVersion,2);
 for(const extra of [{proofDesignId:'saved'},{testProofId:'test'}])assert.equal(prepareBrief(brief(extra)).products[0].decorations[0].placementVersion,undefined);
 const manual=brief({});manual.products[0].decorations[0].placement={x:.65,y:.25};assert.equal(prepareBrief(manual).products[0].decorations[0].placementVersion,undefined);
 fresh.proofDesignId='saved';assert.equal(prepareBrief(fresh).products[0].decorations[0].placementVersion,2);
});
