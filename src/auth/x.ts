import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { upsertXUser } from '../db/identity';
import { createSession } from './session';
import { HttpError } from '../http';
import { pkceChallenge, randomToken, sha256 } from '../security/crypto';
import { getLinkaryUrls } from '../urls';

interface OAuthContext { inviteCode?: string; earnedGrant?: string; returnTo?: string; }

function requireXConfig(env: Env): { clientId: string; clientSecret?: string } {
  if (!env.X_CLIENT_ID) throw new ServiceConfigurationError('X OAuth is not configured yet');
  return { clientId: env.X_CLIENT_ID, clientSecret: env.X_CLIENT_SECRET };
}

function safeReturnTo(value: string | null): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
  return value;
}

export async function startXOAuth(request: Request, env: Env): Promise<Response> {
  const { clientId } = requireXConfig(env);
  const db = new Db(requireDb(env));
  const url = new URL(request.url);
  const inviteCode = url.searchParams.get('invite') || undefined;
  const earnedGrant = url.searchParams.get('grant') || undefined;
  if (!inviteCode && !earnedGrant) throw new HttpError(403, 'A valid Linkary invite or earned-access grant is required', 'access_required');
  if (inviteCode && !(await db.first<{ id: string }>(`SELECT id FROM invites WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`, [await sha256(inviteCode), new Date().toISOString()]))) throw new HttpError(400, 'Invite is invalid or expired', 'invalid_invite');
  if (earnedGrant && !(await db.first<{ id: string }>(`SELECT id FROM access_post_submissions WHERE grant_token_hash = ? AND status = 'pending' AND expires_at > ?`, [await sha256(earnedGrant), new Date().toISOString()]))) throw new HttpError(400, 'Earned access grant is invalid or expired', 'invalid_access_grant');

  const state = randomToken(24);
  const verifier = randomToken(48);
  const context: OAuthContext = { inviteCode, earnedGrant, returnTo: safeReturnTo(url.searchParams.get('return_to')) };
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
  await db.run(`INSERT INTO oauth_states (id, provider, state_hash, code_verifier, access_context_json, expires_at, created_at, used_at) VALUES (?, 'x', ?, ?, ?, ?, ?, NULL)`, [`oauth_${crypto.randomUUID().replace(/-/g, '')}`, await sha256(state), verifier, JSON.stringify(context), expiresAt.toISOString(), createdAt.toISOString()]);

  const redirectUri = env.X_REDIRECT_URI || `${getLinkaryUrls(request, env).api}/api/auth/x/callback`;
  const authUrl = new URL('https://x.com/i/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'users.read tweet.read');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', await pkceChallenge(verifier));
  authUrl.searchParams.set('code_challenge_method', 'S256');
  return Response.redirect(authUrl.toString(), 302);
}

export async function finishXOAuth(request: Request, env: Env): Promise<Response> {
  const { clientId, clientSecret } = requireXConfig(env);
  const db = new Db(requireDb(env));
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) throw new HttpError(400, 'Missing OAuth callback parameters', 'invalid_oauth_callback');
  const stateRow = await db.first<{ id: string; code_verifier: string; access_context_json: string }>(`SELECT id, code_verifier, access_context_json FROM oauth_states WHERE provider = 'x' AND state_hash = ? AND used_at IS NULL AND expires_at > ?`, [await sha256(state), new Date().toISOString()]);
  if (!stateRow) throw new HttpError(400, 'OAuth state is invalid or expired', 'invalid_oauth_state');
  await db.run(`UPDATE oauth_states SET used_at = ? WHERE id = ?`, [new Date().toISOString(), stateRow.id]);
  const context = JSON.parse(stateRow.access_context_json || '{}') as OAuthContext;
  if (!context.inviteCode && !context.earnedGrant) throw new HttpError(403, 'OAuth access context is missing', 'access_required');
  const redirectUri = env.X_REDIRECT_URI || `${getLinkaryUrls(request, env).api}/api/auth/x/callback`;
  const form = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code_verifier: stateRow.code_verifier });
  const tokenHeaders: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (clientSecret) tokenHeaders.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers: tokenHeaders, body: form });
  if (!tokenResponse.ok) throw new HttpError(502, 'X token exchange failed', 'x_oauth_failed');
  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new HttpError(502, 'X did not return an access token', 'x_oauth_failed');
  const meResponse = await fetch('https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url', { headers: { authorization: `Bearer ${tokenJson.access_token}` } });
  if (!meResponse.ok) throw new HttpError(502, 'Unable to read X identity', 'x_identity_failed');
  const meJson = (await meResponse.json()) as { data?: { id?: string; name?: string; username?: string; profile_image_url?: string } };
  const data = meJson.data;
  if (!data?.id || !data.username) throw new HttpError(502, 'X identity payload was incomplete', 'x_identity_failed');
  const { user } = await upsertXUser(db, { providerUserId: data.id, username: data.username.toLowerCase(), displayName: data.name || data.username, raw: data as Record<string, unknown> });

  if (context.inviteCode) {
    const invite = await db.first<{ id: string }>(`SELECT id FROM invites WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`, [await sha256(context.inviteCode), new Date().toISOString()]);
    if (!invite) throw new HttpError(400, 'Invite expired during authentication', 'invalid_invite');
    if (!(await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`, [invite.id, user.id]))) {
      await db.run(`INSERT INTO invite_redemptions (id, invite_id, user_id, chosen_account_type, organization_id, quality_state, redeemed_at) VALUES (?, ?, ?, NULL, NULL, 'pending', ?)`, [`red_${crypto.randomUUID().replace(/-/g, '')}`, invite.id, user.id, new Date().toISOString()]);
      await db.run(`UPDATE invites SET uses = uses + 1, status = CASE WHEN uses + 1 >= max_uses THEN 'exhausted' ELSE status END, updated_at = ? WHERE id = ?`, [new Date().toISOString(), invite.id]);
    }
  }
  if (context.earnedGrant) {
    const resultBefore = await db.first<{ id: string }>(`SELECT id FROM access_post_submissions WHERE grant_token_hash = ? AND status = 'pending' AND expires_at > ?`, [await sha256(context.earnedGrant), new Date().toISOString()]);
    if (!resultBefore) throw new HttpError(400, 'Earned-access grant expired during authentication', 'invalid_access_grant');
    await db.run(`UPDATE access_post_submissions SET user_id = ?, status = 'authenticated', auth_verified_at = ? WHERE id = ?`, [user.id, new Date().toISOString(), resultBefore.id]);
  }

  const session = await createSession(env, user.id);
  const headers = new Headers({ location: context.returnTo || '/onboarding' });
  for (const cookie of session.cookieHeaders) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}
