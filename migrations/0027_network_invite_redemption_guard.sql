-- Network Invite Redemption Integrity.
-- Normal Linkary network invites must not redeem beyond max_uses, even when
-- multiple first-time account creations race the same invitation.
--
-- Team invitations already have their own guard in migration 0019.
-- Keep this trigger deliberately scoped to network_invite.

CREATE TRIGGER IF NOT EXISTS trg_network_invite_redemption_guard_before_insert
BEFORE INSERT ON invite_redemptions
WHEN EXISTS (
  SELECT 1
    FROM invites i
   WHERE i.id = NEW.invite_id
     AND i.invite_type = 'network_invite'
     AND (
       i.status != 'active'
       OR (i.expires_at IS NOT NULL AND datetime(i.expires_at) <= CURRENT_TIMESTAMP)
       OR i.uses >= i.max_uses
       OR (
         SELECT COUNT(*)
           FROM invite_redemptions existing
          WHERE existing.invite_id = NEW.invite_id
       ) >= i.max_uses
     )
)
BEGIN
  SELECT RAISE(ABORT, 'network_invite_unavailable');
END;
