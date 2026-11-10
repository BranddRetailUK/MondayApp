// Run with Railway's UltimateHub environment. Never prints credentials.
const Stripe = require('stripe');
const { spawnSync } = require('child_process');
const { ACCOUNT, HUB } = require('../src/services/hamperCheckout');
(async () => {
  const key = process.env.HAMPER_STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new Error('A Stripe sandbox key is required');
  const stripe = new Stripe(key);
  const account = await stripe.accounts.retrieve();
  if (account.id !== ACCOUNT) throw new Error('Unexpected Stripe account');
  const url = `${HUB}/api/hamper-checkout/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find(item => item.url === url && item.status === 'enabled');
  if (endpoint && !process.env.HAMPER_STRIPE_WEBHOOK_SECRET) throw new Error('Endpoint exists but its secret is not configured; recover the secret in Stripe before continuing');
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({ url, description: 'Ultimate Hub hamper sandbox payments', enabled_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'], api_version: Stripe.API_VERSION });
    const result = spawnSync('railway', ['variable', 'set', 'HAMPER_STRIPE_WEBHOOK_SECRET', '--stdin', '--skip-deploys', '--project', 'b51fde69-eb1d-4b68-b772-a895c9676c31', '--environment', '25edd9ec-8cf4-499c-b136-da2a1828b1b6', '--service', 'a9e777a0-dec8-4c30-960c-b230138cc7d3'], { input: endpoint.secret, stdio: ['pipe', 'ignore', 'pipe'] });
    if (result.status !== 0) throw new Error('Could not save webhook secret to Railway');
  }
  const result = spawnSync('railway', ['variable', 'set', 'HAMPER_CHECKOUT_MODE=sandbox', 'HAMPER_DELIVERY_PENCE=725', '--skip-deploys', '--project', 'b51fde69-eb1d-4b68-b772-a895c9676c31', '--environment', '25edd9ec-8cf4-499c-b136-da2a1828b1b6', '--service', 'a9e777a0-dec8-4c30-960c-b230138cc7d3'], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (result.status !== 0) throw new Error('Could not save sandbox configuration');
  console.log(JSON.stringify({ account: account.id, endpoint: endpoint.id, mode: 'sandbox', deliveryPence: 725 }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
