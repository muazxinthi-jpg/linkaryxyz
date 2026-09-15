-- Extend owner-controlled live banner duration to 30 days.
PRAGMA foreign_keys = OFF;
CREATE TABLE profile_promotion_slots_new (id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id), owner_user_id TEXT NOT NULL REFERENCES users(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)), payout_wallet_address TEXT NOT NULL, settlement_network TEXT NOT NULL DEFAULT 'base' CHECK (settlement_network = 'base'), settlement_asset TEXT NOT NULL DEFAULT 'USDC' CHECK (settlement_asset = 'USDC'), live_duration_hours INTEGER NOT NULL DEFAULT 24 CHECK (live_duration_hours IN (24,72,168,720)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO profile_promotion_slots_new SELECT id, profile_id, owner_user_id, enabled, payout_wallet_address, settlement_network, settlement_asset, live_duration_hours, created_at, updated_at FROM profile_promotion_slots;
DROP TABLE profile_promotion_slots;
ALTER TABLE profile_promotion_slots_new RENAME TO profile_promotion_slots;
CREATE INDEX IF NOT EXISTS idx_profile_promotion_slots_owner ON profile_promotion_slots(owner_user_id, enabled);
PRAGMA foreign_keys = ON;
