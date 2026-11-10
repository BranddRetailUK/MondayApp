const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Stripe = require('stripe');
const { PGlite } = require('@electric-sql/pglite');
const { quote, validateDelivery, createService, ACCOUNT } = require('../src/services/hamperCheckout');
const { ensureHamperTables } = require('../src/db/hamperSchema');
const catalogue = require('../web/hamper-collection/products.json');
const delivery = { name: 'Sandbox Buyer', email: 'sandbox@example.com', line1: '10 Test Street', line2: '', city: 'London', postcode: 'SW1A 1AA', mainland: true };
test('all 90 catalogue prices, VAT and quantity boundaries are authoritative', () => {
  assert.equal(catalogue.length, 90);
  for (const p of catalogue) for (const qty of [1, 10]) {
    const q = quote(p.sku, qty);
    assert.equal(q.subtotalPence, Math.round(p.price * 100) * qty);
    assert.equal(q.shippingPence, 725 * qty);
    assert.equal(q.shippingVatPence, 145 * qty);
    assert.equal(q.totalPence, q.subtotalPence + Math.round(q.subtotalPence * p.vatPercent / 100) + 870 * qty);
  }
  for (const qty of [0, -1, 1.5, 11, NaN, Infinity, '1']) assert.throws(() => quote('H26002', qty));
  assert.throws(() => quote('unknown', 1));
  assert.equal(quote('H26002', 2, 800).shippingPence, 1600);
});
test('delivery requires mainland confirmation and excludes islands and Northern Ireland', () => {
  assert.equal(validateDelivery(delivery).postcode, 'SW1A 1AA');
  for (const postcode of ['BT1 1AA', 'JE1 1AA', 'GY1 1AA', 'IM1 1AA', 'PO30 1AA', 'HS1 1AA', 'ZE1 1AA', 'TR21 1AA', 'invalid']) assert.throws(() => validateDelivery({ ...delivery, postcode }));
  assert.throws(() => validateDelivery({ ...delivery, mainland: false }));
  assert.throws(() => validateDelivery({ ...delivery, email: 'invalid' }));
});
test('sandbox checkout persistence, retries, signed webhook validation and monotonic payment state', async () => {
  const pg = new PGlite();
  const db = { query: async (sql, params) => {
    if (!params && sql.includes('CREATE TABLE')) return pg.exec(sql);
    const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows };
  } };
  db.connect = async () => ({ query: db.query, release() {} });
  await ensureHamperTables(db); await ensureHamperTables(db);
  const real = new Stripe('sk_test_fake');
  let createCalls = 0;
  let sent;
  const fake = { accounts: { retrieve: async () => ({ id: ACCOUNT }) }, taxRates: { create: async r => ({ id: `txr_${r.percentage}` }) }, webhooks: real.webhooks,
    checkout: { sessions: { create: async data => { createCalls++; sent = data; return { id: 'cs_test_123', url: 'https://checkout.stripe.com/test', currency: 'gbp', amount_total: quote('H26002', 2).totalPence, livemode: false }; }, expire: async () => {} } } };
  const env = { HAMPER_CHECKOUT_MODE: 'sandbox', HAMPER_STRIPE_SECRET_KEY: 'sk_test_fake', HAMPER_STRIPE_WEBHOOK_SECRET: 'whsec_test' };
  const service = createService({ db, env, stripe: fake });
  const id = crypto.randomUUID();
  const input = { requestId: id, sku: 'H26002', quantity: 2, delivery, price: 1, vat: 0 };
  const first = await service.create(input); const retry = await service.create(input);
  assert.deepEqual(first, retry); assert.equal(createCalls, 1);
  assert.equal(sent.line_items[0].price_data.unit_amount, 2999);
  assert.equal(sent.line_items[1].price_data.unit_amount, 725);
  assert.equal(sent.line_items[1].quantity, 2);
  assert.equal(sent.payment_intent_data.shipping.address.country, 'GB');
  await assert.rejects(service.create({ ...input, quantity: 3 }), /changed/);
  assert.equal((await service.status(id)).status, 'pending');
  assert.equal((await service.status(id)).delivery, undefined);
  const session = { id: 'cs_test_123', metadata: { hamper_order_id: id, integration: 'ultimate-hampers-sandbox' }, client_reference_id: id, currency: 'gbp', amount_total: quote('H26002', 2).totalPence, payment_status: 'paid', payment_intent: 'pi_test_123' };
  async function send(type, object = session, extra = {}, eventId = crypto.randomUUID()) {
    const payload = JSON.stringify({ id: eventId, type, livemode: false, data: { object }, ...extra });
    const signature = real.webhooks.generateTestHeaderString({ payload, secret: env.HAMPER_STRIPE_WEBHOOK_SECRET });
    await service.webhook(Buffer.from(payload), signature);
  }
  await assert.rejects(service.webhook(Buffer.from('{}'), 'bad'), /signature/);
  await assert.rejects(send('checkout.session.completed', { ...session, amount_total: 1 }), /total mismatch/);
  await assert.rejects(send('checkout.session.completed', session, { livemode: true }), /Live payments/);
  await send('checkout.session.completed', { ...session, payment_status: 'unpaid' });
  assert.equal((await service.status(id)).status, 'pending');
  await send('checkout.session.async_payment_failed');
  assert.equal((await service.status(id)).status, 'failed');
  await send('checkout.session.async_payment_succeeded', session, {}, 'evt_duplicate');
  await send('checkout.session.async_payment_succeeded', session, {}, 'evt_duplicate');
  assert.equal((await service.status(id)).status, 'paid');
  await send('checkout.session.expired');
  assert.equal((await service.status(id)).status, 'paid');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM hamper_payment_events WHERE id='evt_duplicate'")).rows[0].n, 1);
  const disabled = createService({ db, env: { ...env, HAMPER_STRIPE_SECRET_KEY: 'sk_live_fake' }, stripe: fake });
  await assert.rejects(disabled.create(input), /being prepared/);
  await pg.close();
});
test('every SKU uses its independently extracted brochure VAT rate', () => {
  const brochure = require('./fixtures/hamper-brochure-vat.json');
  assert.equal(brochure.products.length, 90);
  assert.equal(new Set(brochure.products.map(p => p.sku)).size, 90);
  for (const source of brochure.products) {
    const product = catalogue.find(p => p.sku === source.sku);
    assert.ok(product, source.sku);
    assert.equal(product.page, source.page, `${source.sku} source page`);
    assert.equal(quote(source.sku, 1).vatPercent, source.vatPercent, `${source.sku} VAT`);
  }
});
