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
  await db.query('INSERT INTO hamper_cleared_orders(id) VALUES($1)', [id]);
  await db.query('DELETE FROM hamper_payment_events WHERE order_id=$1', [id]);
  await db.query('DELETE FROM hamper_orders WHERE id=$1', [id]);
  await send('checkout.session.completed');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hamper_orders')).rows[0].n, 0);
  await assert.rejects(service.status(id), /not found/);
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
test('mixed cart preserves per-product VAT and enforces ten hampers across all lines', () => {
  const { quoteCart } = require('../src/services/hamperCheckout');
  const cart = quoteCart([{ sku: 'H26002', quantity: 2, price: 1 }, { sku: 'H26063', quantity: 1 }, { sku: 'H26001', quantity: 1 }]);
  assert.equal(cart.quantity, 4);
  assert.equal(cart.items.length, 3);
  assert.equal(cart.items.find(i => i.sku === 'H26063').productVatPence, 0);
  assert.equal(cart.items.find(i => i.sku === 'H26002').vatPercent, 8.2);
  assert.equal(cart.items.find(i => i.sku === 'H26001').vatPercent, 10.9);
  assert.equal(cart.shippingPence, 2900);
  assert.equal(cart.shippingVatPence, 580);
  assert.equal(cart.totalPence, cart.subtotalPence + cart.items.reduce((sum, i) => sum + i.productVatPence, 0) + 3480);
  assert.deepEqual(quoteCart([{ sku: 'H26002', quantity: 1 }, { sku: 'H26002', quantity: 2 }]), quoteCart([{ sku: 'H26002', quantity: 3 }]));
  for (const items of [[], null, [{sku:'H26002',quantity:6},{sku:'H26063',quantity:5}], [{sku:'H26002',quantity:5},{sku:'H26002',quantity:6}], [{sku:'invalid',quantity:1}], [{sku:'H26002',quantity:1.5}]]) assert.throws(() => quoteCart(items));
});
test('cart Stripe line items use each product rate and server-resolved prices', async () => {
  const { quoteCart } = require('../src/services/hamperCheckout');
  const pg = new PGlite();
  const db = { query: async (sql, params) => !params && sql.includes('CREATE TABLE') ? pg.exec(sql) : pg.query(sql, params) };
  await ensureHamperTables(db);
  let sent;
  const items = [{sku:'H26002',quantity:2},{sku:'H26063',quantity:1}];
  const expected = quoteCart(items);
  const stripe = { accounts:{retrieve:async()=>({id:ACCOUNT})}, taxRates:{create:async data=>({id:`vat_${data.percentage}`})}, checkout:{sessions:{create:async data=>{sent=data;return {id:'cs_test_cart',url:'https://checkout.stripe.com/test',livemode:false,currency:'gbp',amount_total:expected.totalPence};},expire:async()=>{}}} };
  const env = {HAMPER_CHECKOUT_MODE:'sandbox',HAMPER_STRIPE_SECRET_KEY:'sk_test_fake',HAMPER_STRIPE_WEBHOOK_SECRET:'whsec_test'};
  const service=createService({db,env,stripe});
  await service.create({requestId:crypto.randomUUID(),items,delivery});
  const productLines=sent.line_items.slice(0,-1);
  assert.equal(productLines.length,2);
  assert.deepEqual(productLines.map(l=>l.tax_rates[0]),['vat_8.2','vat_0']);
  assert.deepEqual(productLines.map(l=>l.price_data.unit_amount),[2999,3649]);
  assert.equal(sent.line_items.at(-1).quantity,3);
  assert.equal(sent.line_items.at(-1).tax_rates[0],'vat_20');
  await pg.close();
});
