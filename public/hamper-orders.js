'use strict';
(() => {
const root = document.querySelector('#tab-hamper-orders');
if (!root) return;
let hamperOrders = [];
const money = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const poNumber = order => order.po_number == null ? 'Awaiting PO' : `PO-${String(order.po_number).padStart(6, '0')}`;
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
function paragraph(text, className = '') { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; }
function renderHamperOrders() {
  const search = root.querySelector('#order-search').value.trim().toLowerCase();
  const visible = hamperOrders.filter(o => `${o.delivery.name} ${o.delivery.company || ''} ${o.delivery.email} ${o.matched_customer?.name || ''} ${(o.snapshot.items || [o.snapshot]).map(i => `${i.name} ${i.sku}`).join(' ')} ${o.id} ${poNumber(o)}`.toLowerCase().includes(search));
  const showMatch = visible.some(order => order.matched_customer);
  const columns = [
    ['po', 'PO number'], ['date', 'Date'], ['customer', 'Customer'],
    ...(showMatch ? [['match', 'Matched customer']] : []),
    ['address', 'Delivery address'], ['hamper', 'Hamper'], ['qty', 'Qty'],
    ['cost', 'Cost inc VAT'], ['total', 'Total incl. VAT'], ['details', 'Details']
  ];
  const table = root.querySelector('.hamper-orders-table');
  table.classList.toggle('has-matched-customer', showMatch);
  table.querySelector('colgroup').replaceChildren(...columns.map(([key]) => {
    const col = document.createElement('col'); col.className = `col-${key}`; return col;
  }));
  table.querySelector('thead tr').replaceChildren(...columns.map(([key, label]) => {
    const th = document.createElement('th'); th.scope = 'col'; th.className = `heading-${key}`; th.textContent = label; return th;
  }));
  const empty = root.querySelector('#empty-orders'); empty.hidden = visible.length > 0;
  empty.querySelector('h2').textContent = hamperOrders.length ? 'No matching orders' : 'No orders yet';
  empty.querySelector('p').textContent = hamperOrders.length ? 'Try a different search.' : 'Paid hamper orders will appear here.';
  root.querySelector('#orders-table').hidden = !visible.length;
  const container = root.querySelector('#orders'); container.replaceChildren();
  for (const order of visible) {
    const q = order.snapshot; const d = order.delivery; const items = q.items || [q];
    const itemColumns = new Set(['hamper', 'qty', 'cost']);
    const rows = items.map((item, index) => {
      const row = document.createElement('tr'); row.className = 'hamper-summary-row';
      const cells = {};
      for (const [key, label] of columns) {
        if (index !== 0 && !itemColumns.has(key)) continue;
        const td = document.createElement('td'); td.dataset.label = label;
        if (!itemColumns.has(key)) td.rowSpan = items.length;
        row.append(td); cells[key] = td;
      }
      cells.hamper.append(paragraph(item.name, 'order-primary'));
      cells.qty.textContent = item.quantity; cells.qty.className = 'hamper-number';
      const cost = order.line_costs?.[index];
      cells.cost.textContent = cost ? money(cost.grossPence) : '—';
      if (index === 0) {
        cells.po.append(paragraph(poNumber(order), 'order-primary'));
        cells.date.append(paragraph(date.format(new Date(order.created_at))));
        cells.customer.append(paragraph(d.name, 'order-primary'), ...(d.company ? [paragraph(d.company)] : []), paragraph(d.email, 'muted small'));
        if (cells.match && order.matched_customer) {
          const link = document.createElement('a');
          link.href = `/?${new URLSearchParams({ tab: 'database', customer: order.matched_customer.key })}`;
          link.className = 'test-dashboard-job-number-link hamper-customer-link';
          link.textContent = order.matched_customer.name;
          cells.match.append(link);
        }
        cells.address.append(paragraph([d.line1, d.line2, d.city].filter(Boolean).join(', ')), paragraph(d.postcode));
        cells.total.append(paragraph(money(q.totalPence), 'order-amount'));
      }
      return { row, cells };
    });
    const detailsRow = document.createElement('tr'); detailsRow.className = 'hamper-detail-row'; detailsRow.hidden = true; detailsRow.id = `details-${order.id}`;
    const detailCell = document.createElement('td'); detailCell.colSpan = columns.length;
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
    totals.className = 'hamper-detail-totals';
    const totalsHeading = document.createElement('h3');
    totalsHeading.textContent = 'Order totals';
    const breakdown = document.createElement('dl');
    breakdown.className = 'hamper-totals-breakdown';
    const amounts = [
      ['Hampers ex VAT', q.subtotalPence],
      ['Hamper VAT', q.productVatPence],
      ['Delivery ex VAT', q.shippingPence],
      ['Delivery VAT (20%)', q.shippingVatPence],
      ['Total incl. VAT', q.totalPence]
    ];
    for (const [index, [label, pence]] of amounts.entries()) {
      const pair = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const amount = document.createElement('dd');
      amount.textContent = money(pence);
      if (index === amounts.length - 1) amount.className = 'order-amount';
      pair.append(term, amount);
      breakdown.append(pair);
    }
    totals.append(totalsHeading, breakdown);
    if (q.discountLabel) {
      totals.append(paragraph(`${q.discountLabel}: saved ${money(q.discountPence)} including VAT. All amounts include the discount.`));
    }
    if (order.stripe_payment_intent) { const link = document.createElement('a'); link.href = `https://dashboard.stripe.com/${encodeURIComponent(q.stripeAccountId || 'acct_1UaBAa7O9atIxBPe')}/${order.mode === 'live' ? '' : 'test/'}payments/${encodeURIComponent(order.stripe_payment_intent)}`; link.textContent = 'View payment in Stripe'; link.className = 'order-link'; link.target = '_blank'; link.rel = 'noopener'; totals.append(link); }
    const invoiceActions = document.createElement('div'); invoiceActions.className = 'hamper-invoice-actions';
    for (const [label, download] of [['View invoice', false], ['Download invoice', true]]) {
      const link = document.createElement('a'); link.className = 'proof-secondary-button'; link.textContent = label;
      link.href = `/api/hamper-orders/${encodeURIComponent(order.id)}/invoice${download ? '?download=1' : ''}`;
      if (download) link.download = ''; else { link.target = '_blank'; link.rel = 'noopener'; }
      invoiceActions.append(link);
    }
    totals.append(invoiceActions);
    if(order.confirmation_email_status) totals.append(paragraph('Confirmation email: '+({pending:'Queued',sending:'Sending',sent:'Accepted by SendGrid',failed:'Failed — review required',unknown:'Delivery uncertain — check SendGrid before retrying'}[order.confirmation_email_status]||order.confirmation_email_status)));
    detailGrid.append(lineItems, totals); detailCell.append(detailGrid); detailsRow.append(detailCell);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'proof-secondary-button'; toggle.textContent = 'View details'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', detailsRow.id);
    toggle.addEventListener('click', () => { detailsRow.hidden = !detailsRow.hidden; toggle.setAttribute('aria-expanded', String(!detailsRow.hidden)); toggle.textContent = detailsRow.hidden ? 'View details' : 'Hide details'; });
    rows[0].cells.details.append(toggle);
    if (container.childElementCount) {
      const spacer = document.createElement('tr');
      spacer.className = 'hamper-order-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      const cell = document.createElement('td');
      cell.colSpan = columns.length;
      spacer.append(cell);
      container.append(spacer);
    }
    container.append(...rows.map(r => r.row), detailsRow);
  }
}
async function loadHamperOrders() {
  const message = root.querySelector('#message');
  message.textContent = 'Loading orders…';
  try {
    const response = await fetch('/api/hamper-orders', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in to Ultimate Hub to view orders.' : 'Unable to load orders. Please try again.');
    const data = await response.json();
    hamperOrders = data.orders;
    root.querySelector('.hamper-sandbox-note').hidden = data.mode !== 'sandbox';
    renderHamperOrders(); message.textContent = '';
  } catch (error) { message.textContent = error.message; }
}
root.querySelector('#order-search').addEventListener('input', renderHamperOrders);
window.loadHamperOrders = loadHamperOrders;
})();
