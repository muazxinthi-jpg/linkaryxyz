PRAGMA foreign_keys = ON;

-- 100% Superadmin coupons activate one paid billing period without creating a
-- fake zero-value USDC payment. Paid checkout reservations already protect
-- coupon capacity. These guards give direct/free coupon redemptions the same
-- total and per-account protection while also respecting active paid
-- reservations.

DROP TRIGGER IF EXISTS trg_free_coupon_total_limit;
CREATE TRIGGER trg_free_coupon_total_limit
BEFORE INSERT ON coupon_redemptions
WHEN NEW.related_payment_id IS NULL
 AND (SELECT max_redemptions FROM discount_coupons WHERE id = NEW.coupon_id) IS NOT NULL
 AND (
   (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = NEW.coupon_id)
   +
   (SELECT COUNT(*) FROM billing_coupon_reservations
      WHERE coupon_id = NEW.coupon_id
        AND status = 'reserved'
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
 ) >= (SELECT max_redemptions FROM discount_coupons WHERE id = NEW.coupon_id)
BEGIN
  SELECT RAISE(ABORT, 'coupon_redemption_limit');
END;

DROP TRIGGER IF EXISTS trg_free_coupon_user_limit;
CREATE TRIGGER trg_free_coupon_user_limit
BEFORE INSERT ON coupon_redemptions
WHEN NEW.related_payment_id IS NULL
 AND NEW.user_id IS NOT NULL
 AND (
   (SELECT COUNT(*) FROM coupon_redemptions
      WHERE coupon_id = NEW.coupon_id AND user_id = NEW.user_id)
   +
   (SELECT COUNT(*) FROM billing_coupon_reservations
      WHERE coupon_id = NEW.coupon_id
        AND user_id = NEW.user_id
        AND status = 'reserved'
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
 ) >= (SELECT max_redemptions_per_account FROM discount_coupons WHERE id = NEW.coupon_id)
BEGIN
  SELECT RAISE(ABORT, 'coupon_account_redemption_limit');
END;

DROP TRIGGER IF EXISTS trg_free_coupon_org_limit;
CREATE TRIGGER trg_free_coupon_org_limit
BEFORE INSERT ON coupon_redemptions
WHEN NEW.related_payment_id IS NULL
 AND NEW.organization_id IS NOT NULL
 AND (
   (SELECT COUNT(*) FROM coupon_redemptions
      WHERE coupon_id = NEW.coupon_id AND organization_id = NEW.organization_id)
   +
   (SELECT COUNT(*) FROM billing_coupon_reservations
      WHERE coupon_id = NEW.coupon_id
        AND organization_id = NEW.organization_id
        AND status = 'reserved'
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
 ) >= (SELECT max_redemptions_per_account FROM discount_coupons WHERE id = NEW.coupon_id)
BEGIN
  SELECT RAISE(ABORT, 'coupon_account_redemption_limit');
END;
