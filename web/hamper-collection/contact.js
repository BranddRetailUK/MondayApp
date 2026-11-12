(() => {
 const form=document.querySelector('#contact-form');if(!form)return;
 const status=document.querySelector('#contact-status'),button=form.querySelector('button[type=submit]'),params=new URLSearchParams(location.search);
 let items=[],id=crypto.randomUUID(),lastBody=null;
 try {items=params.has('items')?JSON.parse(params.get('items')):params.has('sku')?[{sku:params.get('sku'),quantity:Number(params.get('quantity')||1)}]:[];}catch{}
 if(!Array.isArray(items))items=[];
 items=items.filter(i=>i&&typeof i.sku==='string'&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=10000).slice(0,100);
 const ready=items.length?fetch('https://www.ultimatehub.co.uk/api/hamper-checkout/catalogue',{credentials:'omit'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json(),products=new Map(data.products.map(p=>[p.sku,p]));items=items.filter(i=>products.has(i.sku));const box=document.querySelector('#contact-items');box.hidden=!items.length;box.textContent=items.map(i=>`${i.quantity} × ${products.get(i.sku).name}`).join('\n');if(items.length&&!form.elements.message.value)form.elements.message.value='Please let me know availability and delivery options for these hampers.';}).catch(()=>{status.textContent='Please include the hamper name and quantity in your message.';items=[];}):Promise.resolve();
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(button.disabled||!form.reportValidity())return;button.disabled=true;button.textContent='Sending…';status.textContent='';
  try {await ready;const fields=new FormData(form),body={name:fields.get('name'),email:fields.get('email'),phone:fields.get('phone'),message:fields.get('message'),website:fields.get('website'),items};const signature=JSON.stringify(body);if(lastBody!==null&&lastBody!==signature)id=crypto.randomUUID();lastBody=signature;
   const response=await fetch('https://www.ultimatehub.co.uk/api/hamper-enquiries',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,id}),signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Your enquiry could not be sent. Please call 01442 264288.');
   form.querySelectorAll('input,textarea').forEach(el=>el.disabled=true);button.classList.add('contact-sent');button.innerHTML='<svg class="contact-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7"/></svg><span>Enquiry sent</span>';status.textContent='Thank you — your enquiry has been sent. Our team will be in touch.';window.HamperAnalytics?.track('enquiry');
  }catch(e){status.textContent=e.name==='TimeoutError'||e.name==='TypeError'?'We could not confirm delivery. Please try once more or call 01442 264288.':e.message;button.disabled=false;button.textContent='Send enquiry';}
 });
})();
