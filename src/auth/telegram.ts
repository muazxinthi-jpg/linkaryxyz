import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { requireAuth, verifyCsrf } from './session';
import { randomToken, sha256 } from '../security/crypto';
import { upsertPlatformIdentityForUser } from '../db/identity';

const issuer = 'https://oauth.telegram.org';
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 8000 });
const callbackPath = '/api/auth/telegram/callback';
const provider = 'telegram_profile';

function config(request: Request, env: Env) {
  if (!env.TELEGRAM_CLIENT_ID || !env.TELEGRAM_CLIENT_SECRET) {
    throw new HttpError(503, 'Telegram connection is being set up. Please try again later.', 'telegram_not_configured');
  }
  const origin = new URL(env.APP_BASE_URL || 'https://app.linkary.xyz').origin;
  if (new URL(request.url).origin !== origin) throw new HttpError(403, 'Invalid connection origin', 'invalid_origin');
  return { clientId: env.TELEGRAM_CLIENT_ID, secret: env.TELEGRAM_CLIENT_SECRET, redirectUri: origin + callbackPath };
}

export async function verifyTelegramIdentity(token: string, clientId: string, key: JWTVerifyGetKey = keys) {
  const { payload } = await jwtVerify(token, key, {
    issuer, audience: clientId,
    // Telegram Login can be configured in BotFather to use any of the
    // algorithms documented for its OIDC provider. Keep the verification
    // allowlist explicit while accepting the configured provider algorithm.
    algorithms: ['RS256', 'ES256', 'EdDSA', 'ES256K'],
    requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: '10m', clockTolerance: 5,
  });
  // Telegram's OIDC subject is distinct from its stable numeric Bot API user ID.
  if (!Number.isSafeInteger(payload.id) || Number(payload.id) <= 0) throw new Error('Missing Telegram user ID');
  return {
    providerUserId: String(payload.id),
    username: typeof payload.preferred_username === 'string' ? payload.preferred_username.slice(0, 64) : null,
    displayName: typeof payload.name === 'string' ? payload.name.slice(0, 200) : null,
  };
}

export async function startTelegramConnection(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const settings = config(request, env);
  const db = new Db(requireDb(env));
  const state = randomToken();
  const verifier = randomToken(48);
  const now = new Date();
  const recent = await db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM oauth_states
    WHERE provider = ? AND created_at > ? AND json_extract(access_context_json, '$.sessionId') = ?`,
  [provider, new Date(now.getTime() - 600000).toISOString(), auth.session.id]);
  if (recent && recent.count >= 10) throw new HttpError(429, 'Please wait a few minutes before trying Telegram again.', 'telegram_rate_limited');
  const context = JSON.stringify({ userId: auth.user.id, sessionId: auth.session.id });
  await db.run(`INSERT INTO oauth_states (id, provider, state_hash, code_verifier, access_context_json, expires_at, created_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
  [`oauth_${crypto.randomUUID()}`, provider, await sha256(state), verifier, context, new Date(now.getTime() + 600000).toISOString(), now.toISOString()]);
  const url = new URL(`${issuer}/auth`);
  url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.redirectUri,
    response_type: 'code', scope: 'openid profile', state,
    code_challenge: await sha256(verifier), code_challenge_method: 'S256' }).toString();
  return json({ authorizationUrl: url.toString() });
}

export async function saveTelegramIdentity(db: Db, userId: string, identity: Awaited<ReturnType<typeof verifyTelegramIdentity>>) {
  const now = new Date().toISOString();
  // Claim ownership with one conditional statement so simultaneous callbacks cannot
  // attach the same identity to two users. Never transfer an existing owner.
  await db.run(`INSERT INTO platform_identities (id, platform, provider_uid, provider_object_type, status, first_seen_at, last_seen_at, metadata_json)
    VALUES (?, 'telegram', ?, 'person', 'active', ?, ?, '{}') ON CONFLICT(platform, provider_uid) DO NOTHING`,
  [`pid_${crypto.randomUUID()}`, identity.providerUserId, now, now]);
  await db.run(`INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at)
    SELECT ?, pi.id, ?, NULL, NULL, 'owns', ?, NULL FROM platform_identities pi
    WHERE pi.platform = 'telegram' AND pi.provider_uid = ? AND pi.provider_object_type = 'person' AND pi.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM platform_identity_links l WHERE l.platform_identity_id = pi.id AND l.link_type = 'owns' AND l.ended_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM platform_identity_links l JOIN platform_identities p ON p.id = l.platform_identity_id
      WHERE l.user_id = ? AND l.link_type = 'owns' AND l.ended_at IS NULL AND p.platform = 'telegram' AND p.provider_object_type = 'person')`,
  [`pil_${crypto.randomUUID()}`, userId, now, identity.providerUserId, userId]);
  const owner = await db.first<{ user_id: string }>(`SELECT l.user_id FROM platform_identity_links l JOIN platform_identities p ON p.id = l.platform_identity_id
    WHERE p.platform = 'telegram' AND p.provider_uid = ? AND p.status = 'active' AND p.provider_object_type = 'person'
      AND l.user_id = ? AND l.link_type = 'owns' AND l.ended_at IS NULL`, [identity.providerUserId, userId]);
  if (!owner) throw new HttpError(409, 'This Telegram or Linkary account already has a different connection.', 'telegram_already_linked');
  await upsertPlatformIdentityForUser(db, userId, { ...identity, platform: 'telegram', source: 'telegram_oidc', raw: { source: 'telegram_oidc' } });
}

export async function finishTelegramConnection(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
  let result = 'failed';
  let phase = 'init';
  try {
    const auth = await requireAuth(request, env);
    phase = 'session_verified';
    const settings = config(request, env);
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    if (!state || state.length > 128) throw new Error('Invalid state');
    const db = new Db(requireDb(env));
    // Atomic consume, bound to both the initiating user and still-active session.
    const row = await db.first<{ code_verifier: string }>(`UPDATE oauth_states SET used_at = ?
      WHERE provider = ? AND state_hash = ? AND used_at IS NULL AND expires_at > ?
        AND json_extract(access_context_json, '$.userId') = ? AND json_extract(access_context_json, '$.sessionId') = ?
      RETURNING code_verifier`, [new Date().toISOString(), provider, await sha256(state), new Date().toISOString(), auth.user.id, auth.session.id]);
    if (!row) throw new Error('Invalid or expired state');
    phase = 'state_consumed';
    if (url.searchParams.has('error')) {
      result = 'cancelled';
      phase = 'provider_cancelled';
    } else {
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096) throw new Error('Invalid code');
      const response = await fetch(`${issuer}/token`, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${settings.clientId}:${settings.secret}`)}` },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: settings.redirectUri, client_id: settings.clientId, code_verifier: row.code_verifier }) });
      if (!response.ok) throw new Error('Telegram exchange failed');
      phase = 'token_exchanged';
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty Telegram response');
      let text = '';
      let size = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65536) throw new Error('Oversized Telegram response');
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel(); }
      const body = JSON.parse(text) as { id_token?: unknown };
      if (typeof body.id_token !== 'string' || body.id_token.length > 16384) throw new Error('Invalid Telegram response');
      const identity = await verifyTelegramIdentity(body.id_token, settings.clientId);
      phase = 'token_verified';
      // Recheck session after the external exchange, before linking.
      const current = await requireAuth(request, env);
      if (current.user.id !== auth.user.id || current.session.id !== auth.session.id) throw new Error('Session changed');
      await saveTelegramIdentity(db, auth.user.id, identity);
      result = 'connected';
      phase = 'identity_saved';
    }
  } catch (error) {
    if (error instanceof HttpError && error.code === 'telegram_already_linked') result = 'conflict';
    // Never log provider bodies, callback URLs, tokens, or exceptions containing them.
    console.error('[Linkary Telegram Connection]', { stage: 'callback_failed', result, phase, errorCode: error instanceof HttpError ? error.code : 'unexpected', timestamp: new Date().toISOString() });
  }
  return new Response(null, { status: 303, headers: { location: `/profile?telegram=${result}&telegram_phase=${phase}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
