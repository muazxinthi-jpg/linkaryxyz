CREATE TABLE IF NOT EXISTS conversion_events (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT REFERENCES campaigns(id),
  activity_id TEXT REFERENCES campaign_activities(id),
  tracked_link_id TEXT REFERENCES tracked_links(id),
  external_event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  value_usd REAL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'linkary_tracked', 'telegram_verified', 'provider_verified')),
  attribution_confidence TEXT NOT NULL DEFAULT 'tracked' CHECK (attribution_confidence IN ('manual', 'tracked', 'correlated', 'verified')),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id, external_event_key)
);
CREATE INDEX IF NOT EXISTS idx_conversion_events_campaign ON conversion_events(campaign_id, occurred_at DESC);
