// Provider integration smoke test. Creates sandbox checkout records only; no payment or fulfilment.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const pool = require('../src/db/pool');
const { ensureHamperTables } = require('../src/db/hamperSchema');
const { createService } = require('../src/services/hamperCheckout');
const Stripe = require('stripe');
(async () => {
  if (!process.env.HAMPER_STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Sandbox key required');
  await ensureHamperTables(pool);
  const service = createService({ db: pool });
  const stripe = new Stripe(process.env.HAMPER_STRIPE_SECRET_KEY);
  for (const quantity of [1, 10]) {
    const input = { requestId: crypto.randomUUID(), sku: 'H26002', quantity, delivery: { name: 'Sandbox Test Buyer', email: 'sandbox@example.com', line1: '10 Test Street', city: 'London', postcode: 'SW1A 1AA', mainland: true } };
    const result = await service.create(input);
    const repeat = await service.create(input);
    assert.deepEqual(result, repeat);
    const { rows: [order] } = await pool.query('SELECT stripe_session_id FROM hamper_orders WHERE id=$1', [result.id]);
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    assert.equal(session.livemode, false);
    assert.equal(session.amount_total, service.getQuote(input.sku, quantity).totalPence);
    console.log(JSON.stringify({ order: result.id, session: session.id, quantity, totalPence: session.amount_total, testMode: !session.livemode, retrySameSession: true }));
    await stripe.checkout.sessions.expire(session.id);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
