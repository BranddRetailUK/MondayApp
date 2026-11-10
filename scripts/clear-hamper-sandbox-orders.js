// Clears only sandbox hamper records after a private backup; keeps UUID-only tombstones for webhook retries.
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
const pool = require('../src/db/pool');
const { ACCOUNT } = require('../src/services/hamperCheckout');
const { ensureHamperTables } = require('../src/db/hamperSchema');
(async () => {
  if (!process.argv.includes('--confirm-clear-sandbox')) throw Error('Explicit --confirm-clear-sandbox is required');
  if (!process.env.HAMPER_STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Sandbox key required');
  const stripe = new Stripe(process.env.HAMPER_STRIPE_SECRET_KEY);
  if ((await stripe.accounts.retrieve()).id !== ACCOUNT) throw Error('Unexpected Stripe account');
  await ensureHamperTables(pool);
  const initial = await pool.query("SELECT stripe_session_id FROM hamper_orders WHERE mode='sandbox' AND stripe_session_id IS NOT NULL");
  for (const order of initial.rows) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (session.livemode) throw Error('Refusing live session');
    if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
  }
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('LOCK TABLE hamper_orders, hamper_payment_events IN EXCLUSIVE MODE');
    const { rows: orders } = await conn.query("SELECT * FROM hamper_orders WHERE mode='sandbox'");
    const { rows: events } = await conn.query("SELECT e.* FROM hamper_payment_events e JOIN hamper_orders o ON o.id=e.order_id WHERE o.mode='sandbox'");
    const dir = path.join(__dirname, '../output/hamper-order-backups');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const backup = path.join(dir, `sandbox-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backup, JSON.stringify({ orders, events }, null, 2), { mode: 0o600, flag: 'wx' });
    const saved = JSON.parse(fs.readFileSync(backup, 'utf8'));
    if (saved.orders.length !== orders.length || saved.events.length !== events.length) throw Error('Backup verification failed');
    await conn.query("INSERT INTO hamper_cleared_orders(id) SELECT id FROM hamper_orders WHERE mode='sandbox' ON CONFLICT DO NOTHING");
    await conn.query("DELETE FROM hamper_payment_events WHERE order_id IN (SELECT id FROM hamper_orders WHERE mode='sandbox')");
    await conn.query("DELETE FROM hamper_orders WHERE mode='sandbox'");
    await conn.query('COMMIT');
    const remaining = await pool.query("SELECT count(*)::int AS count FROM hamper_orders WHERE mode='sandbox'");
    console.log(JSON.stringify({ clearedOrders: orders.length, clearedEvents: events.length, remaining: remaining.rows[0].count, backup }));
  } catch (error) { await conn.query('ROLLBACK'); throw error; } finally { conn.release(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
