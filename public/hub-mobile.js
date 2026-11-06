(async function(){
  const user=await window.ultimateHubUserPromise;
  if(!user || user.access_scope==='dtf_only')return;
  const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const icons={dashboard:svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),database:svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'),alerts:svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),more:svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>')};
  const nav=document.createElement('nav');nav.className='hub-bottom-nav';nav.setAttribute('aria-label','App navigation');
  nav.innerHTML=[['dashboard','Dashboard'],['database','Database'],['alerts','Alerts'],['more','More']].map(([key,label])=>`<button type="button" data-hub-nav="${key}"><span aria-hidden="true">${icons[key]}</span>${label}</button>`).join('');
  document.body.append(nav);
  const header=document.createElement('header');header.className='hub-app-header';header.innerHTML='<img src="/hub-icon-192.png" alt=""><strong>Ultimate Hub</strong><span id="hub-connection">Live</span>';document.body.append(header);
  function connection(){const online=navigator.onLine;document.getElementById('hub-connection').textContent=online?'Live':'Offline';document.body.classList.toggle('hub-offline',!online);}
  window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
  const dialog=document.createElement('dialog');dialog.className='hub-settings';dialog.innerHTML=`<div class="hub-sheet-head"><h2>Notifications</h2><button type="button" data-close aria-label="Close notifications">×</button></div>
    <p>Get updates on this device, even when Ultimate Hub is closed.</p>
    <div class="hub-install-help"><strong>Install on iPhone</strong><p>Open this site in Safari, tap Share → Add to Home Screen, then open Ultimate Hub from your Home Screen. Notifications require iOS 16.4 or later.</p></div>
    <fieldset><legend>Notify me when</legend>
    <label><span>A job is completed</span><input type="checkbox" data-kind="completed" checked></label>
    <label><span>A job is approved</span><input type="checkbox" data-kind="approved" checked></label>
    <label><span>A proof is created</span><input type="checkbox" data-kind="proof" checked></label></fieldset>
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
  nav.addEventListener('click',event=>{
    const button=event.target.closest('[data-hub-nav]');if(!button)return;
    if(button.dataset.hubNav==='alerts'){dialog.showModal();void setup();return;}
    if(button.dataset.hubNav==='more'){document.getElementById('mobileNavToggle')?.click();return;}
    document.querySelector(`.nav-tabs li[data-tab="${button.dataset.hubNav==='database'?'database':'test-dashboard'}"]`)?.click();window.scrollTo({top:0});sync();
  });
  function sync(){const tab=document.querySelector('.nav-tabs li.active')?.dataset.tab;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.hubNav===(tab==='database'?'database':tab==='test-dashboard'?'dashboard':'more'))));}
  new MutationObserver(sync).observe(document.querySelector('.nav-tabs'),{subtree:true,attributes:true,attributeFilter:['class']});sync();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/hub-sw.js').catch(()=>{});
})();
