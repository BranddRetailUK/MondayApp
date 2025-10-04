// public/shipping.js
document.addEventListener('DOMContentLoaded', () => {
  const tab = document.getElementById('tab-shipping');
  if (!tab) return;

  const refreshBtn = document.getElementById('pc-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', loadPcOrders);

  // Auto-load when user opens the Shipping tab
  const tabBtn = document.querySelector('.nav-tabs li[data-tab="shipping"]');
  if (tabBtn) {
    tabBtn.addEventListener('click', () => {
      // lazy load to avoid calling when not visible
      if (!tab.dataset.loaded) {
        loadPcOrders();
      }
    });
  }
});

async function loadPcOrders() {
  const tbody = document.querySelector('#pc-orders-table tbody');
  const detailWrap = document.getElementById('pc-order-detail');
  if (detailWrap) detailWrap.style.display = 'none';
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6">Loading PenCarrie orders…</td></tr>`;

  try {
    const r = await fetch('/api/pencarrie/orders', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();

    const rows = (j.orders || []).map(o => {
      const eta = [o.eta_min, o.eta_max].filter(Boolean).join(' → ');
      const safe = (s) => String(s || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
      return `
        <tr data-ordcode="${safe(o.ordcode)}">
          <td>${safe(o.ordcode)}</td>
          <td>${safe(o.status)}</td>
          <td>${safe(o.trackntrace)}</td>
          <td>${safe(o.delcarrier || o.del_tid)}</td>
          <td>${safe(eta)}</td>
          <td>
            <button class="btn small" data-view>View</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows || `<tr><td colspan="6">No live stock orders found.</td></tr>`;
    tbody.querySelectorAll('button[data-view]').forEach(btn => {
      btn.addEventListener('click', onViewPcOrder);
    });

    // mark loaded so we don't re-hit until user clicks refresh
    const tab = document.getElementById('tab-shipping');
    if (tab) tab.dataset.loaded = '1';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6">Failed to load orders: ${e.message}</td></tr>`;
  }
}

async function onViewPcOrder(e) {
  const tr = e.target.closest('tr');
  const ordcode = tr?.dataset?.ordcode;
  if (!ordcode) return;

  const headerEl = document.getElementById('pc-order-header');
  const linesTbody = document.querySelector('#pc-lines-table tbody');
  const wrap = document.getElementById('pc-order-detail');
  if (headerEl) headerEl.textContent = 'Loading…';
  if (linesTbody) linesTbody.innerHTML = '';
  if (wrap) wrap.style.display = 'block';

  try {
    const r = await fetch(`/api/pencarrie/orders/${encodeURIComponent(ordcode)}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();

    if (headerEl) {
      const h = j.header || {};
      const eta = [h.eta_min, h.eta_max].filter(Boolean).join(' → ');
      headerEl.textContent = `${h.ordcode} · ${h.status} · ${h.trackntrace || '—'} · ${h.delcarrier || ''} · ETA: ${eta || '—'}`;
    }

    if (linesTbody) {
      linesTbody.innerHTML = (j.items || []).map(it => `
        <tr>
          <td>${esc(it.sku)}</td>
          <td>${esc(it.descr)}</td>
          <td>${esc(it.qty)}</td>
          <td>${esc(it.cref)}</td>
        </tr>
      `).join('') || `<tr><td colspan="4">No line items.</td></tr>`;
    }
  } catch (e2) {
    if (headerEl) headerEl.textContent = `Failed to load order: ${e2.message}`;
  }
}

function esc(s){ return String(s ?? '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
