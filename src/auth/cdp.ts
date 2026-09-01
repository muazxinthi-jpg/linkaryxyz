import { CdpClient } from '@coinbase/cdp-sdk';
import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { normalizeCdpEndUser, upsertCdpUser, type NormalizedCdpEndUser } from '../db/identity';
import { HttpError, json, readJson } from '../http';
import { sha256 } from '../security/crypto';
import { createSession } from './session';

interface CdpSessionBody {
  accessToken?: string;
  inviteCode?: string;
  earnedGrant?: string;
  returnTo?: string;
}

function requireCdpConfig(env: Env): { projectId: string; apiKeyId: string; apiKeySecret: string } {
  if (!env.CDP_PROJECT_ID) throw new ServiceConfigurationError('CDP project ID is not configured yet');
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) throw new ServiceConfigurationError('CDP backend validation credentials are not configured yet');
  return { projectId: env.CDP_PROJECT_ID, apiKeyId: env.CDP_API_KEY_ID, apiKeySecret: env.CDP_API_KEY_SECRET };
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/onboarding';
  return value;
}

async function isReturningUser(db: Db, projectId: string, endUser: NormalizedCdpEndUser): Promise<boolean> {
  if (await db.first<{ id: string }>(`SELECT id FROM cdp_user_links WHERE cdp_project_id = ? AND cdp_user_id = ?`, [projectId, endUser.userId])) return true;
  for (const method of endUser.methods) {
    if (!method.uid || !['email', 'sms', 'google', 'apple', 'x', 'telegram'].includes(method.type)) continue;
    if (await db.first<{ id: string }>(`SELECT id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`, [method.type, method.uid])) return true;
  }
  const email = endUser.methods.map((method) => method.email).find(Boolean);
  return Boolean(email && await db.first<{ id: string }>(`SELECT id FROM users WHERE lower(email) = ? AND status = 'active'`, [email]));
}

function xHandleFromPostUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['x.com', 'twitter.com'].includes(host)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[1] !== 'status') return null;
    return parts[0].replace(/^@/, '').toLowerCase();
  } catch { return null; }
}

async function validateInvite(db: Db, inviteCode: string): Promise<{ id: string }> {
  const invite = await db.first<{ id: string }>(`SELECT id FROM invites WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`, [await sha256(inviteCode), new Date().toISOString()]);
  if (!invite) throw new HttpError(400, 'Invite is invalid, expired, or already used', 'invalid_invite');
  return invite;
}

async function validateEarnedGrant(db: Db, grant: string, endUser: NormalizedCdpEndUser): Promise<{ id: string }> {
  const row = await db.first<{ id: string; submitted_x_url: string }>(`SELECT id, submitted_x_url FROM access_post_submissions WHERE grant_token_hash = ? AND status = 'pending' AND expires_at > ?`, [await sha256(grant), new Date().toISOString()]);
  if (!row) throw new HttpError(400, 'Earned-access grant is invalid or expired', 'invalid_access_grant');
  const submittedHandle = xHandleFromPostUrl(row.submitted_x_url);
  const xMethod = endUser.methods.find((method) => method.type === 'x');
  const authenticatedHandle = xMethod?.username?.replace(/^@/, '').toLowerCase() || null;
  if (!submittedHandle || !authenticatedHandle) throw new HttpError(409, 'Sign in with the X account that published the access post', 'x_identity_required');
  if (submittedHandle !== authenticatedHandle) throw new HttpError(403, 'The authenticated X account does not match the submitted post', 'x_post_ownership_mismatch');
  return row;
}

async function consumeInvite(db: Db, inviteId: string, userId: string): Promise<void> {
  if (await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`, [inviteId, userId])) return;
  const timestamp = new Date().toISOString();
  await db.batch([
    db.statement(`INSERT INTO invite_redemptions (id, invite_id, user_id, chosen_account_type, organization_id, quality_state, redeemed_at) VALUES (?, ?, ?, NULL, NULL, 'pending', ?)`, [`red_${crypto.randomUUID().replace(/-/g, '')}`, inviteId, userId, timestamp]),
    db.statement(`UPDATE invites SET uses = uses + 1, status = CASE WHEN uses + 1 >= max_uses THEN 'exhausted' ELSE status END, updated_at = ? WHERE id = ? AND uses < max_uses`, [timestamp, inviteId]),
  ]);
}

async function consumeEarnedGrant(db: Db, grantId: string, userId: string): Promise<void> {
  await db.run(`UPDATE access_post_submissions SET user_id = ?, status = 'authenticated', auth_verified_at = ? WHERE id = ? AND status = 'pending'`, [userId, new Date().toISOString(), grantId]);
}

export async function exchangeCdpSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<CdpSessionBody>(request);
  const accessToken = body.accessToken?.trim();
  if (!accessToken) throw new HttpError(400, 'CDP access token is required', 'missing_access_token');

  const config = requireCdpConfig(env);
  const cdp = new CdpClient({ apiKeyId: config.apiKeyId, apiKeySecret: config.apiKeySecret });
  let validatedRaw: unknown;
  try {
    validatedRaw = await cdp.endUser.validateAccessToken({ accessToken });
  } catch {
    throw new HttpError(401, 'CDP session is invalid or expired', 'invalid_cdp_session');
  }

  let endUser: NormalizedCdpEndUser;
  try { endUser = normalizeCdpEndUser(validatedRaw); }
  catch { throw new HttpError(401, 'CDP did not return a usable user identity', 'invalid_cdp_identity'); }

  const db = new Db(requireDb(env));
  const returningUser = await isReturningUser(db, config.projectId, endUser);
  if (!returningUser && !body.inviteCode && !body.earnedGrant) throw new HttpError(403, 'A Linkary invitation or Earn Access grant is required for a new account', 'access_required');

  const invite = body.inviteCode ? await validateInvite(db, body.inviteCode) : null;
  const earnedGrant = body.earnedGrant ? await validateEarnedGrant(db, body.earnedGrant, endUser) : null;
  const { user, platformIdentities } = await upsertCdpUser(db, config.projectId, validatedRaw);
  if (invite) await consumeInvite(db, invite.id, user.id);
  if (earnedGrant) await consumeEarnedGrant(db, earnedGrant.id, user.id);

  const session = await createSession(env, user.id);
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const cookie of session.cookieHeaders) headers.append('set-cookie', cookie);
  return json({
    authenticated: true,
    user: { id: user.id, displayName: user.display_name, email: user.email },
    platformIdentities: platformIdentities.map((identity) => ({ platform: identity.platform, providerUid: identity.provider_uid, handle: identity.current_handle })),
    next: safeReturnTo(body.returnTo),
    csrfToken: session.csrfToken,
  }, { headers });
}
