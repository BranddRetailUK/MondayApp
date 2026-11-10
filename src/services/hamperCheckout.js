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
  let stripe;
  let accountCheck;
  const taxRates = new Map();
  function configured() {
    return env.HAMPER_CHECKOUT_MODE === 'sandbox' && /^sk_test_/.test(env.HAMPER_STRIPE_SECRET_KEY || '') && !!env.HAMPER_STRIPE_WEBHOOK_SECRET;
  }
  async function client() {
    if (!configured()) throw new CheckoutError('Checkout is being prepared. Please contact our team to order.', 503);
    stripe ||= injectedStripe || new Stripe(env.HAMPER_STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
    accountCheck ||= stripe.accounts.retrieve().then(a => { if (a.id !== ACCOUNT) throw new Error('Unexpected Stripe account'); }).catch(e => { accountCheck = null; throw e; });
    await accountCheck;
    return stripe;
  }
  function getQuote(sku, quantity) { return quote(sku, quantity, Number(env.HAMPER_DELIVERY_PENCE || 725)); }
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
    const snapshot = getQuote(input.sku, input.quantity);
    const delivery = validateDelivery(input.delivery);
    const hash = crypto.createHash('sha256').update(JSON.stringify({ snapshot, delivery })).digest('hex');
    const s = await client();
    await db.query(`INSERT INTO hamper_orders(id,request_hash,mode,snapshot,delivery) VALUES($1,$2,'sandbox',$3,$4) ON CONFLICT(id) DO NOTHING`, [input.requestId, hash, snapshot, delivery]);
    const { rows: [order] } = await db.query('SELECT * FROM hamper_orders WHERE id=$1', [input.requestId]);
    if (order.request_hash !== hash) throw new CheckoutError('Your order details changed. Please reload checkout and try again.', 409);
    if (order.stripe_session_id) return { url: order.checkout_url, id: order.id };
    const [productTax, shippingTax] = await Promise.all([taxRate(snapshot.vatPercent), taxRate(20)]);
    const session = await s.checkout.sessions.create({
      mode: 'payment', customer_email: delivery.email,
      client_reference_id: order.id, metadata: { hamper_order_id: order.id, integration: 'ultimate-hampers-sandbox' },
      payment_intent_data: { metadata: { hamper_order_id: order.id }, shipping: { name: delivery.name, address: { line1: delivery.line1, line2: delivery.line2, city: delivery.city, postal_code: delivery.postcode, country: 'GB' } } },
      line_items: [
        { price_data: { currency: 'gbp', unit_amount: snapshot.unitPence, product_data: { name: snapshot.name, metadata: { sku: snapshot.sku } }, tax_behavior: 'exclusive' }, quantity: snapshot.quantity, tax_rates: [productTax] },
        { price_data: { currency: 'gbp', unit_amount: snapshot.deliveryUnitPence, product_data: { name: 'UK mainland delivery (per hamper)' }, tax_behavior: 'exclusive' }, quantity: snapshot.quantity, tax_rates: [shippingTax] }
      ],
      success_url: `${HUB}/hamper-checkout.html?order=${order.id}`,
      cancel_url: `${HUB}/hamper-checkout.html?order=${order.id}&cancelled=1`,
      custom_text: { submit: { message: 'Sandbox test only. No real order will be dispatched.' } },
      expires_at: Math.floor(new Date(order.created_at).getTime() / 1000) + 3600
    }, { idempotencyKey: `hamper-checkout-${order.id}` });
    if (session.livemode || session.amount_total !== snapshot.totalPence || session.currency !== 'gbp') {
      await s.checkout.sessions.expire(session.id);
      throw new Error('Stripe checkout total mismatch');
    }
    await db.query('UPDATE hamper_orders SET stripe_session_id=$2,checkout_url=$3,updated_at=NOW() WHERE id=$1', [order.id, session.id, session.url]);
    return { url: session.url, id: order.id };
  }
  async function status(id) {
    if (!UUID.test(id || '')) throw new CheckoutError('Order not found.', 404);
    const { rows: [order] } = await db.query('SELECT id,status,snapshot FROM hamper_orders WHERE id=$1', [id]);
    if (!order) throw new CheckoutError('Order not found.', 404);
    return order;
  }
  async function webhook(raw, signature) {
    const s = await client();
    let event;
    try { event = s.webhooks.constructEvent(raw, signature, env.HAMPER_STRIPE_WEBHOOK_SECRET); }
    catch { throw new CheckoutError('Invalid webhook signature.', 400); }
    if (event.livemode) throw new CheckoutError('Live payments are not enabled.', 400);
    const allowed = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'];
    if (!allowed.includes(event.type)) return;
    const session = event.data.object;
    const id = session.metadata?.hamper_order_id;
    if (!UUID.test(id || '') || session.metadata?.integration !== 'ultimate-hampers-sandbox') return;
    const conn = await db.connect();
    try {
      await conn.query('BEGIN');
      const { rows: [order] } = await conn.query('SELECT * FROM hamper_orders WHERE id=$1 FOR UPDATE', [id]);
      if (!order) {
        const { rows: cleared } = await conn.query('SELECT id FROM hamper_cleared_orders WHERE id=$1', [id]);
        if (cleared.length) { await conn.query('COMMIT'); return; }
        throw new Error('Webhook order missing');
      }
      if (order.stripe_session_id && order.stripe_session_id !== session.id) throw new Error('Webhook session mismatch');
      if (session.amount_total !== order.snapshot.totalPence || session.currency !== 'gbp' || session.client_reference_id !== id) throw new Error('Webhook order total mismatch');
      const { rowCount } = await conn.query('INSERT INTO hamper_payment_events(id,order_id,type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [event.id, id, event.type]);
      if (rowCount) {
        let next = order.status;
        if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid') next = 'paid';
        else if (order.status !== 'paid' && event.type === 'checkout.session.expired') next = 'expired';
        else if (order.status !== 'paid' && event.type === 'checkout.session.async_payment_failed') next = 'failed';
        await conn.query('UPDATE hamper_orders SET status=$2,stripe_session_id=$3,stripe_payment_intent=$4,updated_at=NOW() WHERE id=$1', [id, next, session.id, session.payment_intent || null]);
      }
      await conn.query('COMMIT');
    } catch (e) { await conn.query('ROLLBACK'); throw e; } finally { conn.release(); }
  }
  return { configured, getQuote, create, status, webhook };
}
module.exports = { createService, quote, validateDelivery, CheckoutError, SITE, HUB, ACCOUNT };
