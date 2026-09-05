import { getAuthHeaders } from '@coinbase/cdp-sdk/auth';
import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';
import { hmacSha256, sha256 } from '../security/crypto';

const CDP_API_HOST = 'api.cdp.coinbase.com';
const CDP_VALIDATE_PATH = '/platform/v2/end-users/auth/validate-token';
const CLAIM_HEADER = 'x-linkary-claim-token';
const CLAIM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_CLAIM_GUARD = 'creator_access_active_claim_exists';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type UnknownRecord = Record<string, unknown>;

type CreatorClaimRow = {
  id: string;
  cdp_project_id: string;
  cdp_user_id: string;
  claim_code: string;
  claim_token_hash: string;
  submitted_x_url: string | null;
  approved_invite_id: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'consumed' | 'revoked' | 'expired';
  review_mode: 'manual' | 'twitterapi_io';
  rejection_reason: string | null;
  reviewed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

interface StartClaimBody { accessToken?: string }
interface SubmitClaimBody { postUrl?: string }
interface RejectClaimBody { reason?: string }
interface VerificationSettingBody { mode?: 'manual' | 'twitterapi_io' }

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isActiveClaimGuardError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(ACTIVE_CLAIM_GUARD);
}

function requireProviderConfig(env: Env): { projectId: string; apiKeyId: string; apiKeySecret: string } {
  if (!env.CDP_PROJECT_ID || !env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) {
    throw new ServiceConfigurationError('Authentication provider is not configured');
  }
  return { projectId: env.CDP_PROJECT_ID, apiKeyId: env.CDP_API_KEY_ID, apiKeySecret: env.CDP_API_KEY_SECRET };
}

async function validateSignedInIdentity(accessToken: string, env: Env): Promise<{ projectId: string; providerUserId: string }> {
  const config = requireProviderConfig(env);
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
    throw new HttpError(401, 'Your sign-in expired. Please sign in again.', 'sign_in_expired');
  }
  if (!response.ok) throw new HttpError(502, 'Sign-in verification is temporarily unavailable.', 'sign_in_verification_unavailable');
  const result = asRecord(await response.json());
  const providerUserId = stringValue(result?.userId) || stringValue(result?.id);
  if (!providerUserId) throw new HttpError(502, 'Sign-in verification could not be completed.', 'sign_in_verification_invalid');
  return { projectId: config.projectId, providerUserId };
}

function normalizeXPostUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new HttpError(422, 'Paste the link to your published X post.', 'invalid_x_post_url'); }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['x.com', 'twitter.com'].includes(host)) throw new HttpError(422, 'Paste the link to your published X post.', 'invalid_x_post_url');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3 || parts[1] !== 'status' || !/^\d+$/.test(parts[2])) {
    throw new HttpError(422, 'Paste the link to your published X post.', 'invalid_x_post_url');
  }
  const handle = parts[0].replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new HttpError(422, 'Paste the link to your published X post.', 'invalid_x_post_url');
  return `https://x.com/${handle}/status/${parts[2]}`;
}

function claimPostText(claimCode: string): string {
  return `I'm building my verified creator history with @Linkaryxyz, connecting creator work to real campaign outcomes.\n\nClaim: ${claimCode}\nhttps://linkary.xyz`;
}

function publicClaim(row: CreatorClaimRow) {
  const postText = claimPostText(row.claim_code);
  return {
    id: row.id,
    claimCode: row.claim_code,
    status: row.status,
    submittedPostUrl: row.submitted_x_url,
    rejectionReason: row.rejection_reason,
    reviewMode: row.review_mode,
    expiresAt: row.expires_at,
    postText,
    composeUrl: `https://x.com/intent/post?text=${encodeURIComponent(postText)}`,
    accessReady: row.status === 'approved',
  };
}

async function deriveClaimToken(env: Env, claimId: string): Promise<string> {
  if (!env.SESSION_SECRET) throw new ServiceConfigurationError('SESSION_SECRET is not configured');
  return hmacSha256(env.SESSION_SECRET, `creator-access:${claimId}`);
}

async function claimFromToken(db: Db, token: string): Promise<CreatorClaimRow> {
  const row = await db.first<CreatorClaimRow>(
    `SELECT id, cdp_project_id, cdp_user_id, claim_code, claim_token_hash, submitted_x_url, approved_invite_id, status, review_mode, rejection_reason, reviewed_at, expires_at, created_at, updated_at
     FROM creator_access_claims WHERE claim_token_hash = ? LIMIT 1`,
    [await sha256(token)],
  );
  if (!row) throw new HttpError(404, 'This creator access claim could not be found.', 'claim_not_found');
  if (row.status === 'revoked') {
    throw new HttpError(410, 'This creator access claim is no longer active. Start or resume your current claim.', 'claim_expired');
  }
  if (row.expires_at <= now() && !['approved', 'consumed'].includes(row.status)) {
    await db.run(`UPDATE creator_access_claims SET status = 'expired', updated_at = ? WHERE id = ? AND status NOT IN ('approved', 'consumed')`, [now(), row.id]);
    throw new HttpError(410, 'This creator access claim expired. Start a new claim.', 'claim_expired');
  }
  return row;
}

async function claimById(db: Db, claimId: string): Promise<CreatorClaimRow | null> {
  return db.first<CreatorClaimRow>(
    `SELECT id, cdp_project_id, cdp_user_id, claim_code, claim_token_hash, submitted_x_url, approved_invite_id, status, review_mode, rejection_reason, reviewed_at, expires_at, created_at, updated_at
     FROM creator_access_claims WHERE id = ?`,
    [claimId],
  );
}

async function activeClaimForIdentity(db: Db, projectId: string, providerUserId: string, timestamp: string): Promise<CreatorClaimRow | null> {
  return db.first<CreatorClaimRow>(
    `SELECT id, cdp_project_id, cdp_user_id, claim_code, claim_token_hash, submitted_x_url, approved_invite_id, status, review_mode, rejection_reason, reviewed_at, expires_at, created_at, updated_at
     FROM creator_access_claims
     WHERE cdp_project_id = ? AND cdp_user_id = ? AND status IN ('draft', 'submitted', 'approved') AND expires_at > ?
     ORDER BY
       CASE status WHEN 'approved' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
       updated_at DESC,
       id DESC
     LIMIT 1`,
    [projectId, providerUserId, timestamp],
  );
}

async function resumableClaimPayload(env: Env, row: CreatorClaimRow) {
  const claimToken = await deriveClaimToken(env, row.id);
  if (await sha256(claimToken) !== row.claim_token_hash) {
    throw new HttpError(500, 'Creator access claim could not be resumed.', 'claim_token_mismatch');
  }
  return { claimToken, claim: publicClaim(row) };
}

export async function startCreatorAccessClaim(request: Request, env: Env): Promise<Response> {
  const body = await readJson<StartClaimBody>(request);
  const accessToken = body.accessToken?.trim();
  if (!accessToken) throw new HttpError(400, 'Please sign in before starting Creator Earn Access.', 'sign_in_required');
  const identity = await validateSignedInIdentity(accessToken, env);
  const db = new Db(requireDb(env));
  const timestamp = now();

  const existing = await activeClaimForIdentity(db, identity.projectId, identity.providerUserId, timestamp);
  if (existing) return json(await resumableClaimPayload(env, existing));

  const claimId = id('cac');
  const claimCode = `LKY-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const claimToken = await deriveClaimToken(env, claimId);
  const expiresAt = new Date(Date.now() + CLAIM_LIFETIME_MS).toISOString();
  try {
    await db.run(
      `INSERT INTO creator_access_claims
        (id, cdp_project_id, cdp_user_id, user_id, claim_code, claim_token_hash, submitted_x_url, approved_invite_id, status, review_mode, rejection_reason, reviewed_by_user_id, reviewed_at, expires_at, consumed_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, 'draft', 'manual', NULL, NULL, NULL, ?, NULL, ?, ?)`,
      [claimId, identity.projectId, identity.providerUserId, claimCode, await sha256(claimToken), expiresAt, timestamp, timestamp],
    );
  } catch (error) {
    if (!isActiveClaimGuardError(error)) throw error;
    const winner = await activeClaimForIdentity(db, identity.projectId, identity.providerUserId, now());
    if (!winner) {
      throw new HttpError(409, 'Creator access changed while your claim was starting. Please try again.', 'claim_start_conflict');
    }
    return json(await resumableClaimPayload(env, winner));
  }

  const row = await claimById(db, claimId);
  if (!row) throw new HttpError(500, 'Creator access claim could not be created.', 'claim_creation_failed');
  return json({ claimToken, claim: publicClaim(row) }, { status: 201 });
}

export async function creatorAccessClaimStatus(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get(CLAIM_HEADER)?.trim();
  if (!token) throw new HttpError(401, 'Creator access claim is missing.', 'claim_token_required');
  const db = new Db(requireDb(env));
  const row = await claimFromToken(db, token);
  return json({ claim: publicClaim(row) });
}

export async function submitCreatorAccessPost(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get(CLAIM_HEADER)?.trim();
  if (!token) throw new HttpError(401, 'Creator access claim is missing.', 'claim_token_required');
  const body = await readJson<SubmitClaimBody>(request);
  const postUrl = normalizeXPostUrl(body.postUrl || '');
  const db = new Db(requireDb(env));
  const row = await claimFromToken(db, token);
  if (!['draft', 'rejected'].includes(row.status)) {
    if (row.status === 'submitted' && row.submitted_x_url === postUrl) return json({ claim: publicClaim(row) });
    throw new HttpError(409, 'This claim is already under review.', 'claim_already_submitted');
  }
  const duplicate = await db.first<{ id: string }>(`SELECT id FROM creator_access_claims WHERE submitted_x_url = ? AND id <> ? LIMIT 1`, [postUrl, row.id]);
  if (duplicate) throw new HttpError(409, 'This X post has already been used for a Linkary access claim.', 'x_post_already_used');
  const timestamp = now();
  try {
    await db.run(
      `UPDATE creator_access_claims SET submitted_x_url = ?, status = 'submitted', review_mode = 'manual', rejection_reason = NULL, reviewed_by_user_id = NULL, reviewed_at = NULL, updated_at = ?
       WHERE id = ? AND status IN ('draft', 'rejected')`,
      [postUrl, timestamp, row.id],
    );
  } catch (error) {
    const usedBy = await db.first<{ id: string }>(`SELECT id FROM creator_access_claims WHERE submitted_x_url = ? AND id <> ? LIMIT 1`, [postUrl, row.id]);
    if (usedBy) throw new HttpError(409, 'This X post has already been used for a Linkary access claim.', 'x_post_already_used');
    if (isActiveClaimGuardError(error)) {
      throw new HttpError(409, 'Another Creator Earn Access claim is already active. Restart Creator Earn Access to resume it.', ACTIVE_CLAIM_GUARD);
    }
    throw error;
  }
  const updated = await claimFromToken(db, token);
  if (updated.status === 'submitted' && updated.submitted_x_url === postUrl) {
    return json({ claim: publicClaim(updated), message: 'Your post was submitted for review.' }, { status: 202 });
  }
  throw new HttpError(409, 'This claim changed while the post was being submitted. Refresh and try again.', 'claim_submission_conflict');
}

export async function listCreatorAccessClaims(request: Request, env: Env): Promise<Response> {
  await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get('status') || 'submitted';
  const allowedStatuses = new Set(['draft', 'submitted', 'approved', 'rejected', 'consumed', 'revoked', 'expired']);
  if (!allowedStatuses.has(requestedStatus)) throw new HttpError(400, 'Review status is not valid.', 'invalid_review_status');
  const claims = await db.all<CreatorClaimRow>(
    `SELECT id, cdp_project_id, cdp_user_id, claim_code, claim_token_hash, submitted_x_url, approved_invite_id, status, review_mode, rejection_reason, reviewed_at, expires_at, created_at, updated_at
     FROM creator_access_claims WHERE status = ? ORDER BY created_at ASC LIMIT 100`,
    [requestedStatus],
  );
  return json({ claims: claims.map((row) => ({ ...publicClaim(row), createdAt: row.created_at, reviewedAt: row.reviewed_at })) }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
}

export async function approveCreatorAccessClaim(request: Request, env: Env, claimId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const claim = await claimById(db, claimId);
  if (!claim) throw new HttpError(404, 'Creator access claim not found.', 'claim_not_found');
  if (claim.status === 'approved' && claim.approved_invite_id) {
    return json({ ok: true, claimId: claim.id, status: 'approved', inviteId: claim.approved_invite_id, idempotent: true });
  }
  if (claim.status !== 'submitted' || !claim.submitted_x_url) throw new HttpError(409, 'Only submitted claims can be approved.', 'claim_not_reviewable');

  const claimToken = await deriveClaimToken(env, claim.id);
  const inviteCodeHash = await sha256(claimToken);
  if (inviteCodeHash !== claim.claim_token_hash) throw new HttpError(500, 'Creator access claim could not be approved.', 'claim_token_mismatch');
  const timestamp = now();
  const inviteId = id('inv');
  const auditId = id('aud');
  const approvalMetadata = JSON.stringify({ claimCode: claim.claim_code, submittedXUrl: claim.submitted_x_url, reviewMode: 'manual' });

  await db.batch([
    db.statement(
      `INSERT INTO invites (id, code_hash, display_code, invite_type, inviter_user_id, inviter_organization_id, intended_email, allowed_account_types_json, max_uses, uses, expires_at, status, created_at, updated_at)
       SELECT ?, ?, NULL, 'network_invite', ?, NULL, NULL, '["creator"]', 1, 0, ?, 'active', ?, ?
       WHERE EXISTS (
         SELECT 1 FROM creator_access_claims
         WHERE id = ? AND status = 'submitted' AND submitted_x_url IS NOT NULL AND expires_at > ?
       )`,
      [inviteId, inviteCodeHash, auth.user.id, claim.expires_at, timestamp, timestamp, claim.id, timestamp],
    ),
    db.statement(
      `UPDATE creator_access_claims
       SET approved_invite_id = ?, status = 'approved', review_mode = 'manual', rejection_reason = NULL, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'submitted' AND submitted_x_url IS NOT NULL AND expires_at > ?
         AND EXISTS (SELECT 1 FROM invites WHERE id = ? AND code_hash = ?)`,
      [inviteId, auth.user.id, timestamp, timestamp, claim.id, timestamp, inviteId, inviteCodeHash],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'superadmin', 'creator_access.approved', 'creator_access_claim', ?, NULL, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM creator_access_claims
         WHERE id = ? AND status = 'approved' AND approved_invite_id = ? AND reviewed_by_user_id = ? AND reviewed_at = ?
       )`,
      [auditId, auth.user.id, claim.id, approvalMetadata, timestamp, claim.id, inviteId, auth.user.id, timestamp],
    ),
  ]);

  const finalClaim = await claimById(db, claim.id);
  if (!finalClaim) throw new HttpError(404, 'Creator access claim not found.', 'claim_not_found');
  if (finalClaim.status === 'approved' && finalClaim.approved_invite_id === inviteId) {
    return json({ ok: true, claimId: finalClaim.id, status: 'approved', inviteId });
  }
  if (finalClaim.status === 'approved' && finalClaim.approved_invite_id) {
    return json({ ok: true, claimId: finalClaim.id, status: 'approved', inviteId: finalClaim.approved_invite_id, idempotent: true });
  }
  throw new HttpError(409, 'This claim was changed by another review action. Refresh the review queue.', 'claim_review_conflict');
}

export async function rejectCreatorAccessClaim(request: Request, env: Env, claimId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<RejectClaimBody>(request);
  const reason = body.reason?.trim().slice(0, 240) || 'The submitted post could not be approved.';
  const db = new Db(requireDb(env));
  const claim = await claimById(db, claimId);
  if (!claim) throw new HttpError(404, 'Creator access claim not found.', 'claim_not_found');
  if (claim.status !== 'submitted') throw new HttpError(409, 'Only submitted claims can be rejected.', 'claim_not_reviewable');
  const timestamp = now();
  const auditId = id('aud');
  const rejectionMetadata = JSON.stringify({ claimCode: claim.claim_code, submittedXUrl: claim.submitted_x_url, reason });

  await db.batch([
    db.statement(
      `UPDATE creator_access_claims
       SET status = 'rejected', rejection_reason = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'submitted'`,
      [reason, auth.user.id, timestamp, timestamp, claim.id],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'superadmin', 'creator_access.rejected', 'creator_access_claim', ?, NULL, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM creator_access_claims
         WHERE id = ? AND status = 'rejected' AND rejection_reason = ? AND reviewed_by_user_id = ? AND reviewed_at = ?
       )`,
      [auditId, auth.user.id, claim.id, rejectionMetadata, timestamp, claim.id, reason, auth.user.id, timestamp],
    ),
  ]);

  const finalClaim = await claimById(db, claim.id);
  if (!finalClaim) throw new HttpError(404, 'Creator access claim not found.', 'claim_not_found');
  if (finalClaim.status === 'rejected' && finalClaim.rejection_reason === reason && finalClaim.reviewed_at === timestamp) {
    return json({ ok: true, claimId: finalClaim.id, status: 'rejected', reason });
  }
  throw new HttpError(409, 'This claim was changed by another review action. Refresh the review queue.', 'claim_review_conflict');
}

export async function creatorAccessVerificationSetting(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  if (request.method === 'GET') {
    const row = await db.first<{ value_json: string; updated_at: string }>(`SELECT value_json, updated_at FROM admin_settings WHERE setting_key = 'creator_access_verification'`);
    let setting: { mode: 'manual' | 'twitterapi_io'; providerConfigured: boolean } = { mode: 'manual', providerConfigured: false };
    try { if (row) setting = { ...setting, ...JSON.parse(row.value_json) }; } catch {}
    return json({ ...setting, updatedAt: row?.updated_at || null, automationAvailable: false });
  }
  if (request.method !== 'PATCH') throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
  await verifyCsrf(request, env, auth);
  const body = await readJson<VerificationSettingBody>(request);
  if (body.mode !== 'manual' && body.mode !== 'twitterapi_io') throw new HttpError(400, 'Verification mode is not valid.', 'invalid_verification_mode');
  if (body.mode === 'twitterapi_io') {
    throw new HttpError(409, 'Automated verification is not configured yet. Manual review remains active.', 'automated_verification_not_configured');
  }
  const timestamp = now();
  const value = JSON.stringify({ mode: 'manual', providerConfigured: false });
  await db.run(
    `INSERT INTO admin_settings (setting_key, value_json, updated_by_user_id, updated_at) VALUES ('creator_access_verification', ?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`,
    [value, auth.user.id, timestamp],
  );
  return json({ mode: 'manual', providerConfigured: false, automationAvailable: false, updatedAt: timestamp });
}
