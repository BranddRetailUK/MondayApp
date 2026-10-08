const { fetchRalawiseRows, selectRalawiseVisual } = require('./proofRalawiseVisuals');
const PENCARRIE_ORIGIN = 'https://www.pencarrie.com';

function normaliseColour(value) {
  return String(value || '').toLowerCase().replace(/\band\b|&/g, '/').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function matchColour(colours, requested) {
  const target = normaliseColour(requested);
  if (!target) return null;
  const exact = colours.find((item) => normaliseColour(item.name) === target);
  if (exact) return exact;
  const starts = colours.filter((item) => normaliseColour(item.name).startsWith(`${target} `));
  return starts.length === 1 ? starts[0] : null;
}

function imageUrl(path) {
  if (!path || typeof path !== 'string' || !path.startsWith('/storage/')) return '';
  return `${PENCARRIE_ORIGIN}${path}`;
}

async function fetchPencarrieProducts(codes, { fetchImpl = fetch } = {}) {
  const valid = [...new Set(codes.map((code) => String(code || '').trim().toUpperCase()))]
    .filter((code) => /^[A-Z0-9-]{2,24}$/.test(code));
  if (!valid.length) return new Map();
  const body = `${JSON.stringify({ index: 'phoenix_products' })}\n${JSON.stringify({ query: { bool: { filter: [{ terms: { code: valid } }] } }, size: valid.length })}\n`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(`${PENCARRIE_ORIGIN}/_msearch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`PenCarrie returned ${response.status}`);
    const payload = await response.json();
    const hits = payload?.responses?.[0]?.hits?.hits || [];
    return new Map(hits.map((hit) => hit?._source).filter((product) => product?.code && valid.includes(product.code.toUpperCase()))
      .map((product) => [product.code.toUpperCase(), product]));
  } finally {
    clearTimeout(timer);
  }
}

function selectPencarrieVisual(product, requestedColour) {
  const colours = Array.isArray(product.brandcolour_details) ? product.brandcolour_details : [];
  const colour = matchColour(colours, requestedColour);
  const assets = (product.assets || []).filter((asset) => asset.brandColour === colour?.id);
  const front = assets.find((asset) => asset.type === 'IMAGE/FRONT');
  const right = assets.find((asset) => asset.type === 'IMAGE/RIGHT');
  const left = assets.find((asset) => asset.type === 'IMAGE/LEFT');
  const back = assets.find((asset) => asset.type === 'IMAGE/BACK');
  const model = assets.find((asset) => asset.type === 'IMAGE/MODEL');
  const views = [front, right, left, back, model].filter(Boolean).map((asset) => ({
    view: asset.type.replace('IMAGE/', '').toLowerCase(),
    url: imageUrl(asset.paths?.ProductCarouselMain || asset.paths?.ProductCarouselPreview),
  })).filter((asset) => asset.url);
  return {
    source: 'PenCarrie',
    name: Array.isArray(product.name) ? product.name[0] : String(product.name || ''),
    colour: colour?.name || '',
    matched: Boolean(colour),
    productUrl: product.url?.startsWith('/catalogue/products/') ? `${PENCARRIE_ORIGIN}${product.url}` : '',
    views,
  };
}

async function enrichProofProducts(brief, { fetchImpl = fetch, pool, provider = process.env.PROOF_IMAGE_PROVIDER || ((pool || process.env.DATABASE_URL) ? 'ralawise' : 'pencarrie') } = {}) {
  if (provider === 'ralawise') {
    let rows = [];
    let failed = false;
    try { rows = await fetchRalawiseRows(brief.products.map(product => product.code), pool || require('../db/pool')); }
    catch (error) { failed = true; console.warn('Ralawise proof catalogue lookup failed:', error.message); }
    // Prefer a real combined colourway; expand only when every separate colour is verified.
    if(!failed){
      brief.products=brief.products.flatMap(item=>{
        const combined=selectRalawiseVisual(rows,item.code,item.colour,matchColour);
        const colours=String(item.colour||'').split(/\s*(?:\band\b|&|\/|,)\s*/i).filter(Boolean);
        if(combined.lookupIssue!=='colour_not_found'||colours.length<2||colours.length>6)return [item];
        const matches=colours.map(colour=>selectRalawiseVisual(rows,item.code,colour,matchColour));
        if(!matches.every(visual=>visual.matched))return [item];
        return matches.map(visual=>({...structuredClone(item),colour:visual.colour}));
      });
      if(brief.products.length>20)throw new Error('A proof supports at most 20 garment colourways.');
    }
    for (const item of brief.products) {
      const visual = failed
        ? { source: 'Ralawise catalog', matched: false, views: [], lookupIssue: 'catalogue_unavailable' }
        : selectRalawiseVisual(rows, item.code, item.colour, matchColour);
      item.visual = visual;
      item.requestedName ||= item.name;
      if (visual.name) item.name = visual.name;
      if (visual.matched) { item.colour = visual.colour; item.code = visual.styleCode; }
    }
    return brief;
  }
  let products = new Map();
  let lookupFailed = false;
  try { products = await fetchPencarrieProducts(brief.products.map(product => product.code), { fetchImpl }); }
  catch (error) { lookupFailed = true; console.warn('PenCarrie product lookup failed:', error.message); }
  for (const item of brief.products) {
    const found = products.get(String(item.code || '').toUpperCase());
    item.visual = found ? selectPencarrieVisual(found, item.colour) : { source: '', name: '', colour: '', matched: false, productUrl: '', views: [] };
    if (!String(item.code || '').trim()) item.visual.lookupIssue = 'missing_code';
    else if (lookupFailed) item.visual.lookupIssue = 'supplier_unavailable';
    item.requestedName ||= item.name;
    if (item.visual.name) item.name = item.visual.name;
    if (item.visual.matched) item.colour = item.visual.colour;
  }
  return brief;
}

module.exports = { normaliseColour, matchColour, fetchPencarrieProducts, selectPencarrieVisual, enrichProofProducts };
