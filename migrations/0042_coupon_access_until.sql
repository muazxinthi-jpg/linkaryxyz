PRAGMA foreign_keys = ON;

-- Coupon availability and granted access are separate commercial concerns.
-- discount_coupons.ends_at remains the deadline for claiming a coupon.
-- access_until is an optional fixed entitlement expiry for tracked 100% coupons.
-- NULL preserves the existing behavior where a free redemption grants one paid
-- monthly billing period from the redemption timestamp.
ALTER TABLE discount_coupons ADD COLUMN access_until TEXT;
