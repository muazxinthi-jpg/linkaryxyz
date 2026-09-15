-- Extend owner-controlled live banner duration to 30 days without rebuilding
-- the referenced slots table. Existing hour values remain untouched.
ALTER TABLE profile_promotion_slots ADD COLUMN live_duration_days INTEGER
  CHECK (live_duration_days IS NULL OR live_duration_days IN (1,3,7,30));
