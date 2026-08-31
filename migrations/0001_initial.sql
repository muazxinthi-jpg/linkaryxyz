PRAGMA foreign_keys = ON;

-- Linkary Phase A/B foundation. This migration is intentionally comprehensive
-- because the production D1 database has not been provisioned or migrated yet.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_username TEXT,
  verified_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  access_context_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at, used_at);

CREATE TABLE IF NOT EXISTS platform_identities (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  provider_object_type TEXT NOT NULL DEFAULT 'person',
  current_handle TEXT,
  current_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  ownership_verified_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(platform, provider_uid)
);

CREATE TABLE IF NOT EXISTS platform_handle_history (
  id TEXT PRIMARY KEY NOT NULL,
  platform_identity_id TEXT NOT NULL REFERENCES platform_identities(id),
  handle TEXT NOT NULL,
  display_name TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT,
  source TEXT NOT NULL,
  verification_state TEXT NOT NULL DEFAULT 'verified',
  UNIQUE(platform_identity_id, handle, first_seen_at)
);

CREATE INDEX IF NOT EXISTS idx_platform_handle_history_identity ON platform_handle_history(platform_identity_id, first_seen_at);
CREATE INDEX IF NOT EXISTS idx_platform_handle_history_handle ON platform_handle_history(handle);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug_internal TEXT NOT NULL UNIQUE,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'suspended', 'merged')),
  verification_status TEXT NOT NULL DEFAULT 'pending',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  archived_at TEXT,
  archived_by_user_id TEXT REFERENCES users(id),
  merged_into_organization_id TEXT REFERENCES organizations(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'marketing_manager', 'analyst', 'viewer')),
  billing_manager INTEGER NOT NULL DEFAULT 0 CHECK (billing_manager IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON organization_memberships(organization_id, status);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  primary_platform_identity_id TEXT REFERENCES platform_identities(id),
  profile_type TEXT NOT NULL CHECK (profile_type IN ('creator', 'project')),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'published', 'archived')),
  verification_status TEXT NOT NULL DEFAULT 'verified_x',
  seo_title TEXT,
  seo_description TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((profile_type = 'creator' AND owner_user_id IS NOT NULL) OR (profile_type = 'project' AND organization_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_profiles_published_username ON profiles(username, visibility);
CREATE INDEX IF NOT EXISTS idx_profiles_owner_user ON profiles(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON profiles(organization_id);

CREATE TABLE IF NOT EXISTS profile_username_history (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  username TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  released_at TEXT,
  redirect_until TEXT,
  release_review_state TEXT NOT NULL DEFAULT 'held'
);

CREATE INDEX IF NOT EXISTS idx_profile_username_history_profile ON profile_username_history(profile_id, claimed_at);
CREATE INDEX IF NOT EXISTS idx_profile_username_history_username ON profile_username_history(username);

CREATE TABLE IF NOT EXISTS profile_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  block_type TEXT NOT NULL,
  position INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  title TEXT,
  url TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_blocks_order ON profile_blocks(profile_id, enabled, position);

CREATE TABLE IF NOT EXISTS platform_identity_links (
  id TEXT PRIMARY KEY NOT NULL,
  platform_identity_id TEXT NOT NULL REFERENCES platform_identities(id),
  user_id TEXT REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  profile_id TEXT REFERENCES profiles(id),
  link_type TEXT NOT NULL CHECK (link_type IN ('owns', 'represents', 'manages', 'community_identity')),
  verified_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_identity_links_identity ON platform_identity_links(platform_identity_id, ended_at);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  display_code TEXT,
  invite_type TEXT NOT NULL DEFAULT 'network_invite' CHECK (invite_type IN ('network_invite', 'campaign_invite', 'business_admin_invite', 'team_invite')),
  inviter_user_id TEXT REFERENCES users(id),
  inviter_organization_id TEXT REFERENCES organizations(id),
  intended_email TEXT,
  allowed_account_types_json TEXT NOT NULL DEFAULT '["creator","project"]',
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_redemptions (
  id TEXT PRIMARY KEY NOT NULL,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  chosen_account_type TEXT CHECK (chosen_account_type IN ('creator', 'project')),
  organization_id TEXT REFERENCES organizations(id),
  quality_state TEXT NOT NULL DEFAULT 'pending',
  redeemed_at TEXT NOT NULL,
  UNIQUE(invite_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_invite_redemptions_user ON invite_redemptions(user_id);

CREATE TABLE IF NOT EXISTS invite_balances (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('profile', 'organization')),
  owner_id TEXT NOT NULL,
  available_credits INTEGER NOT NULL DEFAULT 0,
  lifetime_granted INTEGER NOT NULL DEFAULT 0,
  lifetime_used INTEGER NOT NULL DEFAULT 0,
  quality_score REAL NOT NULL DEFAULT 0,
  privileges_status TEXT NOT NULL DEFAULT 'active' CHECK (privileges_status IN ('active', 'paused', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS invite_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('profile', 'organization')),
  owner_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('grant', 'use', 'refund', 'reward', 'admin_adjustment')),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  related_invite_id TEXT REFERENCES invites(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_ledger_owner ON invite_ledger(owner_type, owner_id, created_at);

CREATE TABLE IF NOT EXISTS access_post_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  submitted_x_url TEXT NOT NULL,
  grant_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authenticated', 'consumed', 'revoked', 'expired')),
  expires_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  auth_verified_at TEXT,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_post_token ON access_post_submissions(grant_token_hash, status);
CREATE INDEX IF NOT EXISTS idx_access_post_user ON access_post_submissions(user_id, status);

CREATE TABLE IF NOT EXISTS admin_grants (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('superadmin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  actor_kind TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'system', 'superadmin')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  organization_id TEXT REFERENCES organizations(id),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at);
