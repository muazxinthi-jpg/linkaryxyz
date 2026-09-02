CREATE TABLE IF NOT EXISTS partner_manager_collaborations (
  id TEXT PRIMARY KEY NOT NULL,
  manager_id TEXT NOT NULL REFERENCES partner_managers(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT REFERENCES campaigns(id),
  evidence_source TEXT NOT NULL DEFAULT 'manual' CHECK (evidence_source IN ('manual', 'tracked', 'verified')),
  spend_usd REAL CHECK (spend_usd IS NULL OR spend_usd >= 0),
  tracked_clicks INTEGER NOT NULL DEFAULT 0 CHECK (tracked_clicks >= 0),
  outcomes INTEGER NOT NULL DEFAULT 0 CHECK (outcomes >= 0),
  attributed_value_usd REAL NOT NULL DEFAULT 0 CHECK (attributed_value_usd >= 0),
  notes TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_manager_collaborations_manager
  ON partner_manager_collaborations(manager_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_manager_collaborations_organization
  ON partner_manager_collaborations(organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_manager_collaborations_campaign
  ON partner_manager_collaborations(campaign_id, occurred_at DESC);
