CREATE TABLE IF NOT EXISTS project_access_requests (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  requested_role TEXT NOT NULL CHECK (requested_role IN ('admin', 'marketing_manager', 'analyst', 'viewer')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'cancelled')),
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, requested_by_user_id, status)
);
CREATE INDEX IF NOT EXISTS idx_project_access_requests_org_status ON project_access_requests(organization_id, status, created_at DESC);
