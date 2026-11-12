async function ensureEmailCampaignTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS hub_email_campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', html TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '',
      audience_review JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hub_email_recipients (
      campaign_id TEXT NOT NULL REFERENCES hub_email_campaigns(id), email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', message_id TEXT, sent_at TIMESTAMPTZ,
      PRIMARY KEY(campaign_id,email)
    );
    CREATE TABLE IF NOT EXISTS hub_email_events (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, email TEXT NOT NULL,
      event TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, reason TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(campaign_id,email) REFERENCES hub_email_recipients(campaign_id,email)
    );
    CREATE INDEX IF NOT EXISTS hub_email_events_campaign ON hub_email_events(campaign_id,event,email);
    ALTER TABLE hub_email_campaigns ADD COLUMN IF NOT EXISTS suppression_sync_at TIMESTAMPTZ;
    ALTER TABLE hub_email_campaigns ADD COLUMN IF NOT EXISTS sync_at TIMESTAMPTZ;
    ALTER TABLE hub_email_campaigns ADD COLUMN IF NOT EXISTS sync_error TEXT;
    ALTER TABLE hub_email_recipients ADD COLUMN IF NOT EXISTS tracking_batch TEXT;
    CREATE TABLE IF NOT EXISTS hub_email_batches (id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES hub_email_campaigns(id),polled_at TIMESTAMPTZ,poll_step INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS hub_email_suppressions (
      email TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(email,kind)
    );
  `);
}
module.exports = { ensureEmailCampaignTables };
