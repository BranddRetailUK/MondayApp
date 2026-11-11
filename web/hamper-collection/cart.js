'use strict';
(() => {
  const SITE = 'https://christmashampers.ultimatepromotions.co.uk';
  const HUB = 'https://www.ultimatehub.co.uk';
  const KEY = 'ultimate-hamper-cart-v1';
  const money = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n / 100);
  let products = new Map(); let deliveryPence = 725; let items = []; let opener;
  function normalise(value) {
    if (!Array.isArray(value) || value.length > 90) throw Error('Please check the items in your cart.');
    const merged = new Map();
    for (const item of value) {
      if (!item || typeof item.sku !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw Error('Please check the quantities in your cart.');
      if (products.size && !products.has(item.sku)) throw Error('A hamper in your cart is no longer available.');
      merged.set(item.sku, (merged.get(item.sku) || 0) + item.quantity);
    }
    return [...merged].map(([sku, quantity]) => ({ sku, quantity }));
  }
  const params = new URLSearchParams(location.search);
  try { items = normalise(JSON.parse(params.get('cart') || localStorage.getItem(KEY) || '[]')); } catch { items = []; }
  if (location.pathname.endsWith('hamper-checkout.html') && params.has('sku') && !params.has('order')) {
    try { items = normalise([{ sku: params.get('sku'), quantity: Number(params.get('quantity') || 1) }]); } catch { items = []; }
  }
  if (params.has('cart') && !location.pathname.endsWith('hamper-checkout.html')) {
    const cleanUrl = new URL(location.href); cleanUrl.searchParams.delete('cart'); history.replaceState(null, '', cleanUrl);
  }
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'cart-trigger'; trigger.setAttribute('aria-label', 'Open cart'); trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.innerHTML = '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 7h15l-2 10H8L5 3H2"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg><span class="cart-count"></span>';
  (document.querySelector('[data-cart-header]') || document.querySelector('header nav') || document.querySelector('header')).append(trigger);
  const drawer = document.createElement('dialog'); drawer.className = 'cart-drawer'; drawer.setAttribute('aria-labelledby', 'cart-title');
  drawer.innerHTML = '<div class="cart-drawer-header"><h2 id="cart-title">Your cart</h2><button type="button" class="cart-close" aria-label="Close cart">×</button></div><p class="cart-feedback" role="status" aria-live="polite"></p><div class="cart-items"></div><div class="cart-bottom"><dl class="cart-totals"></dl><p class="cart-delivery-note"></p><a class="cart-checkout" href="#">Continue to checkout</a><button type="button" class="cart-continue">Continue shopping</button></div>';
  document.body.append(drawer);
  const feedback = drawer.querySelector('.cart-feedback');
  const dispatch = () => window.dispatchEvent(new CustomEvent('hampercartchange', { detail: { items: items.map(item => ({ ...item })) } }));
  function save(notify = true) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
    trigger.querySelector('.cart-count').textContent = items.reduce((sum, item) => sum + item.quantity, 0);
    trigger.setAttribute('aria-label', `Open cart, ${items.reduce((sum, item) => sum + item.quantity, 0)} hampers`);
    document.querySelectorAll('[data-cart-home]').forEach(link => { link.href = `${SITE}/?cart=${encodeURIComponent(JSON.stringify(items))}`; });
    if (notify) dispatch();
  }
  let closeTimer;
  function finishClose() { clearTimeout(closeTimer); drawer.classList.remove('is-closing'); if (drawer.open) drawer.close(); document.body.classList.remove('cart-open'); opener?.focus(); }
  function close() {
    if (!drawer.open || drawer.classList.contains('is-closing')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishClose(); return; }
    drawer.classList.add('is-closing'); closeTimer = setTimeout(finishClose, 240);
  }
  function open() {
    clearTimeout(closeTimer); drawer.classList.remove('is-closing');
    if (!drawer.open) opener = document.activeElement;
    render(); if (!drawer.open) drawer.showModal(); document.body.classList.add('cart-open');
  }
  drawer.addEventListener('animationend', event => { if (event.target === drawer && event.animationName === 'cart-slide-out' && drawer.classList.contains('is-closing')) finishClose(); });
  function setItems(next, notify = true) { items = normalise(next); save(notify); render(); }
  function render() {
    const list = drawer.querySelector('.cart-items'); list.replaceChildren();
    feedback.textContent = '';
    if (!products.size) {
      feedback.textContent = 'Loading your cart…';
      drawer.querySelector('.cart-checkout').hidden = true;
      drawer.querySelector('.cart-totals').hidden = true;
      return;
    }
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    let subtotal = 0; let vat = 0;
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'cart-empty'; empty.textContent = 'Your cart is empty. Find a thoughtful gift in our collection.'; list.append(empty); }
    for (const item of items) {
      const product = products.get(item.sku); if (!product) continue;
      const linePrice = Math.round(product.price * 100) * item.quantity;
      subtotal += linePrice; vat += Math.round(linePrice * Math.round(product.vatPercent * 100) / 10000);
      const row = document.createElement('article'); row.className = 'cart-item';
      const image = document.createElement('img'); image.src = `${SITE}/assets/product-${product.page}.jpg`; image.alt = product.name;
      const info = document.createElement('div'); info.className = 'cart-item-info';
      const name = document.createElement('h3'); name.textContent = product.name;
      const price = document.createElement('p'); price.textContent = `${money(Math.round(product.price * 100))} each ex. VAT`;
      const controls = document.createElement('div'); controls.className = 'cart-item-controls';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `Decrease ${product.name} quantity`);
      const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '10000'; input.value = item.quantity; input.setAttribute('aria-label', `${product.name} quantity`);
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', `Increase ${product.name} quantity`);
      const change = quantity => { if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) { input.value = item.quantity; feedback.textContent = 'Choose a quantity between 1 and 10, or contact us for bulk orders.'; return; } setItems(items.map(i => i.sku === item.sku ? { ...i, quantity } : i)); const replacement = [...drawer.querySelectorAll('input')].find(i => i.getAttribute('aria-label') === input.getAttribute('aria-label')); replacement?.focus(); };
      minus.addEventListener('click', () => change(Math.max(1, item.quantity - 1))); plus.addEventListener('click', () => change(item.quantity + 1)); input.addEventListener('input', () => { const value = Number(input.value); if (input.value && Number.isInteger(value) && value >= 1 && value <= 10000) change(value); }); input.addEventListener('change', () => change(Number(input.value)));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'cart-remove'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${product.name}`); remove.addEventListener('click', () => { setItems(items.filter(i => i.sku !== item.sku)); drawer.querySelector('.cart-close').focus(); });
      controls.append(minus, input, plus, remove); info.append(name, price, controls); row.append(image, info); list.append(row);
    }
    const shipping = deliveryPence * totalQty; const shippingVat = Math.round(shipping * .2);
    const totals = drawer.querySelector('.cart-totals'); totals.replaceChildren();
    for (const [label, value] of [['Hampers (ex. VAT)', subtotal], ['Hamper VAT', vat], ['Delivery (ex. VAT)', shipping], ['Delivery VAT (20%)', shippingVat], ['Total', subtotal + vat + shipping + shippingVat]]) {
      const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = money(value); row.append(dt, dd); totals.append(row);
    }
    totals.hidden = !items.length;
    const action = drawer.querySelector('.cart-checkout'); action.hidden = !items.length;
    action.textContent = totalQty > 10 ? 'Contact the team for bulk options' : 'Continue to checkout';
    action.href = totalQty > 10 ? `mailto:sales@ultimatepromotions.co.uk?subject=Bulk%20hamper%20enquiry&body=${encodeURIComponent(items.map(item => `${item.quantity} × ${products.get(item.sku)?.name || item.sku}`).join('\n'))}` : `${HUB}/hamper-checkout.html?cart=${encodeURIComponent(JSON.stringify(items))}`;
    drawer.querySelector('.cart-delivery-note').textContent = totalQty > 10 ? 'Online checkout is available for up to 10 hampers. Our team can help with larger orders.' : `${money(deliveryPence)} + VAT delivery per hamper to one UK mainland address.`;
  }
  const ready = fetch(`${HUB}/api/hamper-checkout/catalogue`, { cache: 'no-store' }).then(async r => { if (!r.ok) throw Error('Unable to load your cart. Please try again.'); const data = await r.json(); document.querySelectorAll('[data-sandbox-notice]').forEach(el => { el.hidden = data.mode !== 'sandbox'; }); products = new Map(data.products.map(p => [p.sku, p])); deliveryPence = data.deliveryPence; items = normalise(items); save(false); render(); return data; });
  ready.catch(error => { feedback.textContent = error.message; drawer.querySelector('.cart-checkout').hidden = true; });
  trigger.addEventListener('click', () => { open(); ready.catch(error => { feedback.textContent = error.message; }); });
  drawer.querySelector('.cart-close').addEventListener('click', close); drawer.querySelector('.cart-continue').addEventListener('click', close);
  drawer.addEventListener('cancel', event => { event.preventDefault(); close(); });
  drawer.addEventListener('click', event => { if (event.target === drawer && event.clientX < drawer.getBoundingClientRect().left) close(); });
  window.addEventListener('storage', event => { if (event.key === KEY) { try { setItems(JSON.parse(event.newValue || '[]')); } catch {} } });
  window.HamperCart = { ready, getItems: () => items.map(i => ({ ...i })), setItems, open, add: async (sku, quantity) => { await ready; setItems([...items, { sku, quantity }]); open(); } };
  save(false);
})();
