import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, requireSuperadmin, verifyCsrf } from '../auth/session';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

type OwnedCommunity = {
  id: string;
  manager_id: string;
  name: string;
  handle: string | null;
  url: string | null;
  verification_status: string;
  profile_id: string;
  manager_name: string;
};

type SubmissionMetadata = {
  proofCode?: string;
  evidenceUrl?: string;
  note?: string;
  communityName?: string;
  communityHandle?: string | null;
};

function proofCode(assetId: string): string {
  const compact = assetId.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
  return `LKY-COMM-${compact}`;
}

function telegramEvidenceUrl(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) throw new HttpError(400, 'A public Telegram proof URL is required', 'evidence_required');
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || !['t.me', 'telegram.me', 'www.t.me'].includes(host)) throw new Error();
    if (parsed.pathname.split('/').filter(Boolean).length < 1) throw new Error();
    return parsed.toString();
  } catch {
    throw new HttpError(400, 'Enter a public Telegram URL such as https://t.me/channel/123', 'invalid_evidence_url');
  }
}

function metadata(value: string | null | undefined): SubmissionMetadata {
  if (!value) return {};
  try { return JSON.parse(value) as SubmissionMetadata; }
  catch { return {}; }
}

async function ownedCommunity(db: Db, userId: string, assetId: string): Promise<OwnedCommunity> {
  const asset = await db.first<OwnedCommunity>(
    `SELECT a.id, a.manager_id, a.name, a.handle, a.url, a.verification_status,
            m.profile_id, m.display_name AS manager_name
       FROM partner_manager_assets a
       JOIN partner_managers m ON m.id = a.manager_id
       JOIN profiles p ON p.id = m.profile_id
      WHERE a.id = ?
        AND a.asset_type = 'telegram_community'
        AND m.manager_type = 'community_manager'
        AND p.owner_user_id = ?
        AND p.profile_type = 'creator'
      LIMIT 1`,
    [assetId, userId],
  );
  if (!asset) throw new HttpError(404, 'Community not found', 'community_not_found');
  return asset;
}

async function latestSubmission(db: Db, assetId: string) {
  return db.first<{ metadata_json: string; created_at: string; actor_user_id: string | null }>(
    `SELECT metadata_json, created_at, actor_user_id
       FROM audit_logs
      WHERE resource_type = 'telegram_community'
        AND resource_id = ?
        AND action = 'community_verification.submitted'
      ORDER BY created_at DESC
      LIMIT 1`,
    [assetId],
  );
}

export async function communityVerificationStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const assetId = new URL(request.url).searchParams.get('assetId')?.trim();
  if (!assetId) throw new HttpError(400, 'assetId is required', 'community_required');
  const asset = await ownedCommunity(db, auth.user.id, assetId);
  const submission = await latestSubmission(db, assetId);
  const detail = metadata(submission?.metadata_json);
  return json({
    assetId: asset.id,
    status: asset.verification_status,
    proofCode: proofCode(asset.id),
    submittedAt: submission?.created_at || null,
    evidenceUrl: detail.evidenceUrl || null,
    note: detail.note || '',
  });
}

export async function submitCommunityVerification(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ assetId?: string; evidenceUrl?: string; note?: string }>(request);
  if (!body.assetId) throw new HttpError(400, 'Community is required', 'community_required');
  const db = new Db(requireDb(env));
  const asset = await ownedCommunity(db, auth.user.id, body.assetId);
  if (asset.verification_status === 'verified') throw new HttpError(409, 'This community is already verified', 'already_verified');
  const evidenceUrl = telegramEvidenceUrl(body.evidenceUrl);
  const timestamp = now();
  const code = proofCode(asset.id);
  const details: SubmissionMetadata = {
    proofCode: code,
    evidenceUrl,
    note: body.note?.trim().slice(0, 500) || '',
    communityName: asset.name,
    communityHandle: asset.handle,
  };
  await db.batch([
    db.statement(`UPDATE partner_manager_assets SET verification_status = 'submitted', updated_at = ? WHERE id = ?`, [timestamp, asset.id]),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata_json, created_at)
       VALUES (?, ?, 'user', 'community_verification.submitted', 'telegram_community', ?, ?, ?)`,
      [id('audit'), auth.user.id, asset.id, JSON.stringify(details), timestamp],
    ),
  ]);
  return json({ ok: true, assetId: asset.id, status: 'submitted', proofCode: code, evidenceUrl });
}

export async function listCommunityVerificationReviews(request: Request, env: Env): Promise<Response> {
  await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const assets = await db.all<{
    id: string; manager_id: string; name: string; handle: string | null; url: string | null; audience_size: number;
    verification_status: string; manager_name: string; profile_username: string; owner_email: string | null;
  }>(
    `SELECT a.id, a.manager_id, a.name, a.handle, a.url, a.audience_size, a.verification_status,
            m.display_name AS manager_name, p.username AS profile_username, u.email AS owner_email
       FROM partner_manager_assets a
       JOIN partner_managers m ON m.id = a.manager_id
       JOIN profiles p ON p.id = m.profile_id
       LEFT JOIN users u ON u.id = p.owner_user_id
      WHERE a.asset_type = 'telegram_community'
        AND a.verification_status = 'submitted'
      ORDER BY a.updated_at ASC
      LIMIT 200`,
  );
  const logs = await db.all<{ resource_id: string | null; metadata_json: string; created_at: string }>(
    `SELECT resource_id, metadata_json, created_at
       FROM audit_logs
      WHERE resource_type = 'telegram_community'
        AND action = 'community_verification.submitted'
      ORDER BY created_at DESC
      LIMIT 500`,
  );
  const latest = new Map<string, { metadata_json: string; created_at: string }>();
  for (const log of logs) if (log.resource_id && !latest.has(log.resource_id)) latest.set(log.resource_id, log);
  return json({
    reviews: assets.map((asset) => {
      const log = latest.get(asset.id);
      const detail = metadata(log?.metadata_json);
      return {
        ...asset,
        audience_size: Number(asset.audience_size || 0),
        proof_code: detail.proofCode || proofCode(asset.id),
        evidence_url: detail.evidenceUrl || null,
        note: detail.note || '',
        submitted_at: log?.created_at || null,
      };
    }),
  }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
}

export async function reviewCommunityVerification(request: Request, env: Env, assetId: string, decision: 'approve' | 'reject'): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ reason?: string }>(request);
  const db = new Db(requireDb(env));
  const asset = await db.first<{ id: string; manager_id: string; name: string; verification_status: string }>(
    `SELECT id, manager_id, name, verification_status
       FROM partner_manager_assets
      WHERE id = ? AND asset_type = 'telegram_community' LIMIT 1`,
    [assetId],
  );
  if (!asset) throw new HttpError(404, 'Community not found', 'community_not_found');
  if (asset.verification_status !== 'submitted') throw new HttpError(409, 'This community is not awaiting verification', 'verification_not_pending');
  const timestamp = now();
  const next = decision === 'approve' ? 'verified' : 'rejected';
  const statements = [
    db.statement('UPDATE partner_manager_assets SET verification_status = ?, updated_at = ? WHERE id = ?', [next, timestamp, asset.id]),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', ?, 'telegram_community', ?, ?, ?)`,
      [id('audit'), auth.user.id, `community_verification.${decision === 'approve' ? 'approved' : 'rejected'}`, asset.id, JSON.stringify({ reason: body.reason?.trim().slice(0, 500) || '', communityName: asset.name }), timestamp],
    ),
  ];
  if (decision === 'approve') {
    statements.push(db.statement(`UPDATE partner_managers SET verification_status = 'verified', updated_at = ? WHERE id = ?`, [timestamp, asset.manager_id]));
  }
  await db.batch(statements);
  return json({ ok: true, assetId: asset.id, status: next });
}
