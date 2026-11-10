'use strict';
async function loadHamperOrders() {
  const message = document.querySelector('#message');
  const refresh = document.querySelector('#refresh');
  message.textContent = 'Loading orders…'; refresh.disabled = true;
  const money = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
  function paragraph(text, className = '') { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; }
  try {
    const response = await fetch('/api/hamper-orders', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in to Ultimate Hub to view orders.' : 'Unable to load orders. Please try again.');
    const { orders } = await response.json();
    const container = document.querySelector('#orders'); container.replaceChildren();
    for (const order of orders) {
      const row = document.createElement('tr');
      const cells = Array.from({ length: 5 }, () => document.createElement('td'));
      const q = order.snapshot;
      cells[0].append(paragraph(new Date(order.created_at).toLocaleDateString('en-GB')), paragraph(new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), 'muted small'));
      cells[1].append(paragraph(`${q.quantity} × ${q.name}`), paragraph(q.sku, 'muted small'), paragraph(order.id, 'order-reference'));
      const d = order.delivery;
      cells[2].append(paragraph(d.name), paragraph(d.email, 'muted small'), paragraph([d.line1, d.line2, d.city, d.postcode].filter(Boolean).join(', '), 'muted small'));
      cells[3].append(paragraph(money(q.totalPence), 'order-amount'), paragraph(`Hampers ${money(q.subtotalPence)} + ${money(q.productVatPence)} VAT (${q.vatPercent}%)`, 'order-breakdown'), paragraph(`Delivery ${money(q.shippingPence)} + ${money(q.shippingVatPence)} VAT (20%)`, 'order-breakdown'));
      const status = document.createElement('span'); status.className = `pill status-${order.status}`; status.textContent = order.status; cells[4].append(status);
      if (order.stripe_payment_intent) { const link = document.createElement('a'); link.href = `https://dashboard.stripe.com/acct_1UaBAa7O9atIxBPe/test/payments/${encodeURIComponent(order.stripe_payment_intent)}`; link.textContent = 'View in Stripe'; link.className = 'order-link'; link.target = '_blank'; link.rel = 'noopener'; cells[4].append(link); }
      row.append(...cells); container.append(row);
    }
    message.textContent = orders.length ? '' : 'No sandbox checkouts yet.';
  } catch (error) { message.textContent = error.message; }
  finally { refresh.disabled = false; }
}
document.querySelector('#refresh').addEventListener('click', loadHamperOrders);
loadHamperOrders();
