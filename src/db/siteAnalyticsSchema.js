async function ensureSiteAnalyticsTables(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS hub_site_analytics_config (id INTEGER PRIMARY KEY CHECK(id=1),started_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 INSERT INTO hub_site_analytics_config(id) VALUES(1) ON CONFLICT DO NOTHING;
 CREATE TABLE IF NOT EXISTS hub_site_events (
  id UUID PRIMARY KEY, page_id UUID NOT NULL, event TEXT NOT NULL, path TEXT NOT NULL,
  sku TEXT, source TEXT NOT NULL, device TEXT NOT NULL, landing BOOLEAN NOT NULL DEFAULT FALSE,
  quantity INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS hub_site_events_date ON hub_site_events(created_at);
 CREATE INDEX IF NOT EXISTS hub_site_events_page ON hub_site_events(page_id,event);
 `);
}
module.exports={ensureSiteAnalyticsTables};
