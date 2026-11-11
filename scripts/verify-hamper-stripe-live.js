// Live API configuration check with a temporary DB. Creates and expires an unpaid
// session; never submits payment or creates a Hub order.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Stripe = require('stripe');
const { PGlite } = require('@electric-sql/pglite');
const { createService, quoteCart } = require('../src/services/hamperCheckout');
const { ensureHamperTables } = require('../src/db/hamperSchema');
(async () => {
  if (!/^(sk|rk)_live_/.test(process.env.HAMPER_STRIPE_LIVE_SECRET_KEY?.trim() || '')) throw Error('Live key required');
  const pg = new PGlite();
  const db = { query: async (sql, params) => !params && sql.includes('CREATE TABLE') ? pg.exec(sql) : pg.query(sql, params) };
  await ensureHamperTables(db);
  const stripe = new Stripe(process.env.HAMPER_STRIPE_LIVE_SECRET_KEY.trim());
  const proxy = { accounts: stripe.accounts, taxRates: stripe.taxRates, checkout: { sessions: {
    create: (params, options) => stripe.checkout.sessions.create({ ...params, metadata: { ...params.metadata, integration: 'ultimate-hampers-live-verification' } }, options),
    expire: id => stripe.checkout.sessions.expire(id)
  } } };
  const service = createService({ db, stripe: proxy, env: { ...process.env, HAMPER_CHECKOUT_MODE: 'live' } });
  let session;
  try {
    const items = [{sku:'H26002',quantity:2},{sku:'H26063',quantity:1},{sku:'H26001',quantity:1}];
    const input = {requestId:crypto.randomUUID(),items,delivery:{name:'Checkout Configuration Check',email:'checkout-verification@example.com',line1:'10 Test Street',city:'London',postcode:'SW1A 1AA',mainland:true}};
    const result = await service.create(input);
    const record = await db.query('SELECT stripe_session_id FROM hamper_orders WHERE id=$1',[result.id]);
    session = await stripe.checkout.sessions.retrieve(record.rows[0].stripe_session_id);
    const repeat = await service.create(input); assert.equal(result.url,repeat.url);
    assert.equal(session.livemode,true);assert.equal(session.amount_total,quoteCart(items).totalPence);
    const lines = await stripe.checkout.sessions.listLineItems(session.id);
    assert.equal(lines.data.length,4);
    assert.equal(lines.data.at(-1).quantity,4);
    console.log(JSON.stringify({liveMode:true,paid:false,productLines:3,quantity:4,totalPence:session.amount_total,expectedTotal:quoteCart(items).totalPence,repeatSameSession:true,hubOrdersCreated:0}));
  } finally { if(session) { const expired = await stripe.checkout.sessions.expire(session.id); assert.equal(expired.status, 'expired'); console.log(JSON.stringify({sessionExpired:true})); } await pg.close(); }
})().catch(error=>{console.error(error.type || error.message);process.exitCode=1;});
