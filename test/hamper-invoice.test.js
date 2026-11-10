const {test}=require('node:test');const assert=require('node:assert/strict');
const {generateHamperInvoice,invoiceNumber}=require('../src/services/hamperInvoice');
const {quoteCart}=require('../src/services/hamperCheckout');
const {PDFDocument}=require('pdf-lib');
const order={po_number:1,mode:'sandbox',status:'paid',created_at:'2026-11-10T11:44:00Z',delivery:{name:'Example Customer',line1:'123 Example Street',city:'London',postcode:'SW1A 1AA'},snapshot:quoteCart([{sku:'H26001',quantity:1},{sku:'H26002',quantity:1}])};
async function read(bytes){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let text='';for(let i=1;i<=doc.numPages;i++)text+=(await(await doc.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ');await doc.destroy();return text;}
test('invoice includes immutable snapshot prices, individual taxes, delivery and stable reference',async()=>{
 const before=JSON.stringify(order);const bytes=await generateHamperInvoice(order);const text=await read(bytes);
 for(const value of ['HINV-000001','PO-000001','£84.77','£75.98','£8.79','10.9%','8.2%','20%','£14.50','£2.90','NOT A VAT INVOICE'])assert.ok(text.includes(value),value);
 assert.ok(text.includes('The Ultimate Promotions Company Ltd'));assert.equal((await PDFDocument.load(bytes)).getAuthor(),'The Ultimate Promotions Company Ltd');assert.ok(!text.includes('Tax analysis'));assert.ok(!text.includes('Net at'));assert.equal(invoiceNumber(order),'HINV-000001');assert.equal(JSON.stringify(order),before);assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});
test('long mixed carts paginate and unpaid orders are proformas',async()=>{
 const products=require('../web/hamper-collection/products.json');const snapshot=quoteCart(products.slice(0,10).map(p=>({sku:p.sku,quantity:1})));
 snapshot.items.forEach(i=>i.name+=' - '+('Detailed gift description '.repeat(8)));
 const bytes=await generateHamperInvoice({...order,status:'pending',snapshot});const text=await read(bytes);
 assert.ok((await PDFDocument.load(bytes)).getPageCount()>1);assert.ok(text.includes('PRO-FORMA INVOICE'));assert.ok(text.includes(`£${(snapshot.totalPence/100).toFixed(2)}`));
});

test('invoice endpoint supports view/download and protects order data',async t=>{
 const express=require('express');const {requireHubFullApiAccess}=require('../src/middleware/hubAuth');
 const id='ad8ed97e-357c-4953-8b15-3f6aa2a40c4e';let reads=0;
 const routes=require('../src/routes/hamper-checkout').createRoutes({query:async()=>{reads++;return {rows:[order]};}});
 const app=express();app.use((req,res,next)=>{if(req.get('x-test-access'))req.hubUser={access_scope:req.get('x-test-access')};next();});
 app.get('/orders/:id/invoice',requireHubFullApiAccess,routes.invoice);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const url=`http://127.0.0.1:${server.address().port}/orders/${id}/invoice`;
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-test-access':'dtf_only'}})).status,403);assert.equal(reads,0);
 for(const download of [false,true]){const res=await fetch(url+(download?'?download=1':''),{headers:{'x-test-access':'full'}});assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/application\/pdf/);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('content-disposition'),`${download?'attachment':'inline'}; filename="HINV-000001.pdf"`);assert.equal((await PDFDocument.load(await res.arrayBuffer())).getPageCount(),1);}
});
