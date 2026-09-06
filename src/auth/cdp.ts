import { getAuthHeaders } from '@coinbase/cdp-sdk/auth';
import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { upsertPlatformIdentityForUser } from '../db/identity';
import { HttpError, json, readJson } from '../http';
import { sha256 } from '../security/crypto';
import { createSession } from './session';

interface CdpSessionBody {
  accessToken?: string;
  inviteCode?: string;
  earnedGrant?: string;
}

type UnknownRecord = Record<string, unknown>;
type InviteAccessRow = {
  id: string;
  invite_type: string;
  intended_email: string | null;
  inviter_organization_id: string | null;
  intended_project_role: string | null;
  status: string;
  expires_at: string | null;
  uses: number;
  max_uses: number;
};
type AccessContext =
  | { kind: 'invite'; inviteId: string; inviteType: string; organizationId: string | null }
  | { kind: 'earned'; submissionId: string };
type CdpLink = { id: string; user_id: string };

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const CDP_API_HOST = 'api.cdp.coinbase.com';
const CDP_VALIDATE_PATH = '/platform/v2/end-users/auth/validate-token';

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

function identifierValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function authMethods(endUser: UnknownRecord): UnknownRecord[] {
  const value = endUser.authenticationMethods;
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is UnknownRecord => Boolean(item));
}

function extractVerifiedEmail(methods: UnknownRecord[]): string | null {
  for (const method of methods) {
    const email = stringValue(method.email);
    if (email) return email.toLowerCase();
  }
  return null;
}

function extractLastAuthMethod(methods: UnknownRecord[]): string | null {
  const first = methods[0];
  if (!first) return null;
  return stringValue(first.type)?.toLowerCase() || null;
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

async function syncCdpPlatformIdentities(db: Db, userId: string, methods: UnknownRecord[]): Promise<void> {
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
      const firstName = stringValue(method.firstName);
      const lastName = stringValue(method.lastName);
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
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
    throw new HttpError(401, 'CDP access token is invalid or expired', 'cdp_access_token_invalid');
  }
  if (!response.ok) {
    throw new HttpError(502, 'CDP access-token validation service is unavailable', 'cdp_validation_failed');
  }

  const result = asRecord(await response.json());
  if (!result) throw new HttpError(502, 'CDP returned an invalid end-user response', 'cdp_invalid_response');
  return result;
}

async function hasLinkaryAccess(db: Db, userId: string): Promise<boolean> {
  if (await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE user_id = ? LIMIT 1`, [userId])) return true;
  return Boolean(
    await db.first<{ id: string }>(
      `SELECT id FROM access_post_submissions WHERE user_id = ? AND status IN ('authenticated', 'consumed') LIMIT 1`,
      [userId],
    ),
  );
}

function isSuperadminHostRequest(request: Request, env: Env): boolean {
  const configuredBase = env.SUPERADMIN_BASE_URL?.trim();
  if (!configuredBase) return false;
  try {
    const requestUrl = new URL(request.url);
    const configuredUrl = new URL(configuredBase);
    return requestUrl.protocol === 'https:'
      && configuredUrl.protocol === 'https:'
      && requestUrl.hostname.toLowerCase() === configuredUrl.hostname.toLowerCase();
  } catch {
    return false;
  }
}

async function resolveSuperadminBootstrapUser(
  db: Db,
  request: Request,
  env: Env,
  verifiedEmail: string | null,
): Promise<{ id: string } | null> {
  const configuredEmail = env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail || !verifiedEmail || verifiedEmail.trim().toLowerCase() !== configuredEmail) return null;
  if (!isSuperadminHostRequest(request, env)) return null;

  return db.first<{ id: string }>(
    `SELECT u.id
       FROM users u
       JOIN admin_grants g ON g.user_id = u.id
      WHERE lower(u.email) = lower(?)
        AND u.status = 'active'
        AND g.role = 'superadmin'
        AND g.status = 'active'
      LIMIT 1`,
    [configuredEmail],
  );
}

async function reconcileSuperadminCdpIdentity(
  db: Db,
  projectId: string,
  cdpUserId: string,
  canonicalUserId: string,
  currentLink: CdpLink | null,
  lastAuthMethod: string | null,
  methods: UnknownRecord[],
  timestamp: string,
): Promise<CdpLink | null> {
  const canonicalLink = await db.first<{ id: string; cdp_user_id: string }>(
    `SELECT id, cdp_user_id FROM cdp_user_links WHERE user_id = ? AND cdp_project_id = ? LIMIT 1`,
    [canonicalUserId, projectId],
  );
  const staleCanonicalLink = canonicalLink && canonicalLink.cdp_user_id !== cdpUserId ? canonicalLink : null;
  const staleCanonicalAuthIdentity = await db.first<{ id: string }>(
    `SELECT id FROM auth_identities
      WHERE user_id = ? AND provider = 'coinbase_cdp' AND provider_user_id <> ?
      LIMIT 1`,
    [canonicalUserId, cdpUserId],
  );

  if (staleCanonicalLink || staleCanonicalAuthIdentity) {
    const retirementStatements = [];
    if (staleCanonicalLink) {
      retirementStatements.push(
        db.statement(
          `UPDATE wallet_accounts
              SET cdp_user_link_id = NULL, status = 'disabled', updated_at = ?
            WHERE cdp_user_link_id = ?`,
          [timestamp, staleCanonicalLink.id],
        ),
        db.statement(
          `DELETE FROM cdp_user_links
            WHERE id = ? AND user_id = ? AND cdp_project_id = ? AND cdp_user_id = ?`,
          [staleCanonicalLink.id, canonicalUserId, projectId, staleCanonicalLink.cdp_user_id],
        ),
      );
    }
    if (staleCanonicalAuthIdentity) {
      retirementStatements.push(
        db.statement(
          `DELETE FROM auth_identities
            WHERE user_id = ? AND provider = 'coinbase_cdp' AND provider_user_id <> ?`,
          [canonicalUserId, cdpUserId],
        ),
      );
    }
    retirementStatements.push(
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         VALUES (?, ?, 'system', 'superadmin.cdp_identity.retired', 'user', ?, NULL, ?, ?)`,
        [
          id('aud'),
          canonicalUserId,
          canonicalUserId,
          JSON.stringify({
            source: 'verified_superadmin_login',
            retiredCdpUserId: staleCanonicalLink?.cdp_user_id || null,
            replacementCdpUserId: cdpUserId,
          }),
          timestamp,
        ],
      ),
    );
    await db.batch(retirementStatements);
  }

  const matchingAuthIdentity = await db.first<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM auth_identities WHERE provider = 'coinbase_cdp' AND provider_user_id = ? LIMIT 1`,
    [cdpUserId],
  );

  if (currentLink && currentLink.user_id === canonicalUserId) return currentLink;

  if (currentLink) {
    if (matchingAuthIdentity && matchingAuthIdentity.user_id !== currentLink.user_id && matchingAuthIdentity.user_id !== canonicalUserId) {
      throw new HttpError(403, 'The authenticated CDP identity has conflicting Linkary ownership', 'superadmin_identity_conflict');
    }

    const displacedUserId = currentLink.user_id;
    const statements = [
      db.statement(
        `UPDATE cdp_user_links
            SET user_id = ?, last_auth_method = ?, last_authenticated_at = ?, updated_at = ?
          WHERE id = ? AND cdp_project_id = ? AND cdp_user_id = ?`,
        [canonicalUserId, lastAuthMethod, timestamp, timestamp, currentLink.id, projectId, cdpUserId],
      ),
      db.statement(
        `UPDATE wallet_accounts SET user_id = ?, updated_at = ? WHERE cdp_user_link_id = ?`,
        [canonicalUserId, timestamp, currentLink.id],
      ),
      db.statement(
        `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
        [timestamp, displacedUserId],
      ),
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         VALUES (?, ?, 'system', 'superadmin.cdp_identity.reconciled', 'cdp_user_link', ?, NULL, ?, ?)`,
        [
          id('aud'),
          canonicalUserId,
          currentLink.id,
          JSON.stringify({ source: 'verified_superadmin_login', displacedUserId }),
          timestamp,
        ],
      ),
    ];

    if (matchingAuthIdentity) {
      statements.splice(
        1,
        0,
        db.statement(
          `UPDATE auth_identities SET user_id = ?, metadata_json = ?, updated_at = ? WHERE id = ?`,
          [canonicalUserId, JSON.stringify({ authenticationMethods: methods }), timestamp, matchingAuthIdentity.id],
        ),
      );
    } else {
      statements.splice(
        1,
        0,
        db.statement(
          `INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_username, verified_at, metadata_json, created_at, updated_at)
           VALUES (?, ?, 'coinbase_cdp', ?, NULL, ?, ?, ?, ?)`,
          [id('aid'), canonicalUserId, cdpUserId, timestamp, JSON.stringify({ authenticationMethods: methods }), timestamp, timestamp],
        ),
      );
    }

    await db.batch(statements);
    return { id: currentLink.id, user_id: canonicalUserId };
  }

  if (matchingAuthIdentity && matchingAuthIdentity.user_id !== canonicalUserId) {
    const displacedUserId = matchingAuthIdentity.user_id;
    const linkId = id('cdp');
    await db.batch([
      db.statement(
        `INSERT INTO cdp_user_links (id, user_id, cdp_project_id, cdp_user_id, last_auth_method, last_authenticated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [linkId, canonicalUserId, projectId, cdpUserId, lastAuthMethod, timestamp, timestamp, timestamp],
      ),
      db.statement(
        `UPDATE auth_identities SET user_id = ?, metadata_json = ?, updated_at = ? WHERE id = ?`,
        [canonicalUserId, JSON.stringify({ authenticationMethods: methods }), timestamp, matchingAuthIdentity.id],
      ),
      db.statement(
        `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
        [timestamp, displacedUserId],
      ),
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         VALUES (?, ?, 'system', 'superadmin.cdp_identity.reconciled', 'cdp_user_link', ?, NULL, ?, ?)`,
        [id('aud'), canonicalUserId, linkId, JSON.stringify({ source: 'verified_superadmin_login', displacedUserId }), timestamp],
      ),
    ]);
    return { id: linkId, user_id: canonicalUserId };
  }

  return null;
}

function validateInviteAccess(row: InviteAccessRow, verifiedEmail: string | null): void {
  if (row.status !== 'active' || row.uses >= row.max_uses || (row.expires_at && row.expires_at <= now())) {
    throw new HttpError(403, 'This Linkary invitation is invalid or no longer available', 'invalid_invite');
  }
  if (row.invite_type === 'team_invite') {
    if (!row.inviter_organization_id || !row.intended_project_role) {
      throw new HttpError(403, 'This Project team invitation is incomplete', 'invalid_invite');
    }
    if (row.intended_email) {
      const expectedEmail = row.intended_email.trim().toLowerCase();
      const currentEmail = verifiedEmail?.trim().toLowerCase() || '';
      if (!currentEmail || expectedEmail !== currentEmail) {
        throw new HttpError(403, 'This team invitation requires the matching verified email address', 'team_invite_email_mismatch');
      }
    }
  }
}

async function inviteAccessRow(db: Db, inviteCode: string): Promise<InviteAccessRow | null> {
  return db.first<InviteAccessRow>(
    `SELECT id, invite_type, intended_email, inviter_organization_id, intended_project_role,
            status, expires_at, uses, max_uses
       FROM invites WHERE code_hash = ?`,
    [await sha256(inviteCode)],
  );
}

async function resolveTeamInviteForExistingAccess(db: Db, inviteCode: string, verifiedEmail: string | null): Promise<AccessContext | null> {
  const row = await inviteAccessRow(db, inviteCode);
  if (!row || row.invite_type !== 'team_invite') return null;
  validateInviteAccess(row, verifiedEmail);
  return { kind: 'invite', inviteId: row.id, inviteType: row.invite_type, organizationId: row.inviter_organization_id };
}

async function resolveAccessContext(db: Db, inviteCode?: string, earnedGrant?: string, verifiedEmail: string | null = null): Promise<AccessContext> {
  const invite = inviteCode?.trim();
  const grant = earnedGrant?.trim();
  if (invite && grant) throw new HttpError(400, 'Use one Linkary access path at a time', 'multiple_access_contexts');

  if (invite) {
    const row = await inviteAccessRow(db, invite);
    if (!row) throw new HttpError(403, 'This Linkary invitation is invalid or no longer available', 'invalid_invite');
    validateInviteAccess(row, verifiedEmail);
    return { kind: 'invite', inviteId: row.id, inviteType: row.invite_type, organizationId: row.inviter_organization_id };
  }

  if (grant) {
    const row = await db.first<{ id: string }>(
      `SELECT id FROM access_post_submissions WHERE grant_token_hash = ? AND status = 'pending' AND expires_at > ?`,
      [await sha256(grant), now()],
    );
    if (!row) throw new HttpError(403, 'This earned-access grant is invalid or expired', 'invalid_access_grant');
    return { kind: 'earned', submissionId: row.id };
  }

  throw new HttpError(403, 'A valid Linkary invitation or approved access path is required', 'access_required');
}

async function attachAccessContext(db: Db, userId: string, context: AccessContext): Promise<void> {
  const timestamp = now();

  if (context.kind === 'invite') {
    const existing = await db.first<{ id: string }>(
      `SELECT id FROM invite_redemptions WHERE invite_id = ? AND user_id = ?`,
      [context.inviteId, userId],
    );
    if (existing) return;

    const teamInvite = context.inviteType === 'team_invite';
    await db.batch([
      db.statement(
        `INSERT INTO invite_redemptions (id, invite_id, user_id, chosen_account_type, organization_id, quality_state, redeemed_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?)`,
        [id('red'), context.inviteId, userId, teamInvite ? context.organizationId : null, teamInvite ? 'accepted_team' : 'pending', timestamp],
      ),
      db.statement(
        `UPDATE invites SET uses = uses + 1,
          status = CASE WHEN uses + 1 >= max_uses THEN 'exhausted' ELSE status END,
          updated_at = ?
         WHERE id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`,
        [timestamp, context.inviteId, timestamp],
      ),
    ]);
    return;
  }

  await db.run(
    `UPDATE access_post_submissions SET user_id = ?, status = 'authenticated', auth_verified_at = ?
     WHERE id = ? AND status = 'pending' AND expires_at > ?`,
    [userId, timestamp, context.submissionId, timestamp],
  );
  const submission = await db.first<{ user_id: string | null; status: string }>(
    `SELECT user_id, status FROM access_post_submissions WHERE id = ?`,
    [context.submissionId],
  );
  if (submission?.user_id !== userId || submission.status !== 'authenticated') {
    throw new HttpError(409, 'This earned-access grant was used before sign-in completed', 'access_grant_used');
  }
}

export async function createCdpSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<CdpSessionBody>(request);
  const accessToken = body.accessToken?.trim();
  if (!accessToken) throw new HttpError(400, 'CDP access token is required', 'cdp_access_token_required');

  const config = requireCdpConfig(env);

  let endUser: UnknownRecord;
  try {
    endUser = await validateCdpAccessToken(accessToken, config);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'CDP access-token validation could not be completed', 'cdp_validation_failed');
  }

  const cdpUserId = stringValue(endUser.userId) || stringValue(endUser.id);
  if (!cdpUserId) throw new HttpError(502, 'CDP returned an invalid end-user response', 'cdp_invalid_response');

  const methods = authMethods(endUser);
  const email = extractVerifiedEmail(methods);
  const lastAuthMethod = extractLastAuthMethod(methods);
  const timestamp = now();
  const db = new Db(requireDb(env));
  const superadminBootstrapUser = await resolveSuperadminBootstrapUser(db, request, env, email);

  let link = await db.first<CdpLink>(
    `SELECT id, user_id FROM cdp_user_links WHERE cdp_project_id = ? AND cdp_user_id = ?`,
    [config.projectId, cdpUserId],
  );
  let isNewUser = false;
  let accessContext: AccessContext | null = null;

  if (superadminBootstrapUser) {
    link = await reconcileSuperadminCdpIdentity(
      db,
      config.projectId,
      cdpUserId,
      superadminBootstrapUser.id,
      link,
      lastAuthMethod,
      methods,
      timestamp,
    );
  }

  if (!link) {
    if (superadminBootstrapUser) {
      const linkId = id('cdp');
      const existingAuthIdentity = await db.first<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM auth_identities WHERE provider = 'coinbase_cdp' AND provider_user_id = ? LIMIT 1`,
        [cdpUserId],
      );
      const statements = [
        db.statement(
          `INSERT INTO cdp_user_links (id, user_id, cdp_project_id, cdp_user_id, last_auth_method, last_authenticated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [linkId, superadminBootstrapUser.id, config.projectId, cdpUserId, lastAuthMethod, timestamp, timestamp, timestamp],
        ),
      ];
      if (!existingAuthIdentity) {
        statements.push(
          db.statement(
            `INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_username, verified_at, metadata_json, created_at, updated_at) VALUES (?, ?, 'coinbase_cdp', ?, NULL, ?, ?, ?, ?)`,
            [id('aid'), superadminBootstrapUser.id, cdpUserId, timestamp, JSON.stringify({ authenticationMethods: methods }), timestamp, timestamp],
          ),
        );
      }
      await db.batch(statements);
      link = { id: linkId, user_id: superadminBootstrapUser.id };
    } else {
      accessContext = await resolveAccessContext(db, body.inviteCode, body.earnedGrant, email);
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
    }
  } else {
    await db.run(
      `UPDATE cdp_user_links SET last_auth_method = ?, last_authenticated_at = ?, updated_at = ? WHERE id = ?`,
      [lastAuthMethod, timestamp, timestamp, link.id],
    );
    await db.run(
      `UPDATE auth_identities SET metadata_json = ?, updated_at = ? WHERE provider = 'coinbase_cdp' AND provider_user_id = ?`,
      [JSON.stringify({ authenticationMethods: methods }), timestamp, cdpUserId],
    );
    if (!superadminBootstrapUser) {
      const alreadyHasAccess = await hasLinkaryAccess(db, link.user_id);
      if (!alreadyHasAccess) {
        accessContext = await resolveAccessContext(db, body.inviteCode, body.earnedGrant, email);
      } else if (body.inviteCode?.trim()) {
        accessContext = await resolveTeamInviteForExistingAccess(db, body.inviteCode.trim(), email);
      }
    }
  }

  if (accessContext) {
    try {
      await attachAccessContext(db, link.user_id, accessContext);
    } catch (error) {
      if (isNewUser) {
        await db.batch([
          db.statement(`DELETE FROM auth_identities WHERE user_id = ? AND provider = 'coinbase_cdp'`, [link.user_id]),
          db.statement(`DELETE FROM cdp_user_links WHERE id = ?`, [link.id]),
          db.statement(`DELETE FROM users WHERE id = ?`, [link.user_id]),
        ]);
      }
      throw error;
    }
  }

  if (!superadminBootstrapUser && !(await hasLinkaryAccess(db, link.user_id))) {
    throw new HttpError(403, 'A valid Linkary invitation or approved access path is required', 'access_required');
  }

  await syncCdpPlatformIdentities(db, link.user_id, methods);

  const evmAddresses = extractEvmAddresses(endUser);
  for (let index = 0; index < evmAddresses.length; index += 1) {
    const address = evmAddresses[index];
    if (superadminBootstrapUser) {
      await db.run(
        `INSERT INTO wallet_accounts (id, user_id, cdp_user_link_id, provider, chain_family, address, account_type, is_primary, status, created_at, updated_at)
         VALUES (?, ?, ?, 'coinbase_cdp', 'evm', ?, 'eoa', ?, 'active', ?, ?)
         ON CONFLICT(provider, chain_family, address) DO UPDATE SET
           user_id = excluded.user_id,
           cdp_user_link_id = excluded.cdp_user_link_id,
           account_type = excluded.account_type,
           is_primary = excluded.is_primary,
           status = 'active',
           updated_at = excluded.updated_at`,
        [id('wal'), link.user_id, link.id, address, index === 0 ? 1 : 0, timestamp, timestamp],
      );
    } else {
      await db.run(
        `INSERT OR IGNORE INTO wallet_accounts (id, user_id, cdp_user_link_id, provider, chain_family, address, account_type, is_primary, status, created_at, updated_at) VALUES (?, ?, ?, 'coinbase_cdp', 'evm', ?, 'eoa', ?, 'active', ?, ?)`,
        [id('wal'), link.user_id, link.id, address, index === 0 ? 1 : 0, timestamp, timestamp],
      );
    }
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
      accessGranted: true,
      user: { id: user.id, email: user.email, displayName: user.display_name },
      wallet: { evmAddresses },
      csrfToken: session.csrfToken,
    },
    { status: isNewUser ? 201 : 200, headers },
  );
}
