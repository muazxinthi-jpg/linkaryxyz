-- Superadmin-only platform intelligence support.
--
-- Public referral/network behavior is deliberately unchanged. These tables are
-- private operating records for discretionary internal rewards and growth
-- targets. They do not create an automatic referral liability or a public
-- promise to pay.

CREATE TABLE IF NOT EXISTS internal_referral_rewards (
  id TEXT PRIMARY KEY NOT NULL,
  beneficiary_user_id TEXT NOT NULL REFERENCES users(id),
  period_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'approved', 'paid', 'void')),
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  payment_reference TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  approved_by_user_id TEXT REFERENCES users(id),
  paid_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (beneficiary_user_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_internal_referral_rewards_status_period
  ON internal_referral_rewards(status, period_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_referral_rewards_beneficiary
  ON internal_referral_rewards(beneficiary_user_id, period_key DESC);

CREATE TABLE IF NOT EXISTS platform_growth_targets (
  id TEXT PRIMARY KEY NOT NULL,
  period_key TEXT NOT NULL,
  metric_key TEXT NOT NULL CHECK (metric_key IN (
    'registered_users',
    'mau',
    'paid_accounts',
    'mrr_cents',
    'referral_redemptions'
  )),
  target_value REAL NOT NULL CHECK (target_value >= 0),
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (period_key, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_growth_targets_period
  ON platform_growth_targets(period_key, metric_key);

-- Platform intelligence reads are bounded by time or a short leaderboard. These
-- indexes keep the dashboard from becoming a repeat of the old broad-scan D1
-- failure mode as Linkary grows.
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_user
  ON sessions(last_seen_at, user_id);
CREATE INDEX IF NOT EXISTS idx_users_created_status
  ON users(created_at, status);
CREATE INDEX IF NOT EXISTS idx_billing_payments_verified_status
  ON billing_payments(verified_at, status);
CREATE INDEX IF NOT EXISTS idx_network_referral_edges_status_created
  ON network_referral_edges(status, created_at, inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_invite_click_events_occurred
  ON invite_click_events(occurred_at, invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_redeemed
  ON invite_redemptions(redeemed_at, invite_id, user_id);
CREATE INDEX IF NOT EXISTS idx_invites_inviter_type_created
  ON invites(inviter_user_id, invite_type, created_at);
