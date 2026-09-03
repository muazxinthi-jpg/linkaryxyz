import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { requireOperationalProjectAccess } from './organizations';

export type CampaignLifecycleStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type CampaignLifecycleTarget = 'active' | 'paused' | 'completed' | 'archived';

const ALLOWED_TRANSITIONS: Record<CampaignLifecycleStatus, readonly CampaignLifecycleTarget[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export function canTransitionCampaignStatus(current: CampaignLifecycleStatus, next: CampaignLifecycleTarget): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export async function updateCampaignLifecycleStatus(request: Request, env: Env, campaignId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: CampaignLifecycleTarget }>(request);
  if (!body.status || !['active', 'paused', 'completed', 'archived'].includes(body.status)) {
    throw new HttpError(400, 'Choose a valid campaign status', 'invalid_campaign_status');
  }

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const campaign = await db.first<{
    id: string;
    status: CampaignLifecycleStatus;
    organization_id: string;
  }>('SELECT id, status, organization_id FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) throw new HttpError(404, 'Campaign not found', 'campaign_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, campaign.organization_id, true);

  const next = body.status;
  if (campaign.status === next) {
    return json({ ok: true, id: campaign.id, status: next, previousStatus: campaign.status, existing: true });
  }
  if (!canTransitionCampaignStatus(campaign.status, next)) {
    throw new HttpError(
      409,
      campaign.status === 'archived'
        ? 'Archived campaigns are final in this Beta workflow.'
        : campaign.status === 'completed'
          ? 'Completed campaigns can only be archived in this Beta workflow.'
          : `Campaign cannot move from ${campaign.status} to ${next}.`,
      'invalid_campaign_transition',
    );
  }

  const timestamp = new Date().toISOString();
  await db.run('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?', [next, timestamp, campaign.id]);

  return json({
    ok: true,
    id: campaign.id,
    status: next,
    previousStatus: campaign.status,
    updatedAt: timestamp,
    existing: false,
    activityStatusesChanged: false,
    performanceEvidenceCreated: false,
  });
}
