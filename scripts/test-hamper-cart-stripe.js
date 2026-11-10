// Real sandbox pricing verification with a temporary local DB; creates no Hub orders.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Stripe = require('stripe');
const { PGlite } = require('@electric-sql/pglite');
const { createService, quoteCart } = require('../src/services/hamperCheckout');
const { ensureHamperTables } = require('../src/db/hamperSchema');
(async () => {
  if (!process.env.HAMPER_STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Sandbox key required');
  const pg = new PGlite();
  const db = { query: async (sql, params) => !params && sql.includes('CREATE TABLE') ? pg.exec(sql) : pg.query(sql, params) };
  await ensureHamperTables(db);
  const stripe = new Stripe(process.env.HAMPER_STRIPE_SECRET_KEY);
  const proxy = { accounts: stripe.accounts, taxRates: stripe.taxRates, checkout: { sessions: {
    create: (params, options) => stripe.checkout.sessions.create({ ...params, metadata: { ...params.metadata, integration: 'ultimate-hampers-cart-verification' } }, options),
    expire: id => stripe.checkout.sessions.expire(id)
  } } };
  const service = createService({ db, stripe: proxy });
  let session;
  try {
    const items = [{sku:'H26002',quantity:2},{sku:'H26063',quantity:1},{sku:'H26001',quantity:1}];
    const input = {requestId:crypto.randomUUID(),items,delivery:{name:'Sandbox Cart Verification',email:'sandbox@example.com',line1:'10 Test Street',city:'London',postcode:'SW1A 1AA',mainland:true}};
    const result = await service.create(input);
    const record = await db.query('SELECT stripe_session_id FROM hamper_orders WHERE id=$1',[result.id]);
    session = await stripe.checkout.sessions.retrieve(record.rows[0].stripe_session_id);
    const repeat = await service.create(input); assert.equal(result.url,repeat.url);
    assert.equal(session.livemode,false);assert.equal(session.amount_total,quoteCart(items).totalPence);
    const lines = await stripe.checkout.sessions.listLineItems(session.id);
    assert.equal(lines.data.length,4);
    assert.equal(lines.data.at(-1).quantity,4);
    console.log(JSON.stringify({testMode:true,productLines:3,quantity:4,totalPence:session.amount_total,expectedTotal:quoteCart(items).totalPence,repeatSameSession:true,hubOrdersCreated:0}));
  } finally { if(session) await stripe.checkout.sessions.expire(session.id); await pg.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
