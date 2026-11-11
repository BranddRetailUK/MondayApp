// Configure the live webhook without switching checkout mode or printing secrets.
const Stripe = require('stripe');
const { spawnSync } = require('child_process');
const { HUB } = require('../src/services/hamperCheckout');
(async () => {
  const key = process.env.HAMPER_STRIPE_LIVE_SECRET_KEY?.trim();
  const accountId = process.env.HAMPER_STRIPE_LIVE_ACCOUNT_ID?.trim();
  if (!/^(sk|rk)_live_/.test(key || '') || !/^acct_[a-zA-Z0-9]+$/.test(accountId || '')) throw new Error('Populate the live Stripe key and account ID in Railway first');
  const stripe = new Stripe(key);
  const account = await stripe.accounts.retrieve();
  if (account.id !== accountId) throw new Error('Live Stripe account does not match the configured account ID');
  if (!account.charges_enabled || !account.details_submitted) throw new Error('Live Stripe account is not ready to accept payments');
  const url = `${HUB}/api/hamper-checkout/webhook`;
  const events = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'];
  let endpoint;
  for await (const item of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (item.url === url && item.status === 'enabled') { endpoint = item; break; }
  }
  if (endpoint && !process.env.HAMPER_STRIPE_LIVE_WEBHOOK_SECRET) throw new Error('Live webhook already exists. Add its signing secret to HAMPER_STRIPE_LIVE_WEBHOOK_SECRET in Railway');
  if (endpoint && (events.some(type => !endpoint.enabled_events.includes(type)) || endpoint.api_version !== Stripe.API_VERSION)) {
    throw new Error('Existing live webhook has different event settings or API version; inspect it before changing it');
  }
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({url,description:'Ultimate Hub live hamper payments',enabled_events:events,api_version:Stripe.API_VERSION},{idempotencyKey:`ultimate-hampers-live-webhook-${account.id}`});
    const result = spawnSync('railway',['variable','set','HAMPER_STRIPE_LIVE_WEBHOOK_SECRET','--stdin','--skip-deploys','--project','b51fde69-eb1d-4b68-b772-a895c9676c31','--environment','25edd9ec-8cf4-499c-b136-da2a1828b1b6','--service','a9e777a0-dec8-4c30-960c-b230138cc7d3'],{input:endpoint.secret,stdio:['pipe','ignore','pipe']});
    if(result.status !== 0) throw new Error('Webhook created but signing secret was not saved. Recover it from Stripe before continuing');
  }
  console.log(JSON.stringify({account:account.id,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,endpoint:endpoint.id,modeChanged:false}));
})().catch(error=>{console.error(error.type || error.message);process.exitCode=1;});
