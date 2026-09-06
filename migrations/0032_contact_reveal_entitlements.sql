ALTER TABLE billing_plans ADD COLUMN monthly_contact_reveals INTEGER NOT NULL DEFAULT 0 CHECK (monthly_contact_reveals >= 0);

UPDATE billing_plans SET monthly_contact_reveals = CASE code
  WHEN 'free' THEN 0
  WHEN 'personal_pro' THEN 10
  WHEN 'project_manual' THEN 50
  WHEN 'project_automate' THEN 250
  WHEN 'project_growth' THEN 1000
  WHEN 'scale' THEN 0
  ELSE 0
END;

CREATE TABLE IF NOT EXISTS contact_reveal_events (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  manager_id TEXT NOT NULL REFERENCES partner_managers(id),
  contact_type TEXT NOT NULL CHECK (contact_type IN ('x', 'telegram', 'email', 'website')),
  revealed_value TEXT NOT NULL,
  period_start TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_type, owner_id, manager_id, contact_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_contact_reveal_events_owner_period
  ON contact_reveal_events(owner_type, owner_id, period_start, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_reveal_events_manager
  ON contact_reveal_events(manager_id, created_at DESC);
