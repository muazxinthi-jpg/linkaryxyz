CREATE TABLE IF NOT EXISTS billing_account_price_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents', 'fixed_price_cents')),
  discount_value INTEGER NOT NULL CHECK (discount_value >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  reason TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_billing_account_price_overrides_user
  ON billing_account_price_overrides(user_id, plan_id, status, ends_at);
CREATE INDEX IF NOT EXISTS idx_billing_account_price_overrides_org
  ON billing_account_price_overrides(organization_id, plan_id, status, ends_at);

CREATE TABLE IF NOT EXISTS billing_checkout_intents (
  id TEXT PRIMARY KEY NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  payer_wallet_address TEXT NOT NULL,
  treasury_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'base' CHECK (network = 'base'),
  asset TEXT NOT NULL DEFAULT 'USDC' CHECK (asset = 'USDC'),
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents > 0),
  promotion_id TEXT REFERENCES billing_plan_promotions(id),
  coupon_id TEXT REFERENCES discount_coupons(id),
  account_price_override_id TEXT REFERENCES billing_account_price_overrides(id),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  final_price_cents INTEGER NOT NULL CHECK (final_price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  usdc_amount_atomic INTEGER NOT NULL CHECK (usdc_amount_atomic > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'paid', 'expired', 'cancelled')),
  tx_hash TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_owner
  ON billing_checkout_intents(owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_checkout_user
  ON billing_checkout_intents(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_checkout_status
  ON billing_checkout_intents(status, expires_at);

CREATE TABLE IF NOT EXISTS billing_payments (
  id TEXT PRIMARY KEY NOT NULL,
  checkout_intent_id TEXT NOT NULL UNIQUE REFERENCES billing_checkout_intents(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  payer_wallet_address TEXT NOT NULL,
  treasury_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'base' CHECK (network = 'base'),
  asset TEXT NOT NULL DEFAULT 'USDC' CHECK (asset = 'USDC'),
  amount_atomic INTEGER NOT NULL CHECK (amount_atomic > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  tx_hash TEXT NOT NULL UNIQUE,
  block_number INTEGER,
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'refunded', 'reversed')),
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_owner
  ON billing_payments(owner_type, owner_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_payments_plan
  ON billing_payments(plan_id, verified_at DESC);

CREATE TABLE IF NOT EXISTS billing_subscription_periods (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  payment_id TEXT NOT NULL UNIQUE REFERENCES billing_payments(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'expired', 'cancelled')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_subscription_periods_owner
  ON billing_subscription_periods(owner_type, owner_id, status, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_billing_subscription_periods_plan
  ON billing_subscription_periods(plan_id, status, period_end DESC);
