-- Platform Intelligence V3: private referral reward intelligence.
--
-- This migration does not create a public referral promise and does not send
-- money automatically. It stores the Superadmin rule used for internal reward
-- estimates and the review/approval/settlement decisions made against an
-- eligible first paid referral event.
--
-- Reward eligibility is intentionally direct-referral only. The seven-generation
-- network remains analytics-only. A free entitlement / 100% coupon creates no
-- billing payment and therefore can never create a reward candidate.

CREATE TABLE IF NOT EXISTS referral_reward_rules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  reward_basis TEXT NOT NULL CHECK (reward_basis IN ('percentage_first_payment', 'fixed_first_payment')),
  percentage_bps INTEGER CHECK (percentage_bps IS NULL OR (percentage_bps >= 1 AND percentage_bps <= 10000)),
  fixed_amount_cents INTEGER CHECK (fixed_amount_cents IS NULL OR fixed_amount_cents > 0),
  minimum_payout_cents INTEGER NOT NULL DEFAULT 0 CHECK (minimum_payout_cents >= 0),
  first_payment_only INTEGER NOT NULL DEFAULT 1 CHECK (first_payment_only = 1),
  exclude_free_access INTEGER NOT NULL DEFAULT 1 CHECK (exclude_free_access = 1),
  exclude_refunded_payments INTEGER NOT NULL DEFAULT 1 CHECK (exclude_refunded_payments = 1),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (reward_basis = 'percentage_first_payment' AND percentage_bps IS NOT NULL AND fixed_amount_cents IS NULL)
    OR
    (reward_basis = 'fixed_first_payment' AND fixed_amount_cents IS NOT NULL AND percentage_bps IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_reward_rules_one_active
  ON referral_reward_rules(is_active)
  WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS referral_reward_decisions (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES billing_payments(id),
  inviter_user_id TEXT NOT NULL REFERENCES users(id),
  referred_user_id TEXT NOT NULL REFERENCES users(id),
  reward_rule_id TEXT NOT NULL REFERENCES referral_reward_rules(id),
  source_payment_amount_cents INTEGER NOT NULL CHECK (source_payment_amount_cents > 0),
  computed_reward_cents INTEGER NOT NULL CHECK (computed_reward_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('review', 'approved', 'paid', 'void')),
  reason TEXT NOT NULL,
  payment_reference TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  approved_by_user_id TEXT REFERENCES users(id),
  paid_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (inviter_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_decisions_inviter_status
  ON referral_reward_decisions(inviter_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_reward_decisions_referred
  ON referral_reward_decisions(referred_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_reward_decisions_status
  ON referral_reward_decisions(status, approved_at, updated_at DESC);

-- Speeds direct-referral payment attribution without changing billing behavior.
CREATE INDEX IF NOT EXISTS idx_billing_checkout_requested_status
  ON billing_checkout_intents(requested_by_user_id, status, created_at DESC);

-- Default internal estimate: 10% of the first verified paid transaction made by
-- a directly referred user. This is a private configurable estimate, not an
-- entitlement. Superadmin approval remains required before any amount is payable.
INSERT OR IGNORE INTO referral_reward_rules (
  id,
  name,
  reward_basis,
  percentage_bps,
  fixed_amount_cents,
  minimum_payout_cents,
  first_payment_only,
  exclude_free_access,
  exclude_refunded_payments,
  is_active,
  created_by_user_id,
  created_at,
  updated_at
) VALUES (
  'rrule_default_10pct_first_payment',
  'Default 10% first paid referral',
  'percentage_first_payment',
  1000,
  NULL,
  0,
  1,
  1,
  1,
  1,
  NULL,
  '2026-09-11T00:00:00.000Z',
  '2026-09-11T00:00:00.000Z'
);
