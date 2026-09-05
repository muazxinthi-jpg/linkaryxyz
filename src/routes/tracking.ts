import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { hmacSha256, randomToken } from '../security/crypto';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';
import { getLinkaryUrls } from '../urls';
import { buildTrackedDestination, type TrackingUtmContext } from '../trackingUtm';
import {
  createActivityDeliverable,
  listActivityMeasurements,
  reviewActivityDeliverable,
  saveActivityMetrics,
} from './activityMeasurement';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type TrackingContextRow = {
  campaign_name: string | null;
  activity_title: string | null;
  activity_type: string | null;
  assignment_kind: 'creator' | 'community' | null;
  partner_handle: string | null;
  partner_name: string | null;
};

function utmContext(row: TrackingContextRow): TrackingUtmContext {
  return {
    campaignName: row.campaign_name || 'campaign',
    activityTitle: row.activity_title || 'activity',
    activityType: row.activity_type || 'other',
    assignmentKind: row.assignment_kind,
    partnerHandle: row.partner_handle,
    partnerName: row.partner_name,
  };
}

export async function createTrackedLink(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const operation = requestUrl.searchParams.get('operation');
  if (operation === 'deliverable') return createActivityDeliverable(request, env);
  if (operation === 'metrics') {
    const deliverableId = requestUrl.searchParams.get('deliverableId')?.trim();
    if (!deliverableId) throw new HttpError(400, 'deliverableId is required', 'deliverable_required');
    return saveActivityMetrics(request, env, deliverableId);
  }
  if (operation === 'review-deliverable') {
    const deliverableId = requestUrl.searchParams.get('deliverableId')?.trim();
    if (!deliverableId) throw new HttpError(400, 'deliverableId is required', 'deliverable_required');
    return reviewActivityDeliverable(request, env, deliverableId);
  }

  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ activityId?: string }>(request);
  if (!body.activityId) throw new HttpError(400, 'activityId is required', 'activity_required');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const activity = await db.first<{
    campaign_id: string;
    organization_id: string;
    destination_url: string | null;
  } & TrackingContextRow>(
    `SELECT a.campaign_id,
            c.organization_id,
            a.destination_url,
            c.name AS campaign_name,
            a.title AS activity_title,
            a.activity_type,
            cla.assignment_kind,
            pne.primary_handle AS partner_handle,
            pne.display_name AS partner_name
       FROM campaign_activities a
       JOIN campaigns c ON c.id = a.campaign_id
       LEFT JOIN campaign_activity_linkary_assignments cla ON cla.activity_id = a.id
       LEFT JOIN project_network_entities pne ON pne.id = cla.entity_id
      WHERE a.id = ?`,
    [body.activityId],
  );
  if (!activity || !activity.destination_url) throw new HttpError(409, 'An activity destination URL is required', 'destination_required');
  await requireOperationalProjectAccess(db, auth.user.id, activity.organization_id, true);

  const code = randomToken(8);
  const linkId = id('tl');
  const timestamp = now();
  await db.run(
    "INSERT INTO tracked_links (id, organization_id, campaign_id, activity_id, code, destination_url, status, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
    [linkId, activity.organization_id, activity.campaign_id, body.activityId, code, activity.destination_url, auth.user.id, timestamp, timestamp],
  );

  const trackingBase = getLinkaryUrls(request, env).tracking;
  const trackedDestination = buildTrackedDestination(activity.destination_url, utmContext(activity));
  return json({
    id: linkId,
    code,
    url: `${trackingBase}/r/${encodeURIComponent(code)}`,
    destinationUrl: activity.destination_url,
    effectiveDestinationUrl: trackedDestination.effectiveDestinationUrl,
    utm: trackedDestination.utm,
  }, { status: 201 });
}

export async function listTrackedLinks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('measurement') === '1') return listActivityMeasurements(request, env);

  const auth = await requireAuth(request, env);
  const campaignId = url.searchParams.get('campaignId');
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign || !(await organizationMembership(db, auth.user.id, campaign.organization_id))) {
    throw new HttpError(403, 'Tracking access denied', 'forbidden');
  }

  const status = url.searchParams.get('status')?.trim();
  if (status && !['active', 'paused', 'archived'].includes(status)) {
    throw new HttpError(400, 'Choose a valid tracking link status', 'invalid_tracking_status');
  }

  const params: unknown[] = [campaignId];
  let where = 't.campaign_id = ?';
  if (status) {
    where += ' AND t.status = ?';
    params.push(status);
  }

  const links = await db.all(
    `SELECT
       t.id,
       t.code,
       t.activity_id,
       a.title AS activity_title,
       a.activity_type,
       t.destination_url,
       t.status,
       t.created_at,
       t.updated_at,
       camp.name AS campaign_name,
       cla.assignment_kind,
       pne.primary_handle AS partner_handle,
       pne.display_name AS partner_name,
       COUNT(click.id) AS clicks,
       COUNT(click.visitor_id_hash) AS identified_clicks,
       COUNT(DISTINCT click.visitor_id_hash) AS estimated_unique_clicks,
       MAX(click.occurred_at) AS last_click_at
     FROM tracked_links t
     LEFT JOIN campaigns camp ON camp.id = t.campaign_id
     LEFT JOIN campaign_activities a ON a.id = t.activity_id
     LEFT JOIN campaign_activity_linkary_assignments cla ON cla.activity_id = t.activity_id
     LEFT JOIN project_network_entities pne ON pne.id = cla.entity_id
     LEFT JOIN tracked_link_clicks click ON click.tracked_link_id = t.id
     WHERE ${where}
     GROUP BY t.id
     ORDER BY t.created_at DESC`,
    params,
  );

  const trackingBase = getLinkaryUrls(request, env).tracking;
  return json({
    links: links.map((row: any) => {
      const trackedDestination = buildTrackedDestination(String(row.destination_url || ''), utmContext(row));
      const clicks = Number(row.clicks || 0);
      const identifiedClicks = Number(row.identified_clicks || 0);
      const estimatedUniqueClicks = identifiedClicks > 0 ? Number(row.estimated_unique_clicks || 0) : null;
      return {
        ...row,
        clicks,
        identified_clicks: identifiedClicks,
        estimated_unique_clicks: estimatedUniqueClicks,
        repeat_clicks: estimatedUniqueClicks === null ? null : Math.max(0, identifiedClicks - estimatedUniqueClicks),
        effective_destination_url: trackedDestination.effectiveDestinationUrl,
        utm: trackedDestination.utm,
        url: `${trackingBase}/r/${encodeURIComponent(row.code)}`,
      };
    }),
  });
}

export async function updateTrackedLinkStatus(request: Request, env: Env, linkId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: 'active' | 'paused' | 'archived' }>(request);
  if (!['active', 'paused', 'archived'].includes(body.status || '')) {
    throw new HttpError(400, 'Choose a valid tracking link status', 'invalid_tracking_status');
  }

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const link = await db.first<{ organization_id: string }>('SELECT organization_id FROM tracked_links WHERE id = ?', [linkId]);
  if (!link) throw new HttpError(404, 'Tracking link not found', 'tracking_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, link.organization_id, true);

  const timestamp = now();
  await db.run('UPDATE tracked_links SET status = ?, updated_at = ? WHERE id = ?', [body.status, timestamp, linkId]);
  return json({ ok: true, status: body.status, updatedAt: timestamp });
}

export async function redirectTrackedLink(request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const link = await db.first<{
    id: string;
    destination_url: string;
    status: string;
  } & TrackingContextRow>(
    `SELECT t.id,
            t.destination_url,
            t.status,
            camp.name AS campaign_name,
            a.title AS activity_title,
            a.activity_type,
            cla.assignment_kind,
            pne.primary_handle AS partner_handle,
            pne.display_name AS partner_name
       FROM tracked_links t
       LEFT JOIN campaigns camp ON camp.id = t.campaign_id
       LEFT JOIN campaign_activities a ON a.id = t.activity_id
       LEFT JOIN campaign_activity_linkary_assignments cla ON cla.activity_id = t.activity_id
       LEFT JOIN project_network_entities pne ON pne.id = cla.entity_id
      WHERE t.code = ?`,
    [code],
  );
  if (!link || link.status !== 'active') throw new HttpError(404, 'Tracking link not found', 'tracking_not_found');

  const visitor = request.headers.get('cf-connecting-ip');
  const visitorHash = visitor && env.TRACKING_HASH_SALT ? await hmacSha256(env.TRACKING_HASH_SALT, visitor) : null;
  const referer = request.headers.get('referer');
  let referrerHost: string | null = null;
  try { if (referer) referrerHost = new URL(referer).hostname; } catch {}

  await db.run(
    'INSERT INTO tracked_link_clicks (id, tracked_link_id, visitor_id_hash, referrer_host, occurred_at) VALUES (?, ?, ?, ?, ?)',
    [id('tlc'), link.id, visitorHash, referrerHost, now()],
  );
  const trackedDestination = buildTrackedDestination(link.destination_url, utmContext(link));
  return Response.redirect(trackedDestination.effectiveDestinationUrl, 302);
}
