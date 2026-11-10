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
    const row = document.createElement('tr'); row.className = 'hamper-summary-row';
    const cells = ['PO / Date', 'Customer', 'Hamper', 'Total incl. VAT', 'Payment status', ''].map(label => { const td = document.createElement('td'); td.dataset.label = label; return td; });
    const q = order.snapshot; const d = order.delivery;
    cells[0].append(paragraph(poNumber(order), 'order-primary'), paragraph(new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })), paragraph(new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), 'muted small'));
    cells[1].append(paragraph(d.name, 'order-primary'), paragraph(d.email, 'muted small'));
    for (const item of (q.items || [q])) cells[2].append(paragraph(item.name, 'order-primary'), paragraph(`Quantity: ${item.quantity} · VAT ${item.vatPercent}%`, 'muted small'));
    cells[3].append(paragraph(money(q.totalPence), 'order-amount'));
    const badge = document.createElement('span'); badge.className = `pill status-${order.status}`; badge.textContent = statuses[order.status] || order.status; cells[4].append(badge);
    const detailsRow = document.createElement('tr'); detailsRow.className = 'hamper-detail-row'; detailsRow.hidden = true; detailsRow.id = `details-${order.id}`;
    const detailCell = document.createElement('td'); detailCell.colSpan = 6;
    const detailGrid = document.createElement('div'); detailGrid.className = 'hamper-detail-grid';
    for (const [heading, lines] of [
      ['Delivery address', [d.name, d.line1, d.line2, d.city, d.postcode].filter(Boolean)],
      ['Price breakdown', [...(q.items || [q]).flatMap(item => [`${item.quantity} × ${item.name}: ${money(item.subtotalPence)} ex. VAT`, `Product VAT (${item.vatPercent}%): ${money(item.productVatPence)}`]), `Delivery: ${money(q.shippingPence)} ex. VAT`, `Delivery VAT (20%): ${money(q.shippingVatPence)}`]],
      ['Order information', [`PO number: ${poNumber(order)}`, `Product codes: ${(q.items || [q]).map(item => item.sku).join(", ")}`, `Order reference: ${order.id}`]]
    ]) { const section = document.createElement('section'); const h = document.createElement('h3'); h.textContent = heading; section.append(h); lines.forEach(line => section.append(paragraph(line))); detailGrid.append(section); }
    if (order.stripe_payment_intent) { const link = document.createElement('a'); link.href = `https://dashboard.stripe.com/acct_1UaBAa7O9atIxBPe/test/payments/${encodeURIComponent(order.stripe_payment_intent)}`; link.textContent = 'View payment in Stripe'; link.className = 'order-link'; link.target = '_blank'; link.rel = 'noopener'; detailGrid.lastElementChild.append(link); }
    detailCell.append(detailGrid); detailsRow.append(detailCell);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'proof-secondary-button'; toggle.textContent = 'View details'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', detailsRow.id);
    toggle.addEventListener('click', () => { detailsRow.hidden = !detailsRow.hidden; toggle.setAttribute('aria-expanded', String(!detailsRow.hidden)); toggle.textContent = detailsRow.hidden ? 'View details' : 'Hide details'; });
    cells[5].append(toggle); row.append(...cells); container.append(row, detailsRow);
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
