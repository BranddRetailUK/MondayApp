'use strict';
(() => {
const root = document.querySelector('#tab-hamper-orders');
if (!root) return;
let hamperOrders = [];
const money = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const poNumber = order => order.po_number == null ? 'Awaiting PO' : `PO-${String(order.po_number).padStart(6, '0')}`;
const statuses = { paid: 'Paid', pending: 'Awaiting payment', expired: 'Expired', failed: 'Failed' };
function paragraph(text, className = '') { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; }
function renderHamperOrders() {
  const search = root.querySelector('#order-search').value.trim().toLowerCase();
  const statusFilter = root.querySelector('#order-status').value;
  const visible = hamperOrders.filter(o => (statusFilter === 'all' || o.status === statusFilter) && `${o.delivery.name} ${o.delivery.email} ${(o.snapshot.items || [o.snapshot]).map(i => `${i.name} ${i.sku}`).join(" ")} ${o.id} ${poNumber(o)}`.toLowerCase().includes(search));
  root.querySelector('#count-all').textContent = hamperOrders.length;
  root.querySelector('#count-paid').textContent = hamperOrders.filter(o => o.status === 'paid').length;
  root.querySelector('#count-pending').textContent = hamperOrders.filter(o => o.status === 'pending').length;
  const empty = root.querySelector('#empty-orders'); empty.hidden = visible.length > 0;
  empty.querySelector('h2').textContent = hamperOrders.length ? 'No matching orders' : 'No orders yet';
  empty.querySelector('p').textContent = hamperOrders.length ? 'Try a different search or payment status.' : 'New hamper checkouts will appear here, with their payment status and delivery details.';
  root.querySelector('#orders-table').hidden = !visible.length;
  const container = root.querySelector('#orders'); container.replaceChildren();
  for (const order of visible) {
    const q = order.snapshot; const d = order.delivery; const items = q.items || [q];
    const labels = ['PO number', 'Date / time', 'Customer', 'Delivery address', 'Hamper', 'Qty', 'VAT', 'Total incl. VAT', 'Payment status', 'Details'];
    const rows = items.map((item, index) => {
      const row = document.createElement('tr'); row.className = 'hamper-summary-row';
      const cells = labels.map(label => { const td = document.createElement('td'); td.dataset.label = label; return td; });
      cells[4].append(paragraph(item.name, 'order-primary'));
      cells[5].textContent = item.quantity; cells[5].className = 'hamper-number';
      cells[6].textContent = `${item.vatPercent}%`; cells[6].className = 'hamper-number';
      if (index === 0) {
        cells[0].append(paragraph(poNumber(order), 'order-primary'));
        cells[1].append(paragraph(new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })), paragraph(new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), 'muted small'));
        cells[2].append(paragraph(d.name, 'order-primary'), paragraph(d.email, 'muted small'));
        cells[3].append(paragraph([d.line1, d.line2, d.city].filter(Boolean).join(', ')), paragraph(d.postcode));
        cells[7].append(paragraph(money(q.totalPence), 'order-amount'));
        const badge = document.createElement('span'); badge.className = `pill status-${order.status}`; badge.textContent = statuses[order.status] || order.status; cells[8].append(badge);
        for (const i of [0, 1, 2, 3, 7, 8, 9]) cells[i].rowSpan = items.length;
        row.append(...cells);
      } else row.append(cells[4], cells[5], cells[6]);
      return { row, cells };
    });
    const detailsRow = document.createElement('tr'); detailsRow.className = 'hamper-detail-row'; detailsRow.hidden = true; detailsRow.id = `details-${order.id}`;
    const detailCell = document.createElement('td'); detailCell.colSpan = labels.length;
    const detailGrid = document.createElement('div'); detailGrid.className = 'hamper-detail-grid';
    const lineItems = document.createElement('section');
    const heading = document.createElement('h3'); heading.textContent = 'Line items'; lineItems.append(heading);
    for (const item of items) {
      const line = document.createElement('div'); line.className = 'hamper-detail-item';
      const image = document.createElement('img'); image.src = `/assets/hamper-thumbnails/product-${Number(item.page)}.webp`; image.alt = item.name;
      image.width = 64; image.height = 64; image.loading = 'lazy'; image.decoding = 'async';
      const info = document.createElement('div');
      info.append(paragraph(item.name, 'order-primary'), paragraph(`${item.quantity} × ${money(item.unitPence)} ex. VAT · Line total ${money(item.subtotalPence)}`), paragraph(`VAT (${item.vatPercent}%): ${money(item.productVatPence)}`));
      line.append(image, info); lineItems.append(line);
    }
    const totals = document.createElement('section');
    const totalsHeading = document.createElement('h3'); totalsHeading.textContent = 'Order totals';
    totals.append(totalsHeading, paragraph(`Hampers: ${money(q.subtotalPence)} ex. VAT`), paragraph(`Hamper VAT: ${money(q.productVatPence)}`), paragraph(`Delivery: ${money(q.shippingPence)} ex. VAT`), paragraph(`Delivery VAT (20%): ${money(q.shippingVatPence)}`), paragraph(`Total: ${money(q.totalPence)}`, 'order-primary'));
    if (order.stripe_payment_intent) { const link = document.createElement('a'); link.href = `https://dashboard.stripe.com/acct_1UaBAa7O9atIxBPe/test/payments/${encodeURIComponent(order.stripe_payment_intent)}`; link.textContent = 'View payment in Stripe'; link.className = 'order-link'; link.target = '_blank'; link.rel = 'noopener'; totals.append(link); }
    detailGrid.append(lineItems, totals); detailCell.append(detailGrid); detailsRow.append(detailCell);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'proof-secondary-button'; toggle.textContent = 'View details'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', detailsRow.id);
    toggle.addEventListener('click', () => { detailsRow.hidden = !detailsRow.hidden; toggle.setAttribute('aria-expanded', String(!detailsRow.hidden)); toggle.textContent = detailsRow.hidden ? 'View details' : 'Hide details'; });
    rows[0].cells[9].append(toggle); container.append(...rows.map(r => r.row), detailsRow);
  }
}
async function loadHamperOrders() {
  const message = root.querySelector('#message');
  message.textContent = 'Loading orders…';
  try {
    const response = await fetch('/api/hamper-orders', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in to Ultimate Hub to view orders.' : 'Unable to load orders. Please try again.');
    hamperOrders = (await response.json()).orders;
    renderHamperOrders(); message.textContent = '';
  } catch (error) { message.textContent = error.message; }
}
root.querySelector('#order-search').addEventListener('input', renderHamperOrders);
root.querySelector('#order-status').addEventListener('change', renderHamperOrders);
window.loadHamperOrders = loadHamperOrders;
})();
