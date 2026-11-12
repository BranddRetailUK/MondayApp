'use strict';
const crypto=require('node:crypto');
const products=require('../../web/hamper-collection/products.json');
const catalogue=new Map(products.map(p=>[p.sku,p]));
class EnquiryError extends Error {constructor(message,status=400){super(message);this.status=status;}}
async function ensureTables(db){await db.query(`CREATE TABLE IF NOT EXISTS hamper_enquiries (
 id UUID PRIMARY KEY, fingerprint TEXT NOT NULL, details JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'sending', provider_message_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);}
function validate(input){
 if(!input||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id||''))throw new EnquiryError('Please refresh the page and try again.');
 const field=(key,max,required=false)=>{const v=typeof input[key]==='string'?input[key].trim():'';if((required&&!v)||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw new EnquiryError('Please check your contact details and message.');return v;};
 const name=field('name',120,true),email=field('email',254,true),phone=field('phone',60),message=field('message',5000,true);
 if(/[\r\n]/.test(name+email+phone)||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new EnquiryError('Please enter a valid email address and contact details.');
 const items=input.items||[];if(!Array.isArray(items)||items.length>100)throw new EnquiryError('Please check the hamper details.');
 const selected=items.map(i=>{if(!catalogue.has(i.sku)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>10000)throw new EnquiryError('Please check the hamper and quantity.');return {sku:i.sku,name:catalogue.get(i.sku).name,quantity:i.quantity};});
 return {name,email,phone,message,items:selected};
}
async function submit(db,input,ip,{env=process.env,fetchImpl=fetch}={}){
 if(input?.website)return {received:true};
 const details=validate(input),fingerprint=crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex');
 const existing=(await db.query('SELECT fingerprint,status FROM hamper_enquiries WHERE id=$1',[input.id])).rows[0];
 const repeated=row=>{if(row.fingerprint!==fingerprint)throw new EnquiryError('Please refresh the page before starting a new enquiry.',409);if(row.status==='sent')return {received:true};throw new EnquiryError('We could not confirm email delivery. Please call 01442 264288 rather than submitting again.',503);};
 if(existing)return repeated(existing);
 if(!env.SENDGRID_API_KEY)throw new EnquiryError('Enquiries are temporarily unavailable. Please call 01442 264288.',503);
 const key=crypto.createHash('sha256').update('hamper-enquiry:'+ip).digest('hex');
 const bucket=(await db.query(`INSERT INTO hamper_checkout_limits(key,count,expires_at) VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN hamper_checkout_limits.expires_at<NOW() THEN 1 ELSE hamper_checkout_limits.count+1 END,expires_at=CASE WHEN hamper_checkout_limits.expires_at<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE hamper_checkout_limits.expires_at END RETURNING count`,[key])).rows[0];
 if(bucket.count>5)throw new EnquiryError('Please wait 15 minutes before sending another enquiry, or call 01442 264288.',429);
 const inserted=await db.query('INSERT INTO hamper_enquiries(id,fingerprint,details) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[input.id,fingerprint,details]);
 if(!inserted.rows.length)return repeated((await db.query('SELECT fingerprint,status FROM hamper_enquiries WHERE id=$1',[input.id])).rows[0]);
 const text=[`Name: ${details.name}`,`Email: ${details.email}`,`Phone: ${details.phone||'Not supplied'}`,...details.items.map(i=>`${i.quantity} × ${i.name} (${i.sku})`),'',details.message].join('\n');
 const payload={personalizations:[{to:[{email:'charlie@ultimatepromotions.co.uk'}]}],from:{email:'hampers@ultimatepromotions.co.uk',name:'Ultimate Christmas'},reply_to:{email:details.email,name:details.name},subject:'Christmas hamper enquiry',content:[{type:'text/plain',value:text}],categories:['ultimate-hamper-enquiry'],custom_args:{ultimate_enquiry_id:input.id},tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}}};
 let response;try{response=await fetchImpl('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{Authorization:`Bearer ${env.SENDGRID_API_KEY.trim()}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{await db.query("UPDATE hamper_enquiries SET status='unknown' WHERE id=$1",[input.id]);throw new EnquiryError('We could not confirm email delivery. Please call 01442 264288 rather than submitting again.',503);}
 if(response.status!==202){await db.query("UPDATE hamper_enquiries SET status='failed' WHERE id=$1",[input.id]);throw new EnquiryError('Your enquiry could not be sent. Please call 01442 264288.',503);}
 await db.query("UPDATE hamper_enquiries SET status='sent',provider_message_id=$2 WHERE id=$1",[input.id,response.headers.get('x-message-id')||null]);return {received:true};
}
module.exports={ensureTables,validate,submit,EnquiryError};
