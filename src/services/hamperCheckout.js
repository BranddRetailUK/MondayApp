const crypto = require('crypto');
const Stripe = require('stripe');
const products = require('../../web/hamper-collection/products.json');
const ACCOUNT = 'acct_1UaBAa7O9atIxBPe';
const SITE = 'https://ultimatechristmas-production.up.railway.app';
const HUB = 'https://www.ultimatehub.co.uk';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class CheckoutError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function quote(sku, quantity, deliveryPence = 725) {
  const product = products.find(p => p.sku === sku);
  if (!product) throw new CheckoutError('Please select a hamper from the collection.');
  if (!Number.isInteger(quantity) || quantity < 1) throw new CheckoutError('Choose a whole number of hampers.');
  if (quantity > 10) throw new CheckoutError('For more than 10 hampers, please contact our team for bulk options.');
  if (!Number.isSafeInteger(deliveryPence) || deliveryPence < 0 || deliveryPence > 100000) throw new Error('Invalid delivery configuration');
  const unitPence = Math.round(product.price * 100);
  const subtotalPence = unitPence * quantity;
  const productVatPence = Math.round(subtotalPence * Math.round(product.vatPercent * 100) / 10000);
  const shippingPence = deliveryPence * quantity;
  const shippingVatPence = Math.round(shippingPence * .2);
  return { sku, name: product.name, slug: product.slug, page: product.page, quantity, unitPence, vatPercent: product.vatPercent,
    subtotalPence, productVatPence, deliveryUnitPence: deliveryPence, shippingPence, shippingVatPence,
    totalPence: subtotalPence + productVatPence + shippingPence + shippingVatPence, currency: 'gbp', mode: 'sandbox' };
}
function quoteCart(input, deliveryPence = 725) {
  if (!Array.isArray(input) || !input.length || input.length > 10) throw new CheckoutError('Choose between 1 and 10 hampers for your cart.');
  const merged = new Map();
  for (const item of input) {
    if (!item || typeof item.sku !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new CheckoutError('Choose a whole number of hampers between 1 and 10.');
    merged.set(item.sku, (merged.get(item.sku) || 0) + item.quantity);
  }
  if ([...merged.values()].reduce((sum, n) => sum + n, 0) > 10) throw new CheckoutError('For more than 10 hampers, please contact our team for bulk options.');
  const items = [...merged].sort(([a], [b]) => a.localeCompare(b)).map(([sku, quantity]) => quote(sku, quantity, deliveryPence));
  const total = field => items.reduce((sum, item) => sum + item[field], 0);
  return { ...items[0], sku: items.length === 1 ? items[0].sku : null, name: items.length === 1 ? items[0].name : `${total('quantity')} hampers`,
    vatPercent: items.length === 1 ? items[0].vatPercent : null, items, quantity: total('quantity'), subtotalPence: total('subtotalPence'),
    productVatPence: total('productVatPence'), shippingPence: total('shippingPence'), shippingVatPence: total('shippingVatPence'), totalPence: total('totalPence') };
}
function validateDelivery(input) {
  const clean = {};
  for (const key of ['name', 'email', 'line1', 'line2', 'city', 'postcode']) {
    clean[key] = String(input?.[key] || '').trim();
    if (clean[key].length > (key === 'email' ? 254 : 150) || /[\x00-\x1f]/.test(clean[key])) throw new CheckoutError('Please check your delivery details.');
  }
  if (!clean.name || !clean.line1 || !clean.city || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new CheckoutError('Enter your name, email and full delivery address.');
  clean.postcode = clean.postcode.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(clean.postcode)) throw new CheckoutError('Enter a valid UK mainland postcode.');
  // Conservative exclusions: ambiguous coastal districts go to the team for a delivery quote.
  if (/^(BT|IM|JE|GY|HS|ZE|PO3[0-9]|TR2[1-5]|KA27|KA28|PA(2[0-9]|4[1-9]|6[0-9]|7[0-9]|80)|PH4[1-4]|IV4[0-9]|IV5[1-6]|KW1[5-7])/.test(clean.postcode)) {
    throw new CheckoutError('Please contact our team to arrange delivery to this postcode.');
  }
  if (input?.mainland !== true) throw new CheckoutError('Please confirm this is a UK mainland delivery address.');
  clean.postcode = clean.postcode.slice(0, -3) + ' ' + clean.postcode.slice(-3);
  return clean;
}
function createService({ db, env = process.env, stripe: injectedStripe } = {}) {
  const mode = env.HAMPER_CHECKOUT_MODE;
  const configFor = value => value === 'live' ? {
    key: env.HAMPER_STRIPE_LIVE_SECRET_KEY?.trim(), secret: env.HAMPER_STRIPE_LIVE_WEBHOOK_SECRET?.trim(),
    account: env.HAMPER_STRIPE_LIVE_ACCOUNT_ID?.trim()
  } : { key: env.HAMPER_STRIPE_SECRET_KEY, secret: env.HAMPER_STRIPE_WEBHOOK_SECRET, account: ACCOUNT };
  const config = configFor(mode);
  let stripe;
  let accountCheck;
  const taxRates = new Map();
  function configured() {
    return ['sandbox', 'live'].includes(mode) && (mode === 'live' ? /^(sk|rk)_live_/ : /^sk_test_/).test(config.key || '') &&
      /^acct_[a-zA-Z0-9]+$/.test(config.account || '') && /^whsec_/.test(config.secret || '');
  }
  async function client() {
    if (!configured()) throw new CheckoutError('Checkout is being prepared. Please contact our team to order.', 503);
    stripe ||= injectedStripe || new Stripe(config.key, { maxNetworkRetries: 2, timeout: 20000 });
    accountCheck ||= stripe.accounts.retrieve().then(a => {
      if (a.id !== config.account) throw new Error('Unexpected Stripe account');
      if (mode === 'live' && (!a.charges_enabled || !a.details_submitted)) throw new Error('Stripe account is not ready for payments');
    }).catch(e => { accountCheck = null; throw e; });
    await accountCheck;
    return stripe;
  }
  function withMode(q) { return { ...q, mode, ...(q.items ? { items: q.items.map(item => ({ ...item, mode })) } : {}) }; }
  function getQuote(sku, quantity) { return withMode(quote(sku, quantity, Number(env.HAMPER_DELIVERY_PENCE || 725))); }
  function getCartQuote(items) { return withMode(quoteCart(items, Number(env.HAMPER_DELIVERY_PENCE || 725))); }
  function discountQuote(q, code) {
    if (!code) return q;
    const digest = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
    if (mode !== 'live' || !env.HAMPER_TEST_DISCOUNT_SHA256 || digest !== env.HAMPER_TEST_DISCOUNT_SHA256 ||
        !Number.isFinite(Date.parse(env.HAMPER_TEST_DISCOUNT_EXPIRES)) || Date.now() >= Date.parse(env.HAMPER_TEST_DISCOUNT_EXPIRES)) {
      throw new CheckoutError('This discount code is invalid or has expired.');
    }
    if (q.quantity !== 1 || (q.items || [q]).length !== 1 || (q.items || [q])[0].sku !== 'H26002') {
      throw new CheckoutError('This test discount is for one Christmas Treats Basket only.');
    }
    // Allocate the discounted consideration across the two original VAT rates.
    // 22p goods + 2p VAT + 5p delivery + 1p VAT = 30p.
    const item = { ...(q.items || [q])[0], unitPence: 22, subtotalPence: 22, productVatPence: 2,
      deliveryUnitPence: 5, shippingPence: 5, shippingVatPence: 1, totalPence: 30 };
    return { ...q, ...item, ...(q.items ? { items: [item] } : {}),
      discountLabel: 'Single-use live test discount', originalTotalPence: q.totalPence, discountPence: q.totalPence - 30 };
  }
  function checkoutQuote(items, code) { return discountQuote(getCartQuote(items), code); }
  function catalogue() { return { mode, available: configured(), products: products.map(({ sku, name, price, vatPercent, page, slug }) => ({ sku, name, price, vatPercent, page, slug })), deliveryPence: Number(env.HAMPER_DELIVERY_PENCE || 725) }; }
  async function taxRate(percent) {
    if (!taxRates.has(percent)) taxRates.set(percent, (async () => {
      const s = await client();
      const rate = await s.taxRates.create({ display_name: 'VAT', description: 'UK hamper VAT', percentage: percent, inclusive: false, country: 'GB' }, { idempotencyKey: `hamper-vat-v1-${percent}` });
      return rate.id;
    })().catch(e => { taxRates.delete(percent); throw e; }));
    return taxRates.get(percent);
  }
  async function create(input) {
    if (!UUID.test(input?.requestId || '')) throw new CheckoutError('Please reload checkout and try again.');
    const snapshot = discountQuote(input.items !== undefined ? getCartQuote(input.items) : getQuote(input.sku, input.quantity), input.discountCode);
    snapshot.stripeAccountId = config.account;
    const delivery = validateDelivery(input.delivery);
    const hash = crypto.createHash('sha256').update(JSON.stringify({ snapshot, delivery })).digest('hex');
    const s = await client();
    if (snapshot.discountLabel) {
      const codeHash = crypto.createHash('sha256').update(String(input.discountCode).trim()).digest('hex');
      await db.query('INSERT INTO hamper_discount_redemptions(code_hash,order_id) VALUES($1,$2) ON CONFLICT(code_hash) DO NOTHING', [codeHash, input.requestId]);
      const { rows: [redemption] } = await db.query('SELECT order_id FROM hamper_discount_redemptions WHERE code_hash=$1', [codeHash]);
      if (redemption.order_id !== input.requestId) throw new CheckoutError('This single-use discount has already been used.', 409);
    }
    await db.query(`INSERT INTO hamper_orders(id,request_hash,mode,snapshot,delivery) VALUES($1,$2,$5,$3,$4) ON CONFLICT(id) DO NOTHING`, [input.requestId, hash, snapshot, delivery, mode]);
    await db.query("UPDATE hamper_orders SET po_number=nextval('hamper_po_sequence') WHERE id=$1 AND po_number IS NULL", [input.requestId]);
    const { rows: [order] } = await db.query('SELECT * FROM hamper_orders WHERE id=$1', [input.requestId]);
    if (order.mode !== mode || order.request_hash !== hash) throw new CheckoutError('Your order details changed. Please reload checkout and try again.', 409);
    if (order.stripe_session_id) return { url: order.checkout_url, id: order.id };
    const lines = snapshot.items || [snapshot];
    const productTaxes = await Promise.all(lines.map(item => taxRate(item.vatPercent)));
    const shippingTax = await taxRate(20);
    const session = await s.checkout.sessions.create({
      mode: 'payment', customer_email: delivery.email,
      client_reference_id: order.id, metadata: { hamper_order_id: order.id, integration: `ultimate-hampers-${mode}` },
      payment_intent_data: { metadata: { hamper_order_id: order.id }, shipping: { name: delivery.name, address: { line1: delivery.line1, line2: delivery.line2, city: delivery.city, postal_code: delivery.postcode, country: 'GB' } } },
      line_items: [
        ...lines.map((item, index) => ({ price_data: { currency: 'gbp', unit_amount: item.unitPence, product_data: { name: item.name + (snapshot.discountLabel ? ' (test discount applied)' : ''), metadata: { sku: item.sku } }, tax_behavior: 'exclusive' }, quantity: item.quantity, tax_rates: [productTaxes[index]] })),
        { price_data: { currency: 'gbp', unit_amount: snapshot.deliveryUnitPence, product_data: { name: 'UK mainland delivery (per hamper)' }, tax_behavior: 'exclusive' }, quantity: snapshot.quantity, tax_rates: [shippingTax] }
      ],
      success_url: `${HUB}/hamper-checkout.html?order=${order.id}`,
      cancel_url: `${HUB}/hamper-checkout.html?order=${order.id}&cancelled=1`,
      ...(mode === 'sandbox' ? { custom_text: { submit: { message: 'Sandbox test only. No real order will be dispatched.' } } } : {}),
      expires_at: Math.floor(new Date(order.created_at).getTime() / 1000) + 3600
    }, { idempotencyKey: `hamper-checkout-${order.id}` });
    if (session.livemode !== (mode === 'live') || session.amount_total !== snapshot.totalPence || session.currency !== 'gbp') {
      await s.checkout.sessions.expire(session.id);
      throw new Error('Stripe checkout total mismatch');
    }
    await db.query('UPDATE hamper_orders SET stripe_session_id=$2,checkout_url=$3,updated_at=NOW() WHERE id=$1', [order.id, session.id, session.url]);
    return { url: session.url, id: order.id };
  }
  async function status(id) {
    if (!UUID.test(id || '')) throw new CheckoutError('Order not found.', 404);
    const { rows: [order] } = await db.query('SELECT id,status,mode,snapshot FROM hamper_orders WHERE id=$1', [id]);
    if (!order) throw new CheckoutError('Order not found.', 404);
    return order;
  }
  async function webhook(raw, signature) {
    // Verify against independent endpoint secrets so outstanding sandbox events
    // remain safe to process after the storefront switches to live mode.
    let event, eventMode;
    for (const candidate of ['sandbox', 'live']) {
      const c = configFor(candidate);
      if (!c.secret || !c.key) continue;
      try {
        const verifier = injectedStripe || new Stripe(c.key);
        event = verifier.webhooks.constructEvent(raw, signature, c.secret);
        eventMode = candidate;
        break;
      } catch {}
    }
    if (!event) throw new CheckoutError('Invalid webhook signature.', 400);
    if (event.livemode !== (eventMode === 'live')) throw new CheckoutError('Webhook payment mode mismatch.', 400);
    const allowed = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'];
    if (!allowed.includes(event.type)) return;
    const session = event.data.object;
    const id = session.metadata?.hamper_order_id;
    if (!UUID.test(id || '') || session.metadata?.integration !== `ultimate-hampers-${eventMode}`) return;
    const conn = await db.connect();
    try {
      await conn.query('BEGIN');
      const { rows: [order] } = await conn.query('SELECT * FROM hamper_orders WHERE id=$1 FOR UPDATE', [id]);
      if (!order) {
        const { rows: cleared } = await conn.query('SELECT id FROM hamper_cleared_orders WHERE id=$1', [id]);
        if (cleared.length) { await conn.query('COMMIT'); return; }
        throw new Error('Webhook order missing');
      }
      if (order.mode !== eventMode || (session.livemode !== undefined && session.livemode !== event.livemode)) throw new Error('Webhook order mode mismatch');
      if (order.stripe_session_id && order.stripe_session_id !== session.id) throw new Error('Webhook session mismatch');
      if (session.amount_total !== order.snapshot.totalPence || session.currency !== 'gbp' || session.client_reference_id !== id) throw new Error('Webhook order total mismatch');
      const { rowCount } = await conn.query('INSERT INTO hamper_payment_events(id,order_id,type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [event.id, id, event.type]);
      if (rowCount) {
        let next = order.status;
        if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid') next = 'paid';
        else if (order.status !== 'paid' && event.type === 'checkout.session.expired') next = 'expired';
        else if (order.status !== 'paid' && event.type === 'checkout.session.async_payment_failed') next = 'failed';
        if(next === 'paid' && order.mode === 'live') await conn.query('INSERT INTO hamper_confirmation_emails(order_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
        await conn.query('UPDATE hamper_orders SET status=$2,stripe_session_id=$3,stripe_payment_intent=$4,updated_at=NOW() WHERE id=$1', [id, next, session.id, session.payment_intent || null]);
      }
      await conn.query('COMMIT');
    } catch (e) { await conn.query('ROLLBACK'); throw e; } finally { conn.release(); }
  }
  return { mode, configured, getQuote, getCartQuote, checkoutQuote, catalogue, create, status, webhook };
}
module.exports = { createService, quote, quoteCart, validateDelivery, CheckoutError, SITE, HUB, ACCOUNT };
