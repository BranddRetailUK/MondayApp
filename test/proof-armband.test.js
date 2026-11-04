const test=require('node:test'),assert=require('node:assert/strict');
const {automaticGarmentProfile}=require('../src/services/proofArtwork');
const {placementFor,fitsRegion,positionOptions}=require('../src/services/proofLayout');
const {ensureGeneratedViews}=require('../src/services/proofGeneratedViews');
const white='e897b47fe3e7651a7e7a20490baccfe24730e02c9be0ab5885c2499e0c487369';
const photo=(product,sourceHash=white)=>{
  const g={width:700,height:822,view:'front',sourceHash};
  return {...g,...automaticGarmentProfile(product,g,'front')};
};
const art={width:100,height:90},mark={position:'front',widthMm:50};
test('YK201 and manufacturer alias scale mm to the front face of the wrapped band',()=>{
  for(const product of [{code:'YK201'},{code:'HVW066'},{visual:{styleCode:'YK201'}}]){
    const g=photo(product),p=placementFor(mark,art,g);
    assert.equal(g.scaleSource,'supplier-band-depth');assert.equal(g.bandHeightMm,100);
    assert.equal(p.size.width,50);
    assert.ok(Math.abs(p.width*700-328.8)<1e-8);
    assert.ok(Math.abs(p.y+p.height/2-.60)<1e-8);assert.ok(fitsRegion(p));
    assert.equal(placementFor({...mark,widthMm:25},art,g).width,p.width/2);
    assert.ok(!fitsRegion(placementFor({...mark,widthMm:120},art,g)));
  }
});
test('replacement and unknown armband photos require a scale, and a saved edit or calibration takes precedence',()=>{
  for(const [product,hash] of [[{code:'YK201'},'replacement'],[{name:'Security arm band'},white],[{code:'YK201'},white]]){
    const g=photo(product,hash);
    if(g.scaleSource==='unreviewed-armband')assert.throws(()=>placementFor(mark,art,g),/Armband scale needs review/);
    const d={...mark,placement:{x:.54,y:.36},visualScale:8,manualScale:{widthPerMm:.0015,sourceHash:hash,view:'front'}};
    assert.equal(placementFor(d,art,g).width,.6);
    const p=placementFor(d,art,g,{referenceMm:100,start:{x:0,y:0},end:{x:.1,y:0}});
    assert.ok(p.calibrated);assert.ok(Math.abs(p.width-.4)<1e-8);
    assert.deepEqual(positionOptions(product),['front']);
  }
});
test('armbands never request a torso photo when the requested view is missing',async()=>{
  const product={code:'YK201',visual:{matched:true,views:[{view:'front',url:'supplier-front'}]},decorations:[{position:'back'}]};
  await ensureGeneratedViews({products:[product]},{allowGenerate:true,download:()=>assert.fail('requested a torso fallback')});
  assert.deepEqual(product.visual.views.map(v=>v.view),['front']);
});
