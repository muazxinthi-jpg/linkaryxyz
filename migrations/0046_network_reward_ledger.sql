-- Platform Intelligence V4: source-of-truth referral and network reward accounting.
--
-- Economics are locked to the Technical Product & Engineering Paper:
--   Gen 1  = 10.00%
--   Gen 2  =  0.70%
--   Gen 3  =  0.45%
--   Gen 4  =  0.30%
--   Gen 5  =  0.22%
--   Gen 6  =  0.18%
--   Gen 7  =  0.15%
--   Total  = 12.00%
--
-- Gen 1 applies to eligible settled subscription revenue for the lifetime of the
-- qualified referred billing relationship, not only the first payment.
-- Gen 2-7 remain disabled by default. While disabled, Superadmin may inspect a
-- shadow projection, but no downstream ledger accrual or payable is created.
--
-- The ledger is append-only. Refunds/reversals append compensating entries instead
-- of mutating historical accruals. Settlement decisions live in a separate table.

CREATE TABLE IF NOT EXISTS network_reward_settings (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'global'),
  network_rewards_enabled INTEGER NOT NULL DEFAULT 0 CHECK (network_rewards_enabled IN (0, 1)),
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO network_reward_settings (
  id, network_rewards_enabled, updated_by_user_id, updated_at
) VALUES (
  'global', 0, NULL, '2026-09-11T00:00:00.000Z'
);

CREATE TABLE IF NOT EXISTS network_reward_generation_rates (
  generation INTEGER PRIMARY KEY NOT NULL CHECK (generation BETWEEN 1 AND 7),
  rate_bps INTEGER NOT NULL CHECK (rate_bps > 0 AND rate_bps <= 10000),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO network_reward_generation_rates (generation, rate_bps, label, created_at) VALUES
  (1, 1000, 'Direct referral', '2026-09-11T00:00:00.000Z'),
  (2,   70, 'Generation 2',   '2026-09-11T00:00:00.000Z'),
  (3,   45, 'Generation 3',   '2026-09-11T00:00:00.000Z'),
  (4,   30, 'Generation 4',   '2026-09-11T00:00:00.000Z'),
  (5,   22, 'Generation 5',   '2026-09-11T00:00:00.000Z'),
  (6,   18, 'Generation 6',   '2026-09-11T00:00:00.000Z'),
  (7,   15, 'Generation 7',   '2026-09-11T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS network_reward_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  source_payment_id TEXT NOT NULL REFERENCES billing_payments(id),
  source_user_id TEXT NOT NULL REFERENCES users(id),
  beneficiary_user_id TEXT NOT NULL REFERENCES users(id),
  generation INTEGER NOT NULL CHECK (generation BETWEEN 1 AND 7),
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('accrual', 'reversal')),
  basis_amount_cents INTEGER NOT NULL CHECK (basis_amount_cents > 0),
  rate_bps INTEGER NOT NULL CHECK (rate_bps > 0 AND rate_bps <= 10000),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  related_entry_id TEXT REFERENCES network_reward_ledger(id),
  source_path_edge_id TEXT NOT NULL REFERENCES network_referral_edges(id),
  downstream_enabled_snapshot INTEGER NOT NULL CHECK (downstream_enabled_snapshot IN (0, 1)),
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_payment_id, beneficiary_user_id, generation, entry_kind),
  CHECK (source_user_id <> beneficiary_user_id),
  CHECK (
    (entry_kind = 'accrual' AND related_entry_id IS NULL)
    OR
    (entry_kind = 'reversal' AND related_entry_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_network_reward_ledger_beneficiary
  ON network_reward_ledger(beneficiary_user_id, generation, entry_kind, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_reward_ledger_payment
  ON network_reward_ledger(source_payment_id, generation, entry_kind);
CREATE INDEX IF NOT EXISTS idx_network_reward_ledger_effective
  ON network_reward_ledger(effective_at DESC, generation);
CREATE INDEX IF NOT EXISTS idx_network_reward_ledger_related
  ON network_reward_ledger(related_entry_id);

CREATE TABLE IF NOT EXISTS network_reward_settlements (
  ledger_entry_id TEXT PRIMARY KEY NOT NULL REFERENCES network_reward_ledger(id),
  status TEXT NOT NULL CHECK (status IN ('review', 'approved', 'paid', 'void')),
  decision_amount_cents INTEGER NOT NULL CHECK (decision_amount_cents > 0),
  source TEXT NOT NULL DEFAULT 'v4' CHECK (source IN ('v4', 'v3_legacy')),
  reason TEXT NOT NULL,
  payment_reference TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  approved_by_user_id TEXT REFERENCES users(id),
  paid_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_network_reward_settlements_status
  ON network_reward_settlements(status, approved_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_reward_settlements_source
  ON network_reward_settlements(source, status, updated_at DESC);

-- Backfill every historical Gen 1 payment event. A payment row only exists after a
-- real positive-value onchain checkout. Refunded/reversed rows are intentionally
-- accrued first and then offset below so accounting history remains append-only.
INSERT OR IGNORE INTO network_reward_ledger (
  id, source_payment_id, source_user_id, beneficiary_user_id, generation,
  entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
  source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
)
SELECT
  'nrew_' || bp.id || '_' || p.ancestor_user_id || '_g1_a',
  bp.id,
  bci.requested_by_user_id,
  p.ancestor_user_id,
  1,
  'accrual',
  bp.amount_cents,
  rate.rate_bps,
  CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER),
  NULL,
  p.source_edge_id,
  (SELECT network_rewards_enabled FROM network_reward_settings WHERE id = 'global'),
  bp.verified_at,
  '2026-09-11T00:00:00.000Z'
FROM billing_payments bp
JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
JOIN network_referral_paths p
  ON p.descendant_user_id = bci.requested_by_user_id AND p.depth = 1
JOIN network_referral_edges edge
  ON edge.id = p.source_edge_id AND edge.status = 'active'
JOIN network_reward_generation_rates rate ON rate.generation = 1
WHERE CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER) > 0;

-- Preserve already-refunded/reversed history as a compensating ledger entry.
INSERT OR IGNORE INTO network_reward_ledger (
  id, source_payment_id, source_user_id, beneficiary_user_id, generation,
  entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
  source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
)
SELECT
  accrual.id || '_r',
  accrual.source_payment_id,
  accrual.source_user_id,
  accrual.beneficiary_user_id,
  accrual.generation,
  'reversal',
  accrual.basis_amount_cents,
  accrual.rate_bps,
  accrual.amount_cents,
  accrual.id,
  accrual.source_path_edge_id,
  accrual.downstream_enabled_snapshot,
  bp.verified_at,
  '2026-09-11T00:00:00.000Z'
FROM network_reward_ledger accrual
JOIN billing_payments bp ON bp.id = accrual.source_payment_id
WHERE accrual.entry_kind = 'accrual'
  AND accrual.generation = 1
  AND bp.status IN ('refunded', 'reversed');

-- Carry forward any V3 first-payment review/approval/payment state so the same
-- first payment cannot accidentally enter a second payment workflow in V4.
INSERT OR IGNORE INTO network_reward_settlements (
  ledger_entry_id, status, decision_amount_cents, source, reason, payment_reference,
  created_by_user_id, approved_by_user_id, paid_by_user_id, approved_at, paid_at,
  created_at, updated_at
)
SELECT
  accrual.id,
  decision.status,
  decision.computed_reward_cents,
  'v3_legacy',
  decision.reason,
  decision.payment_reference,
  decision.created_by_user_id,
  decision.approved_by_user_id,
  decision.paid_by_user_id,
  decision.approved_at,
  decision.paid_at,
  decision.created_at,
  decision.updated_at
FROM referral_reward_decisions decision
JOIN network_reward_ledger accrual
  ON accrual.source_payment_id = decision.payment_id
 AND accrual.generation = 1
 AND accrual.entry_kind = 'accrual';

-- Every new verified payment creates a lifetime Gen 1 accrual when canonical
-- referral lineage exists. This is intentionally independent of the downstream flag.
CREATE TRIGGER IF NOT EXISTS trg_network_reward_gen1_after_payment
AFTER INSERT ON billing_payments
WHEN NEW.status = 'verified'
BEGIN
  INSERT OR IGNORE INTO network_reward_ledger (
    id, source_payment_id, source_user_id, beneficiary_user_id, generation,
    entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
    source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
  )
  SELECT
    'nrew_' || NEW.id || '_' || p.ancestor_user_id || '_g1_a',
    NEW.id,
    bci.requested_by_user_id,
    p.ancestor_user_id,
    1,
    'accrual',
    NEW.amount_cents,
    rate.rate_bps,
    CAST(ROUND(NEW.amount_cents * rate.rate_bps / 10000.0) AS INTEGER),
    NULL,
    p.source_edge_id,
    (SELECT network_rewards_enabled FROM network_reward_settings WHERE id = 'global'),
    NEW.verified_at,
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM billing_checkout_intents bci
  JOIN network_referral_paths p
    ON p.descendant_user_id = bci.requested_by_user_id AND p.depth = 1
  JOIN network_referral_edges edge
    ON edge.id = p.source_edge_id AND edge.status = 'active'
  JOIN network_reward_generation_rates rate ON rate.generation = 1
  WHERE bci.id = NEW.checkout_intent_id
    AND CAST(ROUND(NEW.amount_cents * rate.rate_bps / 10000.0) AS INTEGER) > 0;
END;

-- Gen 2-7 accruals are created only while the explicit compliance-gated feature
-- flag is enabled. With the default false setting this trigger inserts nothing.
CREATE TRIGGER IF NOT EXISTS trg_network_reward_downstream_after_payment
AFTER INSERT ON billing_payments
WHEN NEW.status = 'verified'
 AND EXISTS (
   SELECT 1 FROM network_reward_settings
   WHERE id = 'global' AND network_rewards_enabled = 1
 )
BEGIN
  INSERT OR IGNORE INTO network_reward_ledger (
    id, source_payment_id, source_user_id, beneficiary_user_id, generation,
    entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
    source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
  )
  SELECT
    'nrew_' || NEW.id || '_' || p.ancestor_user_id || '_g' || p.depth || '_a',
    NEW.id,
    bci.requested_by_user_id,
    p.ancestor_user_id,
    p.depth,
    'accrual',
    NEW.amount_cents,
    rate.rate_bps,
    CAST(ROUND(NEW.amount_cents * rate.rate_bps / 10000.0) AS INTEGER),
    NULL,
    p.source_edge_id,
    1,
    NEW.verified_at,
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM billing_checkout_intents bci
  JOIN network_referral_paths p
    ON p.descendant_user_id = bci.requested_by_user_id AND p.depth BETWEEN 2 AND 7
  JOIN network_referral_edges edge
    ON edge.id = p.source_edge_id AND edge.status = 'active'
  JOIN network_reward_generation_rates rate ON rate.generation = p.depth
  WHERE bci.id = NEW.checkout_intent_id
    AND CAST(ROUND(NEW.amount_cents * rate.rate_bps / 10000.0) AS INTEGER) > 0;
END;

-- A refund or reversal never rewrites an earned row. It appends an equal and
-- opposite accounting entry for every accrual sourced from that payment.
CREATE TRIGGER IF NOT EXISTS trg_network_reward_reversal_after_payment_status
AFTER UPDATE OF status ON billing_payments
WHEN OLD.status = 'verified' AND NEW.status IN ('refunded', 'reversed')
BEGIN
  INSERT OR IGNORE INTO network_reward_ledger (
    id, source_payment_id, source_user_id, beneficiary_user_id, generation,
    entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
    source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
  )
  SELECT
    accrual.id || '_r',
    accrual.source_payment_id,
    accrual.source_user_id,
    accrual.beneficiary_user_id,
    accrual.generation,
    'reversal',
    accrual.basis_amount_cents,
    accrual.rate_bps,
    accrual.amount_cents,
    accrual.id,
    accrual.source_path_edge_id,
    accrual.downstream_enabled_snapshot,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM network_reward_ledger accrual
  WHERE accrual.source_payment_id = NEW.id
    AND accrual.entry_kind = 'accrual';
END;

-- Keep V3 first-payment decisions mirrored as legacy settlement state while V3
-- remains visible for historical continuity. V4 never deletes or rewrites V3.
CREATE TRIGGER IF NOT EXISTS trg_network_reward_v3_decision_after_insert
AFTER INSERT ON referral_reward_decisions
BEGIN
  INSERT OR IGNORE INTO network_reward_settlements (
    ledger_entry_id, status, decision_amount_cents, source, reason, payment_reference,
    created_by_user_id, approved_by_user_id, paid_by_user_id, approved_at, paid_at,
    created_at, updated_at
  )
  SELECT
    accrual.id,
    NEW.status,
    NEW.computed_reward_cents,
    'v3_legacy',
    NEW.reason,
    NEW.payment_reference,
    NEW.created_by_user_id,
    NEW.approved_by_user_id,
    NEW.paid_by_user_id,
    NEW.approved_at,
    NEW.paid_at,
    NEW.created_at,
    NEW.updated_at
  FROM network_reward_ledger accrual
  WHERE accrual.source_payment_id = NEW.payment_id
    AND accrual.generation = 1
    AND accrual.entry_kind = 'accrual'
  LIMIT 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_network_reward_v3_decision_after_update
AFTER UPDATE OF status, computed_reward_cents, reason, payment_reference, approved_by_user_id, paid_by_user_id, approved_at, paid_at, updated_at
ON referral_reward_decisions
BEGIN
  UPDATE network_reward_settlements
     SET status = NEW.status,
         decision_amount_cents = NEW.computed_reward_cents,
         reason = NEW.reason,
         payment_reference = NEW.payment_reference,
         approved_by_user_id = NEW.approved_by_user_id,
         paid_by_user_id = NEW.paid_by_user_id,
         approved_at = NEW.approved_at,
         paid_at = NEW.paid_at,
         updated_at = NEW.updated_at
   WHERE source = 'v3_legacy'
     AND ledger_entry_id IN (
       SELECT id FROM network_reward_ledger
       WHERE source_payment_id = NEW.payment_id
         AND generation = 1
         AND entry_kind = 'accrual'
     );
END;

-- Ledger facts are immutable. Corrections must use compensating entries.
CREATE TRIGGER IF NOT EXISTS trg_network_reward_ledger_no_update
BEFORE UPDATE ON network_reward_ledger
BEGIN
  SELECT RAISE(ABORT, 'network_reward_ledger_append_only');
END;

CREATE TRIGGER IF NOT EXISTS trg_network_reward_ledger_no_delete
BEFORE DELETE ON network_reward_ledger
BEGIN
  SELECT RAISE(ABORT, 'network_reward_ledger_append_only');
END;
