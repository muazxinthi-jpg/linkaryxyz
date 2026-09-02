ALTER TABLE campaigns ADD COLUMN source_type TEXT NOT NULL DEFAULT 'external';
ALTER TABLE campaigns ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'tracked_elsewhere';

CREATE TABLE IF NOT EXISTS partner_managers (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  manager_type TEXT NOT NULL CHECK (manager_type IN ('community_manager', 'kol_manager')),
  display_name TEXT NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  x_handle TEXT,
  telegram_contact TEXT,
  email TEXT,
  website_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'submitted', 'verified', 'rejected')),
  open_to_campaigns INTEGER NOT NULL DEFAULT 1 CHECK (open_to_campaigns IN (0, 1)),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id, manager_type)
);

CREATE INDEX IF NOT EXISTS idx_partner_managers_directory
  ON partner_managers(manager_type, visibility, verification_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS partner_manager_assets (
  id TEXT PRIMARY KEY NOT NULL,
  manager_id TEXT NOT NULL REFERENCES partner_managers(id),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('telegram_community', 'kol_creator')),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  handle TEXT,
  url TEXT,
  audience_size INTEGER NOT NULL DEFAULT 0 CHECK (audience_size >= 0),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'submitted', 'verified', 'rejected')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_manager_assets_manager
  ON partner_manager_assets(manager_id, asset_type, audience_size DESC);

CREATE TABLE IF NOT EXISTS partner_manager_audience_estimates (
  manager_id TEXT PRIMARY KEY NOT NULL REFERENCES partner_managers(id),
  estimated_unique_audience INTEGER CHECK (estimated_unique_audience IS NULL OR estimated_unique_audience >= 0),
  methodology TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'manual' CHECK (confidence IN ('manual', 'estimated', 'verified')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_opportunities (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  compensation_text TEXT NOT NULL DEFAULT '',
  deliverables_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  application_deadline TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_opportunities_open
  ON campaign_opportunities(status, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_opportunity_applications (
  id TEXT PRIMARY KEY NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES campaign_opportunities(id),
  applicant_profile_id TEXT NOT NULL REFERENCES profiles(id),
  manager_id TEXT REFERENCES partner_managers(id),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(opportunity_id, applicant_profile_id, manager_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_opportunity_applications_opportunity
  ON campaign_opportunity_applications(opportunity_id, status, created_at DESC);
