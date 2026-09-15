-- Profile owners choose how long an approved winning banner remains live.
ALTER TABLE profile_promotion_slots
  ADD COLUMN live_duration_hours INTEGER NOT NULL DEFAULT 24
  CHECK (live_duration_hours IN (24, 72, 168));
