-- Daily public/connected social metric snapshots used by authenticated Analytics.
-- The payload stores normalized metrics only; provider credentials and raw responses are never persisted.
CREATE TABLE IF NOT EXISTS social_provider_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x','telegram','youtube','instagram','tiktok','linkedin')),
  snapshot_date TEXT NOT NULL,
  audience INTEGER CHECK (audience IS NULL OR audience >= 0),
  impressions INTEGER CHECK (impressions IS NULL OR impressions >= 0),
  engagements INTEGER CHECK (engagements IS NULL OR engagements >= 0),
  link_clicks INTEGER CHECK (link_clicks IS NULL OR link_clicks >= 0),
  metrics_json TEXT NOT NULL DEFAULT '{}',
  provider_account_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(profile_id, platform, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_social_provider_snapshots_profile_date
  ON social_provider_snapshots(profile_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_social_provider_snapshots_platform_date
  ON social_provider_snapshots(profile_id, platform, snapshot_date DESC);
