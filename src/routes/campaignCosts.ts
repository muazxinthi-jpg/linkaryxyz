import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';

const id = () => `cost_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const costTypes = new Set(['partner', 'media', 'platform', 'agency', 'other']);

function nonNegative(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, `${field} must be zero or greater`, 'invalid_cost');
  return parsed;
}

function currencyCode(value: unknown): string {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9._-]{2,12}$/.test(code)) throw new HttpError(400, 'Enter a valid currency or token code', 'invalid_currency');
  return code;
}

async function campaignAccess(db: Db, userId: string, campaignId: string, write = false) {
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ id: string; organization_id: string; name: string; budget_usd: number | null }>(
    'SELECT id, organization_id, name, budget_usd FROM campaigns WHERE id = ?',
    [campaignId],
  );
  if (!campaign) throw new HttpError(404, 'Campaign not found', 'campaign_not_found');
  if (write) await requireOperationalProjectAccess(db, userId, campaign.organization_id, true);
  else if (!(await organizationMembership(db, userId, campaign.organization_id))) throw new HttpError(403, 'Campaign spend access denied', 'forbidden');
  return campaign;
}

export async function listCampaignCosts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const activityId = url.searchParams.get('activityId')?.trim() || null;
  let campaignId = url.searchParams.get('campaignId')?.trim() || null;

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  if (!campaignId && activityId) {
    const activity = await db.first<{ campaign_id: string }>('SELECT campaign_id FROM campaign_activities WHERE id = ?', [activityId]);
    campaignId = activity?.campaign_id || null;
  }
  if (!campaignId) throw new HttpError(400, 'campaignId or activityId is required', 'campaign_required');

  const campaign = await campaignAccess(db, auth.user.id, campaignId);
  if (activityId) {
    const activity = await db.first<{ id: string }>('SELECT id FROM campaign_activities WHERE id = ? AND campaign_id = ?', [activityId, campaignId]);
    if (!activity) throw new HttpError(400, 'Choose an activity from this campaign', 'invalid_activity');
  }

  const clauses = ['c.campaign_id = ?'];
  const params: unknown[] = [campaignId];
  if (activityId) { clauses.push('c.activity_id = ?'); params.push(activityId); }

  const entries = await db.all<{
    id: string;
    activity_id: string | null;
    activity_title: string | null;
    cost_type: string;
    amount_original: number;
    currency: string;
    usd_equivalent: number;
    provenance: string;
    note: string;
    incurred_at: string;
    status: string;
    created_at: string;
    void_reason: string | null;
  }>(
    `SELECT c.id, c.activity_id, a.title AS activity_title, c.cost_type, c.amount_original, c.currency,
            c.usd_equivalent, c.provenance, c.note, c.incurred_at, c.status, c.created_at, c.void_reason
       FROM campaign_cost_entries c
       LEFT JOIN campaign_activities a ON a.id = c.activity_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY c.incurred_at DESC, c.created_at DESC
      LIMIT 500`,
    params,
  );

  const active = entries.filter((entry) => entry.status === 'active');
  const actualSpendUsd = active.reduce((sum, entry) => sum + Number(entry.usd_equivalent || 0), 0);
  return json({
    campaign: { id: campaign.id, name: campaign.name, budget_usd: campaign.budget_usd },
    summary: {
      actual_spend_usd: actualSpendUsd,
      active_entries: active.length,
      budget_remaining_usd: campaign.budget_usd === null ? null : Number(campaign.budget_usd) - actualSpendUsd,
    },
    entries,
  });
}

export async function recordCampaignCost(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    campaignId?: string;
    activityId?: string | null;
    costType?: string;
    amount?: number;
    currency?: string;
    usdEquivalent?: number;
    note?: string;
    incurredAt?: string;
  }>(request);
  if (!body.campaignId) throw new HttpError(400, 'Campaign is required', 'campaign_required');

  const db = new Db(requireDb(env));
  const campaign = await campaignAccess(db, auth.user.id, body.campaignId, true);
  const costType = costTypes.has(body.costType || '') ? body.costType! : 'partner';
  const amount = nonNegative(body.amount, 'Amount');
  const currency = currencyCode(body.currency || 'USD');
  const usdEquivalent = currency === 'USD' && body.usdEquivalent === undefined
    ? amount
    : nonNegative(body.usdEquivalent, 'USD equivalent');

  const activityId = body.activityId?.trim() || null;
  if (activityId) {
    const activity = await db.first<{ id: string }>('SELECT id FROM campaign_activities WHERE id = ? AND campaign_id = ?', [activityId, body.campaignId]);
    if (!activity) throw new HttpError(400, 'Choose an activity from this campaign', 'invalid_activity');
  }

  const incurredAt = body.incurredAt?.trim() || now();
  if (Number.isNaN(new Date(incurredAt).getTime())) throw new HttpError(400, 'Enter a valid incurred date', 'invalid_incurred_at');
  const timestamp = now();
  const costId = id();
  await db.run(
    `INSERT INTO campaign_cost_entries
      (id, organization_id, campaign_id, activity_id, cost_type, amount_original, currency, usd_equivalent,
       provenance, note, incurred_at, status, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'founder_manual', ?, ?, 'active', ?, ?, ?)`,
    [costId, campaign.organization_id, body.campaignId, activityId, costType, amount, currency, usdEquivalent, body.note?.trim().slice(0, 500) || '', incurredAt, auth.user.id, timestamp, timestamp],
  );

  return json({ id: costId, actualCostUsd: usdEquivalent, provenance: 'founder_manual' }, { status: 201 });
}

export async function voidCampaignCost(request: Request, env: Env, costId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ reason?: string }>(request);
  const reason = body.reason?.trim();
  if (!reason) throw new HttpError(400, 'Add a reason before voiding a cost entry', 'void_reason_required');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const entry = await db.first<{ id: string; organization_id: string; status: string }>(
    'SELECT id, organization_id, status FROM campaign_cost_entries WHERE id = ?',
    [costId],
  );
  if (!entry) throw new HttpError(404, 'Cost entry not found', 'cost_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, entry.organization_id, true);
  if (entry.status === 'voided') return json({ ok: true, id: entry.id, alreadyVoided: true });

  const timestamp = now();
  await db.run(
    `UPDATE campaign_cost_entries
        SET status = 'voided', void_reason = ?, voided_by_user_id = ?, voided_at = ?, updated_at = ?
      WHERE id = ?`,
    [reason.slice(0, 500), auth.user.id, timestamp, timestamp, costId],
  );
  return json({ ok: true, id: costId, alreadyVoided: false });
}
