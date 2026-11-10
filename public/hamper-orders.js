'use strict';
async function loadHamperOrders() {
  const message = document.querySelector('#message');
  message.textContent = 'Loading…';
  try {
    const response = await fetch('/api/hamper-orders', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in to Ultimate Hub to view orders.' : 'Unable to load orders. Please try again.');
    const { orders } = await response.json();
    const container = document.querySelector('#orders'); container.replaceChildren();
    for (const order of orders) {
      const article = document.createElement('article'); article.className = 'order';
      const heading = document.createElement('h2'); heading.textContent = `${order.snapshot.quantity} × ${order.snapshot.name}`; article.append(heading);
      const delivery = order.delivery;
      for (const text of [`${order.status.toUpperCase()} · £${(order.snapshot.totalPence / 100).toFixed(2)} inc. VAT and delivery · ${new Date(order.created_at).toLocaleString('en-GB')}`, `Order ${order.id}`, `${delivery.name} · ${delivery.email}`, [delivery.line1, delivery.line2, delivery.city, delivery.postcode].filter(Boolean).join(', ')]) { const p = document.createElement('p'); p.textContent = text; article.append(p); }
      if (order.stripe_payment_intent) { const link = document.createElement('a'); link.href = `https://dashboard.stripe.com/acct_1UaBAa7O9atIxBPe/test/payments/${encodeURIComponent(order.stripe_payment_intent)}`; link.textContent = 'View test payment in Stripe'; link.target = '_blank'; link.rel = 'noopener'; article.append(link); }
      container.append(article);
    }
    message.textContent = orders.length ? '' : 'No sandbox checkouts yet.';
  } catch (error) { message.textContent = error.message; }
}
document.querySelector('#refresh').addEventListener('click', loadHamperOrders);
loadHamperOrders();
