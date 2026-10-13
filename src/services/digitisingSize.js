const sharp = require('sharp');
const {pngResolution, epsBoundingBox} = require('../../public/dtf-layout');
const {extractEps} = require('./digitisingEps');

// Read physical size before rasterisation strips resolution and rescales pixels.
async function sourceSize(input) {
  const eps = extractEps(input);
  if (eps) {
    const box = epsBoundingBox(eps.toString('latin1'));
    if (!box) throw Error('EPS needs a numeric bounding box.');
    return {widthMm: box.widthPoints * 25.4 / 72, aspect: box.heightPoints / box.widthPoints};
  }
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const metadata = await sharp(input, {limitInputPixels:16000000}).metadata();
  if (png) return {widthMm: metadata.width * 25.4 / (pngResolution(input)?.dpiX || 300), aspect: metadata.height / metadata.width};
  // SVG physical units must be read explicitly: renderer density affects their
  // raster pixel count, whereas unitless/px lengths are CSS pixels (96 per inch).
  const root = input.toString('utf8').match(/<svg\b[^>]*>/i)?.[0] || '';
  const length = name => {
    const value = root.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    const match = value?.trim().match(/^([+\d.eE-]+)\s*(mm|cm|in|pt|pc|px)?$/i);
    const factor = {mm:1, cm:10, in:25.4, pt:25.4/72, pc:25.4/6, px:25.4/96};
    const mm = match ? Number(match[1]) * factor[(match[2] || 'px').toLowerCase()] : 0;
    return Number.isFinite(mm) && mm > 0 ? mm : null;
  };
  const width = length('width'), height = length('height');
  const aspect = width && height ? height / width : metadata.height / metadata.width;
  return {widthMm: width || (height ? height / aspect : metadata.width * 25.4 / 96), aspect};
}
module.exports = {sourceSize};
