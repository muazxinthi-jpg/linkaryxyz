import { CdpClient } from '@coinbase/cdp-sdk';
import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { upsertCdpUser, type CdpAuthenticationMethod, type CdpEndUserInput } from '../db/identity';
import { HttpError, json, readJson } from '../http';
import { sha256 } from '../security/crypto';
import { createSession } from './session';

interface CdpSessionBody {
  accessToken?: string;
  inviteCode?: string;
  earnedGrant?: string;
  returnTo?: string;
}

function requireCdpConfig(env: Env): { apiKeyId: string; apiKeySecret: string } {
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) throw new ServiceConfigurationError('CDP backend validation is not configured yet');
  return { apiKeyId: env.CDP_API_KEY_ID, apiKeySecret: env.CDP_API_KEY_SECRET };
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/onboarding';
  return value;
}

function methodUid(method: CdpAuthenticationMethod): string | null {
  if (method.type === 'x' || method.type === 'google' || method.type === 'apple') return typeof method.sub === 'string' ? method.sub : null;
  if (method.type === 'telegram') return method.id === undefined || method.id === null ? null : String(method.id);
  if (method.type === 'email') return typeof method.email === 'string' ? method.email.trim().toLowerCase() : null;
  if (method.type === 'sms') return typeof method.phoneNumber === 'string' ? method.phoneNumber : null;
  return null;
}

async function hasExistingLinkaryIdentity(db: Db, endUser: CdpEndUserInput): Promise<boolean> {
  if (await db.first<{ id: string }>(`SELECT id FROM auth_identities WHERE provider = 'coinbase_cdp' AND provider_user_id = ?`, [endUser.userId])) return true;
  for (const method of endUser.authenticationMethods || []) {
    const uid = methodUid(method);
    if (!uid || !['x', 'telegram', 'google', 'apple', 'email', 'sms'].includes(method.type)) continue;
    if (await db.first<{ id: string }>(`SELECT id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`, [method.type, uid])) return true;
  }
  return false;
}

function xHandleFromPostUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['x.com', 'twitter.com'].includes(host)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[1] !== 'status') return null;
    return parts[0].replace(/^@/, '').toLowerCase();
  } catch {
    return null;
  }
}

async function consumeInvite(db: Db, inviteCode: string, userId: string): Promise<void> {
  const invite = await db.first<{ id: string }>(`SELECT id FROM invites WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`, [await sha256(inviteCode), new Date().toISOString()]);
  if (!invite) throw new HttpError(400, 'Invite is invalid, expired, or already used', 'invalid_invite');
  if (await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`, [invite.id, userId])) return;
  const timestamp = new Date().toISOString();
  await db.batch([
    db.statement(`INSERT INTO invite_redemptions (id, invite_id, user_id, chosen_account_type, organization_id, quality_state, redeemed_at) VALUES (?, ?, ?, NULL, NULL, 'pending', ?)`, [`red_${crypto.randomUUID().replace(/-/g, '')}`, invite.id, userId, timestamp]),
    db.statement(`UPDATE invites SET uses = uses + 1, status = CASE WHEN uses + 1 >= max_uses THEN 'exhausted' ELSE status END, updated_at = ? WHERE id = ? AND uses < max_uses`, [timestamp, invite.id]),
  ]);
}

async function consumeEarnedGrant(db: Db, grant: string, userId: string, methods: CdpAuthenticationMethod[]): Promise<void> {
  const row = await db.first<{ id: string; submitted_x_url: string }>(`SELECT id, submitted_x_url FROM access_post_submissions WHERE grant_token_hash = ? AND status = 'pending' AND expires_at > ?`, [await sha256(grant), new Date().toISOString()]);
  if (!row) throw new HttpError(400, 'Earned-access grant is invalid or expired', 'invalid_access_grant');

  const submittedHandle = xHandleFromPostUrl(row.submitted_x_url);
  const xMethod = methods.find((method) => method.type === 'x') as Extract<CdpAuthenticationMethod, { type: 'x' }> | undefined;
  const authenticatedHandle = xMethod?.username?.replace(/^@/, '').toLowerCase();
  if (!submittedHandle || !authenticatedHandle) throw new HttpError(409, 'Sign in with the X account that published the access post', 'x_identity_required');
  if (submittedHandle !== authenticatedHandle) throw new HttpError(403, 'The authenticated X account does not match the submitted post', 'x_post_ownership_mismatch');

  await db.run(`UPDATE access_post_submissions SET user_id = ?, status = 'authenticated', auth_verified_at = ? WHERE id = ?`, [userId, new Date().toISOString(), row.id]);
}

export async function exchangeCdpSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<CdpSessionBody>(request);
  const accessToken = body.accessToken?.trim();
  if (!accessToken) throw new HttpError(400, 'CDP access token is required', 'missing_access_token');

  const credentials = requireCdpConfig(env);
  const cdp = new CdpClient(credentials);
  let validated: CdpEndUserInput;
  try {
    validated = (await cdp.endUser.validateAccessToken({ accessToken })) as unknown as CdpEndUserInput;
  } catch {
    throw new HttpError(401, 'CDP session is invalid or expired', 'invalid_cdp_session');
  }
  if (!validated?.userId) throw new HttpError(401, 'CDP did not return a valid user identity', 'invalid_cdp_identity');

  const db = new Db(requireDb(env));
  const returningUser = await hasExistingLinkaryIdentity(db, validated);
  if (!returningUser && !body.inviteCode && !body.earnedGrant) throw new HttpError(403, 'A Linkary invitation or earned-access grant is required for a new account', 'access_required');

  const { user, platformIdentities } = await upsertCdpUser(db, validated);
  if (body.inviteCode) await consumeInvite(db, body.inviteCode, user.id);
  if (body.earnedGrant) await consumeEarnedGrant(db, body.earnedGrant, user.id, validated.authenticationMethods || []);

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
