import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { randomToken, sha256 } from '../security/crypto';
import { getLinkaryUrls } from '../urls';
import { organizationMembership } from './organizations';
import { createNetworkInvite as legacyCreateNetworkInvite } from './invites';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
type OwnerType = 'profile' | 'organization';
type ProjectTeamRole = 'admin' | 'marketing_manager' | 'analyst' | 'viewer';

type InviteBody = {
  ownerType?: OwnerType;
  ownerId?: string;
  expiresInDays?: number | null;
  action?: 'create' | 'revoke' | 'create_team' | 'revoke_team' | 'accept_team';
  inviteId?: string;
  inviteCode?: string;
};

async function authorizeInviteOwner(db: Db, userId: string, ownerType: OwnerType, ownerId: string): Promise<void> {
  if (ownerType === 'profile') {
    const profile = await db.first<{ owner_user_id: string | null; profile_type: string }>(
      `SELECT owner_user_id, profile_type FROM profiles WHERE id = ?`,
      [ownerId],
    );
    if (!profile || profile.profile_type !== 'creator' || profile.owner_user_id !== userId) {
      throw new HttpError(403, 'Creator profile invite access denied', 'forbidden');
    }
    return;
  }
  const membership = await organizationMembership(db, userId, ownerId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) {
    throw new HttpError(403, 'Project invite access denied', 'forbidden');
  }
}

async function acceptTeamInvite(request: Request, env: Env, body: InviteBody): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const code = body.inviteCode?.trim();
  if (!code) throw new HttpError(400, 'Team invitation code is required', 'invalid_team_invite');

  const db = new Db(requireDb(env));
  const invite = await db.first<{
    id: string;
    inviter_organization_id: string | null;
    intended_project_role: ProjectTeamRole | null;
    intended_email: string | null;
    status: string;
    uses: number;
    max_uses: number;
    expires_at: string | null;
  }>(
    `SELECT id, inviter_organization_id, intended_project_role, intended_email, status, uses, max_uses, expires_at
       FROM invites WHERE code_hash = ? AND invite_type = 'team_invite'`,
    [await sha256(code)],
  );
  if (!invite?.inviter_organization_id || !invite.intended_project_role) {
    throw new HttpError(404, 'Team invitation not found', 'invite_not_found');
  }

  if (invite.intended_email) {
    const expectedEmail = invite.intended_email.trim().toLowerCase();
    const currentEmail = auth.user.email?.trim().toLowerCase() || '';
    if (!currentEmail || currentEmail !== expectedEmail) {
      throw new HttpError(403, 'This team invitation requires the matching verified email address', 'team_invite_email_mismatch');
    }
  }

  const existing = await db.first<{ id: string }>(
    `SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`,
    [invite.id, auth.user.id],
  );
  if (existing) {
    return json({ ok: true, alreadyAccepted: true, organizationId: invite.inviter_organization_id, role: invite.intended_project_role });
  }

  if (invite.status !== 'active' || invite.uses >= invite.max_uses || (invite.expires_at && invite.expires_at <= now())) {
    throw new HttpError(409, 'This team invitation is no longer available', 'invite_not_active');
  }

  const project = await db.first<{ id: string; name: string; status: string; verification_status: string }>(
    `SELECT id, name, status, verification_status FROM organizations WHERE id = ?`,
    [invite.inviter_organization_id],
  );
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') {
    throw new HttpError(409, 'This Project is not currently accepting team access', 'project_not_available');
  }

  const timestamp = now();
  try {
    await db.batch([
      db.statement(
        `INSERT INTO invite_redemptions (id, invite_id, user_id, chosen_account_type, organization_id, quality_state, redeemed_at)
         VALUES (?, ?, ?, NULL, ?, 'accepted_team', ?)`,
        [id('red'), invite.id, auth.user.id, invite.inviter_organization_id, timestamp],
      ),
      db.statement(
        `UPDATE invites SET uses = uses + 1,
          status = CASE WHEN uses + 1 >= max_uses THEN 'exhausted' ELSE status END,
          updated_at = ?
         WHERE id = ? AND status = 'active' AND uses < max_uses`,
        [timestamp, invite.id],
      ),
    ]);
  } catch {
    const raced = await db.first<{ id: string }>(
      `SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`,
      [invite.id, auth.user.id],
    );
    if (raced) {
      return json({ ok: true, alreadyAccepted: true, organizationId: invite.inviter_organization_id, role: invite.intended_project_role });
    }
    throw new HttpError(409, 'This team invitation is no longer available', 'invite_not_active');
  }

  return json({ ok: true, alreadyAccepted: false, organizationId: project.id, projectName: project.name, role: invite.intended_project_role });
}

async function revokeNetworkInvite(request: Request, env: Env, body: InviteBody): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  if (!body.inviteId) throw new HttpError(400, 'Invite is required', 'invalid_invite');
  const db = new Db(requireDb(env));

  const owner = await db.first<{ owner_type: OwnerType; owner_id: string }>(
    `SELECT owner_type, owner_id FROM invite_ledger
      WHERE related_invite_id = ? AND transaction_type = 'use'
      ORDER BY created_at ASC LIMIT 1`,
    [body.inviteId],
  );
  if (!owner) throw new HttpError(404, 'Invitation not found', 'invite_not_found');
  await authorizeInviteOwner(db, auth.user.id, owner.owner_type, owner.owner_id);

  const refundId = id('iled');
  const timestamp = now();
  await db.batch([
    db.statement(
      `INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at)
       SELECT ?, ?, ?, 'refund', 1, 'unused_invite_revoked', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM invites WHERE id = ? AND status = 'active' AND uses = 0
        )
          AND NOT EXISTS (
            SELECT 1 FROM invite_ledger WHERE related_invite_id = ? AND transaction_type = 'refund'
          )`,
      [refundId, owner.owner_type, owner.owner_id, body.inviteId, timestamp, body.inviteId, body.inviteId],
    ),
    db.statement(
      `UPDATE invites SET status = 'revoked', updated_at = ?
        WHERE id = ? AND status = 'active' AND uses = 0
          AND EXISTS (SELECT 1 FROM invite_ledger WHERE id = ? AND transaction_type = 'refund')`,
      [timestamp, body.inviteId, refundId],
    ),
    db.statement(
      `UPDATE invite_balances SET available_credits = available_credits + 1, updated_at = ?
        WHERE owner_type = ? AND owner_id = ?
          AND EXISTS (SELECT 1 FROM invite_ledger WHERE id = ? AND transaction_type = 'refund')`,
      [timestamp, owner.owner_type, owner.owner_id, refundId],
    ),
  ]);

  const refunded = await db.first<{ id: string }>(`SELECT id FROM invite_ledger WHERE id = ?`, [refundId]);
  if (refunded) return json({ ok: true, status: 'revoked', creditRefunded: true });

  const invite = await db.first<{ status: string; uses: number }>(`SELECT status, uses FROM invites WHERE id = ?`, [body.inviteId]);
  const priorRefund = await db.first<{ id: string }>(
    `SELECT id FROM invite_ledger WHERE related_invite_id = ? AND transaction_type = 'refund' LIMIT 1`,
    [body.inviteId],
  );
  if (invite?.status === 'revoked' && priorRefund) {
    return json({ ok: true, status: 'revoked', creditRefunded: false, alreadyRevoked: true });
  }
  if (!invite) throw new HttpError(404, 'Invitation not found', 'invite_not_found');
  if (invite.uses > 0) throw new HttpError(409, 'Redeemed invitations cannot be revoked', 'invite_already_used');
  throw new HttpError(409, 'Only active invitations can be revoked', 'invite_not_active');
}

async function createNetworkInviteSafely(request: Request, env: Env, body: InviteBody): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  if ((body.ownerType !== 'profile' && body.ownerType !== 'organization') || !body.ownerId) {
    throw new HttpError(400, 'ownerType and ownerId are required', 'invalid_invite_owner');
  }

  const db = new Db(requireDb(env));
  await authorizeInviteOwner(db, auth.user.id, body.ownerType, body.ownerId);
  const expiryDays = body.expiresInDays === null || body.expiresInDays === undefined
    ? 30
    : Math.max(1, Math.min(90, Math.floor(body.expiresInDays)));
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  const rawCode = randomToken(18);
  const inviteId = id('inv');
  const ledgerId = id('iled');
  const timestamp = now();
  const inviterOrganizationId = body.ownerType === 'organization' ? body.ownerId : null;

  await db.batch([
    db.statement(
      `INSERT INTO invites (
        id, code_hash, display_code, invite_type, inviter_user_id, inviter_organization_id,
        intended_email, allowed_account_types_json, max_uses, uses, expires_at, status, created_at, updated_at
      )
      SELECT ?, ?, ?, 'network_invite', ?, ?, NULL, '["creator","project"]', 1, 0, ?, 'active', ?, ?
       FROM invite_balances
      WHERE owner_type = ? AND owner_id = ? AND privileges_status = 'active' AND available_credits > 0`,
      [inviteId, await sha256(rawCode), rawCode, auth.user.id, inviterOrganizationId, expiresAt, timestamp, timestamp, body.ownerType, body.ownerId],
    ),
    db.statement(
      `UPDATE invite_balances
          SET available_credits = available_credits - 1,
              lifetime_used = lifetime_used + 1,
              updated_at = ?
        WHERE owner_type = ? AND owner_id = ? AND privileges_status = 'active' AND available_credits > 0
          AND EXISTS (SELECT 1 FROM invites WHERE id = ?)`,
      [timestamp, body.ownerType, body.ownerId, inviteId],
    ),
    db.statement(
      `INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at)
       SELECT ?, ?, ?, 'use', -1, 'network_invite_created', ?, ?
        WHERE EXISTS (SELECT 1 FROM invites WHERE id = ?)`,
      [ledgerId, body.ownerType, body.ownerId, inviteId, timestamp, inviteId],
    ),
  ]);

  const created = await db.first<{ id: string }>(`SELECT id FROM invites WHERE id = ?`, [inviteId]);
  const ledger = await db.first<{ id: string }>(`SELECT id FROM invite_ledger WHERE id = ?`, [ledgerId]);
  if (!created || !ledger) {
    const balance = await db.first<{ privileges_status: string; available_credits: number }>(
      `SELECT privileges_status, available_credits FROM invite_balances WHERE owner_type = ? AND owner_id = ?`,
      [body.ownerType, body.ownerId],
    );
    if (!balance || balance.privileges_status !== 'active') {
      throw new HttpError(403, 'Invite privileges are not active', 'invites_paused');
    }
    throw new HttpError(409, 'No invite credits remain', 'no_invite_credits');
  }

  return json({
    inviteId,
    inviteUrl: `${getLinkaryUrls(request, env).tracking}/i/${encodeURIComponent(rawCode)}`,
    allowedAccountTypes: ['creator', 'project'],
    uses: 1,
    expiresAt,
  }, { status: 201 });
}

export async function createNetworkInviteIntegrity(request: Request, env: Env): Promise<Response> {
  const inspection = request.clone();
  const body = await readJson<InviteBody>(inspection);
  if (body.action === 'accept_team') return acceptTeamInvite(request, env, body);
  if (body.action === 'revoke') return revokeNetworkInvite(request, env, body);
  if (!body.action || body.action === 'create') return createNetworkInviteSafely(request, env, body);
  return legacyCreateNetworkInvite(request, env);
}
