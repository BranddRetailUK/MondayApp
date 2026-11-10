'use strict';
(async () => {
  const params = new URLSearchParams(location.search);
  const message = document.querySelector('#message');
  const money = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n / 100);
  async function api(path, options) {
    const response = await fetch(`/api/hamper-checkout/${path}`, { cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Please try again.');
    return data;
  }
  const showError = error => { message.textContent = error.message; message.className = 'error'; };
  try {
    if (params.has('order')) {
      const cancelled = params.has('cancelled');
      let attempts = 0;
      const poll = async () => {
        const order = await api(`orders/${encodeURIComponent(params.get('order'))}`);
        message.textContent = order.status === 'paid' ? `Test payment received. Thank you!\n${order.snapshot.quantity} × ${order.snapshot.name} · ${money(order.snapshot.totalPence)} including VAT and delivery.\nThis is a sandbox order; no hampers will be dispatched.`
          : order.status === 'expired' ? 'This checkout has expired. Return to the collection to start again.'
          : order.status === 'failed' ? 'Payment was unsuccessful. Return to the collection to try again.'
          : cancelled ? 'Payment was cancelled. No order has been confirmed. You can return to the collection or use your browser’s back button to resume payment.'
          : 'We’re checking your test payment with Stripe. Please keep this page open.';
        if (order.status === 'pending' && !cancelled && ++attempts < 20) setTimeout(() => poll().catch(showError), 2000);
        else if (order.status === 'pending' && !cancelled) message.textContent = 'Payment confirmation is still pending. Please refresh this page shortly; do not pay again.';
      };
      await poll(); return;
    }
    const sku = params.get('sku');
    const quantity = Number(params.get('quantity') || 1);
    const quote = await api(`quote?sku=${encodeURIComponent(sku)}&quantity=${quantity}`);
    document.querySelector('#checkout').hidden = false;
    document.querySelector('#product-name').textContent = quote.name;
    document.querySelector('#quantity-label').textContent = `${quantity} × ${money(quote.unitPence)} ex. VAT`;
    const image = document.querySelector('#product-image');
    image.src = `https://ultimatechristmas-production.up.railway.app/assets/product-${quote.page}.jpg`; image.alt = quote.name;
    const totals = [['Hampers (ex. VAT)', quote.subtotalPence], [`Hamper VAT (${quote.vatPercent}%)`, quote.productVatPence], [`Delivery (${money(quote.deliveryUnitPence)} × ${quantity})`, quote.shippingPence], ['Delivery VAT (20%)', quote.shippingVatPence], ['Total to pay', quote.totalPence]];
    for (const [label, amount] of totals) { const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = money(amount); if (label === 'Total to pay') row.className = 'total'; row.append(dt, dd); document.querySelector('#totals').append(row); }
    message.textContent = quote.available ? '' : 'Checkout is being prepared. Please contact our team to order.';
    const pay = document.querySelector('#pay'); pay.disabled = !quote.available;
    let requestId = crypto.randomUUID();
    let lastPayload;
    document.querySelector('#delivery-form').addEventListener('submit', async event => {
      event.preventDefault(); pay.disabled = true; message.className = ''; message.textContent = 'Opening secure sandbox checkout…';
      const delivery = Object.fromEntries(new FormData(event.target)); delivery.mainland = document.querySelector('#mainland').checked;
      const payload = JSON.stringify({ sku, quantity, delivery });
      if (lastPayload && lastPayload !== payload) requestId = crypto.randomUUID();
      lastPayload = payload;
      try { const session = await api('sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, quantity, delivery, requestId }) }); location.assign(session.url); }
      catch (error) { showError(error); pay.disabled = false; }
    });
  } catch (error) { showError(error); }
})();
