import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { requireOperationalProjectAccess } from './organizations';

const now = () => new Date().toISOString();
const id = () => `collab_${crypto.randomUUID().replace(/-/g, '')}`;

function nonNegative(value: unknown, field: string, optional = false): number | null {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new HttpError(400, `${field} must be zero or greater`, 'invalid_performance_value');
  return number;
}

export async function partnerManagerReputation(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const managerId = new URL(request.url).searchParams.get('managerId');
  if (!managerId) throw new HttpError(400, 'Manager is required', 'manager_required');
  const db = new Db(requireDb(env));
  const manager = await db.first<{ id: string; visibility: string }>('SELECT id, visibility FROM partner_managers WHERE id = ?', [managerId]);
  if (!manager || manager.visibility !== 'public') throw new HttpError(404, 'Manager listing not found', 'manager_not_found');

  const summary = await db.first<{
    collaborations: number;
    projects: number;
    spend_usd: number;
    tracked_clicks: number;
    outcomes: number;
    attributed_value_usd: number;
    tracked_records: number;
    verified_records: number;
  }>(
    `SELECT COUNT(*) AS collaborations,
            COUNT(DISTINCT organization_id) AS projects,
            COALESCE(SUM(spend_usd), 0) AS spend_usd,
            COALESCE(SUM(tracked_clicks), 0) AS tracked_clicks,
            COALESCE(SUM(outcomes), 0) AS outcomes,
            COALESCE(SUM(attributed_value_usd), 0) AS attributed_value_usd,
            COALESCE(SUM(CASE WHEN evidence_source = 'tracked' THEN 1 ELSE 0 END), 0) AS tracked_records,
            COALESCE(SUM(CASE WHEN evidence_source = 'verified' THEN 1 ELSE 0 END), 0) AS verified_records
       FROM partner_manager_collaborations
      WHERE manager_id = ?`,
    [managerId],
  );

  const records = await db.all(
    `SELECT c.id, c.organization_id, c.campaign_id, c.evidence_source, c.spend_usd, c.tracked_clicks,
            c.outcomes, c.attributed_value_usd, c.notes, c.occurred_at, c.created_at,
            o.name AS project_name, ca.name AS campaign_name
       FROM partner_manager_collaborations c
       JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN campaigns ca ON ca.id = c.campaign_id
      WHERE c.manager_id = ?
      ORDER BY c.occurred_at DESC, c.created_at DESC
      LIMIT 25`,
    [managerId],
  );

  const spend = Number(summary?.spend_usd || 0);
  const value = Number(summary?.attributed_value_usd || 0);
  const clicks = Number(summary?.tracked_clicks || 0);
  const outcomes = Number(summary?.outcomes || 0);
  const collaborations = Number(summary?.collaborations || 0);
  const evidenceLevel = Number(summary?.verified_records || 0) > 0 ? 'verified' : Number(summary?.tracked_records || 0) > 0 ? 'tracked' : collaborations > 0 ? 'manual' : 'none';

  return json({
    summary: {
      collaborations,
      projects: Number(summary?.projects || 0),
      spend_usd: spend,
      tracked_clicks: clicks,
      outcomes,
      attributed_value_usd: value,
      roi_multiple: spend > 0 ? value / spend : null,
      conversion_rate: clicks > 0 ? outcomes / clicks : null,
      evidence_level: evidenceLevel,
    },
    records,
  });
}

export async function recordPartnerManagerCollaboration(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    managerId?: string;
    organizationId?: string;
    campaignId?: string | null;
    spendUsd?: number | null;
    trackedClicks?: number;
    outcomes?: number;
    attributedValueUsd?: number;
    notes?: string;
    occurredAt?: string;
  }>(request);
  if (!body.managerId || !body.organizationId) throw new HttpError(400, 'Manager and Project are required', 'invalid_collaboration');
  const db = new Db(requireDb(env));
  await requireOperationalProjectAccess(db, auth.user.id, body.organizationId, true);
  const manager = await db.first<{ id: string }>('SELECT id FROM partner_managers WHERE id = ?', [body.managerId]);
  if (!manager) throw new HttpError(404, 'Manager listing not found', 'manager_not_found');

  if (body.campaignId) {
    const campaign = await db.first<{ id: string }>('SELECT id FROM campaigns WHERE id = ? AND organization_id = ?', [body.campaignId, body.organizationId]);
    if (!campaign) throw new HttpError(400, 'Choose a campaign from this Project', 'invalid_campaign');
  }

  const spend = nonNegative(body.spendUsd, 'Spend', true);
  const clicks = nonNegative(body.trackedClicks, 'Clicks') || 0;
  const outcomes = nonNegative(body.outcomes, 'Outcomes') || 0;
  const value = nonNegative(body.attributedValueUsd, 'Attributed value') || 0;
  const occurredAt = body.occurredAt?.trim() || now();
  const timestamp = now();
  const collaborationId = id();

  await db.run(
    `INSERT INTO partner_manager_collaborations
      (id, manager_id, organization_id, campaign_id, evidence_source, spend_usd, tracked_clicks, outcomes, attributed_value_usd, notes, occurred_at, recorded_by_user_id, created_at)
     VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [collaborationId, body.managerId, body.organizationId, body.campaignId || null, spend, Math.round(clicks), Math.round(outcomes), value, body.notes?.trim().slice(0, 800) || '', occurredAt, auth.user.id, timestamp],
  );

  return json({ id: collaborationId }, { status: 201 });
}
