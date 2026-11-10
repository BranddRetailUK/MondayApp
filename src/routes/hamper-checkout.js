const express = require('express');
const crypto = require('crypto');
const { createService, CheckoutError, HUB, SITE } = require('../services/hamperCheckout');
function createRoutes(db, options = {}) {
  const service = createService({ db, ...options });
  const router = express.Router();
  const handle = fn => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await fn(req, res); }
    catch (e) {
      if (!(e instanceof CheckoutError)) console.error('[hamper-checkout]', e.type || e.name, e.code || 'request-failed');
      res.status(e.status || 503).json({ error: e instanceof CheckoutError ? e.message : 'Checkout is temporarily unavailable. Please try again or contact our team.' });
    }
  };
  router.get('/catalogue', handle(async (_req, res) => { res.set('Access-Control-Allow-Origin', SITE); res.json(service.catalogue()); }));
  router.post('/quote', handle(async (req, res) => res.json({ ...service.getCartQuote(req.body.items), available: service.configured() })));
  router.get('/quote', handle(async (req, res) => {
    res.json({ ...service.getQuote(req.query.sku, Number(req.query.quantity)), available: service.configured() });
  }));
  router.get('/orders/:id', handle(async (req, res) => res.json(await service.status(req.params.id))));
  router.post('/sessions', handle(async (req, res) => {
    if (req.get('origin') && req.get('origin') !== HUB) throw new CheckoutError('Please use the checkout page to place your order.', 403);
    const key = crypto.createHash('sha256').update(`hamper:${req.ip}`).digest('hex');
    await db.query('DELETE FROM hamper_checkout_limits WHERE expires_at < NOW()');
    const { rows: [bucket] } = await db.query(`INSERT INTO hamper_checkout_limits(key,count,expires_at) VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET count=hamper_checkout_limits.count+1 RETURNING count`, [key]);
    if (bucket.count > 25) throw new CheckoutError('Please wait a few minutes before trying checkout again.', 429);
    res.json(await service.create(req.body));
  }));
  return {
    router,
    webhook: handle(async (req, res) => { await service.webhook(req.body, req.get('stripe-signature')); res.json({ received: true }); }),
    admin: handle(async (_req, res) => {
      const { rows } = await db.query('SELECT id,status,snapshot,delivery,stripe_session_id,stripe_payment_intent,created_at,updated_at FROM hamper_orders ORDER BY created_at DESC LIMIT 200');
      res.json({ orders: rows, mode: 'sandbox' });
    })
  };
}
module.exports = { createRoutes };
