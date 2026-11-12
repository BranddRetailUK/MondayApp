'use strict';
const crypto = require('node:crypto');
const EVENTS = new Set(['processed','delivered','open','click','bounce','blocked','dropped','deferred','spamreport','unsubscribe','group_unsubscribe']);
function verifySignature(body, signature, timestamp, key) {
  if (!Buffer.isBuffer(body) || !signature || !/^\d+$/.test(timestamp || '') || !key) return false;
  try {
    const publicKey = key.includes('BEGIN PUBLIC KEY') ? key : { key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' };
    return crypto.verify('sha256', Buffer.concat([Buffer.from(timestamp), body]), publicKey, Buffer.from(signature, 'base64'));
  } catch { return false; }
}
function suppressionKind(event) {
  if (['unsubscribe', 'group_unsubscribe'].includes(event.event)) return 'unsubscribed';
  if (event.event === 'spamreport') return 'complaint';
  // A policy block or full inbox does not prove that a mailbox is dead.
  if (event.event === 'bounce' && event.type !== 'blocked' && (event.bounce_classification === 'Invalid Address' || /^5\.1\.[1236](?:\s|$)/.test(event.status || ''))) return 'invalid';
  if (['bounce','blocked','dropped'].includes(event.event)) return 'undeliverable';
  return null;
}
async function recordEvents(db, events) {
  let recorded = 0;
  for (const e of events) {
    const campaign = e.ultimate_campaign_id, email = String(e.email || '').trim().toLowerCase();
    if (!EVENTS.has(e.event) || typeof campaign !== 'string' || !email || !e.sg_event_id || !Number.isFinite(e.timestamp) || Math.abs(e.timestamp) > 8640000000000) continue;
    // Only our campaign AND enrolled recipient can affect our records, even on the shared account.
    const recipient = await db.query('SELECT 1 FROM hub_email_recipients WHERE campaign_id=$1 AND email=$2', [campaign,email]);
    if (!recipient.rows.length) continue;
    const reason = String(e.reason || e.response || '').slice(0,1000);
    const kind = suppressionKind(e);
    // One statement ensures event deduplication and suppression updates commit together.
    const result = await db.query(`WITH inserted AS (
      INSERT INTO hub_email_events(id,campaign_id,email,event,occurred_at,reason)
      VALUES($1,$2,$3,$4,to_timestamp($5),$6) ON CONFLICT DO NOTHING RETURNING id
    ), suppressed AS (
      INSERT INTO hub_email_suppressions(email,kind,reason,source,occurred_at)
      SELECT $3,$7,$6,'sendgrid_webhook',to_timestamp($5) FROM inserted WHERE $7::text IS NOT NULL
      ON CONFLICT(email,kind) DO UPDATE SET reason=EXCLUDED.reason,occurred_at=GREATEST(hub_email_suppressions.occurred_at,EXCLUDED.occurred_at)
    ) SELECT id FROM inserted`, [String(e.sg_event_id),campaign,email,e.event,e.timestamp,reason,kind]);
    recorded += result.rows.length;
  }
  return recorded;
}
async function overview(db) {
  const campaigns = await db.query(`SELECT c.id,c.name,c.subject,c.status,c.created_at,c.audience_review,c.sync_at,c.sync_error,
    (SELECT COUNT(*)::int FROM hub_email_recipients r WHERE r.campaign_id=c.id) AS audience,
    (SELECT COUNT(*)::int FROM hub_email_recipients r WHERE r.campaign_id=c.id AND r.sent_at IS NOT NULL) AS submitted,
    COALESCE((SELECT jsonb_object_agg(event,total) FROM (
      SELECT CASE WHEN event IN ('unsubscribe','group_unsubscribe') THEN 'unsubscribe_count' ELSE event END AS event,COUNT(DISTINCT email)::int AS total FROM hub_email_events WHERE campaign_id=c.id GROUP BY 1
    ) metrics),'{}') AS metrics FROM hub_email_campaigns c ORDER BY c.created_at DESC`);
  const last = await db.query('SELECT MAX(occurred_at) AS latest FROM hub_email_events');
  return { campaigns: campaigns.rows, latestEvent: last.rows[0].latest };
}
module.exports = { verifySignature, suppressionKind, recordEvents, overview };
