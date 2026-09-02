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
interface CreateInviteBody {
  ownerType?: 'profile' | 'organization';
  ownerId?: string;
  expiresInDays?: number | null;
  action?: 'create' | 'revoke';
  inviteId?: string;
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
    owner_type: string | null;
    owner_id: string | null;
  }>(
    `SELECT
       i.id,
       i.display_code,
       i.invite_type,
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
       MAX(l.owner_type) AS owner_type,
       MAX(l.owner_id) AS owner_id
     FROM invites i
     LEFT JOIN invite_click_events c ON c.invite_id = i.id
     LEFT JOIN invite_redemptions r ON r.invite_id = i.id
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN invite_ledger l ON l.related_invite_id = i.id AND l.transaction_type = 'use'
     WHERE i.inviter_user_id = ? OR i.inviter_organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = ? AND status = 'active')
     GROUP BY i.id
     ORDER BY i.created_at DESC
     LIMIT 200`,
    [now(), auth.user.id, auth.user.id],
  );
  const trackingBase = getLinkaryUrls(request, env).tracking;
  return json({ invites: rows.map((row) => ({ ...row, invite_url: row.display_code ? `${trackingBase}/i/${encodeURIComponent(row.display_code)}` : null })) });
}

export async function createNetworkInvite(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const body = await readJson<CreateInviteBody>(request);
  const db = new Db(requireDb(env));

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
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>You're invited to Linkary</title><style>:root{font-family:Inter,ui-sans-serif,system-ui;color:#171717;background:#f7f7f5}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0,#fff3ea 0,transparent 38%),#f7f7f5}.card{width:min(520px,100%);background:#fff;border:1px solid #e7e5e4;border-radius:24px;padding:32px;box-shadow:0 24px 64px rgba(0,0,0,.08)}.mark{width:44px;height:44px;border-radius:14px;background:#171717;color:#fff;display:grid;place-items:center;font-weight:800}.eyebrow{margin-top:28px;color:#f26419;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.12em}h1{font-size:36px;line-height:1.08;margin:10px 0 12px}p{color:#525252;line-height:1.6;font-size:16px}.types{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.pill{padding:8px 11px;background:#fafafa;border:1px solid #e7e5e4;border-radius:999px;font-size:13px}.cta{display:block;text-align:center;background:#171717;color:#fff;padding:14px 18px;border-radius:13px;text-decoration:none;font-weight:750;margin-top:24px}.note{font-size:12px;color:#8a8a8a;margin-top:14px;text-align:center}@media(max-width:520px){body{padding:14px}.card{padding:24px;border-radius:18px}h1{font-size:31px}}</style></head><body><main class="card"><div class="mark">L</div><div class="eyebrow">Private network invitation</div><h1>You're invited to Linkary.</h1><p>Continue to the Linkary app and sign in with Email, Google, X, or Telegram. Your invitation is only redeemed after secure authentication succeeds.</p><div class="types">${types.map((t)=>`<span class="pill">${escapeHtml(t === 'project' ? 'Company / Project' : 'Creator')}</span>`).join('')}</div><a class="cta" href="${escapeHtml(continueUrl)}">Continue to Linkary</a><div class="note">Single-use invitation. Linkary referral attribution is measured directly by Linkary.</div></main></body></html>`, { headers });
}
