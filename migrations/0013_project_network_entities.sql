CREATE TABLE IF NOT EXISTS project_network_entities (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('creator', 'community')),
  display_name TEXT NOT NULL,
  primary_handle TEXT,
  primary_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'submitted', 'verified', 'rejected')),
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_network_entities_org_type ON project_network_entities(organization_id, entity_type, created_at DESC);
CREATE TABLE IF NOT EXISTS campaign_activity_participants (
  id TEXT PRIMARY KEY NOT NULL,
  activity_id TEXT NOT NULL REFERENCES campaign_activities(id),
  entity_id TEXT NOT NULL REFERENCES project_network_entities(id),
  participation_role TEXT NOT NULL DEFAULT 'contributor' CHECK (participation_role IN ('creator', 'community_host', 'contributor', 'distribution_partner')),
  created_at TEXT NOT NULL,
  UNIQUE(activity_id, entity_id)
);
