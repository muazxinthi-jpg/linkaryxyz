-- Public Profile Sponsored Header Auction V1
-- Non-custodial settlement: winning bidder pays profile owner directly on Base in USDC.

CREATE TABLE IF NOT EXISTS profile_promotion_slots (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  payout_wallet_address TEXT NOT NULL,
  settlement_network TEXT NOT NULL DEFAULT 'base' CHECK (settlement_network = 'base'),
  settlement_asset TEXT NOT NULL DEFAULT 'USDC' CHECK (settlement_asset = 'USDC'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_promotion_slots_owner ON profile_promotion_slots(owner_user_id, enabled);

CREATE TABLE IF NOT EXISTS profile_promotion_auctions (
  id TEXT PRIMARY KEY NOT NULL,
  slot_id TEXT NOT NULL REFERENCES profile_promotion_slots(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','scheduled','open','ended','winner_selected','payment_pending','payment_detected','creative_pending','ready','live','expired','cancelled','payment_expired','rejected')),
  duration_hours INTEGER NOT NULL CHECK (duration_hours IN (6,12,24)),
  starting_bid_cents INTEGER NOT NULL CHECK (starting_bid_cents > 0),
  highest_bid_cents INTEGER,
  highest_bid_id TEXT,
  winner_bid_id TEXT,
  winner_user_id TEXT REFERENCES users(id),
  opens_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  payment_due_at TEXT,
  live_at TEXT,
  promotion_ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_auctions_profile_status ON profile_promotion_auctions(profile_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_auctions_status_expiry ON profile_promotion_auctions(status, expires_at);

CREATE TABLE IF NOT EXISTS profile_promotion_bids (
  id TEXT PRIMARY KEY NOT NULL,
  auction_id TEXT NOT NULL REFERENCES profile_promotion_auctions(id),
  bidder_user_id TEXT NOT NULL REFERENCES users(id),
  bidder_organization_id TEXT REFERENCES organizations(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(auction_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_promotion_bids_auction_amount ON profile_promotion_bids(auction_id, amount_cents DESC, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_promotion_bids_bidder ON profile_promotion_bids(bidder_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_promotion_payments (
  id TEXT PRIMARY KEY NOT NULL,
  auction_id TEXT NOT NULL UNIQUE REFERENCES profile_promotion_auctions(id),
  winning_bid_id TEXT NOT NULL REFERENCES profile_promotion_bids(id),
  payer_user_id TEXT NOT NULL REFERENCES users(id),
  recipient_wallet_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'base' CHECK (network = 'base'),
  asset TEXT NOT NULL DEFAULT 'USDC' CHECK (asset = 'USDC'),
  required_amount_atomic INTEGER NOT NULL CHECK (required_amount_atomic > 0),
  tx_hash TEXT UNIQUE,
  block_number INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','detected','verified','expired','rejected')),
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_payments_status ON profile_promotion_payments(status, updated_at);

CREATE TABLE IF NOT EXISTS profile_promotion_creatives (
  id TEXT PRIMARY KEY NOT NULL,
  auction_id TEXT NOT NULL UNIQUE REFERENCES profile_promotion_auctions(id),
  advertiser_user_id TEXT NOT NULL REFERENCES users(id),
  banner_url TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  tracking_code TEXT NOT NULL UNIQUE,
  cta_type TEXT NOT NULL CHECK (cta_type IN ('join','register','book_now','learn_more','visit','explore','trade','mint','buy','view')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected','flagged')),
  impressions_count INTEGER NOT NULL DEFAULT 0 CHECK (impressions_count >= 0),
  banner_clicks_count INTEGER NOT NULL DEFAULT 0 CHECK (banner_clicks_count >= 0),
  cta_clicks_count INTEGER NOT NULL DEFAULT 0 CHECK (cta_clicks_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_creatives_tracking ON profile_promotion_creatives(tracking_code, moderation_status);

CREATE TABLE IF NOT EXISTS profile_promotion_events (
  id TEXT PRIMARY KEY NOT NULL,
  auction_id TEXT NOT NULL REFERENCES profile_promotion_auctions(id),
  creative_id TEXT REFERENCES profile_promotion_creatives(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  advertiser_user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','banner_click','cta_click')),
  occurred_at TEXT NOT NULL,
  visitor_hash TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);
CREATE INDEX IF NOT EXISTS idx_promotion_events_auction_type_time ON profile_promotion_events(auction_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_events_profile_time ON profile_promotion_events(profile_id, occurred_at DESC);

-- One live/open lifecycle auction per profile is enforced by application transactions;
-- D1/SQLite partial unique index protects the common race at the database layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_promotion_auction_per_profile
  ON profile_promotion_auctions(profile_id)
  WHERE status IN ('scheduled','open','winner_selected','payment_pending','payment_detected','creative_pending','ready','live');
