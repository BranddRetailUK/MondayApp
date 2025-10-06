(() => {
  const API = (path) => `http://localhost:5005${path}`; // point to your Python service

  const panel = document.querySelector('#tab-mdb-jobs');
  const searchInput = document.querySelector('#mdb-search');
  const searchBtn = document.querySelector('#mdb-search-btn');
  const table = document.querySelector('#mdb-jobs-table');

  function row(o){
    const tr = document.createElement('div');
    tr.className = 'row grid grid-cols-12 gap-2 items-center py-2 border-b';
    tr.innerHTML = `
      <div class="col-span-2 font-mono">${o.order_no}</div>
      <div class="col-span-1">${o.order_type}</div>
      <div class="col-span-3">${o.customer || ''}</div>
      <div class="col-span-4 truncate" title="${o.job_title || ''}">${o.job_title || ''}</div>
      <div class="col-span-2 text-right">
        <button class="btn btn-primary" data-order="${o.order_no}">Create subitems</button>
      </div>
    `;
    tr.querySelector('button').addEventListener('click', async (e) => {
      const orderNo = e.currentTarget.getAttribute('data-order');
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = 'Pushing…';
      try {
        const res = await fetch(API(`/orders/${orderNo}/push-to-monday`), { method: 'POST' });
        const json = await res.json();
        if (!json.ok) throw new Error(json.detail || 'Failed');
        e.currentTarget.textContent = `Done (${json.created.length})`;
      } catch (err) {
        console.error(err);
        e.currentTarget.textContent = 'Error';
        alert(`Failed to push subitems: ${err.message}`);
      } finally {
        e.currentTarget.disabled = false;
      }
    });
    return tr;
  }

  async function load(q=""){
    table.innerHTML = `<div class="p-4 text-sm opacity-70">Loading…</div>`;
    const res = await fetch(API(`/jobs${q ? `?q=${encodeURIComponent(q)}` : ''}`));
    const json = await res.json();
    if (!json.ok) {
      table.innerHTML = `<div class="p-4 text-red-600">Error: ${json.detail || 'Unknown error'}</div>`;
      return;
    }
    const items = json.items || [];
    if (!items.length){
      table.innerHTML = `<div class="p-4 opacity-70">No open jobs.</div>`;
      return;
    }
    const header = document.createElement('div');
    header.className = 'row grid grid-cols-12 gap-2 font-semibold py-2 border-b';
    header.innerHTML = `
      <div class="col-span-2">Order #</div>
      <div class="col-span-1">Type</div>
      <div class="col-span-3">Customer</div>
      <div class="col-span-4">Title</div>
      <div class="col-span-2 text-right">Actions</div>
    `;
    table.innerHTML = '';
    table.appendChild(header);
    items.forEach(o => table.appendChild(row(o)));
  }

  searchBtn.addEventListener('click', () => load(searchInput.value.trim()));
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(searchInput.value.trim()); });

  // If your tab system lazy-loads, hook into tab activation; otherwise call now:
  load();
})();