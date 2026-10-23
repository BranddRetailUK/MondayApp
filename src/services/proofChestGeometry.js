// A chest panel is half the body, not half the sleeve-inclusive silhouette.
// Use stable lower-body runs where sleeves have separated. This affects only
// automatic breast anchors; physical scale and established vertical guides stay
// independent. Ambiguous silhouettes retain the existing fallback.
function chestGeometry(garment, view) {
  if (!garment.confident || view !== 'front') return null;
  const {width, height} = garment, mask = garment.torsoMask || garment.mask;
  if (!mask || width < 20 || height < 20) return null;
  const rows = [];
  for (let y = Math.floor(height * .72); y < height * .86; y += Math.max(1, Math.floor(height * .02))) {
    let left = Math.floor(width / 2), right = left;
    if (!mask[y * width + left]) continue;
    while (left > 0 && mask[y * width + left - 1]) left--;
    while (right < width && mask[y * width + right]) right++;
    rows.push({left, right, span: right - left, centre: (left + right) / 2});
  }
  if (rows.length < 5) return null;
  const median = key => [...rows].sort((a,b) => a[key]-b[key])[Math.floor(rows.length/2)][key];
  const span = median('span'), centre = median('centre');
  const stable = rows.filter(r => Math.abs(r.span-span) <= span*.12 && Math.abs(r.centre-centre) <= span*.04);
  // A sleeve may still touch in the first sampled row; require a stable
  // majority rather than letting that one joined run stand for the whole body.
  if (span < width * .35 || span > width * .82 || stable.length < 5 || stable.length < rows.length*.7) return null;
  // Require visible projecting sleeves above the body. Sleeveless garments,
  // bags, compact unknown shapes and uncertain masks keep their prior anchors.
  let broadRows = 0;
  for (let y = Math.floor(height*.20); y < height*.45; y += Math.max(1,Math.floor(height*.025))) {
    let count = 0;
    for (let x=0;x<width;x++) if(mask[y*width+x]) count++;
    if (count > span*1.2) broadRows++;
  }
  if (broadRows < 4) return null;
  // Locate the transition from neck/hood to shoulder-width fabric. The upper
  // chest follows that transition rather than a fixed fraction measured from
  // the top of an arbitrarily tall collar or hood. Require a narrow top and a
  // sustained transition; otherwise retain the established vertical guide.
  let shoulderY = null, consecutive = 0, narrowTop = false;
  for (let y=0;y<height*.25;y++) {
    let count=0;
    for(let x=0;x<width;x++)if(mask[y*width+x])count++;
    if(y<height*.06 && count<span*.65)narrowTop=true;
    consecutive=count>=span*.9 ? consecutive+1 : 0;
    const sustained=Math.max(3,Math.round(height*.015));
    if(narrowTop && consecutive>=sustained){shoulderY=(y-sustained+1)/height;break;}
  }
  return {
    leftBreast: {x:(centre+span*.25)/width},
    rightBreast: {x:(centre-span*.25)/width},
    body: {left:(centre-span*.45)/width,width:span*.9/width},
    breastCentre: shoulderY == null ? null : shoulderY+.16,
  };
}
module.exports = {chestGeometry};
