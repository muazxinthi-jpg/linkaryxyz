-- Preserve the deployed 0011 schema and replace its status-wide uniqueness
-- with the intended invariant: only one pending request per person/Project.
PRAGMA foreign_keys = OFF;
CREATE TABLE project_access_requests_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  requested_role TEXT NOT NULL CHECK (requested_role IN ('admin', 'marketing_manager', 'analyst', 'viewer')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'cancelled')),
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO project_access_requests_next SELECT id, organization_id, requested_by_user_id, requested_role, note, status, reviewed_by_user_id, reviewed_at, created_at, updated_at FROM project_access_requests;
DROP TABLE project_access_requests;
ALTER TABLE project_access_requests_next RENAME TO project_access_requests;
CREATE INDEX IF NOT EXISTS idx_project_access_requests_org_status ON project_access_requests(organization_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_access_requests_one_pending ON project_access_requests(organization_id, requested_by_user_id) WHERE status = 'submitted';
PRAGMA foreign_keys = ON;
