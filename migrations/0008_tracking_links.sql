CREATE TABLE IF NOT EXISTS tracked_links (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT REFERENCES campaigns(id),
  activity_id TEXT REFERENCES campaign_activities(id),
  code TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracked_link_clicks (
  id TEXT PRIMARY KEY NOT NULL,
  tracked_link_id TEXT NOT NULL REFERENCES tracked_links(id),
  visitor_id_hash TEXT,
  referrer_host TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracked_links_activity ON tracked_links(activity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_link_clicks_link ON tracked_link_clicks(tracked_link_id, occurred_at DESC);
