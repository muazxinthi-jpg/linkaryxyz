ALTER TABLE profile_promotion_slots ADD COLUMN default_starting_bid_cents INTEGER NOT NULL DEFAULT 100 CHECK (default_starting_bid_cents > 0);
ALTER TABLE profile_promotion_slots ADD COLUMN auto_auction_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_auction_enabled IN (0,1));

