(() => {
  const root=document.querySelector('#customer-groups-page');
  if (!root) return;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data={customers:[],groups:[]}, loaded=false, loading=false, page=1;
  const size=50;
  const pending=new Map();
  const membershipKey=(key,id)=>JSON.stringify([key,id]);
  const customerCount=n=>`${n} customer${n===1?'':'s'}`;
  root.innerHTML=`<h1>Customers</h1><div class="customer-group-cards"></div><div class="customer-group-tools"><input type="search" aria-label="Search customers" placeholder="Search customers"><label><input type="checkbox" id="customers-ungrouped"> Ungrouped only</label><select data-filter aria-label="Filter by group"><option value="">All groups</option></select><label>Sort by <select data-sort aria-label="Sort by"><option value="newest">Newest to Oldest</option><option value="active">Most Active</option><option value="az">A–Z</option></select></label><button type="button" data-refresh>Refresh</button></div><p class="customer-group-status" role="status" aria-live="polite"></p><div class="customer-group-table"></div><div class="customer-group-pager"><button data-prev>Previous</button><span></span><button data-next>Next</button></div>`;
  const $=s=>root.querySelector(s);
  const status=message=>$('.customer-group-status').textContent=message;
  async function api(path='',method='GET',body) {
    const response=await fetch('/api/customer-groups'+path,{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if (!response.ok) throw Error(result.error||'Unable to save. Please try again.');
    return result;
  }
  function renderCards() {
    $('.customer-group-cards').innerHTML=data.groups.map(g=>`<article class="customer-group-card"><details><summary aria-label="Options for ${escape(g.title)}">⋯</summary><div><button data-edit="${g.id}">Edit group</button><button data-delete="${g.id}">Delete group</button></div></details><h2>${escape(g.title)}</h2><p>${escape(g.description)}</p><strong>${customerCount(data.customers.filter(c=>c.groups.includes(g.id)).length)}</strong></article>`).join('')+'<button class="customer-group-add" data-add><span>＋</span>Add group</button>';
    const selected=$('[data-filter]').value;
    $('[data-filter]').innerHTML='<option value="">All groups</option>'+data.groups.map(g=>`<option value="${g.id}">${escape(g.title)}</option>`).join('');
    $('[data-filter]').value=selected;
  }
  function renderList() {
    const search=$('input[type=search]').value.toLowerCase(), ungrouped=$('#customers-ungrouped').checked, group=Number($('[data-filter]').value);
    const rows=data.customers.filter(c=>c.name.toLowerCase().includes(search)&&(!ungrouped||!c.groups.length)&&(!group||c.groups.includes(group)));
    const sort=$('[data-sort]').value;
    rows.sort((a,b)=>(sort==='newest'?(Date.parse(b.added_at)||0)-(Date.parse(a.added_at)||0):sort==='active'?b.order_count-a.order_count:0)||a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
    const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages);
    $('.customer-group-table').innerHTML=rows.length?`<table><thead><tr><th>Customer</th>${data.groups.map(g=>`<th>${escape(g.title)}</th>`).join('')}</tr></thead><tbody>${rows.slice((page-1)*size,page*size).map(c=>`<tr><th scope="row">${escape(c.name)}</th>${data.groups.map(g=>`<td><input type="checkbox" data-key="${escape(c.key)}" data-group="${g.id}" aria-label="${escape(c.name)}: ${escape(g.title)}" ${(pending.get(membershipKey(c.key,g.id))??c.groups.includes(g.id))?'checked':''} ${pending.has(membershipKey(c.key,g.id))?'disabled':''}></td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="customer-group-empty">No customers match.</p>';
    $('.customer-group-pager span').textContent=`Page ${page} of ${pages} · ${customerCount(rows.length)}`;
    $('[data-prev]').disabled=page<=1;$('[data-next]').disabled=page>=pages;
  }
  async function load(force=false) {
    if (loading || (loaded&&!force)) return;
    if (pending.size) {status('Please wait for assignments to finish saving.');return;}
    loading=true;status('Loading customers…');
    try { data=await api();loaded=true;renderCards();renderList();status(''); }
    catch(e) {status(e.message);} finally {loading=false;}
  }
  function dialog(group,remove=false) {
    const el=document.createElement('dialog');el.className='customer-group-dialog';
    el.setAttribute('aria-labelledby','customer-group-dialog-title');
    el.innerHTML=`<form><h2 id="customer-group-dialog-title">${remove?'Are you sure?':group?'Edit group':'Add group'}</h2>${remove?`<p>Delete “${escape(group.title)}” and its customer assignments? Customer records will be kept.</p>`:`<label>Title<input name="title" maxlength="100" required value="${escape(group?.title||'')}"></label><label>Description<textarea name="description" maxlength="2000" rows="4">${escape(group?.description||'')}</textarea></label>`}<p role="alert"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit">${remove?'Delete group':'Save group'}</button></footer></form>`;
    document.body.append(el);el.showModal();
    el.addEventListener('close',()=>el.remove());
    el.querySelector('[data-cancel]').onclick=()=>el.close();
    el.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const button=el.querySelector('[type=submit]');button.disabled=true;
      try {
        await api('/groups'+(group?'/'+group.id:''),remove?'DELETE':group?'PUT':'POST',remove?undefined:{title:el.querySelector('[name=title]').value,description:el.querySelector('[name=description]').value});
        el.close();await load(true);
      } catch(e) {el.querySelector('[role=alert]').textContent=e.message;button.disabled=false;}
    };
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-add'))dialog();
    if(button.dataset.edit)dialog(data.groups.find(g=>g.id===Number(button.dataset.edit)));
    if(button.dataset.delete)dialog(data.groups.find(g=>g.id===Number(button.dataset.delete)),true);
    if(button.hasAttribute('data-refresh'))load(true);
    if(button.hasAttribute('data-prev')){page--;renderList();}
    if(button.hasAttribute('data-next')){page++;renderList();}
  });
  $('input[type=search]').oninput=()=>{page=1;renderList();};
  $('[data-sort]').onchange=$('[data-filter]').onchange=$('#customers-ungrouped').onchange=()=>{page=1;renderList();};
  root.addEventListener('change',async event=>{
    const box=event.target;if(!box.dataset.group)return;
    const customer=data.customers.find(c=>c.key===box.dataset.key),id=Number(box.dataset.group),selected=box.checked;
    const token=membershipKey(customer.key,id);pending.set(token,selected);
    box.disabled=true;status('Saving…');
    try {
      await api(`/groups/${id}/member`,'PUT',{key:customer.key,selected});
      customer.groups=selected?[...new Set([...customer.groups,id])]:customer.groups.filter(g=>g!==id);
      pending.delete(token);renderCards();renderList();status(pending.size?'Saving…':'Saved');
    } catch(e) {pending.delete(token);renderList();status(e.message);}
  });
  window.loadCustomerGroups=()=>load();
})();
