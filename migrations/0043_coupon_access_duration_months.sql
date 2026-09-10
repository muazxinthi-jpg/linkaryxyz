-- Relative free-access duration for tracked 100% coupons.
-- `ends_at` remains the coupon claim deadline.
-- `access_until` remains an optional fixed calendar entitlement expiry.
-- `access_duration_months` grants access for N calendar months from each redemption timestamp.
-- NULL preserves the existing fixed-date / one-billing-period behavior.

ALTER TABLE discount_coupons
  ADD COLUMN access_duration_months INTEGER
  CHECK (access_duration_months IS NULL OR (access_duration_months >= 1 AND access_duration_months <= 60));

CREATE TRIGGER IF NOT EXISTS trg_coupon_access_policy_insert
BEFORE INSERT ON discount_coupons
WHEN NEW.access_until IS NOT NULL AND NEW.access_duration_months IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'coupon_access_policy_conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_coupon_access_policy_update
BEFORE UPDATE OF access_until, access_duration_months ON discount_coupons
WHEN NEW.access_until IS NOT NULL AND NEW.access_duration_months IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'coupon_access_policy_conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_coupon_access_duration_free_only_insert
BEFORE INSERT ON discount_coupons
WHEN NEW.access_duration_months IS NOT NULL
  AND (NEW.discount_type <> 'percent' OR NEW.discount_value <> 100)
BEGIN
  SELECT RAISE(ABORT, 'coupon_access_duration_requires_free_coupon');
END;

CREATE TRIGGER IF NOT EXISTS trg_coupon_access_duration_free_only_update
BEFORE UPDATE OF access_duration_months, discount_type, discount_value ON discount_coupons
WHEN NEW.access_duration_months IS NOT NULL
  AND (NEW.discount_type <> 'percent' OR NEW.discount_value <> 100)
BEGIN
  SELECT RAISE(ABORT, 'coupon_access_duration_requires_free_coupon');
END;
