// Explicit operator preview only: no order/payment records or discount redemption.
const fs=require('node:fs/promises');
const {quoteCart}=require('../src/services/hamperCheckout');
const {render,send}=require('../src/services/hamperEmail');
(async()=>{
  if(!['--send-to-scott','--render'].includes(process.argv[2]))throw Error('Use --send-to-scott for the explicitly requested preview');
  const q=quoteCart([{sku:'H26002',quantity:1}]);
  const line={...q.items[0],unitPence:22,subtotalPence:22,productVatPence:2,deliveryUnitPence:5,shippingPence:5,shippingVatPence:1,totalPence:30};
  const order={id:'00000000-0000-4000-8000-000000000000',po_number:0,status:'paid',mode:'sandbox',created_at:new Date().toISOString(),snapshot:{...q,...line,items:[line],discountLabel:'Single-use live test discount',originalTotalPence:4115,discountPence:4085},delivery:{name:'Scott — email preview',email:'scott@brandd.co.uk',line1:'Unicorn House',line2:'Northbridge Road',city:'Berkhamsted',postcode:'HP4 1EH'}};
  const message=render(order,{preview:true});
  await fs.mkdir('output/hamper-email-preview',{recursive:true});
  await fs.writeFile('output/hamper-email-preview/index.html',message.html);
  if(process.argv[2]==='--render') return;
  const result=await send(order,{preview:true,to:'scott@brandd.co.uk'});
  await fs.writeFile('output/hamper-email-preview/receipt.json',JSON.stringify({...result,at:new Date().toISOString(),to:'scott@brandd.co.uk',monitorBccEnabled:process.env.HAMPER_EMAIL_MONITOR_ENABLED==='true'},null,2));
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
