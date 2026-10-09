const {isPencarrieCatalogueImage}=require('./proofPencarrieCatalogue');
const normaliseCode=value=>String(value||'').trim().toUpperCase().replace(/^([A-Z]+)0+(?=\d)/,'$1');
const codeSql="REGEXP_REPLACE(UPPER(s.code), '^([A-Z]+)0+([0-9])', '\\1\\2')";
async function fetchPencarrieRows(products,db) {
 const codes=products.map(p=>String(p.code||'').trim().toUpperCase()).filter(Boolean);
 const names=products.filter(p=>!p.code).map(p=>String(p.name||'').trim().toLowerCase()).filter(Boolean);
 const {rows}=await db.query({text:`SELECT s.code AS style_code,s.name AS style_name,s.brand,s.gender,s.garment_type,
  c.code AS colour_code,c.name AS colour_name,c.images FROM proof_pencarrie_styles s
  JOIN proof_pencarrie_colours c ON c.style_code=s.code
  WHERE (UPPER(s.code)=ANY($1::text[]) OR ${codeSql}=ANY($2::text[]) OR LOWER(s.name)=ANY($3::text[]))
  AND EXISTS(SELECT 1 FROM proof_pencarrie_variants v WHERE v.style_code=s.code AND v.colour_code=c.code AND v.is_active)`,
  values:[codes,codes.map(normaliseCode),names],query_timeout:5000});return rows;
}
function selectPencarrieCatalogueVisual(rows,product,matchColour) {
 const code=String(product.code||'').trim().toUpperCase();
 const direct=rows.filter(r=>r.style_code===code);
 const candidates=code?(direct.length?direct:rows.filter(r=>normaliseCode(r.style_code)===normaliseCode(code))):rows.filter(r=>r.style_name.toLowerCase()===String(product.name||'').trim().toLowerCase());
 const base={source:'PenCarrie',matched:false,views:[]};
 const styles=new Set(candidates.map(r=>r.style_code));
 if(!styles.size)return {...base,lookupIssue:'pencarrie_product_not_found'};
 if(styles.size!==1)return {...base,lookupIssue:'pencarrie_ambiguous_code'};
 const colour=matchColour(candidates.map(row=>({name:row.colour_name,row})),product.colour)?.row;
 if(!colour)return {...base,lookupIssue:'pencarrie_colour_not_found'};
 return {...base,matched:true,name:colour.style_name,styleCode:colour.style_code,colour:colour.colour_name,colourCode:colour.colour_code,
  gender:colour.gender,garmentType:colour.garment_type,views:colour.images.filter(i=>['front','back','left','right'].includes(i.view)&&isPencarrieCatalogueImage(i.url))};
}
async function searchPencarrieProducts(query,db) {
 const code=String(query||'').trim().toUpperCase();if(!/^[A-Z0-9-]{2,24}$/.test(code))return [];
 const {rows}=await db.query({text:`SELECT s.code,s.name,s.brand,'pencarrie' AS supplier,
  (SELECT jsonb_agg(c.name ORDER BY c.name) FROM proof_pencarrie_colours c WHERE c.style_code=s.code
   AND EXISTS(SELECT 1 FROM proof_pencarrie_variants v WHERE v.style_code=s.code AND v.colour_code=c.code AND v.is_active)) AS colours
  FROM proof_pencarrie_styles s WHERE (UPPER(s.code) LIKE $1 OR ${codeSql}=$3)
  AND EXISTS(SELECT 1 FROM proof_pencarrie_variants v WHERE v.style_code=s.code AND v.is_active)
  ORDER BY CASE WHEN UPPER(s.code)=$2 THEN 0 WHEN ${codeSql}=$3 THEN 1 ELSE 2 END,s.code LIMIT 12`,values:[`${code}%`,code,normaliseCode(code)],query_timeout:5000});return rows;
}
// Used exclusively by /api/proof-generator/products, never DATABASE search.
async function searchProofProducts(query,db) {
 db ||= require('../db/pool');
 const [rala,pc]=await Promise.all([require('./proofRalawiseVisuals').searchRalawiseProducts(query,db),searchPencarrieProducts(query,db)]);
 const rank=p=>p.code.toUpperCase()===String(query).toUpperCase()?0:normaliseCode(p.code)===normaliseCode(query)?1:2;
 return [...rala.map(p=>({...p,supplier:'ralawise'})),...pc].sort((a,b)=>rank(a)-rank(b)||a.code.localeCompare(b.code)|| (a.supplier==='ralawise'?-1:1)).slice(0,12);
}
module.exports={fetchPencarrieRows,selectPencarrieCatalogueVisual,searchPencarrieProducts,searchProofProducts};
