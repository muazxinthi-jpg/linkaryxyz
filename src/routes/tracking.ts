import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { hmacSha256, randomToken } from '../security/crypto';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';
import { getLinkaryUrls } from '../urls';
import { buildTrackedDestination, type TrackingUtmContext, type TrackingUtmResult } from '../trackingUtm';
import type { ExecutionContextLike } from '../platform';
import {
  createActivityDeliverable,
  listActivityMeasurements,
  listMyAssignedActivities,
  reviewActivityDeliverable,
  saveActivityMetrics,
} from './activityMeasurement';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type TrackingContextRow = {
  campaign_name: string | null;
  activity_id: string | null;
  activity_title: string | null;
  activity_type: string | null;
  assignment_kind: 'creator' | 'community' | null;
  partner_handle: string | null;
  partner_name: string | null;
  creator_profile_id: string | null;
};

type TrackingSnapshotRow = {
  effective_destination_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  linkary_activity: string | null;
  linkary_creator: string | null;
  tracking_context_version: number | null;
};

type TrackedPartnerSnapshotInput = {
  partner_entity_id: string | null;
  creator_profile_id: string | null;
  partner_manager_id: string | null;
  partner_asset_id: string | null;
  partner_manager_name: string | null;
  partner_verification_status: string | null;
};

const TRACKING_CONTEXT_COLUMNS = [
  'effective_destination_url',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'linkary_activity',
  'linkary_creator',
  'tracking_context_version',
] as const;

function utmContext(row: TrackingContextRow, utmTerm?: string | null): TrackingUtmContext {
  return {
    campaignName: row.campaign_name || 'campaign',
    activityId: row.activity_id || 'activity',
    activityTitle: row.activity_title || 'activity',
    activityType: row.activity_type || 'other',
    assignmentKind: row.assignment_kind,
    partnerHandle: row.partner_handle,
    partnerName: row.partner_name,
    creatorProfileId: row.creator_profile_id,
    utmTerm,
  };
}

async function hasImmutableTrackingContext(db: Db): Promise<boolean> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(tracked_links)');
  const names = new Set(columns.map((column) => column.name));
  return TRACKING_CONTEXT_COLUMNS.every((column) => names.has(column));
}

function storedTrackingResult(row: TrackingContextRow & TrackingSnapshotRow & { destination_url: string }): TrackingUtmResult {
  if (Number(row.tracking_context_version || 0) >= 1 && row.effective_destination_url) {
    return {
      effectiveDestinationUrl: row.effective_destination_url,
      utm: {
        source: row.utm_source || '',
        medium: row.utm_medium || '',
        campaign: row.utm_campaign || '',
        content: row.utm_content || '',
        term: row.utm_term,
        linkaryActivity: row.linkary_activity || row.activity_id || 'activity',
        linkaryCreator: row.linkary_creator,
      },
    };
  }
  return buildTrackedDestination(row.destination_url, utmContext(row));
}

function isHttpDestination(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function logTrackedClick(request: Request, env: Env, db: Db, trackedLinkId: string): Promise<void> {
  const visitor = request.headers.get('cf-connecting-ip');
  const visitorHash = visitor && env.TRACKING_HASH_SALT ? await hmacSha256(env.TRACKING_HASH_SALT, visitor) : null;
  const referer = request.headers.get('referer');
  let referrerHost: string | null = null;
  try { if (referer) referrerHost = new URL(referer).hostname; } catch {}

  await db.run(
    'INSERT INTO tracked_link_clicks (id, tracked_link_id, visitor_id_hash, referrer_host, occurred_at) VALUES (?, ?, ?, ?, ?)',
    [id('tlc'), trackedLinkId, visitorHash, referrerHost, now()],
  );
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
  const body = await readJson<{ activityId?: unknown; utmTerm?: unknown }>(request);
  const activityId = typeof body.activityId === 'string' ? body.activityId.trim() : '';
  if (!activityId) throw new HttpError(400, 'activityId is required', 'activity_required');
  if (body.utmTerm !== undefined && body.utmTerm !== null && typeof body.utmTerm !== 'string') {
    throw new HttpError(400, 'utmTerm must be text', 'invalid_utm_term');
  }
  const utmTerm = typeof body.utmTerm === 'string' ? body.utmTerm.trim() : null;
  if (utmTerm && utmTerm.length > 120) throw new HttpError(400, 'utmTerm is too long', 'invalid_utm_term');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const activity = await db.first<{
    campaign_id: string;
    organization_id: string;
    destination_url: string | null;
  } & TrackingContextRow & TrackedPartnerSnapshotInput>(
    `SELECT a.id AS activity_id,
            a.campaign_id,
            c.organization_id,
            a.destination_url,
            c.name AS campaign_name,
            a.title AS activity_title,
            a.activity_type,
            cla.assignment_kind,
            cla.entity_id AS partner_entity_id,
            cla.creator_profile_id,
            cla.partner_manager_id,
            cla.partner_asset_id,
            COALESCE(cpi.current_handle, pa.handle, pne.primary_handle) AS partner_handle,
            COALESCE(cp.display_name, pa.name, pne.display_name) AS partner_name,
            pm.display_name AS partner_manager_name,
            CASE
              WHEN cla.assignment_kind = 'creator' THEN CASE WHEN cp.verification_status = 'verified_x' THEN 'verified' ELSE 'unverified' END
              WHEN cla.assignment_kind = 'community' THEN COALESCE(pa.verification_status, 'unverified')
              ELSE NULL
            END AS partner_verification_status
       FROM campaign_activities a
       JOIN campaigns c ON c.id = a.campaign_id
       LEFT JOIN campaign_activity_linkary_assignments cla ON cla.activity_id = a.id
       LEFT JOIN project_network_entities pne ON pne.id = cla.entity_id
       LEFT JOIN profiles cp ON cp.id = cla.creator_profile_id
       LEFT JOIN platform_identities cpi ON cpi.id = cp.primary_platform_identity_id
       LEFT JOIN partner_managers pm ON pm.id = cla.partner_manager_id
       LEFT JOIN partner_manager_assets pa ON pa.id = cla.partner_asset_id
      WHERE a.id = ?`,
    [activityId],
  );
  if (!activity || !activity.destination_url) throw new HttpError(409, 'An activity destination URL is required', 'destination_required');
  await requireOperationalProjectAccess(db, auth.user.id, activity.organization_id, true);

  const trackedDestination = buildTrackedDestination(activity.destination_url, utmContext(activity, utmTerm));
  if (!trackedDestination.utm || !isHttpDestination(trackedDestination.effectiveDestinationUrl)) {
    throw new HttpError(409, 'Use a valid http(s) destination URL before creating a tracking link', 'invalid_destination');
  }

  const immutableContextReady = await hasImmutableTrackingContext(db);
  const code = randomToken(8);
  const linkId = id('tl');
  const timestamp = now();
  const linkInsert = immutableContextReady
    ? db.statement(
      `INSERT INTO tracked_links
        (id, organization_id, campaign_id, activity_id, code, destination_url,
         effective_destination_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         linkary_activity, linkary_creator, tracking_context_version,
         status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?, ?)`,
      [
        linkId,
        activity.organization_id,
        activity.campaign_id,
        activityId,
        code,
        activity.destination_url,
        trackedDestination.effectiveDestinationUrl,
        trackedDestination.utm.source,
        trackedDestination.utm.medium,
        trackedDestination.utm.campaign,
        trackedDestination.utm.content,
        trackedDestination.utm.term,
        trackedDestination.utm.linkaryActivity,
        trackedDestination.utm.linkaryCreator,
        auth.user.id,
        timestamp,
        timestamp,
      ],
    )
    : db.statement(
      "INSERT INTO tracked_links (id, organization_id, campaign_id, activity_id, code, destination_url, status, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
      [linkId, activity.organization_id, activity.campaign_id, activityId, code, activity.destination_url, auth.user.id, timestamp, timestamp],
    );

  await db.batch([
    linkInsert,
    db.statement(
      `INSERT INTO tracked_link_partner_snapshots
        (tracked_link_id, activity_id, assignment_kind, partner_entity_id, creator_profile_id, partner_manager_id, partner_asset_id,
         partner_display_name, partner_handle, partner_manager_name, partner_verification_status, snapshot_source, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'link_creation', ?)`,
      [
        linkId,
        activityId,
        activity.assignment_kind,
        activity.partner_entity_id,
        activity.creator_profile_id,
        activity.partner_manager_id,
        activity.partner_asset_id,
        activity.partner_name,
        activity.partner_handle,
        activity.partner_manager_name,
        activity.partner_verification_status,
        timestamp,
      ],
    ),
  ]);

  const trackingBase = getLinkaryUrls(request, env).tracking;
  return json({
    id: linkId,
    code,
    url: `${trackingBase}/r/${encodeURIComponent(code)}`,
    destinationUrl: activity.destination_url,
    effectiveDestinationUrl: trackedDestination.effectiveDestinationUrl,
    utm: trackedDestination.utm,
    immutableUtmContext: immutableContextReady,
    partnerSnapshot: {
      source: 'link_creation',
      capturedAt: timestamp,
      kind: activity.assignment_kind,
      entityId: activity.partner_entity_id,
      displayName: activity.partner_name,
      handle: activity.partner_handle,
    },
  }, { status: 201 });
}

export async function listTrackedLinks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('measurement') === '1' && url.searchParams.get('mine') === '1') {
    return listMyAssignedActivities(request, env);
  }
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

  const immutableContextReady = await hasImmutableTrackingContext(db);
  const immutableSelect = immutableContextReady
    ? `t.effective_destination_url,
       t.utm_source,
       t.utm_medium,
       t.utm_campaign,
       t.utm_content,
       t.utm_term,
       t.linkary_activity,
       t.linkary_creator,
       t.tracking_context_version,`
    : `NULL AS effective_destination_url,
       NULL AS utm_source,
       NULL AS utm_medium,
       NULL AS utm_campaign,
       NULL AS utm_content,
       NULL AS utm_term,
       NULL AS linkary_activity,
       NULL AS linkary_creator,
       NULL AS tracking_context_version,`;

  const links = await db.all(
    `SELECT
       t.id,
       t.code,
       t.activity_id,
       a.title AS activity_title,
       a.activity_type,
       t.destination_url,
       ${immutableSelect}
       t.status,
       t.created_at,
       t.updated_at,
       camp.name AS campaign_name,
       CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.assignment_kind ELSE cla.assignment_kind END AS assignment_kind,
       CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.creator_profile_id ELSE cla.creator_profile_id END AS creator_profile_id,
       CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.partner_handle ELSE pne.primary_handle END AS partner_handle,
       CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.partner_display_name ELSE pne.display_name END AS partner_name,
       snap.snapshot_source AS partner_snapshot_source,
       snap.captured_at AS partner_snapshot_captured_at,
       COUNT(click.id) AS clicks,
       COUNT(click.visitor_id_hash) AS identified_clicks,
       COUNT(DISTINCT click.visitor_id_hash) AS estimated_unique_clicks,
       MAX(click.occurred_at) AS last_click_at
     FROM tracked_links t
     LEFT JOIN campaigns camp ON camp.id = t.campaign_id
     LEFT JOIN campaign_activities a ON a.id = t.activity_id
     LEFT JOIN tracked_link_partner_snapshots snap ON snap.tracked_link_id = t.id
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
      const trackedDestination = storedTrackingResult(row);
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

export async function redirectTrackedLink(
  request: Request,
  env: Env,
  code: string,
  ctx?: ExecutionContextLike,
): Promise<Response> {
  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const immutableContextReady = await hasImmutableTrackingContext(db);
  const immutableSelect = immutableContextReady
    ? `t.effective_destination_url,
       t.utm_source,
       t.utm_medium,
       t.utm_campaign,
       t.utm_content,
       t.utm_term,
       t.linkary_activity,
       t.linkary_creator,
       t.tracking_context_version,`
    : `NULL AS effective_destination_url,
       NULL AS utm_source,
       NULL AS utm_medium,
       NULL AS utm_campaign,
       NULL AS utm_content,
       NULL AS utm_term,
       NULL AS linkary_activity,
       NULL AS linkary_creator,
       NULL AS tracking_context_version,`;

  const link = await db.first<{
    id: string;
    destination_url: string;
    status: string;
  } & TrackingContextRow & TrackingSnapshotRow>(
    `SELECT t.id,
            t.activity_id,
            t.destination_url,
            ${immutableSelect}
            t.status,
            camp.name AS campaign_name,
            a.title AS activity_title,
            a.activity_type,
            CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.assignment_kind ELSE cla.assignment_kind END AS assignment_kind,
            CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.creator_profile_id ELSE cla.creator_profile_id END AS creator_profile_id,
            CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.partner_handle ELSE pne.primary_handle END AS partner_handle,
            CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.partner_display_name ELSE pne.display_name END AS partner_name
       FROM tracked_links t
       LEFT JOIN campaigns camp ON camp.id = t.campaign_id
       LEFT JOIN campaign_activities a ON a.id = t.activity_id
       LEFT JOIN tracked_link_partner_snapshots snap ON snap.tracked_link_id = t.id
       LEFT JOIN campaign_activity_linkary_assignments cla ON cla.activity_id = t.activity_id
       LEFT JOIN project_network_entities pne ON pne.id = cla.entity_id
      WHERE t.code = ?`,
    [code],
  );
  if (!link || link.status !== 'active') throw new HttpError(404, 'Tracking link not found', 'tracking_not_found');

  const trackedDestination = storedTrackingResult(link);
  if (!isHttpDestination(trackedDestination.effectiveDestinationUrl)) {
    throw new HttpError(404, 'Tracking destination is unavailable', 'tracking_destination_unavailable');
  }

  const clickWrite = logTrackedClick(request, env, db, link.id).catch(() => undefined);
  if (ctx) ctx.waitUntil(clickWrite);
  else await clickWrite;

  return Response.redirect(trackedDestination.effectiveDestinationUrl, 302);
}
