CREATE TABLE IF NOT EXISTS tracked_link_partner_snapshots (
  tracked_link_id TEXT PRIMARY KEY NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  activity_id TEXT REFERENCES campaign_activities(id) ON DELETE SET NULL,
  assignment_kind TEXT CHECK (assignment_kind IN ('creator', 'community')),
  partner_entity_id TEXT REFERENCES project_network_entities(id),
  creator_profile_id TEXT REFERENCES profiles(id),
  partner_manager_id TEXT REFERENCES partner_managers(id),
  partner_asset_id TEXT REFERENCES partner_manager_assets(id),
  partner_display_name TEXT,
  partner_handle TEXT,
  partner_manager_name TEXT,
  partner_verification_status TEXT,
  snapshot_source TEXT NOT NULL CHECK (snapshot_source IN ('link_creation', 'legacy_backfill')),
  captured_at TEXT NOT NULL,
  CHECK (
    (assignment_kind IS NULL AND partner_entity_id IS NULL AND creator_profile_id IS NULL AND partner_manager_id IS NULL AND partner_asset_id IS NULL)
    OR
    (assignment_kind = 'creator' AND partner_entity_id IS NOT NULL AND creator_profile_id IS NOT NULL AND partner_manager_id IS NULL AND partner_asset_id IS NULL)
    OR
    (assignment_kind = 'community' AND partner_entity_id IS NOT NULL AND creator_profile_id IS NULL AND partner_manager_id IS NOT NULL AND partner_asset_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tracked_link_partner_snapshots_entity
  ON tracked_link_partner_snapshots(partner_entity_id, captured_at DESC)
  WHERE partner_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracked_link_partner_snapshots_creator
  ON tracked_link_partner_snapshots(creator_profile_id, captured_at DESC)
  WHERE creator_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracked_link_partner_snapshots_community
  ON tracked_link_partner_snapshots(partner_asset_id, captured_at DESC)
  WHERE partner_asset_id IS NOT NULL;

-- Existing links pre-date immutable snapshots. Freeze the currently resolvable
-- assignment once, but mark it as a legacy backfill so it is never presented as
-- proven link-creation provenance.
INSERT OR IGNORE INTO tracked_link_partner_snapshots (
  tracked_link_id,
  activity_id,
  assignment_kind,
  partner_entity_id,
  creator_profile_id,
  partner_manager_id,
  partner_asset_id,
  partner_display_name,
  partner_handle,
  partner_manager_name,
  partner_verification_status,
  snapshot_source,
  captured_at
)
SELECT
  t.id,
  t.activity_id,
  la.assignment_kind,
  la.entity_id,
  la.creator_profile_id,
  la.partner_manager_id,
  la.partner_asset_id,
  COALESCE(cp.display_name, pa.name, ne.display_name),
  COALESCE(cpi.current_handle, pa.handle, ne.primary_handle),
  pm.display_name,
  CASE
    WHEN la.assignment_kind = 'creator' THEN CASE WHEN cp.verification_status = 'verified_x' THEN 'verified' ELSE 'unverified' END
    WHEN la.assignment_kind = 'community' THEN COALESCE(pa.verification_status, 'unverified')
    ELSE NULL
  END,
  'legacy_backfill',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tracked_links t
LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = t.activity_id
LEFT JOIN project_network_entities ne ON ne.id = la.entity_id
LEFT JOIN profiles cp ON cp.id = la.creator_profile_id
LEFT JOIN platform_identities cpi ON cpi.id = cp.primary_platform_identity_id
LEFT JOIN partner_managers pm ON pm.id = la.partner_manager_id
LEFT JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id;
