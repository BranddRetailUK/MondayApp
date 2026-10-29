'use strict';

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function settings(env = process.env) {
  return {
    key: String(env.SENDGRID_API_KEY || '').trim(),
    from: String(env.SENDGRID_FROM_EMAIL || '').trim(),
    name: String(env.SENDGRID_FROM_NAME || 'Ultimate Promotions').trim(),
    replyTo: String(env.SENDGRID_REPLY_TO_EMAIL || env.SENDGRID_FROM_EMAIL || '').trim(),
    enabled: env.SENDGRID_SENDING_ENABLED === 'true',
    group: Number(env.SENDGRID_UNSUBSCRIBE_GROUP_ID || 0),
  };
}
function status(env = process.env) {
  const c = settings(env);
  return { configured: Boolean(c.key && emailPattern.test(c.from) && emailPattern.test(c.replyTo)),
    sendingEnabled: c.enabled, fromEmail: c.from, fromName: c.name, replyToEmail: c.replyTo,
    marketingGroupConfigured: Number.isInteger(c.group) && c.group > 0 };
}
async function sendMarketingEmail(input, { env = process.env, fetchImpl = fetch } = {}) {
  const c = settings(env);
  if (!status(env).configured) throw new Error('SendGrid is not configured');
  const sandbox = input.sandbox !== false;
  if (!sandbox && !c.enabled) throw new Error('Sending is disabled pending sender verification');
  if (!emailPattern.test(input.to || '')) throw new Error('One valid recipient email is required');
  if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 255 || /[\r\n]/.test(input.subject)) throw new Error('A valid subject is required');
  if (typeof input.html !== 'string' || !input.html.trim() || typeof input.text !== 'string' || !input.text.trim()) throw new Error('HTML and plain text content are required');
  if (Buffer.byteLength(input.html) + Buffer.byteLength(input.text) > 500000) throw new Error('Email content is too large');
  if (/\{\{[^}]+\}\}/.test(input.html + input.text) || /(?:src|href)\s*=\s*["'](?:assets\/|#|http:\/\/(?:localhost|127\.0\.0\.1))/i.test(input.html)) throw new Error('Replace preview placeholders and local links before sending');
  if (!sandbox && (!Number.isInteger(c.group) || c.group <= 0)) throw new Error('A marketing unsubscribe group is required');
  if (!sandbox && (!input.html.includes('<%asm_group_unsubscribe_raw_url%>') || !input.text.includes('<%asm_group_unsubscribe_raw_url%>'))) throw new Error('Include the SendGrid unsubscribe link in HTML and plain text');
  const payload = {
    personalizations: [{ to: [{ email: input.to }] }],
    from: { email: c.from, name: c.name }, reply_to: { email: c.replyTo, name: c.name },
    subject: input.subject.trim(), content: [{ type: 'text/plain', value: input.text }, { type: 'text/html', value: input.html }],
    categories: ['ultimate-promotions'],
    mail_settings: { sandbox_mode: { enable: sandbox } },
    tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
  };
  if (Number.isInteger(c.group) && c.group > 0) payload.asm = { group_id: c.group, groups_to_display: [c.group] };
  let response;
  try {
    response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST', headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
  } catch {
    // Do not retry: the provider may have accepted a live request before a timeout.
    throw new Error('SendGrid connection failed; delivery status is unknown. Do not automatically retry.');
  }
  const expected = sandbox ? 200 : 202;
  if (response.status !== expected) throw new Error(`SendGrid rejected the request (HTTP ${response.status})`);
  return { sandbox, accepted: !sandbox, validated: sandbox, messageId: response.headers.get('x-message-id') || null };
}
module.exports = { status, sendMarketingEmail };
