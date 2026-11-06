// No business data, HTML, credentials or API responses are cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data.json();}catch{}
  event.waitUntil(self.registration.showNotification('Ultimate Hub',{
    body:data.body||'There is an update in Ultimate Hub.',icon:'/hub-icon-v2-192.png',
    badge:'/hub-icon-v2-192.png',tag:data.tag||'hub-update',data:{url:'/mobile?tab=test-dashboard'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL('/mobile?tab=test-dashboard',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}}
    return self.clients.openWindow(url);
  })());
});
