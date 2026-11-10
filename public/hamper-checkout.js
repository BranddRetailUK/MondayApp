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
      document.body.classList.add('order-result');
      const confirmation = document.querySelector('#confirmation');
      const title = document.querySelector('h1');
      const subtitle = document.querySelector('header p');
      const backLink = document.querySelector('#collection-return a');
      backLink.classList.add('button');
      title.textContent = 'Checking your payment';
      subtitle.textContent = 'Please keep this page open while we confirm your payment.';
      message.textContent = '';
      const cancelled = params.has('cancelled');
      let attempts = 0;
      let summaryRendered = false;
      const poll = async () => {
        const order = await api(`orders/${encodeURIComponent(params.get('order'))}`);
        const paid = order.status === 'paid';
        title.textContent = paid ? 'Thank you for your order' : order.status === 'expired' ? 'Your checkout has expired' : order.status === 'failed' ? 'Payment unsuccessful' : cancelled ? 'Payment cancelled' : 'Checking your payment';
        subtitle.textContent = paid ? 'Your test payment has been received.' : order.status === 'expired' ? 'Return to the collection to start again.' : order.status === 'failed' ? 'Please return to the collection to try again.' : cancelled ? 'No order has been confirmed. You can return to the collection or go back to resume payment.' : 'We’re waiting for confirmation from Stripe. Please do not pay again.';
        document.querySelector('#confirmation-icon').textContent = paid ? '✓' : order.status === 'pending' && !cancelled ? '…' : '–';
        document.querySelector('#confirmation-icon').classList.toggle('confirmed', paid);
        if (!summaryRendered) {
          const q = order.snapshot;
          const image = document.querySelector('#confirmation-image');
          image.src = `https://ultimatechristmas-production.up.railway.app/assets/product-${q.page}.jpg`;
          image.alt = q.name;
          document.querySelector('#confirmation-product-name').textContent = q.name;
          document.querySelector('#confirmation-quantity').textContent = `Quantity: ${q.quantity} · ${money(q.unitPence)} each ex. VAT`;
          document.querySelector('#confirmation-reference').textContent = order.id;
          const rows = [['Hampers (ex. VAT)', q.subtotalPence], [`Hamper VAT (${q.vatPercent}%)`, q.productVatPence], ['Delivery (ex. VAT)', q.shippingPence], ['Delivery VAT (20%)', q.shippingVatPence], ['Order total', q.totalPence]];
          for (const [label, amount] of rows) {
            const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
            dt.textContent = label; dd.textContent = money(amount);
            if (label === 'Order total') { row.className = 'total'; dt.id = 'confirmation-total-label'; }
            row.append(dt, dd); document.querySelector('#confirmation-totals').append(row);
          }
          summaryRendered = true;
        }
        document.querySelector('#confirmation-total-label').textContent = paid ? 'Total paid' : 'Order total';
        confirmation.hidden = false;
        if (order.status === 'pending' && !cancelled && ++attempts < 20) setTimeout(() => poll().catch(showError), 2000);
        else if (order.status === 'pending' && !cancelled) subtitle.textContent = 'Confirmation is still pending. Please refresh this page shortly; do not pay again.';
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
