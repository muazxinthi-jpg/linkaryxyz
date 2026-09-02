CREATE TABLE IF NOT EXISTS profile_engagement_events (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  block_id TEXT REFERENCES profile_blocks(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('link_click')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_engagement_profile_created ON profile_engagement_events(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_engagement_block_created ON profile_engagement_events(block_id, created_at DESC);
