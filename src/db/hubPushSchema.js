const { TEST_DASHBOARD_COLUMN_IDS: C } = require('../services/testDashboardDefaults');
// Durable fanout is created in the same transaction as the underlying business event.
async function ensureHubPushTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS hub_push_subscriptions (
      endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES hub_sessions(id) ON DELETE CASCADE,
      subscription JSONB NOT NULL, preferences JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_test_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS hub_push_events (event_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS hub_push_deliveries (
      id BIGSERIAL PRIMARY KEY, endpoint TEXT NOT NULL REFERENCES hub_push_subscriptions(endpoint) ON DELETE CASCADE,
      kind TEXT NOT NULL, event_key TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(endpoint,event_key)
    );
    INSERT INTO hub_push_events(event_key) SELECT 'proof:' || id FROM proof_design_jobs WHERE proof_ready ON CONFLICT DO NOTHING;
    CREATE INDEX IF NOT EXISTS hub_push_delivery_due ON hub_push_deliveries(available_at);
    CREATE OR REPLACE FUNCTION enqueue_hub_push() RETURNS TRIGGER AS $$
    DECLARE kind TEXT; push_event_key TEXT;
    BEGIN
      IF TG_TABLE_NAME = 'database_job_status_updates' THEN
        IF NEW.event_type = 'approved' THEN kind := 'approved';
        ELSIF NEW.event_type = 'status' AND upper(trim(NEW.status)) = 'COMPLETED' THEN kind := 'completed';
        ELSE RETURN NEW; END IF;
        push_event_key := 'activity:' || NEW.id;
      ELSE
        IF NOT NEW.proof_ready THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' THEN
          IF OLD.proof_ready OR OLD.revision > 0 THEN RETURN NEW; END IF;
        END IF;
        kind := 'proof'; push_event_key := 'proof:' || NEW.id;
      END IF;
      INSERT INTO hub_push_events(event_key) VALUES(push_event_key) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN RETURN NEW; END IF;
      INSERT INTO hub_push_deliveries(endpoint,kind,event_key)
        SELECT p.endpoint,kind,push_event_key FROM hub_push_subscriptions p
        JOIN hub_sessions s ON s.id=p.session_id AND s.expires_at>now()
        JOIN hub_users u ON u.id=p.user_id AND u.access_scope='full'
        WHERE p.preferences->>kind='true'
        ON CONFLICT DO NOTHING;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS hub_push_job_activity ON database_job_status_updates;
    CREATE TRIGGER hub_push_job_activity AFTER INSERT ON database_job_status_updates
      FOR EACH ROW EXECUTE FUNCTION enqueue_hub_push();
    CREATE SEQUENCE IF NOT EXISTS hub_push_private_event_seq;
    CREATE OR REPLACE FUNCTION enqueue_hub_private_push() RETURNS TRIGGER AS $$
    DECLARE kind TEXT; event_key TEXT;
    BEGIN
      -- Linked production rows notify through the aggregate DATABASE parent.
      IF NEW.archived OR EXISTS(SELECT 1 FROM dashboard_production_jobs WHERE dashboard_job_id=NEW.id) THEN RETURN NEW; END IF;
      FOREACH kind IN ARRAY ARRAY['completed','approved'] LOOP
        IF (kind='completed' AND upper(trim(COALESCE(NEW.column_values->'${C.STATUS}'->>'text','')))='COMPLETED'
            AND upper(trim(COALESCE(OLD.column_values->'${C.STATUS}'->>'text','')))<>'COMPLETED') OR
           (kind='approved' AND lower(COALESCE(NEW.column_values->'${C.JOB}'->>'text','')) IN ('v','✓','true','checked')
            AND lower(COALESCE(OLD.column_values->'${C.JOB}'->>'text','')) NOT IN ('v','✓','true','checked')) THEN
          event_key := 'private:' || nextval('hub_push_private_event_seq');
          INSERT INTO hub_push_deliveries(endpoint,kind,event_key)
            SELECT p.endpoint,kind,event_key FROM hub_push_subscriptions p
            JOIN hub_sessions s ON s.id=p.session_id AND s.expires_at>now()
            JOIN hub_users u ON u.id=p.user_id AND u.access_scope='full'
            WHERE p.preferences->>kind='true';
        END IF;
      END LOOP;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS hub_push_private_activity ON test_dashboard_private_jobs;
    CREATE TRIGGER hub_push_private_activity AFTER UPDATE OF column_values ON test_dashboard_private_jobs
      FOR EACH ROW EXECUTE FUNCTION enqueue_hub_private_push();
    DROP TRIGGER IF EXISTS hub_push_proof_created ON proof_design_jobs;
    CREATE TRIGGER hub_push_proof_created AFTER INSERT OR UPDATE OF proof_ready ON proof_design_jobs
      FOR EACH ROW EXECUTE FUNCTION enqueue_hub_push();
  `);
}
module.exports = { ensureHubPushTables };
