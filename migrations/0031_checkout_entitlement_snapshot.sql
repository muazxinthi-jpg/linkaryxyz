ALTER TABLE billing_checkout_intents
  ADD COLUMN monthly_usage_credits_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (monthly_usage_credits_snapshot >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemptions_payment_unique
  ON coupon_redemptions(related_payment_id)
  WHERE related_payment_id IS NOT NULL;
