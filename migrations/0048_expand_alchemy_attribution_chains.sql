-- Forward-only correction: activate the intended five-network attribution set.
-- Polygon remains accepted by storage only so rows written under 0047 survive.
-- Runtime validation and the triggers below reject new Polygon attribution data.
PRAGMA defer_foreign_keys = TRUE;

ALTER TABLE onchain_attribution_events RENAME TO onchain_attribution_events_0047;
ALTER TABLE onchain_watch_targets RENAME TO onchain_watch_targets_0047;

CREATE TABLE onchain_watch_targets (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  activity_id TEXT REFERENCES campaign_activities(id),
  tracked_link_id TEXT REFERENCES tracked_links(id),
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'bnb', 'solana', 'robinhood', 'polygon')),
  address TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  provider_sync_status TEXT NOT NULL DEFAULT 'pending_config' CHECK (provider_sync_status IN ('pending_config', 'syncing', 'active', 'error', 'disabled')),
  provider_sync_error TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, campaign_id, chain, address)
);

CREATE TABLE onchain_attribution_events (
  id TEXT PRIMARY KEY NOT NULL,
  watch_target_id TEXT NOT NULL REFERENCES onchain_watch_targets(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  activity_id TEXT REFERENCES campaign_activities(id),
  tracked_link_id TEXT REFERENCES tracked_links(id),
  provider TEXT NOT NULL DEFAULT 'alchemy' CHECK (provider IN ('alchemy')),
  provider_event_id TEXT NOT NULL,
  provider_item_key TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'bnb', 'solana', 'robinhood', 'polygon')),
  watched_address TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'self', 'unknown')),
  transaction_hash TEXT,
  block_number TEXT,
  block_hash TEXT,
  log_index TEXT,
  category TEXT,
  asset TEXT,
  value_text TEXT,
  from_address TEXT,
  to_address TEXT,
  evidence_confidence TEXT NOT NULL DEFAULT 'verified' CHECK (evidence_confidence IN ('verified')),
  chain_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (chain_status IN ('confirmed', 'reorged')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'ignored', 'reorged')),
  linked_conversion_id TEXT REFERENCES conversion_events(id),
  reorged_at TEXT,
  reorg_provider_event_id TEXT,
  reorg_payload_json TEXT,
  provider_created_at TEXT,
  occurred_at TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_item_key)
);

INSERT INTO onchain_watch_targets SELECT * FROM onchain_watch_targets_0047;
INSERT INTO onchain_attribution_events SELECT * FROM onchain_attribution_events_0047;

DROP TABLE onchain_attribution_events_0047;
DROP TABLE onchain_watch_targets_0047;

CREATE INDEX idx_onchain_watch_targets_campaign
  ON onchain_watch_targets(campaign_id, status, created_at DESC);
CREATE INDEX idx_onchain_watch_targets_chain_address
  ON onchain_watch_targets(chain, address, status);
CREATE INDEX idx_onchain_attribution_events_campaign
  ON onchain_attribution_events(campaign_id, occurred_at DESC);
CREATE INDEX idx_onchain_attribution_events_target
  ON onchain_attribution_events(watch_target_id, occurred_at DESC);
CREATE INDEX idx_onchain_attribution_events_review
  ON onchain_attribution_events(review_status, occurred_at DESC);

CREATE TRIGGER reject_new_polygon_watch_targets
BEFORE INSERT ON onchain_watch_targets
WHEN NEW.chain = 'polygon'
BEGIN
  SELECT RAISE(ABORT, 'polygon attribution is legacy-only');
END;

CREATE TRIGGER reject_polygon_watch_target_reassignment
BEFORE UPDATE OF chain ON onchain_watch_targets
WHEN NEW.chain = 'polygon' AND OLD.chain <> 'polygon'
BEGIN
  SELECT RAISE(ABORT, 'polygon attribution is legacy-only');
END;

CREATE TRIGGER reject_new_polygon_attribution_events
BEFORE INSERT ON onchain_attribution_events
WHEN NEW.chain = 'polygon'
BEGIN
  SELECT RAISE(ABORT, 'polygon attribution is legacy-only');
END;

CREATE TRIGGER reject_polygon_event_reassignment
BEFORE UPDATE OF chain ON onchain_attribution_events
WHEN NEW.chain = 'polygon' AND OLD.chain <> 'polygon'
BEGIN
  SELECT RAISE(ABORT, 'polygon attribution is legacy-only');
END;
