import { CdpClient } from '@coinbase/cdp-sdk';
import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { createSession } from './session';

interface CdpSessionBody {
  accessToken?: string;
}

type UnknownRecord = Record<string, unknown>;

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

function requireCdpConfig(env: Env): { projectId: string; apiKeyId: string; apiKeySecret: string } {
  if (!env.CDP_PROJECT_ID) throw new ServiceConfigurationError('CDP_PROJECT_ID is not configured');
  if (!env.CDP_API_KEY_ID) throw new ServiceConfigurationError('CDP_API_KEY_ID is not configured');
  if (!env.CDP_API_KEY_SECRET) throw new ServiceConfigurationError('CDP_API_KEY_SECRET is not configured');
  return { projectId: env.CDP_PROJECT_ID, apiKeyId: env.CDP_API_KEY_ID, apiKeySecret: env.CDP_API_KEY_SECRET };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function authMethods(endUser: UnknownRecord): UnknownRecord[] {
  const value = endUser.authenticationMethods;
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is UnknownRecord => Boolean(item));
}

function extractVerifiedEmail(methods: UnknownRecord[]): string | null {
  for (const method of methods) {
    const type = stringValue(method.type)?.toLowerCase();
    const email = stringValue(method.email);
    if (type === 'email' && email) return email.toLowerCase();
  }
  return null;
}

function extractLastAuthMethod(methods: UnknownRecord[]): string | null {
  const first = methods[0];
  if (!first) return null;
  const type = stringValue(first.type);
  const provider = stringValue(first.provider) || stringValue(first.oauthProvider) || stringValue(first.oauth_provider);
  return provider ? `${type || 'oauth'}:${provider}` : type;
}

function extractEvmAddresses(endUser: UnknownRecord): string[] {
  const addresses = new Set<string>();
  const objectValues = endUser.evmAccountObjects;
  if (Array.isArray(objectValues)) {
    for (const account of objectValues) {
      const address = stringValue(asRecord(account)?.address);
      if (address) addresses.add(address.toLowerCase());
    }
  }
  const legacyValues = endUser.evmAccounts;
  if (Array.isArray(legacyValues)) {
    for (const value of legacyValues) {
      const address = stringValue(value);
      if (address) addresses.add(address.toLowerCase());
    }
  }
  return [...addresses];
}

export async function createCdpSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<CdpSessionBody>(request);
  const accessToken = body.accessToken?.trim();
  if (!accessToken) throw new HttpError(400, 'CDP access token is required', 'cdp_access_token_required');

  const config = requireCdpConfig(env);
  const cdp = new CdpClient({ apiKeyId: config.apiKeyId, apiKeySecret: config.apiKeySecret });

  let validated: unknown;
  try {
    validated = await cdp.endUser.validateAccessToken({ accessToken });
  } catch {
    throw new HttpError(401, 'CDP access token is invalid or expired', 'cdp_access_token_invalid');
  }

  const endUser = asRecord(validated);
  const cdpUserId = stringValue(endUser?.userId) || stringValue(endUser?.id);
  if (!endUser || !cdpUserId) throw new HttpError(502, 'CDP returned an invalid end-user response', 'cdp_invalid_response');

  const methods = authMethods(endUser);
  const email = extractVerifiedEmail(methods);
  const lastAuthMethod = extractLastAuthMethod(methods);
  const timestamp = now();
  const db = new Db(requireDb(env));

  let link = await db.first<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM cdp_user_links WHERE cdp_project_id = ? AND cdp_user_id = ?`,
    [config.projectId, cdpUserId],
  );
  let isNewUser = false;

  if (!link) {
    isNewUser = true;
    const userId = id('usr');
    const linkId = id('cdp');
    const authIdentityId = id('aid');
    const existingEmail = email
      ? await db.first<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower(?)`, [email])
      : null;
    const storedEmail = existingEmail ? null : email;
    const displayName = email ? email.split('@')[0] : 'Linkary user';

    await db.batch([
      db.statement(
        `INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
        [userId, storedEmail, displayName, timestamp, timestamp],
      ),
      db.statement(
        `INSERT INTO cdp_user_links (id, user_id, cdp_project_id, cdp_user_id, last_auth_method, last_authenticated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [linkId, userId, config.projectId, cdpUserId, lastAuthMethod, timestamp, timestamp, timestamp],
      ),
      db.statement(
        `INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_username, verified_at, metadata_json, created_at, updated_at) VALUES (?, ?, 'coinbase_cdp', ?, NULL, ?, ?, ?, ?)`,
        [authIdentityId, userId, cdpUserId, timestamp, JSON.stringify({ authenticationMethods: methods }), timestamp, timestamp],
      ),
    ]);
    link = { id: linkId, user_id: userId };
  } else {
    await db.run(
      `UPDATE cdp_user_links SET last_auth_method = ?, last_authenticated_at = ?, updated_at = ? WHERE id = ?`,
      [lastAuthMethod, timestamp, timestamp, link.id],
    );
    await db.run(
      `UPDATE auth_identities SET metadata_json = ?, updated_at = ? WHERE provider = 'coinbase_cdp' AND provider_user_id = ?`,
      [JSON.stringify({ authenticationMethods: methods }), timestamp, cdpUserId],
    );
  }

  const evmAddresses = extractEvmAddresses(endUser);
  for (let index = 0; index < evmAddresses.length; index += 1) {
    const address = evmAddresses[index];
    await db.run(
      `INSERT OR IGNORE INTO wallet_accounts (id, user_id, cdp_user_link_id, provider, chain_family, address, account_type, is_primary, status, created_at, updated_at) VALUES (?, ?, ?, 'coinbase_cdp', 'evm', ?, 'eoa', ?, 'active', ?, ?)`,
      [id('wal'), link.user_id, link.id, address, index === 0 ? 1 : 0, timestamp, timestamp],
    );
  }

  const user = await db.first<{ id: string; email: string | null; display_name: string }>(
    `SELECT id, email, display_name FROM users WHERE id = ? AND status = 'active'`,
    [link.user_id],
  );
  if (!user) throw new HttpError(500, 'Linkary user mapping could not be loaded', 'user_mapping_failed');

  const session = await createSession(env, user.id);
  const headers = new Headers();
  for (const cookie of session.cookieHeaders) headers.append('set-cookie', cookie);

  return json(
    {
      ok: true,
      isNewUser,
      user: { id: user.id, email: user.email, displayName: user.display_name },
      wallet: { evmAddresses },
      csrfToken: session.csrfToken,
    },
    { status: isNewUser ? 201 : 200, headers },
  );
}
