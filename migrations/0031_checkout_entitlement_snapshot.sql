ALTER TABLE billing_checkout_intents
  ADD COLUMN monthly_usage_credits_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (monthly_usage_credits_snapshot >= 0);
