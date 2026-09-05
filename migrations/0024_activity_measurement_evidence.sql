PRAGMA foreign_keys = ON;

-- Measurement & Attribution V1.
-- Keeps published deliverables and reported/provider performance attached to the
-- existing Project -> Campaign -> Activity evidence chain.

CREATE TABLE IF NOT EXISTS campaign_activity_deliverables (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  activity_id TEXT NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'telegram', 'youtube', 'article', 'website', 'other')),
  content_url TEXT NOT NULL,
  published_at TEXT,
  evidence_state TEXT NOT NULL DEFAULT 'submitted' CHECK (evidence_state IN ('submitted', 'accepted', 'rejected')),
  submitted_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_deliverables_activity
  ON campaign_activity_deliverables(activity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_deliverables_campaign
  ON campaign_activity_deliverables(campaign_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_deliverables_exact_url
  ON campaign_activity_deliverables(activity_id, content_url);

CREATE TABLE IF NOT EXISTS campaign_activity_metrics (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  activity_id TEXT NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
  deliverable_id TEXT NOT NULL REFERENCES campaign_activity_deliverables(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value REAL NOT NULL CHECK (metric_value >= 0),
  provenance TEXT NOT NULL CHECK (provenance IN ('creator_manual', 'partner_manual', 'founder_manual', 'linkary_first_party', 'telegram_verified', 'provider_verified', 'estimated')),
  observed_at TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(deliverable_id, metric_key, provenance)
);

CREATE INDEX IF NOT EXISTS idx_activity_metrics_activity
  ON campaign_activity_metrics(activity_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_metrics_campaign
  ON campaign_activity_metrics(campaign_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_metrics_deliverable
  ON campaign_activity_metrics(deliverable_id, updated_at DESC);
