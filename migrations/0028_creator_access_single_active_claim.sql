-- Creator Earn Access active-claim integrity.
--
-- One CDP identity must have at most one unexpired active Creator Earn Access
-- claim across draft, submitted, and approved states. The triggers below make
-- that invariant database-authoritative for both new claims and state changes.
--
-- Before installing the guard, resolve any historical duplicates that may have
-- been produced by a read-then-insert race. Prefer the strongest/newest claim:
-- approved > submitted > draft, then most recently updated.

-- Revoke any still-active approval invite that belongs to a duplicate loser.
WITH ranked_active_claims AS (
  SELECT
    id,
    approved_invite_id,
    ROW_NUMBER() OVER (
      PARTITION BY cdp_project_id, cdp_user_id
      ORDER BY
        CASE status
          WHEN 'approved' THEN 0
          WHEN 'submitted' THEN 1
          ELSE 2
        END,
        datetime(updated_at) DESC,
        id DESC
    ) AS active_rank
  FROM creator_access_claims
  WHERE status IN ('draft', 'submitted', 'approved')
    AND datetime(expires_at) > CURRENT_TIMESTAMP
)
UPDATE invites
   SET status = 'revoked',
       updated_at = CURRENT_TIMESTAMP
 WHERE status = 'active'
   AND id IN (
     SELECT approved_invite_id
       FROM ranked_active_claims
      WHERE active_rank > 1
        AND approved_invite_id IS NOT NULL
   );

-- Keep duplicate rows as history, but make only the authoritative winner active.
WITH ranked_active_claims AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY cdp_project_id, cdp_user_id
      ORDER BY
        CASE status
          WHEN 'approved' THEN 0
          WHEN 'submitted' THEN 1
          ELSE 2
        END,
        datetime(updated_at) DESC,
        id DESC
    ) AS active_rank
  FROM creator_access_claims
  WHERE status IN ('draft', 'submitted', 'approved')
    AND datetime(expires_at) > CURRENT_TIMESTAMP
)
UPDATE creator_access_claims
   SET status = 'revoked',
       updated_at = CURRENT_TIMESTAMP
 WHERE id IN (
   SELECT id
     FROM ranked_active_claims
    WHERE active_rank > 1
 );

CREATE TRIGGER IF NOT EXISTS trg_creator_access_single_active_before_insert
BEFORE INSERT ON creator_access_claims
WHEN NEW.status IN ('draft', 'submitted', 'approved')
  AND datetime(NEW.expires_at) > CURRENT_TIMESTAMP
  AND EXISTS (
    SELECT 1
      FROM creator_access_claims existing
     WHERE existing.cdp_project_id = NEW.cdp_project_id
       AND existing.cdp_user_id = NEW.cdp_user_id
       AND existing.status IN ('draft', 'submitted', 'approved')
       AND datetime(existing.expires_at) > CURRENT_TIMESTAMP
  )
BEGIN
  SELECT RAISE(ABORT, 'creator_access_active_claim_exists');
END;

CREATE TRIGGER IF NOT EXISTS trg_creator_access_single_active_before_update
BEFORE UPDATE OF status, expires_at, cdp_project_id, cdp_user_id ON creator_access_claims
WHEN NEW.status IN ('draft', 'submitted', 'approved')
  AND datetime(NEW.expires_at) > CURRENT_TIMESTAMP
  AND EXISTS (
    SELECT 1
      FROM creator_access_claims existing
     WHERE existing.id != OLD.id
       AND existing.cdp_project_id = NEW.cdp_project_id
       AND existing.cdp_user_id = NEW.cdp_user_id
       AND existing.status IN ('draft', 'submitted', 'approved')
       AND datetime(existing.expires_at) > CURRENT_TIMESTAMP
  )
BEGIN
  SELECT RAISE(ABORT, 'creator_access_active_claim_exists');
END;
