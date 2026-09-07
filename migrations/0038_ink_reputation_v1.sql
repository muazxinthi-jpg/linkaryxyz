-- INK V1 reputation evidence infrastructure.
--
-- This migration creates versioned, auditable storage for future INK scoring.
-- It deliberately does NOT activate a numeric scoring formula and does NOT
-- activate downstream referral cash rewards. Until the methodology is locked,
-- score fields may remain NULL while evidence is collected.

CREATE TABLE IF NOT EXISTS ink_score_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  score_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'active', 'superseded')),
  total_score INTEGER CHECK (total_score IS NULL OR total_score BETWEEN 0 AND 10000),
  network_strength_score INTEGER CHECK (network_strength_score IS NULL OR network_strength_score BETWEEN 0 AND 3000),
  verified_contribution_score INTEGER CHECK (verified_contribution_score IS NULL OR verified_contribution_score BETWEEN 0 AND 2500),
  trust_votes_score INTEGER CHECK (trust_votes_score IS NULL OR trust_votes_score BETWEEN 0 AND 2000),
  network_economic_footprint_score INTEGER CHECK (network_economic_footprint_score IS NULL OR network_economic_footprint_score BETWEEN 0 AND 1000),
  integrity_reliability_score INTEGER CHECK (integrity_reliability_score IS NULL OR integrity_reliability_score BETWEEN 0 AND 1500),
  methodology_note TEXT NOT NULL DEFAULT '',
  computed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (status <> 'active' OR total_score IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ink_score_snapshots_profile_version
  ON ink_score_snapshots(profile_id, score_version, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ink_score_snapshots_owner
  ON ink_score_snapshots(owner_user_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS ink_component_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  snapshot_id TEXT REFERENCES ink_score_snapshots(id),
  score_version TEXT NOT NULL,
  component TEXT NOT NULL CHECK (component IN (
    'network_strength',
    'verified_contribution',
    'trust_votes',
    'network_economic_footprint',
    'integrity_reliability'
  )),
  source_type TEXT NOT NULL,
  source_ref TEXT,
  generation INTEGER CHECK (generation IS NULL OR generation BETWEEN 1 AND 7),
  observed_value TEXT,
  points_awarded INTEGER CHECK (points_awarded IS NULL OR points_awarded >= 0),
  evidence_status TEXT NOT NULL DEFAULT 'building' CHECK (evidence_status IN ('building', 'tracked', 'verified', 'rejected')),
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ink_component_evidence_profile_component
  ON ink_component_evidence(profile_id, score_version, component, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ink_component_evidence_snapshot
  ON ink_component_evidence(snapshot_id, component);
