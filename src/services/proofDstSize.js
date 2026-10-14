// DST geometry is decoded from uploaded bytes in the browser. Its millimetre
// bounds are an explicit default; thumbnail pixels and filenames are never sizes.
function nativeSize(artwork) {
  if(!/\.dst$/i.test(artwork?.fileName||artwork?.file?.originalname||''))return null;
  const widthMm=Number(artwork?.dstSize?.widthMm),heightMm=Number(artwork?.dstSize?.heightMm);
  if(![widthMm,heightMm].every(n=>Number.isFinite(n)&&n>0&&n<=3000))return null;
  return {widthMm,heightMm};
}
function applyNativeSize(decoration,artwork) {
  if(decoration.widthMm||decoration.heightMm||decoration.dimensionIssues?.length||decoration.dimensionSource==='user-confirmed')return;
  const size=nativeSize(artwork);if(!size)return;
  decoration.widthMm=String(size.widthMm);decoration.heightMm=String(size.heightMm);
  decoration.dimensionSource='dst-native';
}
module.exports={nativeSize,applyNativeSize};
