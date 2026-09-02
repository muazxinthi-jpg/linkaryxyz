-- Project-owned collaboration pipeline. Public directory listings and private Project notes remain separate.
CREATE TABLE IF NOT EXISTS project_partner_shortlists (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  partner_manager_id TEXT REFERENCES partner_managers(id),
  network_entity_id TEXT REFERENCES project_network_entities(id),
  partner_kind TEXT NOT NULL CHECK (partner_kind IN ('community_manager','kol_manager','creator','community','collaboration_manager')),
  status TEXT NOT NULL DEFAULT 'interested' CHECK (status IN ('interested','contacted','negotiating','active','completed','not_a_fit')),
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((partner_manager_id IS NOT NULL) OR (network_entity_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_partner_shortlist_manager ON project_partner_shortlists(organization_id, partner_manager_id) WHERE partner_manager_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_partner_shortlist_entity ON project_partner_shortlists(organization_id, network_entity_id) WHERE network_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_partner_shortlist_project ON project_partner_shortlists(organization_id, status, updated_at DESC);
