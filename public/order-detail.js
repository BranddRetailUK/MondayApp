(function () {
  const qs = new URLSearchParams(location.search);
  const id = parseInt(qs.get('id') || '', 10);

  if (!Number.isFinite(id)) {
    document.body.innerHTML = '<div style="padding:24px;font-family:system-ui">Invalid order id.</div>';
    return;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const r = await fetch(`/api/orders/${id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Failed to load order');
      const { order, items, files } = await r.json();

      // Header
      document.getElementById('od-title').textContent = `Order #${order.id} — ${order.job_title || order.product_title || 'Untitled'}`;
      document.getElementById('od-status').textContent = order.status || '—';
      document.getElementById('od-created').textContent = order.created_at ? new Date(order.created_at).toLocaleString() : '—';
      document.getElementById('od-notes').textContent = order.notes || '—';

      // Customer block
      document.getElementById('c-name').textContent = order.customer_name || '—';
      // We don’t have contact/email/phone on the /api/orders/:id payload; if needed,
      // you can extend the server to join those. For now we leave placeholders.
      // (Optional enhancement: fetch /api/customers/:id if order.customer_id is present.)

      // Items
      const tbody = document.querySelector('#items-table tbody');
      tbody.innerHTML = '';
      if (!items || !items.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="muted">No items.</td></tr>`;
      } else {
        for (const it of items) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${esc(it.line_no ?? '')}</td>
            <td>${esc(it.product_code ?? '')}</td>
            <td>${esc(it.garment_type ?? '')}</td>
            <td>${esc(it.product_title ?? '')}</td>
            <td>${esc(it.colour ?? '')}</td>
            <td>${esc(it.size ?? '')}</td>
            <td>${esc(it.quantity ?? 1)}</td>
          `;
          tbody.appendChild(tr);
        }
      }

      // Files
      if (files && files.length) {
        const wrap = document.getElementById('files-card');
        const grid = document.getElementById('files-list');
        grid.innerHTML = '';
        for (const f of files) {
          const a = document.createElement('a');
          a.href = f.path;
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'file-chip';
          a.textContent = f.filename;
          grid.appendChild(a);
        }
        wrap.style.display = '';
      }
    } catch (e) {
      console.error(e);
      document.body.innerHTML = `<div style="padding:24px;font-family:system-ui">Error loading order.</div>`;
    }
  });

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
