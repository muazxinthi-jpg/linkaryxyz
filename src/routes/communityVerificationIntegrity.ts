import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { readJson } from '../http';
import { savePartnerManagerAsset } from './partnerDirectory';
import { reviewCommunityVerification } from './communityVerification';

const now = () => new Date().toISOString();

export async function syncCommunityManagerVerification(db: Db, managerId: string): Promise<void> {
  const manager = await db.first<{ manager_type: string }>(
    `SELECT manager_type FROM partner_managers WHERE id = ?`,
    [managerId],
  );
  if (!manager || manager.manager_type !== 'community_manager') return;

  const verifiedAsset = await db.first<{ id: string }>(
    `SELECT id FROM partner_manager_assets
      WHERE manager_id = ?
        AND asset_type = 'telegram_community'
        AND verification_status = 'verified'
      LIMIT 1`,
    [managerId],
  );
  await db.run(
    `UPDATE partner_managers
        SET verification_status = ?, updated_at = ?
      WHERE id = ? AND manager_type = 'community_manager'`,
    [verifiedAsset ? 'verified' : 'unverified', now(), managerId],
  );
}

export async function savePartnerManagerAssetIntegrity(request: Request, env: Env): Promise<Response> {
  const inspection = request.clone();
  const body = await readJson<{ managerId?: string }>(inspection);
  const response = await savePartnerManagerAsset(request, env);
  if (response.ok && body.managerId) {
    await syncCommunityManagerVerification(new Db(requireDb(env)), body.managerId);
  }
  return response;
}

export async function reviewCommunityVerificationIntegrity(
  request: Request,
  env: Env,
  assetId: string,
  decision: 'approve' | 'reject',
): Promise<Response> {
  const db = new Db(requireDb(env));
  const asset = await db.first<{ manager_id: string }>(
    `SELECT manager_id FROM partner_manager_assets
      WHERE id = ? AND asset_type = 'telegram_community'`,
    [assetId],
  );
  const response = await reviewCommunityVerification(request, env, assetId, decision);
  if (response.ok && asset?.manager_id) {
    await syncCommunityManagerVerification(db, asset.manager_id);
  }
  return response;
}
