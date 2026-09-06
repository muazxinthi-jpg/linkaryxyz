CREATE TABLE IF NOT EXISTS project_growth_baselines (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL CHECK (metric_key IN ('x_followers', 'community_members', 'website_users', 'waitlist_members', 'signups', 'wallet_users')),
  metric_value REAL NOT NULL CHECK (metric_value >= 0),
  observed_at TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('founder_manual', 'provider_verified', 'telegram_verified', 'estimated')),
  source_url TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, metric_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_project_growth_baselines_org_metric
  ON project_growth_baselines(organization_id, metric_key, observed_at DESC);
