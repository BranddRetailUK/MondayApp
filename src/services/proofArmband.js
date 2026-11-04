// Ralawise YK201 / Yoko HVW066: 450 or 550 mm around, 100 mm deep in
// both sizes. The seven FT images show the same wrapped, upright band. In
// cropped coordinates the central FRONT rim starts 20% down, not at the
// rear rim. Bind that photographic measurement to the reviewed source bytes.
// https://shop.ralawise.com/yoko/print-me-armbands-hvw066-pack-of-20/
const frontPhotos = new Set([
  'b231bb9d2f6a486a5d731eaf18c31c8dfef49f2ebe87cf05adeea02b6659d850', // orange
  '281281302be92a2ff0f4a552f19354187c121c96d5b0b8956c1106d64754988d', // yellow
  '4bf20a608ffe07b514b09f6d80424c2aa0eeebfd9c773f9ca8988b15c5a3cbe3', // lime
  '195dd533e18279628fef892ea19c6734de204ec06f3db3ae72774c37b38c4062', // pink
  '751ffff3f15c5b9a23666e9c22679531254c6fc7c4d9f0e4ca5c62e09c308684', // red
  '81efd3b9dcdd66cd4230d491ac86741e0b990a7cb8822382c957b92464b589b0', // royal
  'e897b47fe3e7651a7e7a20490baccfe24730e02c9be0ab5885c2499e0c487369', // white
]);
const bandDepthMm=100, frontRim=.20;
function armbandProfile(product) {
  const code=String(product.visual?.styleCode || product.code || '').trim().toUpperCase();
  const yk201=['YK201','HVW066'].includes(code);
  if(!yk201 && !/\barm[ -]?bands?\b/i.test(product.visual?.name || product.name || product.requestedName || ''))return null;
  return {family:'armband',yk201};
}
function armbandScale(profile,garment,view) {
  const reviewed=profile.yk201 && view==='front' && frontPhotos.has(garment.sourceHash);
  const face=reviewed ? {x:.5,y:(1+frontRim)/2,left:.05,top:frontRim+.05,width:.90,height:1-frontRim-.10}
    : {x:.5,y:.5,left:0,top:0,width:1,height:1};
  return {placementProfile:{...profile,printableRegions:{front:face}},landmarks:{},
    estimatedPxPerMm:reviewed ? garment.height*(1-frontRim)/bandDepthMm : null,
    scaleSource:reviewed?'supplier-band-depth':'unreviewed-armband',bandHeightMm:reviewed?bandDepthMm:undefined};
}
module.exports={armbandProfile,armbandScale};
