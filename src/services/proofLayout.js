// Deterministic brief resolution and geometry. All coordinates refer to the
// visible garment bounds, not the supplier photograph's surrounding canvas.
const { automaticTop } = require('./proofPlacementProfiles');
const POSITIONS = ['left breast', 'right breast', 'front', 'back', 'upper back', 'nape', 'left sleeve', 'right sleeve', 'left hem', 'right hem'];
const ALIASES = { lb: 'left breast', rb: 'right breast', ls: 'left sleeve', rs: 'right sleeve', 'left chest': 'left breast', 'right chest': 'right breast', chest: 'front', 'centre chest': 'front', 'center chest': 'front', 'full chest': 'front', 'front chest': 'front', 'centre front': 'front', 'center front': 'front', 'full front': 'front', 'centre back': 'back', 'center back': 'back', 'full back': 'back', rear: 'back', 'back neck': 'nape' };
function normalise(value) { return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function positionName(value) { const text = normalise(value); return ALIASES[text] || text; }
function dimension(value, { signed = false } = {}) {
  if (value === '' || value == null) return null;
  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|inches|inch|in|")?$/i);
  if (!match) throw new Error(`Invalid dimension "${value}". Use a number with mm, cm or inches.`);
  const result = Number(match[1]) * (/^cm$/i.test(match[2]) ? 10 : /^(in|inch|inches|")$/i.test(match[2]) ? 25.4 : 1);
  if (!Number.isFinite(result) || (signed ? Math.abs(result) > 3000 : result <= 0 || result > 3000)) throw new Error('Dimensions must be positive and no greater than 3000 mm.');
  return result;
}

function dimensionsInText(value) {
  const text = String(value || '');
  const found = { width: [], height: [] };
  const unit = '(mm|millimetres?|millimeters?|cm|centimetres?|centimeters?|inches|inch|in|\")';
  const convert = (n, u) => Number(n) * (/^c/i.test(u) ? 10 : /^(in|\")/i.test(u) ? 25.4 : 1);
  const pair = new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + unit + '?\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*' + unit, 'gi');
  let rest = text.replace(pair, (_all, w, wu, h, hu) => { found.width.push(convert(w, wu || hu)); found.height.push(convert(h, hu)); return ''; });
  rest = rest.replace(new RegExp('\\b(width|height)\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)\\s*' + unit, 'gi'), (_all, axis, n, u) => {
    found[axis.toLowerCase()].push(convert(n, u)); return '';
  });
  rest = rest.replace(new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + unit + '\\s*(wide|width|high|height|tall)\\b', 'gi'), (_all, n, u, axis) => {
    found[/^(wide|width)$/i.test(axis) ? 'width' : 'height'].push(convert(n, u)); return '';
  });
  // Unlabelled dimensions are intentionally not guessed (could be an offset).
  return found;
}

function textClauses(text) {
  const positions = [...POSITIONS, ...Object.keys(ALIASES)].sort((a,b) => b.length-a.length).join('|');
  return String(text || '').split(/[;\r\n]+/).flatMap(line => {
    const matches = [...line.matchAll(new RegExp('\\b(?:' + positions + ')\\b', 'gi'))];
    if (!matches.length) return [line.trim()].filter(Boolean);
    const prefix=line.slice(0,matches[0].index);
    return matches.map((match,i) => prefix+line.slice(match.index,matches[i+1]?.index ?? line.length).trim());
  });
}

function mentionsPosition(text, position) {
  const names = [...POSITIONS, ...Object.keys(ALIASES)].sort((a,b) => b.length-a.length).join('|');
  return [...String(text || '').matchAll(new RegExp('\\b(?:' + names + ')\\b', 'gi'))].some(match => positionName(match[0]) === position);
}

function recoverDimensions(decoration, input = {}, product = {}, products = []) {
  const assigned = (input.artworks || []).find(a => a.id && a.id === decoration.artworkId);
  const position = positionName(decoration.position);
  const scoped = textClauses(input.requestText).filter(clause => {
    if (!mentionsPosition(clause, position)) return false;
    // Never recover another product's numbers into this product's decoration.
    const codes = products.filter(p => p.code && new RegExp('\\b' + String(p.code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(clause));
    return !codes.length || (product.code && codes.some(p => p.code === product.code));
  });
  const assignedClauses=textClauses(assigned?.notes);
  const scopedNotes=assignedClauses.filter(clause=>mentionsPosition(clause, position));
  const notesHavePositions=assignedClauses.some(clause=>[...POSITIONS,...Object.keys(ALIASES)].some(p=>new RegExp('\\b'+p+'\\b','i').test(clause)));
  const texts = [decoration.notes, ...(notesHavePositions?scopedNotes:[assigned?.notes]), ...scoped];
  const issues = [];
  for (const axis of ['width','height']) {
    const field = `${axis}Mm`;
    const supplied = texts.flatMap(t => dimensionsInText(t)[axis]);
    const explicit = dimension(decoration[field]);
    const candidates = [...new Set([...supplied, ...(explicit == null ? [] : [explicit])].map(n => Math.round(n * 1000)/1000))];
    if (candidates.length > 1) issues.push(`Conflicting ${axis}s (${candidates.join(', ')} mm). Set the intended ${axis} in the review.`);
    if (explicit != null) decoration[field] = String(explicit);
    if (explicit == null && candidates.length === 1) decoration[field] = String(candidates[0]);
  }
  decoration.dimensionIssues = issues;
}

function resolveDecorations(brief, product) {
  const exceptions = product.decorations || [];
  const overridden = new Set(exceptions.map(d => positionName(d.position)));
  return [...(brief.sharedDecorations || []).filter(d => !overridden.has(positionName(d.position))), ...exceptions].filter(d => !d.omit);
}

function findArtwork(decoration, artworks) {
  if (decoration.artworkId) return artworks.find(a => a.id === decoration.artworkId) || null;
  const name = normalise(decoration.artwork).replace(/\.[a-z0-9]+$/, '');
  const exact = artworks.filter(a => normalise(a.file?.originalname || a.fileName).replace(/\.[a-z0-9]+$/, '') === name);
  // Only exact identity is a safe legacy migration. Position similarity is not identity.
  return exact.length === 1 ? exact[0] : null;
}

function recoverProductCodes(brief, input = {}) {
  const source=String(input.requestText || '');
  for(const product of brief.products || []) {
    const supplied=String(product.code || '').trim();
    if(/^[a-z0-9-]{2,24}$/i.test(supplied)) { product.code=supplied.toUpperCase(); continue; }
    // Recover only literal style tokens present in both the product name and
    // the supplied request. Never infer a code from a brand or garment type.
    const candidates=[...`${supplied} ${product.name || ''}`.matchAll(/\b([a-z]{1,6}\d[a-z0-9-]*|\d{4,8})\b/gi)]
      .map(match=>match[1].toUpperCase()).filter(code=>new RegExp('\\b'+code+'\\b','i').test(source));
    const unique=[...new Set(candidates)];
    product.code=unique.length===1 ? unique[0] : '';
  }
  return brief;
}

function prepareBrief(brief, input = {}) {
  if (!Array.isArray(brief?.products) || !brief.products.length || brief.products.length > 20) throw new Error('A proof needs 1-20 products.');
  brief.products.forEach((product, pi) => {
    product.decorations = resolveDecorations(brief, product).map((original, di) => {
      const d = JSON.parse(JSON.stringify(original));
      d.id = d.id || `product-${pi}-decoration-${di}`;
      d.position = positionName(d.position);
      const artwork = findArtwork(d, input.artworks || []);
      if (artwork) d.artworkId = artwork.id;
      recoverDimensions(d, input, product, brief.products);
      return d;
    });
    if (product.decorations.length > 6) throw new Error(`${product.code || 'Product'} has more than six decorations.`);
  });
  brief.sharedDecorations = [];
  brief.questions = [];
  return brief;
}

function preferredView(d, views) {
  const position = positionName(d.position);
  const expected = /back|nape/.test(position) ? 'back' : position === 'left sleeve' ? 'left' : position === 'right sleeve' ? 'right' : 'front';
  const requested = d.view && d.view !== 'auto' ? d.view : expected;
  if (!['front','back','left','right'].includes(requested)) throw new Error('Select a front, back, left or right view.');
  if (views.some(v => v.view === requested)) return requested;
  // A front-facing sleeve may be used only when the relevant side is unavailable.
  if ((!d.view || d.view === 'auto') && /sleeve/.test(position) && views.some(v => v.view === 'front')) return 'front';
  return requested;
}

// Estimated regions for an upright top. A saved template/calibration supersedes these.
// x/y = artwork centre horizontally and top edge vertically; regions are safe boxes.
function regionFor(position, view) {
  const p = positionName(position);
  if (/sleeve/.test(p) && ['left','right'].includes(view)) return { x:.5,y:.30, left:.22,top:.16,width:.56,height:.43 };
  const presets = {
    'left breast': [.65,.25,.52,.12,.27,.40], 'right breast': [.35,.25,.21,.12,.27,.40],
    front: [.5,.20,.26,.12,.48,.76], back: [.5,.20,.24,.08,.52,.82],
    'upper back': [.5,.18,.24,.1,.52,.48], nape: [.5,.11,.35,.05,.3,.22],
    'left sleeve': [.87,.31,.75,.16,.24,.38], 'right sleeve': [.13,.31,.01,.16,.24,.38],
    'left hem': [.66,.8,.52,.68,.24,.25], 'right hem': [.34,.8,.24,.68,.24,.25],
  };
  const values = presets[p];
  if (!values) return null;
  const [x,y,left,top,width,height] = values;
  return {x,y,left,top,width,height};
}

function artworkSize(d, aspect) {
  let width = dimension(d.widthMm), height = dimension(d.heightMm);
  const confirmed = width != null || height != null;
  if (width && height && Math.abs(width / height / aspect - 1) > .025) throw new Error('Width and height conflict with the visible artwork proportions. Set one dimension or supply matching artwork.');
  if (!width && !height) width = 80;
  if (!width) width = height * aspect;
  if (!height) height = width / aspect;
  return {width,height,confirmed};
}

function placementFor(d, asset, garment, calibration = {}) {
  const position = positionName(d.position);
  const custom = calibration.regions?.[position];
  const region = custom || regionFor(position, garment.view);
  if (!region) throw new Error(`Unsupported position "${d.position}". Choose a supported position or define its printable region.`);
  for (const key of ['x','y','left','top','width','height']) if (!Number.isFinite(region[key]) || region[key] < 0 || region[key] > 1) throw new Error('Printable region coordinates must be between 0 and 1.');
  if (region.width <= 0 || region.height <= 0 || region.left+region.width>1.001 || region.top+region.height>1.001) throw new Error('Printable region must fit inside the garment.');
  const size = artworkSize(d, asset.width / asset.height);
  let pxPerMm = garment.estimatedPxPerMm || garment.width / 700;
  let calibrated = false;
  if (calibration.referenceMm !== '' && calibration.referenceMm != null) {
    const mm = dimension(calibration.referenceMm);
    const a = calibration.start, b = calibration.end;
    if (![a?.x,a?.y,b?.x,b?.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Select both calibration reference points on the garment.');
    const distance = Math.hypot((b.x-a.x)*garment.width,(b.y-a.y)*garment.height);
    if (distance < 5) throw new Error('Calibration reference points are too close together.');
    pxPerMm = distance/mm; calibrated = true;
  }
  const width = size.width * pxPerMm / garment.width;
  const height = size.height * pxPerMm / garment.height;
  const explicit = d.placement != null;
  if (explicit && ![d.placement.x,d.placement.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Placement coordinates must be between 0 and 1.');
  let x = explicit ? d.placement.x : region.x;
  let y = explicit ? d.placement.y : region.y;
  if (!explicit && !custom && (!d.anchor || d.anchor === 'region')) {
    y = automaticTop(position, garment.view, height, garment.placementProfile) ?? y;
  }
  if (!explicit && d.anchor && d.anchor !== 'region') {
    const landmark = calibration[d.anchor] || garment.landmarks?.[d.anchor];
    if (!['collar','hem'].includes(d.anchor) || !landmark || ![landmark.x,landmark.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error(`Mark the ${d.anchor} landmark before applying this offset.`);
    x = landmark.x; y = landmark.y;
  }
  const offsetX = dimension(d.offsetXmm, {signed:true}) || 0;
  const offsetY = dimension(d.offsetYmm, {signed:true}) || 0;
  // Automatic proofs honour offsets against the labelled estimated scale. A
  // measured template makes these exact; the estimate never becomes calibration.
  x += offsetX * pxPerMm / garment.width;
  y += offsetY * pxPerMm / garment.height;
  return {x,y,width,height,size,region,calibrated,explicit};
}

function fitsRegion(p) {
  return p.x-p.width/2 >= p.region.left-.001 && p.x+p.width/2 <= p.region.left+p.region.width+.001 && p.y >= p.region.top-.001 && p.y+p.height <= p.region.top+p.region.height+.001;
}
module.exports = {POSITIONS,positionName,dimension,dimensionsInText,textClauses,recoverDimensions,resolveDecorations,findArtwork,recoverProductCodes,prepareBrief,preferredView,regionFor,artworkSize,placementFor,fitsRegion};
