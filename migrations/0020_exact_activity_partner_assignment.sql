CREATE TABLE IF NOT EXISTS campaign_activity_linkary_assignments (
  activity_id TEXT PRIMARY KEY NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES campaign_activity_participants(id),
  participant_created_by_assignment INTEGER NOT NULL DEFAULT 1 CHECK (participant_created_by_assignment IN (0, 1)),
  entity_id TEXT NOT NULL REFERENCES project_network_entities(id),
  assignment_kind TEXT NOT NULL CHECK (assignment_kind IN ('creator', 'community')),
  creator_profile_id TEXT REFERENCES profiles(id),
  partner_manager_id TEXT REFERENCES partner_managers(id),
  partner_asset_id TEXT REFERENCES partner_manager_assets(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (assignment_kind = 'creator' AND creator_profile_id IS NOT NULL AND partner_manager_id IS NULL AND partner_asset_id IS NULL)
    OR
    (assignment_kind = 'community' AND creator_profile_id IS NULL AND partner_manager_id IS NOT NULL AND partner_asset_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_activity_linkary_assignments_entity
  ON campaign_activity_linkary_assignments(entity_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_activity_linkary_assignments_creator
  ON campaign_activity_linkary_assignments(creator_profile_id)
  WHERE creator_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_activity_linkary_assignments_community
  ON campaign_activity_linkary_assignments(partner_asset_id)
  WHERE partner_asset_id IS NOT NULL;
