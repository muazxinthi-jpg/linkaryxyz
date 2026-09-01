PRAGMA foreign_keys = ON;

-- Creator Earn Access is approval-gated. A creator authenticates first, receives
-- a curated Linkary claim, publishes the approved X copy, submits the resulting
-- status URL, and waits for Superadmin approval before a normal Linkary session
-- may be created.

CREATE TABLE IF NOT EXISTS creator_access_claims (
  id TEXT PRIMARY KEY NOT NULL,
  cdp_project_id TEXT NOT NULL,
  cdp_user_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  claim_code TEXT NOT NULL UNIQUE,
  claim_token_hash TEXT NOT NULL UNIQUE,
  submitted_x_url TEXT UNIQUE,
  approved_invite_id TEXT REFERENCES invites(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'consumed', 'revoked', 'expired')),
  review_mode TEXT NOT NULL DEFAULT 'manual' CHECK (review_mode IN ('manual', 'twitterapi_io')),
  rejection_reason TEXT,
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_creator_access_claims_cdp_user
  ON creator_access_claims(cdp_project_id, cdp_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_creator_access_claims_review
  ON creator_access_claims(status, created_at);

CREATE TABLE IF NOT EXISTS admin_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO admin_settings (setting_key, value_json, updated_by_user_id, updated_at)
VALUES (
  'creator_access_verification',
  '{"mode":"manual","providerConfigured":false}',
  NULL,
  datetime('now')
);
