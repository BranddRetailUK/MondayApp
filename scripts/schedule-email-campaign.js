#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { audience, suppressions, importSuppressions, providerGet } = require('../src/services/emailCampaignDelivery');
const { scheduleMarketingBatch, status } = require('../src/services/sendgrid');

const BATCH_SIZE = 500;
const CANCELLATION_MARGIN_MS = 11 * 60 * 1000;
const CAMPAIGN_LOCK = 73104262;

function loadCampaign(args) {
  const [manifestPath, date, send, consent] = args;
  if (!manifestPath || !date || send !== '--schedule' || consent !== '--consent-confirmed' || args.length !== 4) {
    throw new Error('Usage: node scripts/schedule-email-campaign.js <manifest.json> <ISO timestamp> --schedule --consent-confirmed');
  }
  const scheduledAt = new Date(date);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(date) || !Number.isFinite(scheduledAt.getTime())) {
    throw new Error('Use an ISO timestamp with an explicit time zone.');
  }
  const remaining = scheduledAt.getTime() - Date.now();
  if (remaining <= CANCELLATION_MARGIN_MS || remaining > 72 * 60 * 60 * 1000) {
    throw new Error('The schedule must be within 72 hours and leave time to cancel an incomplete queue.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!/^[a-z0-9-]{1,100}$/.test(manifest.id || '') || !manifest.name || !manifest.subject ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(manifest.from || '')) {
    throw new Error('The campaign manifest needs an ID, name, subject and From address.');
  }
  const dir = path.dirname(path.resolve(manifestPath));
  const html = fs.readFileSync(path.join(dir, manifest.html), 'utf8');
  const text = fs.readFileSync(path.join(dir, manifest.text), 'utf8');
  if (!html.includes('<%asm_group_unsubscribe_raw_url%>') || !text.includes('<%asm_group_unsubscribe_raw_url%>')) {
    throw new Error('Both campaign formats need the marketing unsubscribe link.');
  }
  return { ...manifest, html, text, scheduledAt, sendAt: scheduledAt.getTime() / 1000 };
}

async function providerPost(endpoint, env, body) {
  return fetch('https://api.sendgrid.com' + endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
}

async function prepare(client, campaign, addressList, provider, env) {
  const local = (await client.query('SELECT email,kind FROM hub_email_suppressions')).rows;
  const blocked = new Set([...local, ...provider].map(entry => entry.email));
  const optedOut = new Set([...local, ...provider].filter(entry => entry.kind === 'unsubscribed').map(entry => entry.email));
  const recipients = addressList.emails.filter(email => !blocked.has(email));
  if (!recipients.length) throw new Error('There are no eligible marketing recipients.');

  const response = await providerPost('/v3/mail/batch', env);
  if (!response.ok) throw new Error(`SendGrid could not create a scheduling batch (HTTP ${response.status}).`);
  const { batch_id: providerBatchId } = await response.json();
  const incoming = {
    subject: campaign.subject, html: campaign.html, text: campaign.text,
    campaignId: campaign.id, sendAt: campaign.sendAt, providerBatchId,
  };
  await scheduleMarketingBatch({
    ...incoming, recipients: [campaign.from], batchId: campaign.id + '-0', sandbox: true,
  }, { env });
  const review = {
    uniqueValid: addressList.emails.length, malformed: addressList.invalid.length,
    excluded: addressList.emails.length - recipients.length,
    unsubscribed: addressList.emails.filter(email => optedOut.has(email)).length,
    consent: 'User confirmed all campaign recipients are approved for marketing.',
    scheduledAt: campaign.scheduledAt.toISOString(), providerBatchId, from: campaign.from,
    siteClickTracking: campaign.siteClickTracking === true,
  };
  const batches = [];
  await client.query('BEGIN');
  try {
    await importSuppressions(client, provider, new Set(addressList.emails));
    await client.query(`INSERT INTO hub_email_campaigns (id,name,subject,html,body_text,audience_review,status)
      VALUES ($1,$2,$3,$4,$5,$6,'scheduling')`, [campaign.id, campaign.name, campaign.subject, campaign.html, campaign.text, review]);
    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const batchId = campaign.id + '-' + batches.length;
      await client.query('INSERT INTO hub_email_batches (id,campaign_id) VALUES ($1,$2)', [batchId, campaign.id]);
      await client.query(`INSERT INTO hub_email_recipients (campaign_id,email,tracking_batch)
        SELECT $1,unnest($2::text[]),$3`, [campaign.id, recipients.slice(start, start + BATCH_SIZE), batchId]);
      batches.push(batchId);
    }
    const { rows: [snapshot] } = await client.query('SELECT COUNT(*)::int AS count FROM hub_email_recipients WHERE campaign_id=$1', [campaign.id]);
    if (snapshot.count !== recipients.length) throw new Error('The saved audience did not match the approved snapshot.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return { batches, incoming, review, initialCount: recipients.length };
}

async function queueCampaign(db, client, campaign, state, env) {
  let accepted = 0;
  let attempted = false;
  try {
    for (const batchId of state.batches) {
      const { rows } = await client.query(`UPDATE hub_email_recipients r SET status='scheduling'
        WHERE campaign_id=$1 AND tracking_batch=$2 AND status='pending'
        AND NOT EXISTS (SELECT 1 FROM hub_email_suppressions s WHERE s.email=r.email)
        RETURNING email`, [campaign.id, batchId]);
      if (!rows.length) continue;
      if (campaign.scheduledAt.getTime() - Date.now() <= CANCELLATION_MARGIN_MS) {
        throw new Error('The provider cancellation deadline is too close to queue another batch.');
      }
      attempted = true;
      const result = await scheduleMarketingBatch({
        ...state.incoming, recipients: rows.map(row => row.email), batchId, sandbox: false,
      }, { env });
      const saved = await client.query(`UPDATE hub_email_recipients SET status='sent',message_id=$3,sent_at=$4
        WHERE campaign_id=$1 AND tracking_batch=$2 AND status='scheduling'`,
      [campaign.id, batchId, result.messageId, campaign.scheduledAt]);
      if (saved.rowCount !== rows.length) throw new Error('The provider receipt could not be reconciled to the audience.');
      accepted += saved.rowCount;
    }
    await client.query(`UPDATE hub_email_recipients SET status='excluded'
      WHERE campaign_id=$1 AND status='pending'`, [campaign.id]);
    const excluded = state.review.excluded + state.initialCount - accepted;
    await client.query(`UPDATE hub_email_campaigns SET status=$2,
      audience_review=audience_review || jsonb_build_object('excluded',$3::int,'scheduledRecipients',$4::int)
      WHERE id=$1`, [campaign.id, accepted ? 'scheduled' : 'cancelled', excluded, accepted]);
    console.log(JSON.stringify({
      campaignId: campaign.id, scheduledAt: state.review.scheduledAt, from: campaign.from,
      accepted, excluded, unsubscribed: state.review.unsubscribed, malformed: state.review.malformed,
    }));
  } catch (error) {
    let cancelled = !attempted;
    if (attempted) {
      const response = await providerPost('/v3/user/scheduled_sends', env, {
        batch_id: state.incoming.providerBatchId, status: 'cancel',
      }).catch(() => null);
      cancelled = response?.status === 201;
    }
    const campaignError = cancelled
      ? 'The scheduled send was cancelled because the complete audience could not be queued.'
      : 'The scheduled send needs review. SendGrid did not confirm cancellation.';
    if (cancelled) {
      await db.query(`UPDATE hub_email_recipients SET status='cancelled',sent_at=NULL
        WHERE campaign_id=$1`, [campaign.id]);
    }
    await db.query('UPDATE hub_email_campaigns SET status=$2,sync_error=$3 WHERE id=$1',
      [campaign.id, cancelled ? 'cancelled' : 'schedule_uncertain', campaignError]);
    throw new Error(`${campaignError} ${error.message}`);
  }
}

async function main() {
  const campaign = loadCampaign(process.argv.slice(2));
  const env = {
    ...process.env,
    SENDGRID_FROM_EMAIL: campaign.from,
    SENDGRID_REPLY_TO_EMAIL: campaign.replyTo || campaign.from,
    SENDGRID_SENDING_ENABLED: 'true',
  };
  const sender = status(env);
  if (!sender.configured || !sender.marketingGroupConfigured || env.SENDGRID_CAMPAIGN_POLL_ENABLED !== 'true') {
    throw new Error('The verified sender, marketing unsubscribe group and campaign tracking must be configured.');
  }
  const db = new Pool({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  let client;
  try {
    client = await db.connect();
    if (!(await client.query('SELECT pg_try_advisory_lock($1) AS locked', [CAMPAIGN_LOCK])).rows[0].locked) {
      throw new Error('Another campaign operation is running.');
    }
    if ((await client.query('SELECT 1 FROM hub_email_campaigns WHERE id=$1', [campaign.id])).rows.length) {
      throw new Error('This campaign ID already exists. Review its current state before making another attempt.');
    }
    const [list, provider] = await Promise.all([audience(client), suppressions(env), providerGet('/v3/messages?limit=1', env)]);
    const state = await prepare(client, campaign, list, provider, env);
    await queueCampaign(db, client, campaign, state, env);
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock($1)', [CAMPAIGN_LOCK]).catch(() => {});
      client.release();
    }
    await db.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
