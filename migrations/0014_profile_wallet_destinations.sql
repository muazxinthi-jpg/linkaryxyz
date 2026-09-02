CREATE TABLE IF NOT EXISTS profile_wallet_destinations (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  chain_family TEXT NOT NULL CHECK (chain_family IN ('evm', 'solana')),
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id, chain_family)
);

CREATE INDEX IF NOT EXISTS idx_profile_wallet_destinations_profile
  ON profile_wallet_destinations(profile_id, status);
