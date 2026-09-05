import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';

const id = () => `cev_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function createConversion(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ trackedLinkId?: string; eventKey?: string; eventType?: string; valueUsd?: number; occurredAt?: string }>(request);
  if (!body.trackedLinkId || !body.eventKey?.trim() || !body.eventType?.trim()) {
    throw new HttpError(400, 'Tracking link, external outcome ID, and outcome type are required', 'invalid_conversion');
  }

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const link = await db.first<{ organization_id: string; campaign_id: string | null; activity_id: string | null }>(
    'SELECT organization_id, campaign_id, activity_id FROM tracked_links WHERE id = ?',
    [body.trackedLinkId],
  );
  if (!link) throw new HttpError(404, 'Tracking link not found', 'tracking_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, link.organization_id, true);

  const eventKey = body.eventKey.trim().slice(0, 180);
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM conversion_events WHERE organization_id = ? AND external_event_key = ?',
    [link.organization_id, eventKey],
  );
  if (existing) return json({ ok: true, id: existing.id, duplicate: true });

  const conversionId = id();
  await db.run(
    "INSERT INTO conversion_events (id, organization_id, campaign_id, activity_id, tracked_link_id, external_event_key, event_type, value_usd, source, attribution_confidence, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'manual', ?, ?)",
    [
      conversionId,
      link.organization_id,
      link.campaign_id,
      link.activity_id,
      body.trackedLinkId,
      eventKey,
      body.eventType.trim().slice(0, 80),
      typeof body.valueUsd === 'number' ? body.valueUsd : null,
      body.occurredAt || now(),
      now(),
    ],
  );
  return json({ ok: true, id: conversionId, duplicate: false }, { status: 201 });
}

export async function listConversions(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaignId');
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ organization_id: string; name: string }>('SELECT organization_id, name FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign || !(await organizationMembership(db, auth.user.id, campaign.organization_id))) {
    throw new HttpError(403, 'Conversion access denied', 'forbidden');
  }

  const activityId = url.searchParams.get('activityId')?.trim();
  const source = url.searchParams.get('source')?.trim();
  const confidence = url.searchParams.get('confidence')?.trim();
  const search = url.searchParams.get('search')?.trim();
  const from = url.searchParams.get('from')?.trim();
  const to = url.searchParams.get('to')?.trim();
  const format = url.searchParams.get('format')?.trim().toLowerCase();

  const clauses = ['e.campaign_id = ?'];
  const params: unknown[] = [campaignId];
  if (activityId) { clauses.push('e.activity_id = ?'); params.push(activityId); }
  if (source) { clauses.push('e.source = ?'); params.push(source); }
  if (confidence) { clauses.push('e.attribution_confidence = ?'); params.push(confidence); }
  if (search) { clauses.push('(lower(e.external_event_key) LIKE ? OR lower(e.event_type) LIKE ?)'); const term = `%${search.toLowerCase()}%`; params.push(term, term); }
  if (from) { clauses.push('e.occurred_at >= ?'); params.push(from); }
  if (to) { clauses.push('e.occurred_at <= ?'); params.push(to); }

  const limit = format === 'csv' ? 5000 : 500;
  params.push(limit);
  const conversions = await db.all<any>(
    `SELECT
       e.id,
       e.tracked_link_id,
       t.code AS tracking_code,
       t.destination_url,
       e.activity_id,
       a.title AS activity_title,
       a.activity_type,
       e.external_event_key,
       e.event_type,
       e.value_usd,
       e.source,
       e.attribution_confidence,
       e.occurred_at,
       e.created_at
     FROM conversion_events e
     LEFT JOIN tracked_links t ON t.id = e.tracked_link_id
     LEFT JOIN campaign_activities a ON a.id = e.activity_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY e.occurred_at DESC
     LIMIT ?`,
    params,
  );

  if (format === 'csv') {
    const header = ['Outcome ID', 'Campaign', 'Activity', 'Activity Type', 'Tracking Code', 'Destination', 'External Outcome ID', 'Outcome Type', 'Value USD', 'Source', 'Confidence', 'Occurred At'];
    const lines = [header.map(csvCell).join(',')];
    for (const row of conversions) {
      lines.push([
        row.id,
        campaign.name,
        row.activity_title,
        row.activity_type,
        row.tracking_code,
        row.destination_url,
        row.external_event_key,
        row.event_type,
        row.value_usd,
        row.source,
        row.attribution_confidence,
        row.occurred_at,
      ].map(csvCell).join(','));
    }
    const filename = `linkary-${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign'}-outcomes.csv`;
    return new Response(`${lines.join('\n')}\n`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    });
  }

  return json({ conversions, filters: { activityId: activityId || null, source: source || null, confidence: confidence || null, search: search || null, from: from || null, to: to || null } });
}

export async function campaignOutcomeSummary(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const campaignId = new URL(request.url).searchParams.get('campaignId');
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign || !(await organizationMembership(db, auth.user.id, campaign.organization_id))) {
    throw new HttpError(403, 'Campaign access denied', 'forbidden');
  }

  const summary = await db.first<{ conversions: number; value_usd: number; tracked_clicks: number; tracking_links: number; actual_spend_usd: number }>(
    `SELECT
       (SELECT COUNT(*) FROM conversion_events WHERE campaign_id = ?) AS conversions,
       COALESCE((SELECT SUM(value_usd) FROM conversion_events WHERE campaign_id = ?), 0) AS value_usd,
       COALESCE((SELECT COUNT(*) FROM tracked_link_clicks c JOIN tracked_links t ON t.id = c.tracked_link_id WHERE t.campaign_id = ?), 0) AS tracked_clicks,
       COALESCE((SELECT COUNT(*) FROM tracked_links WHERE campaign_id = ? AND status != 'archived'), 0) AS tracking_links,
       COALESCE((SELECT SUM(usd_equivalent) FROM campaign_cost_entries WHERE campaign_id = ? AND status = 'active'), 0) AS actual_spend_usd`,
    [campaignId, campaignId, campaignId, campaignId, campaignId],
  );

  const safe = summary || { conversions: 0, value_usd: 0, tracked_clicks: 0, tracking_links: 0, actual_spend_usd: 0 };
  return json({
    summary: {
      ...safe,
      conversion_rate: safe.tracked_clicks > 0 ? safe.conversions / safe.tracked_clicks : 0,
      return_on_spend: safe.actual_spend_usd > 0 ? safe.value_usd / safe.actual_spend_usd : null,
      cost_per_outcome: safe.actual_spend_usd > 0 && safe.conversions > 0 ? safe.actual_spend_usd / safe.conversions : null,
    },
  });
}
