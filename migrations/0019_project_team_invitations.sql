-- Project Team Invitations V1.
-- Team invitations are operational Project access and never consume network invite credits.

ALTER TABLE invites ADD COLUMN intended_project_role TEXT
  CHECK (intended_project_role IS NULL OR intended_project_role IN ('admin','marketing_manager','analyst','viewer'));

CREATE INDEX IF NOT EXISTS idx_invites_project_team
  ON invites(inviter_organization_id, invite_type, status, created_at DESC);

-- A team invite is single-use even if two acceptance attempts race.
CREATE TRIGGER IF NOT EXISTS trg_team_invite_redemption_guard_before_insert
BEFORE INSERT ON invite_redemptions
WHEN EXISTS (
  SELECT 1
    FROM invites i
   WHERE i.id = NEW.invite_id
     AND i.invite_type = 'team_invite'
     AND (
       i.status != 'active'
       OR (i.expires_at IS NOT NULL AND i.expires_at <= CURRENT_TIMESTAMP)
       OR i.uses >= i.max_uses
     )
)
BEGIN
  SELECT RAISE(ABORT, 'team_invite_unavailable');
END;

-- Redemption is the source of truth for accepting a team invite.
-- Existing active memberships keep their current role; removed memberships can be restored
-- using the role carried by the new invitation.
CREATE TRIGGER IF NOT EXISTS trg_team_invite_membership_after_redemption
AFTER INSERT ON invite_redemptions
WHEN EXISTS (
  SELECT 1 FROM invites i
   WHERE i.id = NEW.invite_id
     AND i.invite_type = 'team_invite'
     AND i.inviter_organization_id IS NOT NULL
     AND i.intended_project_role IS NOT NULL
)
BEGIN
  INSERT INTO organization_memberships (
    id, user_id, organization_id, role, billing_manager, status, created_at, updated_at
  )
  SELECT
    'mem_' || lower(hex(randomblob(16))),
    NEW.user_id,
    i.inviter_organization_id,
    i.intended_project_role,
    0,
    'active',
    NEW.redeemed_at,
    NEW.redeemed_at
  FROM invites i
  WHERE i.id = NEW.invite_id
  ON CONFLICT(user_id, organization_id) DO UPDATE SET
    role = CASE
      WHEN organization_memberships.status = 'active' THEN organization_memberships.role
      ELSE excluded.role
    END,
    billing_manager = CASE
      WHEN organization_memberships.status = 'active' THEN organization_memberships.billing_manager
      ELSE 0
    END,
    status = 'active',
    updated_at = excluded.updated_at;

  INSERT INTO audit_logs (
    id, actor_user_id, actor_kind, action, resource_type, resource_id,
    organization_id, metadata_json, created_at
  )
  SELECT
    'aud_' || lower(hex(randomblob(16))),
    NEW.user_id,
    'user',
    'project_team_invite.accepted',
    'invite',
    NEW.invite_id,
    i.inviter_organization_id,
    json_object('role', i.intended_project_role, 'intendedEmail', i.intended_email),
    NEW.redeemed_at
  FROM invites i
  WHERE i.id = NEW.invite_id
    AND i.invite_type = 'team_invite';
END;
