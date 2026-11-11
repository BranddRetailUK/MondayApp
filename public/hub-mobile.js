(async function(){
  const user=await window.ultimateHubUserPromise;
  if(!user || user.access_scope==='dtf_only')return;
  document.body.classList.toggle('hub-production-user',String(user.email||'').trim().toLowerCase()==='production@ultimatepromotions.co.uk');
  const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const icons={create:svg('<path d="M12 5v14M5 12h14"/>'),dashboard:svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),database:svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'),holiday:svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>'),more:svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>')};
  const nav=document.createElement('nav');nav.className='hub-bottom-nav';nav.setAttribute('aria-label','App navigation');
  nav.innerHTML=[['dashboard','Dashboard'],['database','Database'],['create','Create'],['holiday','Holiday'],['more','More']].map(([key,label])=>`<button type="button" data-hub-nav="${key}"><span aria-hidden="true">${icons[key]}</span>${label}</button>`).join('');
  document.body.append(nav);
  const header=document.createElement('header');header.className='hub-app-header';header.innerHTML='<button type="button" class="hub-brand-menu" aria-label="Open navigation" aria-controls="appSidebar" aria-expanded="false"><img src="/hub-icon-v2-192.png" alt=""></button><strong>Ultimate Hub</strong>';document.body.append(header);
  const brandMenu=header.querySelector('.hub-brand-menu');
  brandMenu.onclick=()=>{if(!document.body.classList.contains('mobile-nav-open'))document.getElementById('mobileNavToggle')?.click();};
  new MutationObserver(()=>brandMenu.setAttribute('aria-expanded',String(document.body.classList.contains('mobile-nav-open')))).observe(document.body,{attributes:true,attributeFilter:['class']});
  const dialog=document.createElement('dialog');dialog.className='hub-settings';dialog.innerHTML=`<div class="hub-sheet-head"><h2>Notifications</h2><button type="button" data-close aria-label="Close notifications">×</button></div>
    <p>Get updates on this device, even when Ultimate Hub is closed.</p>
    <div class="hub-install-help"><strong>Install on iPhone</strong><p>Open this site in Safari, tap Share → Add to Home Screen, then open Ultimate Hub from your Home Screen. Notifications require iOS 16.4 or later.</p></div>
    <fieldset><legend>Notify me when</legend>
    <label><span>A job is completed</span><input type="checkbox" data-kind="completed" checked></label>
    <label><span>A job is approved</span><input type="checkbox" data-kind="approved" checked></label>
    <label><span>A proof is created</span><input type="checkbox" data-kind="proof" checked></label>
    <label><span>A hamper order is paid</span><input type="checkbox" data-kind="hamper" checked></label></fieldset>
    <p id="hub-push-status" role="status" aria-live="polite"></p>
    <button type="button" data-enable>Enable notifications</button><button type="button" data-test disabled>Send test notification</button><button type="button" data-disable disabled>Turn off on this device</button>`;
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  const status=dialog.querySelector('#hub-push-status'),enable=dialog.querySelector('[data-enable]'),test=dialog.querySelector('[data-test]'),disable=dialog.querySelector('[data-disable]');
  let registration,config,enabled=false;
  async function api(path,body){const response=await fetch('/api/hub-push/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not update notifications.');return data;}
  function render(){enable.textContent=enabled?'Save preferences':'Enable notifications';test.disabled=disable.disabled=!enabled;}
  async function setup(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){enable.disabled=true;status.textContent='Install the app on your Home Screen to enable notifications on iPhone, or use a browser that supports Web Push.';return;}
    try{
      config=await api('config');registration=await navigator.serviceWorker.register('/hub-sw.js');await navigator.serviceWorker.ready;
      enable.disabled=!config.enabled;
      if(!config.enabled){status.textContent='Notifications are not configured yet.';return;}
      const subscription=await registration.pushManager.getSubscription();
      const state=subscription?await api('device',{endpoint:subscription.endpoint}):{enabled:false};enabled=state.enabled;
      if(state.preferences)dialog.querySelectorAll('[data-kind]').forEach(el=>el.checked=state.preferences[el.dataset.kind]);
      status.textContent=enabled?'Notifications are enabled on this device.':'Choose your alerts, then enable notifications.';render();
    }catch(e){status.textContent=e.message;enable.disabled=true;}
  }
  async function run(button,fn){button.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{button.disabled=false;render();}}
  enable.onclick=()=>run(enable,async()=>{
    // Permission is requested directly from the user's tap, before any network work.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications are blocked. Allow them in your device notification settings, then try again.');
    const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    const preferences=Object.fromEntries([...dialog.querySelectorAll('[data-kind]')].map(el=>[el.dataset.kind,el.checked]));
    await api('subscribe',{subscription:subscription.toJSON(),preferences});enabled=true;status.textContent='Notifications enabled. Only new updates will be sent.';
  });
  test.onclick=()=>run(test,async()=>{const sub=await registration.pushManager.getSubscription();await api('test',{endpoint:sub?.endpoint});status.textContent='Test queued. It should arrive shortly.';});
  disable.onclick=()=>run(disable,async()=>{const sub=await registration.pushManager.getSubscription();if(sub){await api('unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}enabled=false;status.textContent='Notifications are off on this device.';});
  const alerts=document.createElement('button');alerts.type='button';alerts.className='hub-more-alerts';alerts.textContent='Alerts';
  document.querySelector('#sidebarDashboardControls')?.prepend(alerts);
  alerts.onclick=()=>{document.getElementById('mobileNavToggle')?.click();dialog.showModal();void setup();};
  nav.addEventListener('click',event=>{
    const button=event.target.closest('[data-hub-nav]');if(!button)return;
    if(button.dataset.hubNav==='more'){document.getElementById('mobileNavToggle')?.click();return;}
    if(button.dataset.hubNav==='database' && document.querySelector('.nav-tabs li.active')?.dataset.tab==='database'){
      document.querySelector('[data-db-go="home"]')?.click();
      window.scrollTo({top:0});sync();return;
    }
    if(button.dataset.hubNav==='create'){
      document.querySelector('.nav-tabs li[data-tab="database"]')?.click();
      if(!document.getElementById('db-new-order-view')?.classList.contains('active'))document.querySelector('[data-db-action="new-order"]')?.click();
      window.scrollTo({top:0});sync();return;
    }
    document.querySelector(`.nav-tabs li[data-tab="${button.dataset.hubNav==='database'?'database':button.dataset.hubNav==='holiday'?'holiday-board':'test-dashboard'}"]`)?.click();window.scrollTo({top:0});sync();
  });
  function sync(){const tab=document.querySelector('.nav-tabs li.active')?.dataset.tab;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.hubNav===(tab==='database'?(document.getElementById('db-new-order-view')?.classList.contains('active')?'create':'database'):tab==='test-dashboard'?'dashboard':tab==='holiday-board'?'holiday':'more'))));}
  new MutationObserver(sync).observe(document.querySelector('.nav-tabs'),{subtree:true,attributes:true,attributeFilter:['class']});sync();
  const newOrderView=document.getElementById('db-new-order-view');
  if(newOrderView)new MutationObserver(sync).observe(newOrderView,{attributes:true,attributeFilter:['class']});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/hub-sw.js').catch(()=>{});
})();
