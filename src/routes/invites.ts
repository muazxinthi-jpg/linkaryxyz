import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, html, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { randomToken, sha256 } from '../security/crypto';
import { getLinkaryUrls } from '../urls';
import { organizationMembership } from './organizations';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
type ProjectTeamRole = 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
const PROJECT_TEAM_ROLES = new Set<ProjectTeamRole>(['admin', 'marketing_manager', 'analyst', 'viewer']);

interface CreateInviteBody {
  ownerType?: 'profile' | 'organization';
  ownerId?: string;
  expiresInDays?: number | null;
  action?: 'create' | 'revoke' | 'create_team' | 'revoke_team' | 'accept_team';
  inviteId?: string;
  inviteCode?: string;
  organizationId?: string;
  role?: ProjectTeamRole;
  email?: string | null;
}

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() || '';
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid teammate email address', 'invalid_email');
  }
  return email;
}

async function authorizeInviteOwner(db: Db, userId: string, ownerType: 'profile' | 'organization', ownerId: string): Promise<void> {
  if (ownerType === 'profile') {
    const profile = await db.first<{ owner_user_id: string | null; profile_type: string }>(`SELECT owner_user_id, profile_type FROM profiles WHERE id = ?`, [ownerId]);
    if (!profile || profile.profile_type !== 'creator' || profile.owner_user_id !== userId) throw new HttpError(403, 'Creator profile invite access denied', 'forbidden');
    return;
  }
  const membership = await organizationMembership(db, userId, ownerId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) throw new HttpError(403, 'Project invite access denied', 'forbidden');
}

async function requireProjectTeamInviteAdmin(db: Db, userId: string, organizationId: string) {
  const membership = await organizationMembership(db, userId, organizationId);
  if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'Project Admin access required', 'forbidden');
  return membership;
}

function teamInviteUrl(request: Request, env: Env, code: string): string {
  return `${getLinkaryUrls(request, env).app}/team-invite?invite=${encodeURIComponent(code)}`;
}

export async function inviteBalances(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); const db = new Db(requireDb(env));
  const rows = await db.all<{ owner_type: string; owner_id: string; available_credits: number; lifetime_granted: number; lifetime_used: number; quality_score: number; privileges_status: string }>(`SELECT b.* FROM invite_balances b WHERE (b.owner_type = 'profile' AND b.owner_id IN (SELECT id FROM profiles WHERE owner_user_id = ? AND profile_type = 'creator')) OR (b.owner_type = 'organization' AND b.owner_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = ? AND status = 'active'))`, [auth.user.id, auth.user.id]);
  return json({ balances: rows });
}

export async function listNetworkInvites(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); const db = new Db(requireDb(env));
  const rows = await db.all<{
    id: string;
    display_code: string | null;
    invite_type: string;
    inviter_organization_id: string | null;
    intended_email: string | null;
    intended_project_role: string | null;
    status: string;
    uses: number;
    max_uses: number;
    expires_at: string | null;
    created_at: string;
    clicks: number;
    registrations: number;
    chosen_account_type: string | null;
    quality_state: string | null;
    recipient_name: string | null;
    recipient_email: string | null;
    recipient_x_handle: string | null;
    recipient_telegram: number;
    owner_type: string | null;
    owner_id: string | null;
  }>(
    `SELECT
       i.id,
       i.display_code,
       i.invite_type,
       i.inviter_organization_id,
       i.intended_email,
       i.intended_project_role,
       CASE WHEN i.status = 'active' AND i.expires_at IS NOT NULL AND i.expires_at <= ? THEN 'expired' ELSE i.status END AS status,
       i.uses,
       i.max_uses,
       i.expires_at,
       i.created_at,
       COUNT(DISTINCT c.id) AS clicks,
       COUNT(DISTINCT r.id) AS registrations,
       MAX(r.chosen_account_type) AS chosen_account_type,
       MAX(r.quality_state) AS quality_state,
       MAX(u.display_name) AS recipient_name,
       MAX(u.email) AS recipient_email,
       MAX((SELECT p.current_handle FROM platform_identity_links pl JOIN platform_identities p ON p.id = pl.platform_identity_id WHERE pl.user_id = r.user_id AND pl.ended_at IS NULL AND p.platform = 'x' AND p.current_handle IS NOT NULL ORDER BY p.ownership_verified_at DESC LIMIT 1)) AS recipient_x_handle,
       MAX(CASE WHEN EXISTS (
         SELECT 1
           FROM platform_identity_links tpl
           JOIN platform_identities tp ON tp.id = tpl.platform_identity_id
          WHERE tpl.user_id = r.user_id
            AND tpl.link_type = 'owns'
            AND tpl.ended_at IS NULL
            AND tp.platform = 'telegram'
            AND tp.provider_object_type = 'person'
            AND tp.status = 'active'
       ) THEN 1 ELSE 0 END) AS recipient_telegram,
       MAX(l.owner_type) AS owner_type,
       MAX(l.owner_id) AS owner_id
     FROM invites i
     LEFT JOIN invite_click_events c ON c.invite_id = i.id
     LEFT JOIN invite_redemptions r ON r.invite_id = i.id
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN invite_ledger l ON l.related_invite_id = i.id AND l.transaction_type = 'use'
     WHERE (
       i.invite_type != 'team_invite'
       AND (
         i.inviter_user_id = ?
         OR i.inviter_organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = ? AND status = 'active')
       )
     ) OR (
       i.invite_type = 'team_invite'
       AND i.inviter_organization_id IN (
         SELECT organization_id FROM organization_memberships
          WHERE user_id = ? AND status = 'active' AND role IN ('owner','admin')
       )
     )
     GROUP BY i.id
     ORDER BY i.created_at DESC
     LIMIT 300`,
    [now(), auth.user.id, auth.user.id, auth.user.id],
  );
  const urls = getLinkaryUrls(request, env);
  return json({
    invites: rows.map((row) => ({
      ...row,
      invite_url: row.display_code
        ? row.invite_type === 'team_invite'
          ? `${urls.app}/team-invite?invite=${encodeURIComponent(row.display_code)}`
          : `${urls.tracking}/i/${encodeURIComponent(row.display_code)}`
        : null,
    })),
  });
}

export async function createNetworkInvite(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const body = await readJson<CreateInviteBody>(request);
  const db = new Db(requireDb(env));

  if (body.action === 'create_team') {
    const organizationId = body.organizationId?.trim();
    const role = body.role;
    if (!organizationId || !role || !PROJECT_TEAM_ROLES.has(role)) throw new HttpError(400, 'Project and team role are required', 'invalid_team_invite');
    const actor = await requireProjectTeamInviteAdmin(db, auth.user.id, organizationId);
    if (actor.role === 'admin' && role === 'admin') throw new HttpError(403, 'Only a Project Owner can invite another Project Admin', 'owner_required');
    const project = await db.first<{ id: string; name: string; status: string; verification_status: string }>(`SELECT id, name, status, verification_status FROM organizations WHERE id = ?`, [organizationId]);
    if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') throw new HttpError(409, 'Verify this Project before inviting teammates', 'project_verification_required');
    const intendedEmail = normalizeOptionalEmail(body.email);
    const expiryDays = body.expiresInDays === null || body.expiresInDays === undefined ? 14 : Math.max(1, Math.min(90, Math.floor(body.expiresInDays)));
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

    if (intendedEmail) {
      const existing = await db.first<{ id: string; display_code: string; expires_at: string | null }>(
        `SELECT id, display_code, expires_at FROM invites
          WHERE invite_type = 'team_invite' AND inviter_organization_id = ? AND intended_email = ?
            AND intended_project_role = ? AND status = 'active' AND uses = 0
            AND (expires_at IS NULL OR expires_at > ?)
          ORDER BY created_at DESC LIMIT 1`,
        [organizationId, intendedEmail, role, now()],
      );
      if (existing?.display_code) {
        return json({
          inviteId: existing.id,
          inviteUrl: teamInviteUrl(request, env, existing.display_code),
          organizationId,
          projectName: project.name,
          role,
          intendedEmail,
          expiresAt: existing.expires_at,
          duplicate: true,
          consumesNetworkCredit: false,
        });
      }
    }

    const rawCode = randomToken(18); const inviteId = id('inv'); const timestamp = now();
    await db.batch([
      db.statement(
        `INSERT INTO invites (
          id, code_hash, display_code, invite_type, inviter_user_id, inviter_organization_id,
          intended_email, allowed_account_types_json, max_uses, uses, expires_at, status,
          created_at, updated_at, intended_project_role
        ) VALUES (?, ?, ?, 'team_invite', ?, ?, ?, '[]', 1, 0, ?, 'active', ?, ?, ?)`,
        [inviteId, await sha256(rawCode), rawCode, auth.user.id, organizationId, intendedEmail, expiresAt, timestamp, timestamp, role],
      ),
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         VALUES (?, ?, 'user', 'project_team_invite.created', 'invite', ?, ?, ?, ?)`,
        [id('aud'), auth.user.id, inviteId, organizationId, JSON.stringify({ role, intendedEmail, expiresAt, consumesNetworkCredit: false }), timestamp],
      ),
    ]);
    return json({
      inviteId,
      inviteUrl: teamInviteUrl(request, env, rawCode),
      organizationId,
      projectName: project.name,
      role,
      intendedEmail,
      expiresAt,
      duplicate: false,
      consumesNetworkCredit: false,
    }, { status: 201 });
  }

  if (body.action === 'revoke_team') {
    if (!body.inviteId) throw new HttpError(400, 'Team invitation is required', 'invalid_team_invite');
    const invite = await db.first<{ id: string; inviter_organization_id: string | null; intended_project_role: ProjectTeamRole | null; status: string; uses: number }>(
      `SELECT id, inviter_organization_id, intended_project_role, status, uses FROM invites WHERE id = ? AND invite_type = 'team_invite'`,
      [body.inviteId],
    );
    if (!invite?.inviter_organization_id) throw new HttpError(404, 'Team invitation not found', 'invite_not_found');
    const actor = await requireProjectTeamInviteAdmin(db, auth.user.id, invite.inviter_organization_id);
    if (actor.role === 'admin' && invite.intended_project_role === 'admin') throw new HttpError(403, 'Only a Project Owner can manage Project Admin invitations', 'owner_required');
    if (invite.status !== 'active' || invite.uses > 0) throw new HttpError(409, 'Only unused active team invitations can be revoked', 'invite_not_active');
    const timestamp = now();
    await db.batch([
      db.statement(`UPDATE invites SET status = 'revoked', updated_at = ? WHERE id = ? AND status = 'active' AND uses = 0`, [timestamp, body.inviteId]),
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         VALUES (?, ?, 'user', 'project_team_invite.revoked', 'invite', ?, ?, ?, ?)`,
        [id('aud'), auth.user.id, body.inviteId, invite.inviter_organization_id, JSON.stringify({ role: invite.intended_project_role }), timestamp],
      ),
    ]);
    return json({ ok: true, status: 'revoked', creditRefunded: false, consumesNetworkCredit: false });
  }

  if (body.action === 'accept_team') {
    const code = body.inviteCode?.trim();
    if (!code) throw new HttpError(400, 'Team invitation code is required', 'invalid_team_invite');
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
    if (!invite?.inviter_organization_id || !invite.intended_project_role) throw new HttpError(404, 'Team invitation not found', 'invite_not_found');
    const existing = await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`, [invite.id, auth.user.id]);
    if (existing) {
      return json({ ok: true, alreadyAccepted: true, organizationId: invite.inviter_organization_id, role: invite.intended_project_role });
    }
    if (invite.status !== 'active' || invite.uses >= invite.max_uses || (invite.expires_at && invite.expires_at <= now())) throw new HttpError(409, 'This team invitation is no longer available', 'invite_not_active');
    if (invite.intended_email && auth.user.email && invite.intended_email.toLowerCase() !== auth.user.email.toLowerCase()) {
      throw new HttpError(403, 'This team invitation was prepared for a different email address', 'team_invite_email_mismatch');
    }
    const project = await db.first<{ id: string; name: string; status: string; verification_status: string }>(`SELECT id, name, status, verification_status FROM organizations WHERE id = ?`, [invite.inviter_organization_id]);
    if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') throw new HttpError(409, 'This Project is not currently accepting team access', 'project_not_available');
    const timestamp = now();
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
    return json({ ok: true, alreadyAccepted: false, organizationId: project.id, projectName: project.name, role: invite.intended_project_role });
  }

  if (body.action === 'revoke') {
    if (!body.inviteId) throw new HttpError(400, 'Invite is required', 'invalid_invite');
    const invite = await db.first<{ id: string; status: string; uses: number }>('SELECT id, status, uses FROM invites WHERE id = ?', [body.inviteId]);
    const owner = await db.first<{ owner_type: 'profile' | 'organization'; owner_id: string }>(
      `SELECT owner_type, owner_id FROM invite_ledger WHERE related_invite_id = ? AND transaction_type = 'use' ORDER BY created_at ASC LIMIT 1`,
      [body.inviteId],
    );
    if (!invite || !owner) throw new HttpError(404, 'Invitation not found', 'invite_not_found');
    await authorizeInviteOwner(db, auth.user.id, owner.owner_type, owner.owner_id);
    if (invite.status !== 'active') throw new HttpError(409, 'Only active invitations can be revoked', 'invite_not_active');
    if (invite.uses > 0) throw new HttpError(409, 'Redeemed invitations cannot be revoked', 'invite_already_used');
    const timestamp = now();
    await db.batch([
      db.statement(`UPDATE invites SET status = 'revoked', updated_at = ? WHERE id = ? AND status = 'active' AND uses = 0`, [timestamp, body.inviteId]),
      db.statement(`UPDATE invite_balances SET available_credits = available_credits + 1, updated_at = ? WHERE owner_type = ? AND owner_id = ?`, [timestamp, owner.owner_type, owner.owner_id]),
      db.statement(`INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at) VALUES (?, ?, ?, 'refund', 1, 'unused_invite_revoked', ?, ?)`, [id('iled'), owner.owner_type, owner.owner_id, body.inviteId, timestamp]),
    ]);
    return json({ ok: true, status: 'revoked', creditRefunded: true });
  }

  if ((body.ownerType !== 'profile' && body.ownerType !== 'organization') || !body.ownerId) throw new HttpError(400, 'ownerType and ownerId are required', 'invalid_invite_owner');
  await authorizeInviteOwner(db, auth.user.id, body.ownerType, body.ownerId);
  const balance = await db.first<{ available_credits: number; privileges_status: string }>(`SELECT available_credits, privileges_status FROM invite_balances WHERE owner_type = ? AND owner_id = ?`, [body.ownerType, body.ownerId]);
  if (!balance || balance.privileges_status !== 'active') throw new HttpError(403, 'Invite privileges are not active', 'invites_paused');
  if (balance.available_credits < 1) throw new HttpError(409, 'No invite credits remain', 'no_invite_credits');
  const expiryDays = body.expiresInDays === null || body.expiresInDays === undefined ? 30 : Math.max(1, Math.min(90, Math.floor(body.expiresInDays)));
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  const rawCode = randomToken(18); const inviteId = id('inv'); const timestamp = now(); const inviterOrganizationId = body.ownerType === 'organization' ? body.ownerId : null;
  await db.batch([
    db.statement(`INSERT INTO invites (id, code_hash, display_code, invite_type, inviter_user_id, inviter_organization_id, intended_email, allowed_account_types_json, max_uses, uses, expires_at, status, created_at, updated_at) VALUES (?, ?, ?, 'network_invite', ?, ?, NULL, '["creator","project"]', 1, 0, ?, 'active', ?, ?)`, [inviteId, await sha256(rawCode), rawCode, auth.user.id, inviterOrganizationId, expiresAt, timestamp, timestamp]),
    db.statement(`UPDATE invite_balances SET available_credits = available_credits - 1, lifetime_used = lifetime_used + 1, updated_at = ? WHERE owner_type = ? AND owner_id = ? AND available_credits > 0`, [timestamp, body.ownerType, body.ownerId]),
    db.statement(`INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at) VALUES (?, ?, ?, 'use', -1, 'network_invite_created', ?, ?)`, [id('iled'), body.ownerType, body.ownerId, inviteId, timestamp]),
  ]);
  return json({ inviteId, inviteUrl: `${getLinkaryUrls(request, env).tracking}/i/${encodeURIComponent(rawCode)}`, allowedAccountTypes: ['creator', 'project'], uses: 1, expiresAt }, { status: 201 });
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[c] || c); }

export async function renderInviteLanding(request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const invite = await db.first<{ id: string; allowed_account_types_json: string; status: string; expires_at: string | null; uses: number; max_uses: number }>(`SELECT id, allowed_account_types_json, status, expires_at, uses, max_uses FROM invites WHERE code_hash = ?`, [await sha256(code)]);
  if (!invite || invite.status !== 'active' || (invite.expires_at && invite.expires_at <= now()) || invite.uses >= invite.max_uses) throw new HttpError(404, 'This Linkary invitation is no longer available', 'invite_not_found');
  const cookieHeader = request.headers.get('cookie') || ''; const match = cookieHeader.match(/(?:^|;\s*)linkary_vid=([^;]+)/); const visitor = match?.[1] ? decodeURIComponent(match[1]) : randomToken(18); const setVisitorCookie = !match?.[1];
  let referrerHost: string | null = null; const referrer = request.headers.get('referer'); if (referrer) { try { referrerHost = new URL(referrer).hostname.slice(0,255); } catch {} }
  await db.run(`INSERT INTO invite_click_events (id, invite_id, visitor_id_hash, referrer_host, occurred_at) VALUES (?, ?, ?, ?, ?)`, [id('icl'), invite.id, await sha256(visitor), referrerHost, now()]);
  const continueUrl = `${getLinkaryUrls(request, env).app}/?invite=${encodeURIComponent(code)}`; const types = JSON.parse(invite.allowed_account_types_json) as string[];
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }); if (setVisitorCookie) headers.append('set-cookie', `linkary_vid=${encodeURIComponent(visitor)}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`);
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>You're invited to Linkary</title><style>:root{font-family:Inter,ui-sans-serif,system-ui;color:#171717;background:#f7f7f5}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0,#fff3ea 0,transparent 38%),#f7f7f5}.card{width:min(520px,100%);background:#fff;border:1px solid #e7e5e4;border-radius:24px;padding:32px;box-shadow:0 24px 64px rgba(0,0,0,.08)}.mark{width:44px;height:44px;border-radius:14px;background:#171717;color:#fff;display:grid;place-items:center;font-weight:800}.eyebrow{margin-top:28px;color:#f26419;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.12em}h1{font-size:36px;line-height:1.08;margin:10px 0 12px}p{color:#525252;line-height:1.6;font-size:16px}.types{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.pill{padding:8px 11px;background:#fafafa;border:1px solid #e7e5e4;border-radius:999px;font-size:13px}.cta{display:block;text-align:center;background:#171717;color:#fff;padding:14px 18px;border-radius:13px;text-decoration:none;font-weight:750;margin-top:24px}.note{font-size:12px;color:#8a8a8a;margin-top:14px;text-align:center}@media(max-width:520px){body{padding:14px}.card{padding:24px;border-radius:18px}h1{font-size:31px}}</style></head><body><main class="card"><div class="mark">L</div><div class="eyebrow">Private network invitation</div><h1>You're invited to Linkary.</h1><p>Continue to the Linkary app and sign in with Email, Google, or X. Your invitation is only redeemed after secure authentication succeeds.</p><div class="types">${types.map((t)=>`<span class="pill">${escapeHtml(t === 'project' ? 'Company / Project' : 'Creator')}</span>`).join('')}</div><a class="cta" href="${escapeHtml(continueUrl)}">Continue to Linkary</a><div class="note">Single-use invitation. Linkary referral attribution is measured directly by Linkary.</div></main></body></html>`, { headers });
}
