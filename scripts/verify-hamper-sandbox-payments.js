// Read-only verification plus replay of an already-processed genuine sandbox event.
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const pool = require('../src/db/pool');
const { HUB } = require('../src/services/hamperCheckout');
(async () => {
  if (!process.env.HAMPER_STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Sandbox key required');
  const stripe = new Stripe(process.env.HAMPER_STRIPE_SECRET_KEY);
  for (const id of process.argv.slice(2)) {
    const { rows: [order] } = await pool.query('SELECT * FROM hamper_orders WHERE id=$1', [id]);
    assert.equal(order.mode, 'sandbox'); assert.equal(order.status, 'paid');
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    assert.equal(session.livemode, false); assert.equal(session.payment_status, 'paid');
    assert.equal(session.amount_total, order.snapshot.totalPence);
    const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent, { expand: ['latest_charge'] });
    assert.equal(intent.status, 'succeeded');
    const { rows: events } = await pool.query('SELECT id FROM hamper_payment_events WHERE order_id=$1 AND type=$2', [id, 'checkout.session.completed']);
    assert.equal(events.length, 1);
    const event = await stripe.events.retrieve(events[0].id);
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.HAMPER_STRIPE_WEBHOOK_SECRET });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${HUB}/api/hamper-checkout/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
      assert.equal(response.status, 200);
    }
    const { rows: [count] } = await pool.query('SELECT count(*)::int AS n FROM hamper_payment_events WHERE id=$1', [event.id]);
    assert.equal(count.n, 1);
    console.log(JSON.stringify({ order: id, quantity: order.snapshot.quantity, totalPence: session.amount_total, stripeStatus: intent.status, storedStatus: order.status, authentication: intent.latest_charge.payment_method_details.card.three_d_secure?.result || 'not_required', duplicateWebhookRows: count.n }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
