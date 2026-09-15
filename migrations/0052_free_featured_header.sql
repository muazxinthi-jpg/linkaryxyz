-- Owner-controlled free featured header fallback for public profiles.
CREATE TABLE IF NOT EXISTS profile_featured_headers (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  preferred_project_profile_id TEXT REFERENCES profiles(id),
  project_name TEXT NOT NULL,
  banner_url TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  tracking_code TEXT NOT NULL UNIQUE,
  cta_type TEXT NOT NULL CHECK (cta_type IN ('join','register','book_now','learn_more','visit','explore','trade','mint','buy','view')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  impressions_count INTEGER NOT NULL DEFAULT 0 CHECK (impressions_count >= 0),
  banner_clicks_count INTEGER NOT NULL DEFAULT 0 CHECK (banner_clicks_count >= 0),
  cta_clicks_count INTEGER NOT NULL DEFAULT 0 CHECK (cta_clicks_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_featured_headers_tracking ON profile_featured_headers(tracking_code, enabled);
CREATE INDEX IF NOT EXISTS idx_profile_featured_headers_owner ON profile_featured_headers(owner_user_id, enabled);
