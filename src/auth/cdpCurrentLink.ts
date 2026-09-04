import { getAuthHeaders } from '@coinbase/cdp-sdk/auth';
import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { upsertPlatformIdentityForUser } from '../db/identity';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from './session';

type UnknownRecord = Record<string, unknown>;
type CurrentLinkBody = { accessToken?: string };

const CDP_API_HOST = 'api.cdp.coinbase.com';
const CDP_VALIDATE_PATH = '/platform/v2/end-users/auth/validate-token';

function requireCdpConfig(env: Env): { projectId: string; apiKeyId: string; apiKeySecret: string } {
  if (!env.CDP_PROJECT_ID) throw new ServiceConfigurationError('CDP_PROJECT_ID is not configured');
  if (!env.CDP_API_KEY_ID) throw new ServiceConfigurationError('CDP_API_KEY_ID is not configured');
  if (!env.CDP_API_KEY_SECRET) throw new ServiceConfigurationError('CDP_API_KEY_SECRET is not configured');
  return { projectId: env.CDP_PROJECT_ID, apiKeyId: env.CDP_API_KEY_ID, apiKeySecret: env.CDP_API_KEY_SECRET };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifierValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function authMethods(endUser: UnknownRecord): UnknownRecord[] {
  if (!Array.isArray(endUser.authenticationMethods)) return [];
  return endUser.authenticationMethods.map(asRecord).filter((item): item is UnknownRecord => Boolean(item));
}

async function validateCdpAccessToken(accessToken: string, config: { apiKeyId: string; apiKeySecret: string }): Promise<UnknownRecord> {
  const requestBody = { accessToken };
  const authHeaders = await getAuthHeaders({
    apiKeyId: config.apiKeyId,
    apiKeySecret: config.apiKeySecret,
    requestMethod: 'POST',
    requestHost: CDP_API_HOST,
    requestPath: CDP_VALIDATE_PATH,
    requestBody,
    source: 'linkary-worker',
  });
  const response = await fetch(`https://${CDP_API_HOST}${CDP_VALIDATE_PATH}`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(requestBody),
  });
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'Secure sign-in token is invalid or expired', 'cdp_access_token_invalid');
  }
  if (!response.ok) throw new HttpError(502, 'Secure sign-in validation is unavailable', 'cdp_validation_failed');
  const result = asRecord(await response.json());
  if (!result) throw new HttpError(502, 'Secure sign-in returned an invalid response', 'cdp_invalid_response');
  return result;
}

async function syncPlatformIdentities(db: Db, userId: string, methods: UnknownRecord[]): Promise<void> {
  for (const method of methods) {
    const type = stringValue(method.type)?.toLowerCase();
    if (type === 'x') {
      const providerUserId = identifierValue(method.sub);
      if (!providerUserId) continue;
      await upsertPlatformIdentityForUser(db, userId, {
        platform: 'x',
        providerUserId,
        username: stringValue(method.username),
        displayName: stringValue(method.name) || stringValue(method.displayName) || stringValue(method.username),
        raw: method,
        source: 'cdp_oauth',
      });
      continue;
    }
    if (type === 'telegram') {
      const providerUserId = identifierValue(method.id) || identifierValue(method.sub);
      if (!providerUserId) continue;
      const fullName = [stringValue(method.firstName), stringValue(method.lastName)].filter(Boolean).join(' ') || null;
      await upsertPlatformIdentityForUser(db, userId, {
        platform: 'telegram',
        providerUserId,
        username: stringValue(method.username),
        displayName: fullName || stringValue(method.username),
        raw: method,
        source: 'cdp_oauth',
      });
    }
  }
}

export async function refreshCurrentCdpLink(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<CurrentLinkBody>(request);
  const accessToken = body.accessToken?.trim();
  if (!accessToken) throw new HttpError(400, 'Secure sign-in token is required', 'cdp_access_token_required');

  const config = requireCdpConfig(env);
  const endUser = await validateCdpAccessToken(accessToken, config);
  const cdpUserId = stringValue(endUser.userId) || stringValue(endUser.id);
  if (!cdpUserId) throw new HttpError(502, 'Secure sign-in returned an invalid user', 'cdp_invalid_response');

  const db = new Db(requireDb(env));
  const link = await db.first<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM cdp_user_links WHERE cdp_project_id = ? AND cdp_user_id = ? LIMIT 1`,
    [config.projectId, cdpUserId],
  );
  if (!link || link.user_id !== auth.user.id) {
    throw new HttpError(
      409,
      'That secure sign-in belongs to a different Linkary account. Your current Linkary account was not changed.',
      'cdp_account_mismatch',
    );
  }

  const methods = authMethods(endUser);
  const lastAuthMethod = stringValue(methods[0]?.type)?.toLowerCase() || null;
  const timestamp = new Date().toISOString();
  await db.run(
    `UPDATE cdp_user_links SET last_auth_method = ?, last_authenticated_at = ?, updated_at = ? WHERE id = ?`,
    [lastAuthMethod, timestamp, timestamp, link.id],
  );
  await db.run(
    `UPDATE auth_identities SET metadata_json = ?, updated_at = ? WHERE user_id = ? AND provider = 'coinbase_cdp' AND provider_user_id = ?`,
    [JSON.stringify({ authenticationMethods: methods }), timestamp, auth.user.id, cdpUserId],
  );
  await syncPlatformIdentities(db, auth.user.id, methods);

  return json({
    ok: true,
    currentLinkaryUserId: auth.user.id,
    authenticationMethods: methods.map((method) => stringValue(method.type)).filter(Boolean),
    telegramLinked: methods.some((method) => stringValue(method.type)?.toLowerCase() === 'telegram'),
  });
}
