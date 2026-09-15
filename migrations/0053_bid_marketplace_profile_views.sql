CREATE TABLE IF NOT EXISTS public_profile_daily_views (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  view_date TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_public_profile_daily_views_date
  ON public_profile_daily_views(view_date, profile_id);
