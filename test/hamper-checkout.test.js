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
    checkout: { sessions: { create: async data => { createCalls++; sent = data; return { id: createCalls === 1 ? 'cs_test_123' : `cs_test_${createCalls}`, url: 'https://checkout.stripe.com/test', currency: 'gbp', amount_total: quote('H26002', 2).totalPence, livemode: false }; }, expire: async () => {} } } };
  const env = { HAMPER_CHECKOUT_MODE: 'sandbox', HAMPER_STRIPE_SECRET_KEY: 'sk_test_fake', HAMPER_STRIPE_WEBHOOK_SECRET: 'whsec_test' };
  const service = createService({ db, env, stripe: fake });
  const id = crypto.randomUUID();
  const input = { requestId: id, sku: 'H26002', quantity: 2, delivery, price: 1, vat: 0 };
  const first = await service.create(input); const retry = await service.create(input);
  assert.deepEqual(first, retry); assert.equal(createCalls, 1);
  assert.equal(Number((await db.query('SELECT po_number FROM hamper_orders WHERE id=$1', [id])).rows[0].po_number), 1);
  const nextId = crypto.randomUUID();
  await service.create({ ...input, requestId: nextId });
  assert.equal(Number((await db.query('SELECT po_number FROM hamper_orders WHERE id=$1', [nextId])).rows[0].po_number), 2);
  await db.query('DELETE FROM hamper_orders WHERE id=$1', [nextId]);
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
  await assert.rejects(send('checkout.session.completed', session, { livemode: true }), /payment mode mismatch/);
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

test('PO migration backfills older orders chronologically and retains numbers on restart', async () => {
  const pg = new PGlite();
  const db = { query: async (sql, params) => !params && sql.includes('CREATE TABLE') ? pg.exec(sql) : pg.query(sql, params) };
  await ensureHamperTables(db);
  await pg.exec('ALTER TABLE hamper_orders DROP COLUMN po_number');
  const older = crypto.randomUUID(), newer = crypto.randomUUID();
  for (const [id, created] of [[newer, '2026-11-10'], [older, '2026-11-09']]) {
    await db.query("INSERT INTO hamper_orders(id,request_hash,mode,snapshot,delivery,created_at) VALUES($1,'test','sandbox','{}','{}',$2)", [id, created]);
  }
  await ensureHamperTables(db);
  await ensureHamperTables(db);
  const rows = (await db.query('SELECT id,po_number FROM hamper_orders ORDER BY po_number')).rows;
  assert.deepEqual(rows.map(r => r.id), [older, newer]);
  assert.deepEqual(rows.map(r => Number(r.po_number)), [1, 2]);
  await assert.rejects(db.query('UPDATE hamper_orders SET po_number=1 WHERE id=$1', [newer]), /unique/);
  await pg.close();
});

test('live mode isolates orders, validates account readiness and authenticates both endpoint secrets', async () => {
  const pg = new PGlite();
  const db = { query: async (sql, params) => {
    if (!params && sql.includes('CREATE TABLE')) return pg.exec(sql);
    const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows };
  } };
  db.connect = async () => ({query:db.query,release(){}});
  // Exercise an existing sandbox-only schema upgrade, preserving its records.
  await pg.exec("CREATE TABLE hamper_orders(id UUID PRIMARY KEY,request_hash TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode='sandbox'),status TEXT NOT NULL DEFAULT 'pending',snapshot JSONB NOT NULL,delivery JSONB NOT NULL,stripe_session_id TEXT UNIQUE,stripe_payment_intent TEXT,checkout_url TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const oldId=crypto.randomUUID();
  await db.query("INSERT INTO hamper_orders(id,request_hash,mode,snapshot,delivery) VALUES($1,'old','sandbox',$2,$3)",[oldId,quote('H26002',1),delivery]);
  await ensureHamperTables(db); await ensureHamperTables(db);
  const env={HAMPER_CHECKOUT_MODE:'live',HAMPER_STRIPE_LIVE_SECRET_KEY:'sk_live_fake',HAMPER_STRIPE_LIVE_WEBHOOK_SECRET:'whsec_live',HAMPER_STRIPE_LIVE_ACCOUNT_ID:'acct_liveExpected',HAMPER_STRIPE_SECRET_KEY:'sk_test_fake',HAMPER_STRIPE_WEBHOOK_SECRET:'whsec_test'};
  const real=new Stripe('sk_test_fake'); let sent, calls=0, expires=0;
  let account={id:'acct_liveExpected',charges_enabled:true,details_submitted:true};
  const fake={accounts:{retrieve:async()=>account},webhooks:real.webhooks,taxRates:{create:async r=>({id:`txr_${r.percentage}`})},checkout:{sessions:{create:async data=>{calls++;sent=data;return {id:'cs_live_123',url:'https://checkout.stripe.com/live',livemode:true,amount_total:quote('H26002',1).totalPence,currency:'gbp'};},expire:async()=>{expires++;}}}};
  assert.equal(createService({db,env:{...env,HAMPER_STRIPE_LIVE_SECRET_KEY:'rk_live_fake'},stripe:fake}).configured(),true);
  const service=createService({db,env,stripe:fake});
  assert.equal(service.configured(),true); assert.equal(service.catalogue().mode,'live'); assert.equal(service.getCartQuote([{sku:'H26002',quantity:1}]).items[0].mode,'live');
  const id=crypto.randomUUID(),input={requestId:id,sku:'H26002',quantity:1,delivery};
  await service.create(input);await service.create(input);assert.equal(calls,1);
  assert.equal(sent.custom_text,undefined);assert.equal(sent.metadata.integration,'ultimate-hampers-live');
  assert.equal((await service.status(id)).mode,'live');assert.equal((await service.status(oldId)).mode,'sandbox');
  assert.equal((await service.status(id)).snapshot.stripeAccountId,'acct_liveExpected');
  await assert.rejects(service.create({...input,requestId:oldId}),/changed/);
  const liveSession={id:'cs_live_123',livemode:true,metadata:{hamper_order_id:id,integration:'ultimate-hampers-live'},client_reference_id:id,currency:'gbp',amount_total:quote('H26002',1).totalPence,payment_status:'paid',payment_intent:'pi_live_123'};
  const send=async(object,livemode,secret,eventId=crypto.randomUUID(),type='checkout.session.completed')=>{
    const payload=JSON.stringify({id:eventId,type,livemode,data:{object}});
    await service.webhook(Buffer.from(payload),real.webhooks.generateTestHeaderString({payload,secret}));
  };
  await assert.rejects(send(liveSession,true,'whsec_test'),/mode mismatch/);
  await assert.rejects(send({...liveSession,amount_total:1},true,'whsec_live'),/total mismatch/);
  await assert.rejects(send({...liveSession,livemode:false},true,'whsec_live'),/order mode mismatch/);
  const eventId='evt_live_duplicate';await send(liveSession,true,'whsec_live',eventId);await send(liveSession,true,'whsec_live',eventId);
  await send(liveSession,true,'whsec_live','evt_late_expired','checkout.session.expired');
  assert.equal((await service.status(id)).status,'paid');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hamper_payment_events WHERE id=$1',[eventId])).rows[0].n,1);
  const oldSession={...liveSession,id:'cs_test_old',livemode:false,metadata:{hamper_order_id:oldId,integration:'ultimate-hampers-sandbox'},client_reference_id:oldId};
  await send(oldSession,false,'whsec_test');assert.equal((await service.status(oldId)).status,'paid');
  await assert.rejects(send({...liveSession,metadata:{hamper_order_id:oldId,integration:'ultimate-hampers-live'},client_reference_id:oldId},true,'whsec_live'),/order mode mismatch/);
  for(const overrides of [{HAMPER_STRIPE_LIVE_SECRET_KEY:'sk_test_wrong'},{HAMPER_STRIPE_LIVE_WEBHOOK_SECRET:''},{HAMPER_STRIPE_LIVE_ACCOUNT_ID:''},{HAMPER_CHECKOUT_MODE:'unexpected'}]) {
    const invalid=createService({db,env:{...env,...overrides},stripe:fake});assert.equal(invalid.configured(),false);await assert.rejects(invalid.create(input),/being prepared/);
  }
  account={...account,id:'acct_wrong'};
  await assert.rejects(createService({db,env,stripe:fake}).create(input),/Unexpected Stripe account/);
  account={id:'acct_liveExpected',charges_enabled:false,details_submitted:true};
  await assert.rejects(createService({db,env,stripe:fake}).create(input),/not ready/);
  account={...account,charges_enabled:true};
  const wrongSession={...fake,checkout:{sessions:{create:async()=>({id:'cs_test_wrong',livemode:false,amount_total:quote('H26002',1).totalPence,currency:'gbp'}),expire:fake.checkout.sessions.expire}}};
  await assert.rejects(createService({db,env,stripe:wrongSession}).create({...input,requestId:crypto.randomUUID()}),/mismatch/);assert.equal(expires,1);
  await pg.close();
});

test('single-use live test discount preserves VAT, rejects other carts and prevents a second checkout', async () => {
  const pg = new PGlite();
  const db = {query: async (sql, params) => !params && sql.includes('CREATE TABLE') ? pg.exec(sql) : pg.query(sql,params)};
  await ensureHamperTables(db);
  const code='PRIVATE-TEST-CODE';
  const env={HAMPER_CHECKOUT_MODE:'live',HAMPER_STRIPE_LIVE_SECRET_KEY:'rk_live_fake',HAMPER_STRIPE_LIVE_WEBHOOK_SECRET:'whsec_live',HAMPER_STRIPE_LIVE_ACCOUNT_ID:'acct_expected',HAMPER_TEST_DISCOUNT_SHA256:crypto.createHash('sha256').update(code).digest('hex'),HAMPER_TEST_DISCOUNT_EXPIRES:new Date(Date.now()+3600000).toISOString()};
  let calls=0;
  const stripe={accounts:{retrieve:async()=>({id:'acct_expected',charges_enabled:true,details_submitted:true})},taxRates:{create:async r=>({id:`vat_${r.percentage}`})},checkout:{sessions:{create:async p=>{calls++;assert.equal(p.line_items[0].price_data.unit_amount,22);assert.equal(p.line_items[1].price_data.unit_amount,5);assert.deepEqual(p.line_items.map(l=>l.tax_rates[0]),['vat_8.2','vat_20']);return{id:'cs_live_discount',url:'https://checkout.stripe.com/discount',amount_total:30,currency:'gbp',livemode:true};},expire:async()=>{}}}};
  const svc=createService({db,env,stripe}), items=[{sku:'H26002',quantity:1}];
  const q=svc.checkoutQuote(items,code);assert.equal(q.totalPence,30);assert.equal(q.productVatPence,2);assert.equal(q.shippingVatPence,1);assert.equal(q.discountPence,4085);assert.equal(q.items[0].unitPence,22);
  assert.equal(svc.checkoutQuote(items).totalPence,4115);
  for(const invalid of [[{sku:'H26002',quantity:2}],[{sku:'H26001',quantity:1}]]) assert.throws(()=>svc.checkoutQuote(invalid,code),/one Christmas/);
  assert.throws(()=>svc.checkoutQuote(items,'wrong'),/invalid/);
  assert.throws(()=>createService({db,env:{...env,HAMPER_TEST_DISCOUNT_EXPIRES:'2020-01-01'},stripe}).checkoutQuote(items,code),/expired/);
  const input={requestId:crypto.randomUUID(),items,delivery,discountCode:code};
  await svc.create(input);await svc.create(input);assert.equal(calls,1);
  await assert.rejects(svc.create({...input,requestId:crypto.randomUUID()}),/already been used/);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM hamper_orders')).rows[0].n),1);
  assert.equal((await svc.status(input.requestId)).snapshot.totalPence,30);
  const {generateHamperInvoice}=require('../src/services/hamperInvoice');
  const pdf=await generateHamperInvoice({...((await db.query('SELECT * FROM hamper_orders')).rows[0]),status:'paid'});assert.ok(pdf.length>1000);
  await pg.close();
});
