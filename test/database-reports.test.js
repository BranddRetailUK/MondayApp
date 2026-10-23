const test = require('node:test');
const assert = require('node:assert/strict');
const {groupWeeks,bucketEnd,totals,filterOrders,margin,csv} = require('../public/database-reports');
const order = (changes={}) => ({orderNo:1,salesAt:'2026-09-01T12:00:00',customerName:'A & B',jobTitle:'Shirts',orderType:'Printing',grossSales:120,netSales:100,costOfGoods:60,grossProfit:40,unitsSold:5,missingCostLines:0,missingPriceLines:0,...changes});
test('calendar weeks preserve partial edges and every penny/order through DST',()=>{
  const series=Array.from({length:9},(_,i)=>({bucketStart:`2026-03-${String(25+i).padStart(2,'0')}T00:00:00`,netSales:100,orderCount:1})).slice(0,7);
  const weeks=groupWeeks(series);
  assert.equal(weeks.length,2);
  assert.equal(weeks[0].bucketStart,'2026-03-25T00:00:00');
  assert.equal(weeks[0].bucketEnd,'2026-03-30T00:00:00');
  assert.equal(weeks[1].bucketEnd,'2026-04-01T00:00:00');
  assert.equal(weeks.reduce((n,w)=>n+w.netSales,0),700);
  assert.equal(weeks.reduce((n,w)=>n+w.orderCount,0),7);
});
test('date drilldowns use exclusive ends and hourly/monthly calendar boundaries',()=>{
  assert.equal(bucketEnd('2026-12-01T00:00:00','month'),'2027-01-01T00:00:00');
  assert.equal(bucketEnd('2026-09-01T23:00:00','hour'),'2026-09-02T00:00:00');
  const rows=[order(),order({salesAt:'2026-09-02T00:00:00'}),order({salesAt:null})];
  assert.equal(filterOrders(rows,{bucket:{bucketStart:'2026-09-01T00:00:00'},grain:'day'}).length,1);
  assert.equal(filterOrders(rows).length,3);
});
test('missing prices/costs never masquerade as reliable low margins',()=>{
  const rows=[order(),order({grossProfit:10}),order({missingCostLines:1,grossProfit:0}),order({missingPriceLines:1,grossProfit:-60}),order({netSales:0,grossProfit:-60})];
  assert.equal(filterOrders(rows,{mode:'low'}).length,1);
  assert.equal(filterOrders(rows,{mode:'missing'}).length,2);
  assert.equal(margin(rows[4]),null);
  assert.equal(totals(rows).orderCount,5);
});
test('complete order list is uncapped, with composable customer/type filters',()=>{
  const rows=Array.from({length:205},(_,i)=>order({orderNo:i}));
  assert.equal(filterOrders(rows).length,205);
  assert.equal(filterOrders(rows,{query:'a & b',type:'Printing'}).length,205);
  assert.equal(filterOrders(rows,{query:'absent'}).length,0);
});
test('CSV retains every order, quotes customer text and neutralizes formula cells',()=>{
  const output=csv([order({customerName:'=SUM(1,2)',jobTitle:'a "quoted" job'})]);
  assert.ok(output.includes('"\'=SUM(1,2)"'));
  assert.ok(output.includes('"a ""quoted"" job"'));
  assert.ok(output.includes('Missing cost lines'));
  assert.equal(output.split('\r\n').length,2);
  assert.ok(csv([order({grossProfit:-10})]).includes('"-10"'));
  assert.ok(csv([order({customerName:'  =1+1'})]).includes('"\'  =1+1"'));
});
test('reports endpoint keeps the financial basis and returns order drilldown fields',async()=>{
  const poolPath=require.resolve('../src/db/pool'),routePath=require.resolve('../src/routes/database');
  const oldPool=require.cache[poolPath],oldRoute=require.cache[routePath];
  let query;
  require.cache[poolPath]={id:poolPath,filename:poolPath,loaded:true,exports:{query:async sql=>{if(sql.includes('WITH bounds'))query=sql;return {rows:[{orders:[order()],summary:{orderCount:1},series:[],period_start:'2026-09-01',period_end:'2026-09-30'}]};}}};
  delete require.cache[routePath];
  try {
    const router=require('../src/routes/database');
    const handler=router.stack.find(l=>l.route?.path==='/api/database/reports').route.stack[0].handle;
    let body; const res={status(){return this;},json(value){body=value;}};
    await handler({query:{range:'custom-month',period:'2026-09'}},res);
    assert.equal(body.orders.length,1);
    assert.ok(query.includes("'salesAt', TO_CHAR(sales_at"));
    assert.ok(query.includes("'missingCostLines', missing_cost_lines"));
    assert.ok(query.includes('WHERE li.is_internal IS NOT TRUE'));
    assert.ok(query.includes('COUNT(*) FILTER (WHERE fl.cost_missing)'));
    assert.ok(!query.includes('LIMIT 100'));
  } finally {
    if(oldPool)require.cache[poolPath]=oldPool;else delete require.cache[poolPath];
    if(oldRoute)require.cache[routePath]=oldRoute;else delete require.cache[routePath];
  }
});

test('invoice reporting uses invoice month, excludes proformas and separates uninvoiced orders',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const poolPath=require.resolve('../src/db/pool'),routePath=require.resolve('../src/routes/database');const oldPool=require.cache[poolPath],oldRoute=require.cache[routePath];
 try{
  await db.exec(`CREATE TABLE database_jobs(source_order_id int,order_no int,customer_name text,job_title text,order_type text,order_type_abbr text,order_date timestamp,created_at_source timestamp,invoice_date timestamp,invoice_no int,closed_without_invoice boolean);
  CREATE TABLE database_job_line_items(source_order_id int,quantity numeric,unit_price numeric,unit_cost numeric,vat_rate numeric,size text,line_description text,style_name text,product_type text,style_code text,alt_style_code text,is_internal boolean);
  INSERT INTO database_jobs VALUES
  (1,1,'A','Earlier order','Printing','P','2026-08-15',NULL,'2026-09-10',101,false),
  (2,2,'B','Later invoice','Printing','P','2026-09-15',NULL,'2026-10-10',102,false),
  (3,3,'C','Uninvoiced','Printing','P','2026-09-16',NULL,NULL,NULL,false),
  (4,4,'D','Missing invoice date','Printing','P','2026-08-16',NULL,NULL,103,false);
  INSERT INTO database_job_line_items(source_order_id,quantity,unit_price,unit_cost,vat_rate,is_internal) VALUES(1,1,100,50,20,false),(2,1,200,100,20,false),(3,1,300,150,20,false),(4,1,400,200,20,false),(1,1,999,0,20,true);`);
  require.cache[poolPath]={id:poolPath,filename:poolPath,loaded:true,exports:db};delete require.cache[routePath];
  const router=require('../src/routes/database');const handler=router.stack.find(l=>l.route?.path==='/api/database/reports').route.stack[0].handle;
  let body,status=200;await handler({query:{range:'custom-month',period:'2026-09'}},{status(n){status=n;return this;},json(value){body=value;}});
  assert.equal(status,200);assert.equal(body.summary.netSales,500);assert.equal(body.invoiced.summary.netSales,100);assert.equal(body.invoiced.summary.vat,20);assert.equal(body.uninvoiced.summary.netSales,300);assert.equal(body.missingInvoiceDates,1);
  assert.equal(body.invoiced.orders[0].sourceOrderId,1);assert.equal(body.invoiced.orders[0].salesAt,'2026-09-10T00:00:00');assert.equal(body.invoiced.series.reduce((n,p)=>n+p.netSales,0),100);
 }finally{if(oldPool)require.cache[poolPath]=oldPool;else delete require.cache[poolPath];if(oldRoute)require.cache[routePath]=oldRoute;else delete require.cache[routePath];await db.close();}
});
