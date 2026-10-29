const { test } = require('node:test');
const assert = require('node:assert/strict');
const { status, sendMarketingEmail } = require('../src/services/sendgrid');
const env = { SENDGRID_API_KEY: 'secret-test', SENDGRID_FROM_EMAIL: 'sales@ultimatepromotions.co.uk' };
const input = { to: 'recipient@example.com', subject: 'Christmas gifts', html: '<p>Hello</p>', text: 'Hello' };
test('status never exposes the key and sending defaults off', () => {
  assert.equal(status(env).configured, true);
  assert.equal(status(env).sendingEnabled, false);
  assert.ok(!JSON.stringify(status(env)).includes('secret-test'));
});
test('validation defaults to sandbox and fixes sender, endpoint and tracking', async () => {
  const result = await sendMarketingEmail(input, { env, fetchImpl: async (url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(url, 'https://api.sendgrid.com/v3/mail/send');
    assert.equal(body.mail_settings.sandbox_mode.enable, true);
    assert.equal(body.from.email, env.SENDGRID_FROM_EMAIL);
    assert.equal(body.tracking_settings.click_tracking.enable, false);
    return { status: 200, headers: new Headers() };
  } });
  assert.equal(result.accepted, false);
  assert.equal(result.validated, true);
});
test('live sending requires switch, group and unsubscribe links', async () => {
  await assert.rejects(sendMarketingEmail({ ...input, sandbox: false }, { env }), /disabled/);
  const live = { ...env, SENDGRID_SENDING_ENABLED: 'true' };
  await assert.rejects(sendMarketingEmail({ ...input, sandbox: false }, { env: live }), /unsubscribe group/);
  live.SENDGRID_UNSUBSCRIBE_GROUP_ID = '123';
  await assert.rejects(sendMarketingEmail({ ...input, sandbox: false }, { env: live }), /unsubscribe link/);
  const link = '<%asm_group_unsubscribe_raw_url%>';
  const result = await sendMarketingEmail({ ...input, sandbox: false, html: `<a href="${link}">Unsubscribe</a>`, text: link }, { env: live, fetchImpl: async (_, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.asm.group_id, 123);
    assert.equal(body.mail_settings.sandbox_mode.enable, false);
    return { status: 202, headers: new Headers({ 'x-message-id': 'test-id' }) };
  } });
  assert.equal(result.messageId, 'test-id');
});
test('rejects preview assets, placeholders and invalid recipients', async () => {
  for (const html of ['<img src="assets/photo.jpg">', '{{ENQUIRY_URL}}', '<a href="#test">Test</a>']) await assert.rejects(sendMarketingEmail({ ...input, html }, { env }), /preview/);
  await assert.rejects(sendMarketingEmail({ ...input, to: 'bad' }, { env }), /recipient/);
});
test('provider failures are redacted and never retried', async () => {
  let calls = 0;
  await assert.rejects(sendMarketingEmail(input, { env, fetchImpl: async () => { calls++; throw new Error(env.SENDGRID_API_KEY); } }), /delivery status is unknown/);
  assert.equal(calls, 1);
});
