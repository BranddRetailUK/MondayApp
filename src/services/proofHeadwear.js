// Headwear is deliberately isolated from the existing clothing profiles.
const B45 = /^(?:B0?45|BB0?45|BC0?45)$/i;
const BUILTIN_URL = 'proof-headwear:b45-black-front-v1';
const BUILTIN_HASH = '9058975bf52b24039287d9f4cf526e7439f94b48f1e20d54705ba5f13bc03577';
function headwearKind(product = {}) {
  const name = `${product.name || ''} ${product.visual?.name || ''}`;
  if (B45.test(product.code || '')) return 'cuffed-beanie';
  if (/\bbeanie\b/i.test(name)) return /cuff|turn[ -]?up/i.test(name) ? 'cuffed-beanie' : 'beanie';
  if (/\b(?:baseball cap|snapback|trucker cap|cap)\b/i.test(name) && !/cap[ -]?sleeve/i.test(name)) return 'cap';
  if (/headwear|\bhats?\b/i.test(`${name} ${product.visual?.garmentType || ''}`)) return 'headwear';
  return null;
}
function builtinFor(product) {
  return B45.test(product.code || '') && /^black\s*[*†‡]*$/i.test(product.colour || '') ? BUILTIN_URL : null;
}
function productIdentity(product) {
  return {code:String(product.code || '').toUpperCase(), colour:String(product.colour || '').toLowerCase(), kind:headwearKind(product)};
}
function hasManualGeometry(product, decorations) {
  return Object.values(product.calibrations || {}).some(c=>Object.keys(c || {}).some(k=>k!=='sourceHash')) || decorations.some(d=>d.placement || d.manualScale || (d.anchor && d.anchor!=='region') || Number(d.offsetXmm) || Number(d.offsetYmm));
}
function validateSurface(surface, kind) {
  const r = surface?.region;
  if (!surface?.suitable || !Number.isFinite(surface.confidence) || surface.confidence < .85 || !Number.isFinite(surface.angleDegrees) || Math.abs(surface.angleDegrees)>3 ||
      !r || !['left','top','width','height'].every(k=>Number.isFinite(r[k]) && r[k]>=0 && r[k]<=1) ||
      r.left+r.width>1 || r.top+r.height>1 || r.width<.25 || r.height<.08 ||
      (kind==='cuffed-beanie' && r.top<.45)) {
    throw new Error('Headwear decoration surface could not be verified as straight-on and unobstructed. A reviewed garment template is required.');
  }
  return {left:r.left,top:r.top,width:r.width,height:r.height,x:r.left+r.width/2,y:r.top+r.height/2};
}
module.exports={headwearKind,builtinFor,productIdentity,hasManualGeometry,validateSurface,BUILTIN_URL,BUILTIN_HASH};
