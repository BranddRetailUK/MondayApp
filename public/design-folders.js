(() => {
  const pending=new Set();
  let notice,hideTimer;
  function show(message,autoHide=false){
    clearTimeout(hideTimer);
    if(!notice){notice=document.createElement('div');notice.className='design-folder-notice';notice.setAttribute('role','status');document.body.append(notice);}
    notice.textContent=message;notice.hidden=false;
    if(autoHide)hideTimer=setTimeout(()=>{notice.hidden=true;},2000);
  }
  window.openDesignFolder=async(number,event)=>{
    event?.preventDefault();event?.stopPropagation();
    number=String(number).trim();
    if(!/^[1-9]\d{0,9}$/.test(number)||pending.has(number))return;
    pending.add(number);show(`Opening folder ${number} on the Windows design computer…`);
    try{
      const response=await fetch('/api/design-folders/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designNumber:number})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to open folder');
      const deadline=Date.now()+65000;
      while(Date.now()<deadline){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const check=await fetch(`/api/design-folders/requests/${result.id}`,{cache:'no-store'});
        const state=await check.json();if(!check.ok)throw new Error(state.error||'Unable to check folder request');
        if(state.status==='opened'||(state.status==='error'&&state.message==='Folder opened, but Windows blocked foreground focus. Select Explorer on the taskbar.')){
          clearTimeout(hideTimer);if(notice)notice.hidden=true;return;
        }
        if(state.status==='error')throw new Error(state.message||'Folder could not be opened');
        if(state.status==='expired')break;
      }
      throw new Error('Folder request expired. Check the Windows worker, then click the number again.');
    }catch(error){show(error.message,true);}finally{pending.delete(number);}
  };
})();
