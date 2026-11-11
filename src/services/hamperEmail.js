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
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>
:root{color-scheme:light dark;supported-color-schemes:light dark}body{margin:0!important}table{border-collapse:collapse}a{color:inherit}
@media only screen and (max-width:480px){.outer-pad{padding:24px 14px!important}.card-pad{padding:24px 20px!important}.email-title{font-size:30px!important}.product-image,.product-info{display:block!important;width:100%!important;text-align:center!important;padding:0!important}.product-image{padding:0 0 14px!important}.product-info{padding-bottom:20px!important}.mobile-centre{text-align:center!important}.product-title{font-size:24px!important}.body-copy{font-size:15px!important}.total-value{font-size:26px!important}}
@media(prefers-color-scheme:dark){.email-bg{background-color:#17251f!important}.email-card{background-color:#23372e!important;border-color:#496052!important}.heading,.value{color:#fffaf0!important}.body-copy{color:#e4e9df!important}.muted,.label{color:#bdc9bf!important}.divider{border-color:#496052!important}.success{background-color:#344e3f!important;color:#eed49b!important}.total-panel{background-color:#344e3f!important}.total-value{color:#eed49b!important}.footer-link{color:#eed49b!important}}
</style></head><body class="email-bg" style="margin:0;background-color:#faf7f0;font-family:Arial,sans-serif"><table role="presentation" class="email-bg" width="100%" bgcolor="#faf7f0" cellpadding="0" cellspacing="0"><tr><td class="outer-pad" align="center" style="padding:36px 18px"><table role="presentation" width="600" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 24px"><img src="${SITE}/assets/ultimate-christmas-logo.png" alt="${company}" width="220" style="display:block;width:220px;max-width:100%;background-color:#faf7f0;border-radius:12px;padding:10px 12px"><h1 class="email-title heading" style="color:#243f35;font-family:Georgia,serif;font-size:36px;line-height:1.2;font-weight:400;margin:24px 0 12px">${title}</h1><p class="muted" style="font-size:15px;line-height:1.6;color:#647068;margin:0">${preview?'TEST PREVIEW — no order has been placed.':'Your payment has been received.'}</p></td></tr>
<tr><td class="email-card card-pad" bgcolor="#fffdfa" style="background-color:#fffdfa;border:1px solid #e6dece;border-radius:20px;padding:28px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation"><tr><td class="success" align="center" width="48" height="48" style="width:48px;height:48px;border-radius:50%;background-color:#e8eee7;color:#243f35;font-size:26px">✓</td></tr></table><p class="body-copy" style="color:#37463d;font-size:16px;line-height:1.6;margin:20px 0 8px">Hello ${esc(d.name)},</p><p class="muted" style="color:#647068;font-size:14px;line-height:1.6;margin:0 0 24px">${preview?'This is a preview of your confirmation.':'Your Christmas hamper is confirmed.'}<br>Order <strong class="heading" style="color:#243f35">${po}</strong> · Your invoice PDF is attached.</p></td></tr>
${items.map(i=>`<tr><td class="divider" style="padding:0 0 22px;border-bottom:1px solid #dbd4c6"><table role="presentation" width="100%"><tr><td class="product-image" width="112" valign="middle" style="width:112px;padding-right:20px"><img width="92" src="${SITE}/assets/product-${Number(i.page)}.jpg" alt="${esc(i.name)}" style="width:92px;max-width:100%;border-radius:10px"></td><td class="product-info" valign="middle"><h2 class="product-title heading" style="color:#243f35;font-family:Georgia,serif;font-size:25px;line-height:1.2;font-weight:400;margin:0 0 9px">${esc(i.name)}</h2><p class="muted" style="color:#647068;font-size:14px;line-height:1.7;margin:0">${i.quantity} × <strong class="value" style="color:#263b30;font-weight:600">${money(i.unitPence)}</strong> ex. VAT<br>VAT (${i.vatPercent}%): ${money(i.productVatPence)}</p></td></tr></table></td></tr>`).join('')}
${q.discountLabel?`<tr><td align="center" style="padding:18px 0 0"><p class="muted" style="color:#647068;font-size:12px;line-height:1.6;margin:0">${esc(q.discountLabel)}<br><strong class="heading" style="color:#243f35">Saved ${money(q.discountPence)} including VAT.</strong><br>All amounts below include the discount.</p></td></tr>`:''}
<tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summary.slice(0,-1).map(([k,v])=>`<tr><td class="label" style="color:#647068;font-size:14px;padding:7px 12px 7px 0">${k}</td><td class="value" align="right" style="color:#263b30;font-size:14px;font-weight:600;padding:7px 0;white-space:nowrap">${money(v)}</td></tr>`).join('')}</table></td></tr>
<tr><td style="padding:18px 0 22px"><table class="total-panel" role="presentation" width="100%" bgcolor="#e8eee7" style="background-color:#e8eee7;border-radius:12px"><tr><td class="heading" style="color:#243f35;font-size:16px;font-weight:bold;padding:18px">Total paid</td><td class="total-value heading" align="right" style="color:#243f35;font-family:Georgia,serif;font-size:28px;padding:18px;white-space:nowrap">${money(q.totalPence)}</td></tr></table></td></tr>
<tr><td class="divider mobile-centre" style="padding-top:22px;border-top:1px solid #dbd4c6"><h2 class="heading" style="color:#243f35;font-family:Georgia,serif;font-size:23px;font-weight:400;margin:0 0 12px">Delivery address</h2><p class="body-copy" style="color:#37463d;font-size:14px;line-height:1.7;margin:0">${address.map(esc).join('<br>')}</p></td></tr></table></td></tr>
<tr><td align="center" style="padding:24px 12px 0"><p class="muted" style="color:#647068;font-size:13px;line-height:1.8;margin:0 0 20px">Questions about your order?<br>Reply to this email or call <a class="footer-link" href="tel:+441442264288" style="color:#243f35;font-weight:bold;text-decoration:none">01442 264288</a>.</p><p class="muted" style="color:#647068;font-size:12px;line-height:1.8;margin:0">${company}<br>Unicorn House, Northbridge Road<br>Berkhamsted, HP4 1EH<br><a class="footer-link" href="mailto:hampers@ultimatepromotions.co.uk" style="color:#243f35">hampers@ultimatepromotions.co.uk</a></p></td></tr></table></td></tr></table></body></html>`;
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
