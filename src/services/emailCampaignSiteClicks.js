'use strict';

const { createHash } = require('node:crypto');
const { storefrontPath } = require('./siteAnalytics');

async function rememberSiteClickMessages(db, batch, messages) {
  const candidates = messages
    .filter(m => typeof m.to_email === 'string' && typeof m.msg_id === 'string' &&
      m.msg_id.length > 0 && m.msg_id.length <= 512 && Number.isSafeInteger(m.clicks_count) &&
      m.clicks_count > 0 && m.clicks_count <= 2147483647)
    .map(m => ({ email: m.to_email.trim().toLowerCase(), message_id: m.msg_id, clicks: m.clicks_count }));
  if (!candidates.length) return;
  await db.query(`WITH candidates AS (
    SELECT DISTINCT ON (email) email,message_id,clicks
    FROM jsonb_to_recordset($3::jsonb) AS m(email text,message_id text,clicks integer)
    ORDER BY email,clicks DESC,message_id
  )
  UPDATE hub_email_recipients r SET site_click_message_id=m.message_id,
    site_click_reported=GREATEST(r.site_click_reported,m.clicks)
  FROM candidates m
  WHERE r.campaign_id=$1 AND r.tracking_batch=$2 AND r.email=m.email
    AND r.status='sent' AND r.sent_at<=NOW()
    AND (r.site_click_message_id IS NULL OR r.site_click_message_id=m.message_id)`,
  [batch.campaign_id,batch.id,JSON.stringify(candidates)]);
}

async function refreshSiteClick(db, getProviderDetails) {
  // Called under the activity poller's cross-replica lock. The persisted timestamp
  // leaves room in SendGrid's shared request budget and rotates failed lookups.
  const { rows: [recipient] } = await db.query(`WITH next AS (
    SELECT r.campaign_id,r.email FROM hub_email_recipients r
    JOIN hub_email_campaigns c ON c.id=r.campaign_id
    WHERE c.audience_review @> '{"siteClickTracking":true}' AND r.status='sent'
      AND r.sent_at BETWEEN NOW()-INTERVAL '30 days' AND NOW()
      AND r.site_click_message_id IS NOT NULL AND r.site_click_reported>r.site_click_verified
      AND NOT EXISTS (SELECT 1 FROM hub_email_recipients WHERE site_click_checked_at>NOW()-INTERVAL '30 seconds')
    ORDER BY r.site_click_checked_at NULLS FIRST,r.tracking_batch,r.email LIMIT 1
  )
  UPDATE hub_email_recipients r SET site_click_checked_at=NOW()
  FROM next WHERE r.campaign_id=next.campaign_id AND r.email=next.email
  RETURNING r.campaign_id,r.email,r.tracking_batch,r.sent_at,r.site_click_message_id`);
  if (!recipient) return 0;

  const detail = await getProviderDetails('/v3/messages/' + encodeURIComponent(recipient.site_click_message_id));
  const args = typeof detail.unique_args === 'string' ? JSON.parse(detail.unique_args) : detail.unique_args;
  if (detail.msg_id !== recipient.site_click_message_id ||
      String(detail.to_email || '').trim().toLowerCase() !== recipient.email ||
      args?.ultimate_campaign_id !== recipient.campaign_id ||
      args?.ultimate_batch_id !== recipient.tracking_batch || !Array.isArray(detail.events)) {
    throw new Error('Unexpected campaign message details.');
  }

  const clickEvents = detail.events.filter(event => event.event_name === 'click' || event.event_name === 'clicked');
  const occurrences = new Map();
  const verified = [];
  const sentAt = new Date(recipient.sent_at).getTime();
  for (const event of clickEvents) {
    const path = storefrontPath(event.url);
    const time = Date.parse(event.processed);
    if (!path || !Number.isFinite(time) || time < sentAt) continue;
    const key = JSON.stringify([recipient.site_click_message_id,path,time]);
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key,occurrence);
    verified.push({
      id: createHash('sha256').update(key + ':' + occurrence).digest('hex'),
      path, occurred_at: new Date(time).toISOString(),
    });
  }
  await db.query(`WITH saved AS (
    INSERT INTO hub_email_site_clicks(id,campaign_id,email,path,occurred_at)
    SELECT e.id,$1,$2,e.path,e.occurred_at
    FROM jsonb_to_recordset($3::jsonb) AS e(id text,path text,occurred_at timestamptz)
    ON CONFLICT DO NOTHING
  )
  UPDATE hub_email_recipients SET site_click_verified=GREATEST(site_click_verified,$4)
  WHERE campaign_id=$1 AND email=$2`,
  [recipient.campaign_id,recipient.email,JSON.stringify(verified),clickEvents.length]);
  return verified.length;
}

module.exports = { rememberSiteClickMessages, refreshSiteClick };
