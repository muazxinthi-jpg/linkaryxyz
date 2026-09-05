CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  audience TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  billing_period TEXT NOT NULL CHECK (billing_period IN ('free', 'monthly', 'custom')),
  base_price_cents INTEGER CHECK (base_price_cents IS NULL OR base_price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  monthly_usage_credits INTEGER NOT NULL DEFAULT 0 CHECK (monthly_usage_credits >= 0),
  project_seat_limit INTEGER CHECK (project_seat_limit IS NULL OR project_seat_limit >= 0),
  features_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_public
  ON billing_plans(is_public, is_active, display_order);

CREATE TABLE IF NOT EXISTS billing_plan_price_versions (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  applies_to_renewals INTEGER NOT NULL DEFAULT 0 CHECK (applies_to_renewals IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_plan_price_versions_plan
  ON billing_plan_price_versions(plan_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS billing_plan_promotions (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  label TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents', 'fixed_price_cents')),
  discount_value INTEGER NOT NULL CHECK (discount_value >= 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_plan_promotions_active
  ON billing_plan_promotions(plan_id, is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS discount_coupons (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents', 'fixed_price_cents')),
  discount_value INTEGER NOT NULL CHECK (discount_value >= 0),
  eligible_plan_codes_json TEXT NOT NULL DEFAULT '[]',
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
  max_redemptions_per_account INTEGER NOT NULL DEFAULT 1 CHECK (max_redemptions_per_account >= 1),
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  stackable INTEGER NOT NULL DEFAULT 0 CHECK (stackable IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY NOT NULL,
  coupon_id TEXT NOT NULL REFERENCES discount_coupons(id),
  user_id TEXT REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  related_payment_id TEXT,
  redeemed_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon
  ON coupon_redemptions(coupon_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user
  ON coupon_redemptions(user_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_org
  ON coupon_redemptions(organization_id, redeemed_at DESC);

CREATE TABLE IF NOT EXISTS billing_entitlement_grants (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  monthly_credit_override INTEGER CHECK (monthly_credit_override IS NULL OR monthly_credit_override >= 0),
  reason TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_billing_entitlement_grants_user
  ON billing_entitlement_grants(user_id, status, ends_at);
CREATE INDEX IF NOT EXISTS idx_billing_entitlement_grants_org
  ON billing_entitlement_grants(organization_id, status, ends_at);

CREATE TABLE IF NOT EXISTS usage_credit_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('monthly_grant', 'usage', 'admin_adjustment', 'bonus', 'refund', 'expiry')),
  amount INTEGER NOT NULL CHECK (amount <> 0),
  reason TEXT NOT NULL,
  feature_key TEXT,
  provider TEXT,
  related_id TEXT,
  idempotency_key TEXT UNIQUE,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_credit_ledger_owner
  ON usage_credit_ledger(owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_credit_ledger_feature
  ON usage_credit_ledger(feature_key, created_at DESC);

INSERT OR IGNORE INTO billing_plans
  (id, code, name, audience, description, billing_period, base_price_cents, currency, monthly_usage_credits, project_seat_limit, features_json, is_active, is_public, display_order, created_at, updated_at)
VALUES
  ('plan_free', 'free', 'Free', 'Everyone', 'Create a Linkary identity, track manually and evaluate the network before upgrading.', 'free', 0, 'USD', 25, 0, '["Public profile","Manual tracking","Basic dashboard","30-day campaign history"]', 1, 1, 10, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z'),
  ('plan_personal_pro', 'personal_pro', 'Personal Pro / Collector', 'Creators and collectors', 'Enhanced personal profile tools with wallet-based NFT discovery and collection presentation.', 'monthly', 499, 'USD', 250, 0, '["NFT wallet discovery","NFT showcase","NFT avatar","NFT collections","Profile intelligence"]', 1, 1, 20, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z'),
  ('plan_project_manual', 'project_manual', 'Project Manual', 'Founders and small Projects', 'Manual campaign tracking and relationship memory for one Project.', 'monthly', 999, 'USD', 500, 1, '["1 Project seat","Unlimited manual campaigns","12-month campaign history","CSV export","Partner shortlists"]', 1, 1, 30, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z'),
  ('plan_project_automate', 'project_automate', 'Project Automate', 'Growing Project teams', 'Higher usage capacity for Projects adding provider-assisted refreshes and automation.', 'monthly', 3399, 'USD', 2500, 3, '["Up to 3 Project seats","Team access","Higher tracking allowance","Provider-assisted refreshes","Richer reporting"]', 1, 1, 40, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z'),
  ('plan_project_growth', 'project_growth', 'Project Growth', 'Established growth teams', 'Advanced growth operations, higher usage limits and intelligence for larger Project teams.', 'monthly', 9999, 'USD', 10000, 10, '["Up to 10 Project seats","Advanced reporting","High first-party tracking allowance","Provider automation credits","Priority growth intelligence"]', 1, 1, 50, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z'),
  ('plan_scale', 'scale', 'Scale / Agency / Enterprise', 'Agencies and large organizations', 'Custom seats, credits, controls and commercial terms.', 'custom', NULL, 'USD', 25000, NULL, '["Custom Project seats","25,000+ usage credits","Custom reporting","API and export options","Commercial support"]', 1, 1, 60, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z');

INSERT OR IGNORE INTO billing_plan_price_versions
  (id, plan_id, price_cents, currency, effective_from, effective_until, applies_to_renewals, created_by_user_id, created_at)
VALUES
  ('price_free_beta', 'plan_free', 0, 'USD', '2026-09-06T00:00:00.000Z', NULL, 1, NULL, '2026-09-06T00:00:00.000Z'),
  ('price_personal_pro_beta', 'plan_personal_pro', 499, 'USD', '2026-09-06T00:00:00.000Z', NULL, 1, NULL, '2026-09-06T00:00:00.000Z'),
  ('price_project_manual_beta', 'plan_project_manual', 999, 'USD', '2026-09-06T00:00:00.000Z', NULL, 1, NULL, '2026-09-06T00:00:00.000Z'),
  ('price_project_automate_beta', 'plan_project_automate', 3399, 'USD', '2026-09-06T00:00:00.000Z', NULL, 1, NULL, '2026-09-06T00:00:00.000Z'),
  ('price_project_growth_beta', 'plan_project_growth', 9999, 'USD', '2026-09-06T00:00:00.000Z', NULL, 1, NULL, '2026-09-06T00:00:00.000Z'),
  ('price_scale_beta', 'plan_scale', NULL, 'USD', '2026-09-06T00:00:00.000Z', NULL, 1, NULL, '2026-09-06T00:00:00.000Z');