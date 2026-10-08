function normaliseStyleCode(value) {
  return String(value || '').trim().toUpperCase().replace(/^([A-Z]+)0+(?=\d)/, '$1');
}
const styleCodeSql = "REGEXP_REPLACE(UPPER(s.style_code), '^([A-Z]+)0+([0-9])', '\\1\\2')";

const PIMBERLY_TENANT = '/public/asset/raw/571f95845f13380f0056d06a/';

function isRalawiseImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    return (url.hostname === 'cdn.pimber.ly' && url.pathname.startsWith(PIMBERLY_TENANT))
      || (['shop.ralawise.com', 'www.ralawise.com', 'ralawise.com'].includes(url.hostname) && /\/globalassets\//i.test(url.pathname));
  } catch { return false; }
}

function imageView(filename) {
  // The imported supplier filename is authoritative even when its CDN URL is opaque.
  const name = String(filename || '').trim();
  if (/_LS\d*(?:_|\.)/i.test(name)) return null;
  const token = name.match(/_(FT\d*|FRONT|BK\d*|BACK|LEFT|RIGHT)\s*\.(?:jpe?g|png|webp)$/i)?.[1].toUpperCase();
  if (/^(FT\d*|FRONT)$/.test(token || '')) return 'front';
  if (/^(BK\d*|BACK)$/.test(token || '')) return 'back';
  if (token === 'LEFT') return 'left';
  if (token === 'RIGHT') return 'right';
  return null;
}

async function fetchRalawiseRows(codes, pool) {
  const valid = [...new Set(codes.map(code => String(code || '').trim().toUpperCase()))].filter(code => /^[A-Z0-9-]{2,24}$/.test(code));
  if (!valid.length) return [];
  const { rows } = await pool.query({
    text: `SELECT s.id AS style_id, s.style_code, s.manufacturer_style_code, s.style_name,
                  c.id AS colour_id, c.colour_name, c.colour_code, c.colour_image_url, c.colour_image_filename,
                  COALESCE(images.items, '[]'::jsonb) AS images
             FROM database_ralawise_catalog_styles s
             JOIN database_ralawise_catalog_colours c ON c.style_id = s.id
             LEFT JOIN LATERAL (
               SELECT JSONB_AGG(JSONB_BUILD_OBJECT('url', i.source_url, 'filename', i.filename,
                      'colour_id', i.colour_id, 'licence_expiry_date', i.licence_expiry_date) ORDER BY i.id) AS items
                 FROM database_ralawise_catalog_images i
                WHERE i.style_id = s.id AND i.colour_id = c.id
             ) images ON TRUE
            WHERE (UPPER(s.style_code) = ANY($1::text[]) OR UPPER(s.manufacturer_style_code) = ANY($1::text[]) OR ${styleCodeSql} = ANY($2::text[]))
              AND EXISTS (SELECT 1 FROM database_ralawise_catalog_variants v
                          WHERE v.style_id = s.id AND v.colour_id = c.id AND v.is_active IS TRUE)`,
    values: [valid, valid.map(normaliseStyleCode)], query_timeout: 5000,
  });
  return rows;
}

function selectRalawiseVisual(rows, code, requestedColour, matchColour) {
  const requestedCode = String(code || '').trim().toUpperCase();
  const direct = rows.filter(row => row.style_code.toUpperCase() === requestedCode);
  const equivalent = rows.filter(row => normaliseStyleCode(row.style_code) === normaliseStyleCode(requestedCode));
  const candidates = direct.length ? direct : equivalent.length ? equivalent : rows.filter(row => String(row.manufacturer_style_code || '').toUpperCase() === requestedCode);
  const base = { source: 'Ralawise catalog', name: '', colour: '', matched: false, productUrl: '', views: [] };
  const styles = [...new Set(candidates.map(row => String(row.style_id)))];
  if (!styles.length) return { ...base, lookupIssue: requestedCode ? 'product_not_found' : 'missing_code' };
  if (styles.length !== 1) return { ...base, lookupIssue: 'ambiguous_code' };
  const match = matchColour(candidates.map(row => ({ name: row.colour_name, row })), requestedColour)?.row;
  if (!match) return { ...base, name: candidates[0].style_name, lookupIssue: 'colour_not_found' };
  const views = new Map();
  const assets = [{ url: match.colour_image_url, filename: match.colour_image_filename, colour_id: match.colour_id }, ...(match.images || [])];
  for (const asset of assets) {
    if (String(asset.colour_id) !== String(match.colour_id) || !isRalawiseImageUrl(asset.url)) continue;
    if (asset.licence_expiry_date && new Date(asset.licence_expiry_date).getTime() < Date.now()) continue;
    const view = imageView(asset.filename);
    if (view && !views.has(view)) views.set(view, { view, url: asset.url, filename: asset.filename });
  }
  return { ...base, name: match.style_name, colour: match.colour_name, matched: true,
    styleCode: match.style_code, styleId: match.style_id, colourCode: match.colour_code,
    views: [...views.values()] };
}

async function searchRalawiseProducts(query, pool) {
  const code=String(query || '').trim().toUpperCase();
  if(!/^[A-Z0-9-]{2,24}$/.test(code))return [];
  if(!pool){
    if(!process.env.DATABASE_URL)throw new Error('Catalogue search requires the hosted catalogue connection.');
    pool=require('../db/pool');
  }
  const {rows}=await pool.query({text:`SELECT s.style_code AS code, s.style_name AS name, s.brand,
      COALESCE((SELECT JSONB_AGG(c.colour_name ORDER BY c.colour_name)
        FROM database_ralawise_catalog_colours c WHERE c.style_id=s.id
        AND EXISTS (SELECT 1 FROM database_ralawise_catalog_variants cv
          WHERE cv.style_id=s.id AND cv.colour_id=c.id AND cv.is_active IS TRUE)), '[]'::jsonb) AS colours
    FROM database_ralawise_catalog_styles s
    WHERE (UPPER(s.style_code) LIKE $1 OR UPPER(s.manufacturer_style_code) LIKE $1 OR ${styleCodeSql}=$3)
      AND EXISTS (SELECT 1 FROM database_ralawise_catalog_variants v WHERE v.style_id=s.id AND v.is_active IS TRUE)
    ORDER BY CASE WHEN UPPER(s.style_code)=$2 THEN 0 WHEN ${styleCodeSql}=$3 THEN 1 WHEN UPPER(s.manufacturer_style_code)=$2 THEN 2 ELSE 3 END,
      s.style_code LIMIT 12`,values:[`${code}%`,code,normaliseStyleCode(code)],query_timeout:5000});
  return rows;
}

module.exports = { isRalawiseImageUrl, imageView, fetchRalawiseRows, selectRalawiseVisual, searchRalawiseProducts };
