-- Phase A identity foundation. Apply only after a D1 database is provisioned.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('creator', 'project')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'published', 'archived')),
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_published_username
  ON profiles (username, visibility);
CREATE INDEX IF NOT EXISTS idx_memberships_user
  ON memberships (user_id);
