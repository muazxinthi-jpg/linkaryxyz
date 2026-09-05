-- Linkary Actual Spend Ledger V1
-- Budget and planned cost are planning fields. This ledger records actual incurred cost
-- so ROI, CPA and cost-efficiency metrics are not calculated from budget estimates.

CREATE TABLE IF NOT EXISTS campaign_cost_entries (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  activity_id TEXT REFERENCES campaign_activities(id) ON DELETE SET NULL,
  cost_type TEXT NOT NULL DEFAULT 'partner' CHECK (cost_type IN ('partner', 'media', 'platform', 'agency', 'other')),
  amount_original REAL NOT NULL CHECK (amount_original >= 0),
  currency TEXT NOT NULL,
  usd_equivalent REAL NOT NULL CHECK (usd_equivalent >= 0),
  provenance TEXT NOT NULL DEFAULT 'founder_manual' CHECK (provenance IN ('founder_manual', 'provider_verified')),
  note TEXT NOT NULL DEFAULT '',
  incurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  voided_by_user_id TEXT REFERENCES users(id),
  voided_at TEXT,
  void_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaign_cost_entries_campaign
  ON campaign_cost_entries(campaign_id, status, incurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_cost_entries_activity
  ON campaign_cost_entries(activity_id, status, incurred_at DESC)
  WHERE activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_cost_entries_organization
  ON campaign_cost_entries(organization_id, status, incurred_at DESC);
