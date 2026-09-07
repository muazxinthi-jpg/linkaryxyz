-- Seven-Generation Linkary Network Graph
--
-- Every accepted network_invite redemption creates one permanent acquisition edge.
-- The closure table stores bounded ancestry up to seven generations so normal
-- Personal Profile reads never need recursive full-history scans.
--
-- Economic downstream rewards are deliberately NOT implemented by this migration.
-- The proposed 2% Network Reward Pool remains disabled until legal/compliance approval.

CREATE TABLE IF NOT EXISTS network_referral_edges (
  id TEXT PRIMARY KEY NOT NULL,
  inviter_user_id TEXT NOT NULL REFERENCES users(id),
  invitee_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  source_invite_id TEXT NOT NULL UNIQUE REFERENCES invites(id),
  chosen_account_type TEXT CHECK (chosen_account_type IN ('creator', 'project')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'held', 'invalid')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (inviter_user_id <> invitee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_network_referral_edges_inviter
  ON network_referral_edges(inviter_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_network_referral_edges_invitee
  ON network_referral_edges(invitee_user_id, status);

CREATE TABLE IF NOT EXISTS network_referral_paths (
  ancestor_user_id TEXT NOT NULL REFERENCES users(id),
  descendant_user_id TEXT NOT NULL REFERENCES users(id),
  depth INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 7),
  source_edge_id TEXT NOT NULL REFERENCES network_referral_edges(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (ancestor_user_id, descendant_user_id),
  CHECK (ancestor_user_id <> descendant_user_id)
);

CREATE INDEX IF NOT EXISTS idx_network_referral_paths_ancestor_depth
  ON network_referral_paths(ancestor_user_id, depth, descendant_user_id);
CREATE INDEX IF NOT EXISTS idx_network_referral_paths_descendant
  ON network_referral_paths(descendant_user_id, depth, ancestor_user_id);

-- Backfill one canonical acquisition edge per existing Linkary member. If an
-- existing user redeemed more than one network invite, preserve the earliest
-- accepted network invite as the permanent lineage source.
INSERT OR IGNORE INTO network_referral_edges (
  id,
  inviter_user_id,
  invitee_user_id,
  source_invite_id,
  chosen_account_type,
  status,
  created_at,
  updated_at
)
SELECT
  'nedge_' || lower(hex(randomblob(16))),
  i.inviter_user_id,
  r.user_id,
  i.id,
  r.chosen_account_type,
  'active',
  r.redeemed_at,
  r.redeemed_at
FROM invite_redemptions r
JOIN invites i ON i.id = r.invite_id
WHERE i.invite_type = 'network_invite'
  AND i.inviter_user_id IS NOT NULL
  AND i.inviter_user_id <> r.user_id
  AND r.id = (
    SELECT r2.id
    FROM invite_redemptions r2
    JOIN invites i2 ON i2.id = r2.invite_id
    WHERE r2.user_id = r.user_id
      AND i2.invite_type = 'network_invite'
      AND i2.inviter_user_id IS NOT NULL
      AND i2.inviter_user_id <> r2.user_id
    ORDER BY r2.redeemed_at ASC, r2.id ASC
    LIMIT 1
  );

-- Seed direct ancestry.
INSERT OR IGNORE INTO network_referral_paths (
  ancestor_user_id,
  descendant_user_id,
  depth,
  source_edge_id,
  created_at
)
SELECT inviter_user_id, invitee_user_id, 1, id, created_at
FROM network_referral_edges
WHERE status = 'active';

-- Expand the existing lineage in bounded passes. Seven passes are intentionally
-- explicit so the maximum depth remains an engineering invariant.
INSERT OR IGNORE INTO network_referral_paths
SELECT p.ancestor_user_id, e.invitee_user_id, 2, e.id, e.created_at
FROM network_referral_paths p
JOIN network_referral_edges e ON e.inviter_user_id = p.descendant_user_id AND e.status = 'active'
WHERE p.depth = 1 AND p.ancestor_user_id <> e.invitee_user_id;

INSERT OR IGNORE INTO network_referral_paths
SELECT p.ancestor_user_id, e.invitee_user_id, 3, e.id, e.created_at
FROM network_referral_paths p
JOIN network_referral_edges e ON e.inviter_user_id = p.descendant_user_id AND e.status = 'active'
WHERE p.depth = 2 AND p.ancestor_user_id <> e.invitee_user_id;

INSERT OR IGNORE INTO network_referral_paths
SELECT p.ancestor_user_id, e.invitee_user_id, 4, e.id, e.created_at
FROM network_referral_paths p
JOIN network_referral_edges e ON e.inviter_user_id = p.descendant_user_id AND e.status = 'active'
WHERE p.depth = 3 AND p.ancestor_user_id <> e.invitee_user_id;

INSERT OR IGNORE INTO network_referral_paths
SELECT p.ancestor_user_id, e.invitee_user_id, 5, e.id, e.created_at
FROM network_referral_paths p
JOIN network_referral_edges e ON e.inviter_user_id = p.descendant_user_id AND e.status = 'active'
WHERE p.depth = 4 AND p.ancestor_user_id <> e.invitee_user_id;

INSERT OR IGNORE INTO network_referral_paths
SELECT p.ancestor_user_id, e.invitee_user_id, 6, e.id, e.created_at
FROM network_referral_paths p
JOIN network_referral_edges e ON e.inviter_user_id = p.descendant_user_id AND e.status = 'active'
WHERE p.depth = 5 AND p.ancestor_user_id <> e.invitee_user_id;

INSERT OR IGNORE INTO network_referral_paths
SELECT p.ancestor_user_id, e.invitee_user_id, 7, e.id, e.created_at
FROM network_referral_paths p
JOIN network_referral_edges e ON e.inviter_user_id = p.descendant_user_id AND e.status = 'active'
WHERE p.depth = 6 AND p.ancestor_user_id <> e.invitee_user_id;

-- New network invite redemptions become graph edges automatically. This trigger
-- is deliberately scoped to network_invite and refuses a second inviter, a
-- self-edge, or a lineage that would close an already-known cycle.
CREATE TRIGGER IF NOT EXISTS trg_network_referral_edge_after_redemption
AFTER INSERT ON invite_redemptions
WHEN EXISTS (
  SELECT 1 FROM invites i
  WHERE i.id = NEW.invite_id
    AND i.invite_type = 'network_invite'
    AND i.inviter_user_id IS NOT NULL
)
BEGIN
  INSERT OR IGNORE INTO network_referral_edges (
    id,
    inviter_user_id,
    invitee_user_id,
    source_invite_id,
    chosen_account_type,
    status,
    created_at,
    updated_at
  )
  SELECT
    'nedge_' || lower(hex(randomblob(16))),
    i.inviter_user_id,
    NEW.user_id,
    i.id,
    NEW.chosen_account_type,
    'active',
    NEW.redeemed_at,
    NEW.redeemed_at
  FROM invites i
  WHERE i.id = NEW.invite_id
    AND i.invite_type = 'network_invite'
    AND i.inviter_user_id IS NOT NULL
    AND i.inviter_user_id <> NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM network_referral_edges existing
      WHERE existing.invitee_user_id = NEW.user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM network_referral_paths reverse_path
      WHERE reverse_path.ancestor_user_id = NEW.user_id
        AND reverse_path.descendant_user_id = i.inviter_user_id
    );

  INSERT OR IGNORE INTO network_referral_paths (
    ancestor_user_id,
    descendant_user_id,
    depth,
    source_edge_id,
    created_at
  )
  SELECT e.inviter_user_id, e.invitee_user_id, 1, e.id, NEW.redeemed_at
  FROM network_referral_edges e
  WHERE e.source_invite_id = NEW.invite_id
    AND e.invitee_user_id = NEW.user_id
    AND e.status = 'active';

  INSERT OR IGNORE INTO network_referral_paths (
    ancestor_user_id,
    descendant_user_id,
    depth,
    source_edge_id,
    created_at
  )
  SELECT
    parent_path.ancestor_user_id,
    e.invitee_user_id,
    parent_path.depth + 1,
    e.id,
    NEW.redeemed_at
  FROM network_referral_edges e
  JOIN network_referral_paths parent_path
    ON parent_path.descendant_user_id = e.inviter_user_id
  WHERE e.source_invite_id = NEW.invite_id
    AND e.invitee_user_id = NEW.user_id
    AND e.status = 'active'
    AND parent_path.depth < 7
    AND parent_path.ancestor_user_id <> e.invitee_user_id;
END;

-- Onboarding assigns Creator or Project intent after the access redemption. Keep
-- the graph edge enriched without making account type part of the permanent User identity.
CREATE TRIGGER IF NOT EXISTS trg_network_referral_edge_account_type_after_update
AFTER UPDATE OF chosen_account_type ON invite_redemptions
WHEN NEW.chosen_account_type IS NOT NULL
BEGIN
  UPDATE network_referral_edges
     SET chosen_account_type = NEW.chosen_account_type,
         updated_at = CURRENT_TIMESTAMP
   WHERE source_invite_id = NEW.invite_id
     AND invitee_user_id = NEW.user_id;
END;
