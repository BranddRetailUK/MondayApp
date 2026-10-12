#!/usr/bin/env node
// Scoped, transactional import of the user-approved Plastic Head PO. Defaults to read-only.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { Client } = require('pg');
const { TEST_DASHBOARD_COLUMN_IDS: C, TEST_DASHBOARD_GROUP_IDS: G } = require('../src/services/testDashboardDefaults');
const { dashboardStatusValue } = require('../src/services/dashboardAutomation');
const ORDER = 50593;
const rows = [
 ['Cannibal Corpse Logo',200,2.37,'PSG6219',''],
 ['Burzum Logo',150,2.76,'PH012','PHHAT097'],
 ['Bathory White Logo',200,2.76,'PH011','PHHAT098'],
 ['Sodom Logo',150,3.05,'PSG6220','PHHAT212'],
 ['Amon Amarth Logo',50,2.44,'PSG6098','PHHAT246'],
 ['Deicide Logo',50,3.50,'PSG6265','PHHAT270'],
 ['Emperor Logo',50,2.99,'PSG6655','PHHAT290'],
 ['Destruction Logo',50,2.44,'PH030','PHHAT245'],
 ['Sonic Youth Goo Logo',50,2.40,'PSG6657','PHHAT229'],
 ['Dimmu Borgir Logo',100,3.29,'PSG7026','PHHAT342'],
 ['Fear Factory White Logo',100,2.22,'PSG6358','PHHAT228'],
];
const rehearse = process.argv.includes('--rehearse');
const apply = process.argv.includes('--apply') || rehearse;
if (apply && !process.argv.includes('--confirm-order=51346')) throw new Error('Apply requires --confirm-order=51346');
async function main() {
 const db = new Client({ connectionString:process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
   ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:12000 });
 await db.connect();
 try {
  await db.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  await db.query("SET LOCAL lock_timeout='10s'");
  await db.query("SET LOCAL statement_timeout='30s'");
  if (apply) {
   await db.query('SELECT pg_advisory_xact_lock(71060217)');
   await db.query('SELECT pg_advisory_xact_lock(71060218)');
  }
  const parent = (await db.query(`SELECT * FROM database_jobs WHERE source_order_id=$1 ${apply?'FOR UPDATE':''}`,[ORDER])).rows[0];
  assert.equal(parent?.order_no,51346);
  assert.match(parent.customer_name,/Plastic Head/i);
  const existingLines=(await db.query('SELECT * FROM database_job_line_items WHERE source_order_id=$1 ORDER BY line_sort_order',[ORDER])).rows;
  const existingDesigns=(await db.query('SELECT * FROM database_job_positions WHERE source_order_id=$1 ORDER BY position_sort_order',[ORDER])).rows;
  const hasLinks=(await db.query("SELECT to_regclass('dashboard_production_jobs') AS name")).rows[0].name;
  const existingLinks=hasLinks?(await db.query('SELECT * FROM dashboard_production_jobs WHERE source_order_id=$1',[ORDER])).rows:[];
  const state=(await db.query('SELECT * FROM test_dashboard_job_state WHERE source_order_id=$1',[ORDER])).rows[0];
  if (existingLinks.length) {
   assert.equal(existingLinks.length,11);assert.equal(existingLines.length,11);assert.equal(existingDesigns.length,11);
   rows.forEach(([name,qty,price,ref],i)=>{
    assert.equal(existingLines[i].quantity,qty);assert.equal(Number(existingLines[i].unit_price),price);
    assert.equal(existingLines[i].ralawise_sku,'BC045BLAC');
    assert.equal(existingDesigns[i].colour_notes,name);assert.equal(existingDesigns[i].design_ref,ref);
    assert.ok(existingLinks.some(l=>l.source_order_item_id===existingLines[i].source_order_item_id && l.source_order_position_id===existingDesigns[i].source_order_position_id));
   });
   await db.query('ROLLBACK');console.log(JSON.stringify({alreadyImported:true,order:51346,lines:11,quantity:1150,net:3137}));return;
  }
  assert.equal(existingLines.length,0,'Refusing to replace existing stock lines');
  assert.equal(existingDesigns.length,0,'Refusing to replace existing designs');
  assert.ok(!parent.is_complete && !parent.invoice_printed && !parent.pf_invoice_printed && !parent.closed_without_invoice);
  const variants=(await db.query(`SELECT v.*,s.style_code,s.database_product_style_id,s.manufacturer_style_code,s.style_name,s.product_type,c.colour_name,c.colour_code
   FROM database_ralawise_catalog_variants v JOIN database_ralawise_catalog_styles s ON s.id=v.style_id
   JOIN database_ralawise_catalog_colours c ON c.id=v.colour_id
   WHERE s.manufacturer_style_code='B45' AND lower(c.colour_name)='black' AND v.is_active IS TRUE`)).rows;
  assert.equal(variants.length,1);const v=variants[0];assert.equal(v.sku_code,'BC045BLAC');assert.ok(v.database_product_source_id);
  assert.equal(rows.reduce((n,r)=>n+r[1],0),1150);
  assert.equal(rows.reduce((n,r)=>n+r[1]*Math.round(r[2]*100),0),313700);
  if (!apply) {
   await db.query('ROLLBACK');console.log(JSON.stringify({dryRun:true,order:51346,product:v.sku_code,variant:v.id,quantity:1150,net:3137,vat:627.4,gross:3764.4,rows},null,2));return;
  }
  if (rehearse && !hasLinks) await require('../src/services/dashboardProductionJobs').ensureProductionJobTables(db);
  else assert.ok(hasLinks,'Deploy linked production-job schema before applying');
  if (!rehearse) fs.writeFileSync('/tmp/plastic-head-152150-before.json',JSON.stringify({parent,state,existingLines,existingDesigns},null,2),{mode:0o600,flag:'wx'});
  await db.query('LOCK TABLE database_job_positions, database_job_line_items IN SHARE ROW EXCLUSIVE MODE');
  const positionStart=(await db.query('SELECT (COALESCE(MAX(source_order_position_id),0)+1)::int AS id FROM database_job_positions')).rows[0].id;
  const lineStart=(await db.query('SELECT (COALESCE(MAX(source_order_item_id),0)+1)::int AS id FROM database_job_line_items')).rows[0].id;
  const columns={ [C.JOB]:{id:C.JOB,type:'checkbox',text:'v',value:JSON.stringify({checked:'true'})},[C.STATUS]:dashboardStatusValue('NO STOCK'),
    [C.TYPE]:{id:C.TYPE,type:'status',text:'EMB',value:JSON.stringify({index:0})},[C.DATE]:{id:C.DATE,type:'date',text:'2026-10-23',value:JSON.stringify({date:'2026-10-23'})} };
  for (const [i,[name,qty,price,ref,customerRef]] of rows.entries()) {
   const lineId=lineStart+i,positionId=positionStart+i,id=`private_${crypto.randomUUID()}`;
   await db.query(`INSERT INTO database_job_line_items(source_order_item_id,source_order_id,line_sort_order,source_product_id,
    line_description,quantity,unit_price,unit_cost,vat_rate,is_non_deliverable,is_internal,supplier_name,style_id,style_code,
    alt_style_code,style_name,colour,size,product_type,is_product_active,ralawise_catalog_variant_id,ralawise_sku,
    supplier_style_code,supplier_colour_code,supplier_size_code,catalogue_status,item_reference,catalogue_synced_at,created_at_source,updated_at_source)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,0.2,FALSE,FALSE,'Ralawise',$9,$10,$11,$12,$13,$14,$15,TRUE,$16,$17,$10,$18,$19,$20,$21,NOW(),NOW(),NOW())`,
    [lineId,ORDER,i+1,v.database_product_source_id,`${name} — ${v.style_name}`,qty,price,v.carton_price,
     v.database_product_style_id,v.style_code,v.manufacturer_style_code,v.style_name,v.colour_name,v.size_name,v.product_type,
     v.id,v.sku_code,v.colour_code,v.size_code,v.sku_status,customerRef||null]);
   await db.query(`INSERT INTO database_job_positions(source_order_position_id,source_order_id,position_sort_order,position_name,colour_notes,design_ref,created_at_source,updated_at_source)
    VALUES($1,$2,$3,'Front on turn-up',$4,$5,NOW(),NOW())`,[positionId,ORDER,i+1,name,ref]);
   const childColumns={...columns,[C.DESIGN]:{id:C.DESIGN,type:'text',text:ref,value:ref},[C.NOTES]:{id:C.NOTES,type:'text',text:`PO 0000152150. ${qty} black B45 beanies. ${customerRef||'Barcode 0803341257504'}.`,value:null}};
   await db.query(`INSERT INTO test_dashboard_private_jobs(id,group_id,item_name,column_values,archived,created_by_name)
    VALUES($1,$2,$3,$4,FALSE,'Plastic Head PO 152150 import')`,[id,G.PRE_PRODUCTION,`51346 - Plastic Head - ${name}`,JSON.stringify(childColumns)]);
   await db.query('INSERT INTO dashboard_production_jobs(dashboard_job_id,source_order_id,source_order_position_id,source_order_item_id) VALUES($1,$2,$3,$4)',[id,ORDER,positionId,lineId]);
  }
  await db.query(`UPDATE database_jobs SET client_order_no='0000152150',customer_supplied=FALSE,customer_date_required=TRUE,
   delivery_date='2026-10-23',delivery_method='Collection',proof_approved=TRUE,proof_approved_at=NOW(),dashboard_status='NO STOCK',
   dashboard_type='EMB',dashboard_status_updated_at=NOW(),is_complete=FALSE,
   comments=concat_ws(E'\n',NULLIF(comments,''),'PO 0000152150 dated 09/10/2026: please advise when ready for collection. All 11 repeat designs approved by Scott; Cannibal PSG6219, Sonic Youth PSG6657 and Dimmu Borgir PSG7026 explicitly confirmed. Completed only when all linked production jobs are complete.'),
   updated_at_source=NOW() WHERE source_order_id=$1`,[ORDER]);
  await db.query(`INSERT INTO test_dashboard_job_state(source_order_id,group_id,column_values,archived)
   VALUES($1,$2,$3,FALSE) ON CONFLICT(source_order_id) DO UPDATE SET group_id=EXCLUDED.group_id,
   column_values=test_dashboard_job_state.column_values || EXCLUDED.column_values,archived=FALSE,updated_at=NOW()`,[ORDER,G.PRE_PRODUCTION,JSON.stringify(columns)]);
  const totals=(await db.query('SELECT count(*)::int AS lines,sum(quantity)::int AS qty,sum(quantity*unit_price)::numeric(15,2) AS net FROM database_job_line_items WHERE source_order_id=$1',[ORDER])).rows[0];
  assert.equal(totals.lines,11);assert.equal(totals.qty,1150);assert.equal(Number(totals.net),3137);
  const count=(await db.query(`SELECT count(*)::int AS n FROM dashboard_production_jobs p JOIN test_dashboard_private_jobs d ON d.id=p.dashboard_job_id
    WHERE p.source_order_id=$1 AND d.group_id=$2 AND (d.column_values->$3->>'value')::jsonb->>'checked'='true'`,[ORDER,G.PRE_PRODUCTION,C.JOB])).rows[0].n;
  assert.equal(count,11);
  await db.query(rehearse?'ROLLBACK':'COMMIT');console.log(JSON.stringify({applied:!rehearse,rehearsed:rehearse,order:51346,...totals,approvedChildren:count}));
 } catch(e) {await db.query('ROLLBACK').catch(()=>{});throw e;} finally {await db.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={rows};
