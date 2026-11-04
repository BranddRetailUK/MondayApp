const {test} = require('node:test');
const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const {ensureDatabaseTables} = require('../src/db/databaseSchema');
const {ensureProofPencarrieTables} = require('../src/db/proofPencarrieSchema');
const {ensureOrderCatalogue,refreshOrderCatalogue} = require('../src/db/orderCatalogue');

test('one shared style prefers active Ralawise variants and retains distinct products with colliding codes', async () => {
  const db = new PGlite();
  try {
    const adapter = {query: sql => db.exec(sql)};
    await ensureDatabaseTables(adapter);
    await ensureProofPencarrieTables(adapter);
    await db.exec(`
      INSERT INTO database_ralawise_catalog_styles(id,style_code,manufacturer_style_code,brand,style_name)
      VALUES (1,'JH501','JH501','AWDis Just Hoods','College hoodie 2.0'),
             (2,'YK201','HVW066','Yoko','Armband');
      INSERT INTO database_ralawise_catalog_colours(id,style_id,colour_code,colour_name) VALUES (1,1,'BLACK','Black*†△');
      INSERT INTO database_ralawise_catalog_variants(sku_code,style_id,colour_id,size_name,is_active,sku_status)
      VALUES ('R-XXL',1,1,'2XL',true,'Live'),('R-S',1,1,'S',false,'Discontinued');
      INSERT INTO proof_pencarrie_imports VALUES ('00000000-0000-0000-0000-000000000001','test','hash',now(),'{}');
      INSERT INTO proof_pencarrie_styles SELECT code, name, brand,'','',model,id FROM proof_pencarrie_imports
      CROSS JOIN (VALUES ('JH501','Hoodie','Just Hoods','JH501'),('YK201','Bomber jacket','YOKO','HVP218')) p(code,name,brand,model);
      INSERT INTO proof_pencarrie_colours SELECT code,'BLK','Black','','[]',import_id FROM proof_pencarrie_styles;
      INSERT INTO proof_pencarrie_variants SELECT code||size,code,'BLK',size,'',10,false,false,true,import_id
      FROM proof_pencarrie_styles CROSS JOIN (VALUES ('XXL'),('S')) sizes(size);
    `);
    await ensureOrderCatalogue(adapter);
    const offers=async()=> (await db.query("SELECT sku_code FROM database_order_variants WHERE style_id=1 AND is_active ORDER BY sku_code")).rows.map(r=>r.sku_code);
    assert.deepEqual(await offers(), ['JH501S','R-XXL']);
    assert.equal((await db.query("SELECT id FROM database_order_styles WHERE style_code='JH501'")).rows.length,1);
    assert.equal((await db.query("SELECT id FROM database_order_styles WHERE style_code='YK201'")).rows.length,2);

    await db.exec("UPDATE database_ralawise_catalog_variants SET is_active=true WHERE sku_code='R-S'");
    await refreshOrderCatalogue({query:sql=>db.query(sql)});
    assert.deepEqual(await offers(),['R-S','R-XXL']);
  } finally {await db.close();}
});
