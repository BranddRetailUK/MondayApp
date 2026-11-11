'use strict';
(async () => {
  const params = new URLSearchParams(location.search);
  let discountCode = '';
  const discountPanel = document.querySelector('#discount-panel');
  const message = document.querySelector('#message');
  const cart = window.HamperCart;
  const money = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n / 100);
  const SITE = 'https://christmashampers.ultimatepromotions.co.uk';
  async function api(path, options) {
    const response = await fetch(`/api/hamper-checkout/${path}`, { cache: 'no-store', ...options });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Please try again.'); return data;
  }
  const showError = error => { message.textContent = error.message; message.className = 'error'; };
  function showMode(mode) {
    document.querySelector('.sandbox').hidden = mode !== 'sandbox';
    document.querySelector('.confirmation-note').hidden = mode !== 'sandbox';
  }
  function productRows(container, lines) {
    container.replaceChildren();
    for (const item of lines) {
      const row = document.createElement('div'); row.className = 'confirmation-product';
      const image = document.createElement('img'); image.src = `${SITE}/assets/product-${item.page}.jpg`; image.alt = item.name;
      const info = document.createElement('div'); const name = document.createElement('h2'); name.textContent = item.name;
      const quantity = document.createElement('p'); quantity.textContent = `Quantity: ${item.quantity} · ${money(item.unitPence)} each ex. VAT`;
      const vat = document.createElement('p'); vat.textContent = `Product VAT: ${item.vatPercent}%`;
      info.append(name, quantity, vat); row.append(image, info); container.append(row);
    }
  }
  function totals(container, quote, totalLabel) {
    container.replaceChildren();
    if (quote.discountLabel) { const note = document.createElement('p'); note.textContent = `${quote.discountLabel}: saved ${money(quote.discountPence)} including VAT. Prices below include the discount.`; container.append(note); }
    const lines = quote.items || [quote];
    const rows = [['Hampers (ex. VAT)', quote.subtotalPence], ...lines.map(item => [`${item.name} VAT (${item.vatPercent}%)`, item.productVatPence]), [`Delivery (${money(quote.deliveryUnitPence)} × ${quote.quantity})`, quote.shippingPence], ['Delivery VAT (20%)', quote.shippingVatPence], [totalLabel, quote.totalPence]];
    for (const [label, amount] of rows) {
      const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = money(amount); if (label === totalLabel) row.className = 'total'; row.append(dt, dd); container.append(row);
    }
  }
  try {
    if (params.has('order')) {
      discountPanel.hidden = true;
      document.body.classList.add('order-result');
      const confirmation = document.querySelector('#confirmation'); const title = document.querySelector('h1'); const subtitle = document.querySelector('header>p');
      title.textContent = 'Checking your payment'; subtitle.textContent = 'Please keep this page open while we confirm your payment.'; message.textContent = '';
      const cancelled = params.has('cancelled'); let attempts = 0;
      const poll = async () => {
        const order = await api(`orders/${encodeURIComponent(params.get('order'))}`); const paid = order.status === 'paid'; showMode(order.mode);
        title.textContent = paid ? 'Thank you for your order' : order.status === 'expired' ? 'Your checkout has expired' : order.status === 'failed' ? 'Payment unsuccessful' : cancelled ? 'Payment cancelled' : 'Checking your payment';
        subtitle.textContent = paid ? (order.mode === 'sandbox' ? 'Your test payment has been received.' : 'Your payment has been received.') : order.status === 'expired' ? 'Open your cart to start again.' : order.status === 'failed' ? 'Open your cart to try again.' : cancelled ? 'No order has been confirmed. Open your cart to review your hampers.' : 'We’re waiting for confirmation from Stripe. Please do not pay again.';
        document.querySelector('#confirmation-icon').textContent = paid ? '✓' : order.status === 'pending' && !cancelled ? '…' : '–'; document.querySelector('#confirmation-icon').classList.toggle('confirmed', paid);
        productRows(document.querySelector('#confirmation-products'), order.snapshot.items || [order.snapshot]);
        totals(document.querySelector('#confirmation-totals'), order.snapshot, paid ? 'Total paid' : 'Order total');
        document.querySelector('#confirmation-reference').textContent = order.id; confirmation.hidden = false;
        if (paid) {
          const key = `hamper-paid-${order.id}`;
          if (!sessionStorage.getItem(key)) {
            const purchased = order.snapshot.items || [order.snapshot];
            cart.setItems(cart.getItems().map(item => ({ sku: item.sku, quantity: Math.max(0, item.quantity - (purchased.find(p => p.sku === item.sku)?.quantity || 0)) })).filter(item => item.quantity), false);
            sessionStorage.setItem(key, '1');
          }
        }
        if (order.status === 'pending' && !cancelled && ++attempts < 20) setTimeout(() => poll().catch(showError), 2000);
        else if (order.status === 'pending' && !cancelled) subtitle.textContent = 'Confirmation is still pending. Please refresh this page shortly; do not pay again.';
      };
      await poll(); return;
    }
    const catalogue = await cart.ready; showMode(catalogue.mode);
    const pay = document.querySelector('#pay'); const form = document.querySelector('#delivery-form');
    let requestId = crypto.randomUUID(); let lastPayload; let latestQuote; let quoteVersion = 0;
    async function updateQuote() {
      const version = ++quoteVersion; pay.disabled = true; latestQuote = null; message.className = ''; message.textContent = 'Updating your order…';
      const items = cart.getItems();
      if (!items.length) { document.querySelector('#checkout').hidden = true; message.textContent = 'Your cart is empty. Use the logo above to browse the collection.'; return; }
      try {
        const quote = await api('quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, discountCode }) });
        if (version !== quoteVersion) return;
        showMode(quote.mode); latestQuote = quote; document.querySelector('#checkout').hidden = false;
        document.querySelector('h1').textContent = quote.items.length > 1 ? 'Your Christmas hampers' : 'Your Christmas hamper';
        productRows(document.querySelector('#checkout-items'), quote.items); totals(document.querySelector('#totals'), quote, 'Total to pay');
        message.textContent = quote.available ? '' : 'Checkout is being prepared. Please contact our team to order.'; pay.disabled = !quote.available;
        history.replaceState(null, '', `?cart=${encodeURIComponent(JSON.stringify(items))}`);
      } catch (error) { if (version === quoteVersion) { document.querySelector('#checkout').hidden = true; showError(error); } }
    }
    document.querySelector('#apply-discount').addEventListener('click', () => { discountCode = document.querySelector('#discount-code').value.trim(); updateQuote(); });
    window.addEventListener('hampercartchange', updateQuote);
    await updateQuote();
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!latestQuote || pay.disabled) return;
      pay.disabled = true; message.className = ''; message.textContent = 'Opening secure checkout…';
      const delivery = Object.fromEntries(new FormData(form)); delivery.mainland = document.querySelector('#mainland').checked;
      const items = cart.getItems(); const payload = JSON.stringify({ items, delivery, discountCode });
      if (lastPayload && lastPayload !== payload) requestId = crypto.randomUUID(); lastPayload = payload;
      try { const session = await api('sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, delivery, requestId, discountCode }) }); location.assign(session.url); }
      catch (error) { showError(error); pay.disabled = false; }
    });
  } catch (error) { showError(error); }
})();
