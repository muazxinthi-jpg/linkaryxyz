-- Focused Project-to-partner collaboration intent. An inquiry is not campaign evidence.
CREATE TABLE IF NOT EXISTS collaboration_inquiries (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('creator','community_manager')),
  target_profile_id TEXT NOT NULL REFERENCES profiles(id),
  partner_manager_id TEXT REFERENCES partner_managers(id),
  partner_asset_id TEXT REFERENCES partner_manager_assets(id),
  campaign_id TEXT REFERENCES campaigns(id),
  inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('content_collaboration','telegram_promotion','community_activation','x_campaign','ambassador','partnership','other')),
  budget_usd REAL CHECK (budget_usd IS NULL OR budget_usd >= 0),
  message TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn','closed')),
  responded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (target_kind = 'creator' AND partner_manager_id IS NULL AND partner_asset_id IS NULL)
    OR
    (target_kind = 'community_manager' AND partner_manager_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_collaboration_inquiries_project
  ON collaboration_inquiries(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaboration_inquiries_target
  ON collaboration_inquiries(target_profile_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaboration_inquiries_manager
  ON collaboration_inquiries(partner_manager_id, status, created_at DESC)
  WHERE partner_manager_id IS NOT NULL;
