const fs=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {parse}=require('csv-parse');
const {ensureProofPencarrieTables}=require('../db/proofPencarrieSchema');

function isPencarrieCatalogueImage(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && u.hostname==='www.fullcollection.com' && !u.username && !u.password && (!u.port || u.port==='443')
      && u.pathname.startsWith('/storage/phoenix/') && /\.(?:jpe?g|png|webp)$/i.test(u.pathname) && !u.search;
  } catch {return false;}
}
function catalogueImages(row) {
  const images=[];
  for(const [column,view] of [['Front Image','front'],['Back Image','back'],['Side Image',null]]) {
    const url=String(row[column]||'').trim();if(!url)continue;
    if(!isPencarrieCatalogueImage(url))throw Error(`Unsupported supplier image URL on ${row.SKU}`);
    // A generic side column is not proof of which sleeve it depicts.
    const filename=decodeURIComponent(new URL(url).pathname.split('/').pop());
    const side=filename.match(/\b(LEFT|RIGHT)(?:\s+\d+)?\.(?:jpe?g|png|webp)$/i)?.[1].toLowerCase();
    if(view||side)images.push({view:view||side,url});
  }
  return images;
}
function boolean(value,column,sku) {
  if(!/^(TRUE|FALSE)$/i.test(String(value)))throw Error(`Invalid ${column} on ${sku}`);
  return /^true$/i.test(value);
}
async function readCatalogue(file) {
  const styles=new Map(),colours=new Map(),variants=new Map();
  const hash=createHash('sha256');const stream=fs.createReadStream(file);stream.on('data',chunk=>hash.update(chunk));
  const parser=stream.pipe(parse({bom:true,columns:true,skip_empty_lines:true}));
  let count=0;
  for await(const row of parser) {
    if(!count)for(const key of ['SKU','Style Code','Title','Colourway Code','Colourway Name','Size','Discontinued','Special Order','Front Image','Back Image','Side Image'])if(!(key in row))throw Error(`Missing CSV column ${key}`);
    count++;
    const code=String(row['Style Code']).trim(),colour=String(row['Colourway Code']).trim(),sku=String(row.SKU).trim();
    if(!/^[A-Z0-9-]{2,24}$/i.test(code)||!colour||!sku||!row.Title||!row['Colourway Name'])throw Error(`Incomplete identity at CSV row ${count+1}`);
    if(variants.has(sku))throw Error(`Duplicate SKU ${sku}`);
    const style={code,name:row.Title,brand:row.Brand||'',gender:row.Gender||'',garment_type:row.Type||'',supplier_code:row['Supplier Code']||''};
    if(styles.has(code)&&JSON.stringify(styles.get(code))!==JSON.stringify(style))throw Error(`Conflicting style metadata ${code}`);
    styles.set(code,style);
    const colourKey=JSON.stringify([code,colour]);
    const c={style_code:code,code:colour,name:row['Colourway Name'],rgb:row.RGB||'',images:catalogueImages(row)};
    if(colours.has(colourKey)&&JSON.stringify(colours.get(colourKey))!==JSON.stringify(c))throw Error(`Conflicting colour metadata ${code}/${colour}`);
    colours.set(colourKey,c);
    const price=String(row['Single List Price']||'').trim();
    if(price&&!/^\d{1,8}(?:\.\d{1,4})?$/.test(price))throw Error(`Invalid list price on ${sku}`);
    const discontinued=boolean(row.Discontinued,'Discontinued',sku);
    variants.set(sku,{sku,style_code:code,colour_code:colour,size:row.Size,size_conversions:row['Size Conversions']||'',list_price:price||null,discontinued,special_order:boolean(row['Special Order'],'Special Order',sku),is_active:!discontinued});
  }
  if(!count)throw Error('Empty catalogue');
  return {styles:[...styles.values()],colours:[...colours.values()],variants:[...variants.values()],hash:hash.digest('hex'),counts:{styles:styles.size,colours:colours.size,variants:variants.size}};
}
async function applyCatalogue(db,data,sourceName) {
  const id=randomUUID();
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(7120261010)');
    await ensureProofPencarrieTables(db);
    await db.query('INSERT INTO proof_pencarrie_imports(id,source_name,source_hash,counts) VALUES($1,$2,$3,$4)',[id,sourceName,data.hash,JSON.stringify(data.counts)]);
    const tables=[
      ['styles','code','code text,name text,brand text,gender text,garment_type text,supplier_code text'],
      ['colours','style_code,code','style_code text,code text,name text,rgb text,images jsonb'],
      ['variants','sku','sku text,style_code text,colour_code text,size text,size_conversions text,list_price numeric,discontinued boolean,special_order boolean,is_active boolean']
    ];
    for(const [table,key,definition] of tables) {
      const fields=definition.split(',').map(field=>field.split(' ')[0]);
      const update=fields.filter(field=>!key.split(',').includes(field)).map(field=>`${field}=EXCLUDED.${field}`).concat('import_id=EXCLUDED.import_id').join(',');
      for(let i=0;i<data[table].length;i+=750)await db.query(`INSERT INTO proof_pencarrie_${table}(${fields.join(',')},import_id)
        SELECT ${fields.join(',')},$2::uuid FROM jsonb_to_recordset($1::jsonb) AS x(${definition})
        ON CONFLICT(${key}) DO UPDATE SET ${update}`,[JSON.stringify(data[table].slice(i,i+750)),id]);
    }
    await db.query('UPDATE proof_pencarrie_variants SET is_active=false WHERE import_id<>$1 AND is_active',[id]);
    await db.query('COMMIT');return id;
  } catch(error){await db.query('ROLLBACK');throw error;}
}
module.exports={isPencarrieCatalogueImage,catalogueImages,readCatalogue,applyCatalogue};
