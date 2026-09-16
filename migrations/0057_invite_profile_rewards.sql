-- Invite-credit rewards for verified public creator profiles.
-- This is separate from the financial network reward ledger.
CREATE TABLE IF NOT EXISTS invite_reward_events (
  id TEXT PRIMARY KEY NOT NULL,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  qualified_user_id TEXT NOT NULL REFERENCES users(id),
  qualified_profile_id TEXT NOT NULL REFERENCES profiles(id),
  beneficiary_user_id TEXT NOT NULL REFERENCES users(id),
  beneficiary_owner_type TEXT NOT NULL CHECK (beneficiary_owner_type = 'profile'),
  beneficiary_owner_id TEXT NOT NULL REFERENCES profiles(id),
  generation INTEGER NOT NULL CHECK (generation BETWEEN 1 AND 7),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (invite_id, qualified_user_id, generation)
);

CREATE INDEX IF NOT EXISTS idx_invite_reward_events_beneficiary
  ON invite_reward_events(beneficiary_user_id, created_at DESC);

