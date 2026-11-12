/* First-party aggregate statistics. No visitor IDs, cookies, form values or stored browsing history. */
(() => {
 'use strict';
 if(window.HamperAnalytics)return;
 const HUB='https://www.ultimatehub.co.uk',SITE='https://christmashampers.ultimatepromotions.co.uk',KEY='hamper-statistics-disabled';
 const params=new URLSearchParams(location.search);
 let optedOut=false;try{if(params.get('analytics')==='off')localStorage.setItem(KEY,'1');optedOut=localStorage.getItem(KEY)==='1';}catch{}
 const browserOptOut=navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true;
 const testing=params.get('analytics_test')==='1'||navigator.webdriver;
 const disabled=()=>optedOut||browserOptOut||testing;
 const pageId=crypto.randomUUID();
 const path=location.pathname==='/index.html'?'/':location.pathname.endsWith('hamper-checkout.html')&&params.has('order')?'/order-confirmation':location.pathname;
 let viewed=false;
 function track(event,extra={}){
  if(disabled())return;
  try {
  if(event!=='pageview'&&!viewed)track('pageview');
  if(event==='pageview'&&viewed)return;
  const data={id:crypto.randomUUID(),pageId,event,path,referrer:document.referrer,sku:extra.sku,quantity:extra.quantity};
  // Strip query strings and credentials before any referrer data leaves the browser.
  try{data.referrer=new URL(document.referrer).origin;}catch{data.referrer='';}
  fetch(HUB+'/api/site-analytics/events',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(data),credentials:'omit',keepalive:true,referrerPolicy:'no-referrer'}).catch(()=>{});
  if(event==='pageview')viewed=true;
  }catch{}
 }
 function decorateUrl(value){if(!disabled())return value;try{const url=new URL(value,location.href);if([HUB,SITE,location.origin].includes(url.origin))url.searchParams.set('analytics','off');return url.href;}catch{return value;}}
 window.HamperAnalytics={track,decorateUrl};
 track('pageview');if(path==='/hamper-checkout.html')track('checkout_start');
 let seconds=0;const timer=setInterval(()=>{if(document.visibilityState==='visible')seconds++;if(seconds>=10){clearInterval(timer);track('engaged');}},1000);
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('a[href]');if(!link)return;
  if(/^(mailto:|tel:)/i.test(link.getAttribute('href')))track('enquiry');
  else if(disabled())link.href=decorateUrl(link.href);
 });
 const footer=document.querySelector('footer')||document.querySelector('main');if(!footer)return;
 const button=document.createElement('button');button.type='button';button.textContent='Privacy & analytics';button.style.cssText='font:inherit;font-size:12px;color:inherit;text-decoration:underline;background:none;border:0;cursor:pointer;margin:16px 0;padding:8px;';footer.append(button);
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','hamper-privacy-title');dialog.style.cssText='max-width:440px;width:calc(100% - 48px);padding:26px;border:1px solid #ccc;border-radius:14px;background:#fbf7ef;color:#25332c;font:16px/1.6 Arial,sans-serif;';
 dialog.innerHTML='<h2 id="hamper-privacy-title" style="margin-top:0;font:28px Georgia,serif">Privacy & analytics</h2><p>We use anonymous page and shopping activity counts to improve this website. We do not create visitor profiles or collect names, email addresses or form contents for these statistics. Activity is retained for up to 180 days and is not shared with advertising providers.</p><p>Statistics do not use cookies. If you switch them off, we save only that preference in your browser. Your basket is stored separately so you can shop.</p><p data-analytics-status></p><button type="button" data-analytics-toggle style="padding:10px 14px;margin-right:10px">Switch off statistics</button><button type="button" data-analytics-close style="padding:10px 14px">Close</button>';
 document.body.append(dialog);
 const update=()=>{dialog.querySelector('[data-analytics-status]').textContent=browserOptOut?'Your browser has requested no tracking.':disabled()?'Anonymous statistics are off.':'Anonymous statistics are on.';const toggle=dialog.querySelector('[data-analytics-toggle]');toggle.disabled=browserOptOut||Boolean(testing);toggle.textContent=optedOut?'Allow anonymous statistics':'Switch off statistics';};
 button.addEventListener('click',()=>{update();dialog.showModal();});dialog.querySelector('[data-analytics-close]').addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-analytics-toggle]').addEventListener('click',()=>{optedOut=!optedOut;try{if(optedOut)localStorage.setItem(KEY,'1');else localStorage.removeItem(KEY);}catch{}update();});
})();
