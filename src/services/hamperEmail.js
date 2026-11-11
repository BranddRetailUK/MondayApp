'use strict';
const { generateHamperInvoice, invoiceNumber } = require('./hamperInvoice');
const SITE = 'https://ultimatechristmas-production.up.railway.app';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => `£${(n/100).toFixed(2)}`;
const company = 'The Ultimate Promotion Company Ltd';
function render(order, { preview = false } = {}) {
  const q=order.snapshot,d=order.delivery,po=`PO-${String(order.po_number).padStart(6,'0')}`;
  const items=q.items||[q];
  const title=preview?'Preview of your order confirmation':'Thank you for your order';
  const summary=[['Hampers (ex. VAT)',q.subtotalPence],['Hamper VAT',q.productVatPence],['Delivery (ex. VAT)',q.shippingPence],['Delivery VAT (20%)',q.shippingVatPence],['Total paid',q.totalPence]];
  const address=[d.name,d.line1,d.line2,d.city,d.postcode].filter(Boolean);
  const text=[preview?'TEST PREVIEW — no order has been placed.':'Your payment has been received.',`Hello ${d.name},`,`${po} — your invoice PDF is attached.`,...items.map(i=>`${i.quantity} × ${i.name}: ${money(i.subtotalPence)} ex. VAT; VAT ${i.vatPercent}%: ${money(i.productVatPence)}`),...(q.discountLabel?[`${q.discountLabel}: saved ${money(q.discountPence)} including VAT. Prices include the discount.`]:[]),...summary.map(([k,v])=>`${k}: ${money(v)}`),'Delivery address:',...address,'Questions about your order? Reply to this email or call 01442 264288.',company].join('\n');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#faf7ef;color:#233e35;font-family:Arial,sans-serif"><table role="presentation" width="100%" bgcolor="#faf7ef" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="width:100%;max-width:600px" cellpadding="0" cellspacing="0"><tr><td align="center"><img src="${SITE}/assets/ultimate-christmas-logo.png" alt="${company}" width="220" style="width:220px;max-width:100%"><h1 style="font-family:Georgia,serif;font-size:32px;font-weight:400">${title}</h1><p>${preview?'TEST PREVIEW — no order has been placed.':'Your payment has been received.'}</p></td></tr><tr><td style="padding:20px 0"><p>Hello ${esc(d.name)},</p><p>Thank you for choosing your Christmas hamper. Your order reference is <strong>${po}</strong>. Your invoice PDF is attached.</p>${items.map(i=>`<table role="presentation" width="100%" style="border-bottom:1px solid #ded5c3"><tr><td width="100" style="padding:16px 12px 16px 0"><img width="88" src="${SITE}/assets/product-${Number(i.page)}.jpg" alt="${esc(i.name)}" style="width:88px"></td><td><h2 style="font-family:Georgia,serif;font-size:23px;font-weight:400;margin:0 0 8px">${esc(i.name)}</h2><p style="margin:0;font-size:14px">${i.quantity} × ${money(i.unitPence)} ex. VAT<br>VAT (${i.vatPercent}%): ${money(i.productVatPence)}</p></td></tr></table>`).join('')}${q.discountLabel?`<p>${esc(q.discountLabel)}: saved ${money(q.discountPence)} including VAT. All amounts include the discount.</p>`:''}<table role="presentation" width="100%" style="margin-top:20px">${summary.map(([k,v])=>`<tr><td style="padding:7px 0;${k==='Total paid'?'font-weight:bold;border-top:1px solid #ded5c3':''}">${k}</td><td align="right" style="padding:7px 0;${k==='Total paid'?'font-weight:bold;border-top:1px solid #ded5c3':''}">${money(v)}</td></tr>`).join('')}</table><h2 style="font-family:Georgia,serif;font-weight:400">Delivery address</h2><p style="line-height:1.6">${address.map(esc).join('<br>')}</p><p style="line-height:1.6">Questions about your order? Reply to this email or call <a href="tel:+441442264288" style="color:#233e35">01442 264288</a>.</p></td></tr><tr><td align="center" style="border-top:1px solid #ded5c3;padding-top:24px;font-size:13px;line-height:1.7">${company}<br>Unicorn House, Northbridge Road, Berkhamsted, HP4 1EH<br><a href="mailto:hampers@ultimatepromotions.co.uk" style="color:#233e35">hampers@ultimatepromotions.co.uk</a></td></tr></table></td></tr></table></body></html>`;
  return {subject:`${preview?'[TEST] ':''}Your Christmas hamper order ${po}`,html,text};
}
async function send(order,{env=process.env,fetchImpl=fetch,preview=false,to}={}) {
  if(env.HAMPER_EMAIL_ENABLED!=='true'||!env.SENDGRID_API_KEY)throw Error('Hamper email sending is disabled');
  if(!preview&&(order.status!=='paid'||order.mode!=='live'))throw Error('Only paid live orders receive confirmation emails');
  const recipient=to||order.delivery.email;
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))throw Error('Invalid confirmation recipient');
  const message=render(order,{preview});
  const personal={to:[{email:recipient}]};
  const monitor=env.HAMPER_EMAIL_MONITOR_BCC?.trim();
  if(env.HAMPER_EMAIL_MONITOR_ENABLED==='true'&&monitor&&monitor.toLowerCase()!==recipient.toLowerCase()) {
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(monitor))throw Error('Invalid monitoring address');
    personal.bcc=[{email:monitor}];
  }
  const pdf=await generateHamperInvoice(order);
  const payload={personalizations:[personal],from:{email:'hampers@ultimatepromotions.co.uk',name:company},reply_to:{email:'hampers@ultimatepromotions.co.uk',name:company},subject:message.subject,content:[{type:'text/plain',value:message.text},{type:'text/html',value:message.html}],attachments:[{content:pdf.toString('base64'),type:'application/pdf',filename:`${invoiceNumber(order)}.pdf`,disposition:'attachment'}],categories:['ultimate-hamper-confirmation'],tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}}};
  let response;
  try {response=await fetchImpl('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{Authorization:`Bearer ${env.SENDGRID_API_KEY.trim()}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'error'});}catch {const e=Error('Delivery status unknown; check SendGrid before retrying');e.deliveryState='unknown';throw e;}
  if(response.status!==202){const e=Error(`SendGrid rejected confirmation (HTTP ${response.status})`);e.deliveryState='failed';throw e;}
  return {messageId:response.headers.get('x-message-id')||null,accepted:true};
}
async function drain(db,options={}) {
  const env=options.env||process.env;
  if(env.HAMPER_EMAIL_ENABLED!=='true')return;
  await db.query("UPDATE hamper_confirmation_emails SET status='unknown',last_error='Worker interrupted; check SendGrid before retrying',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '5 minutes'");
  for(let n=0;n<5;n++){
    const {rows:[job]}=await db.query("UPDATE hamper_confirmation_emails SET status='sending',updated_at=now() WHERE order_id=(SELECT order_id FROM hamper_confirmation_emails WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING order_id");
    if(!job)break;
    try {const {rows:[order]}=await db.query('SELECT * FROM hamper_orders WHERE id=$1',[job.order_id]);const result=await (options.sendImpl||send)(order,{env});await db.query("UPDATE hamper_confirmation_emails SET status='sent',provider_message_id=$2,last_error=NULL,updated_at=now() WHERE order_id=$1",[job.order_id,result.messageId]);}
    catch(e){await db.query('UPDATE hamper_confirmation_emails SET status=$2,last_error=$3,updated_at=now() WHERE order_id=$1',[job.order_id,e.deliveryState||'unknown',e.deliveryState==='failed'?'SendGrid rejected this email; review before retrying':'Delivery status unknown; check SendGrid before retrying']);}
  }
}
function start(db){if(process.env.HAMPER_EMAIL_ENABLED!=='true')return;let running=false;const tick=async()=>{if(running)return;running=true;try{await drain(db);}catch{console.error('[hamper-email] Queue processing failed');}finally{running=false;}};const timer=setInterval(tick,15000);timer.unref();void tick();return timer;}
module.exports={render,send,drain,start};
