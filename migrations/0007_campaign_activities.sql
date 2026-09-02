CREATE TABLE IF NOT EXISTS campaign_activities (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('creator_content', 'community_placement', 'website', 'video', 'other')),
  destination_url TEXT,
  planned_cost_usd REAL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'live', 'completed', 'cancelled')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_activities_campaign ON campaign_activities(campaign_id, created_at DESC);
