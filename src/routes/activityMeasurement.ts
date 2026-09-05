import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

const PLATFORMS = new Set(['x', 'telegram', 'youtube', 'article', 'website', 'other']);
const EVIDENCE_STATES = new Set(['accepted', 'rejected']);
const METRIC_KEY = /^[a-z][a-z0-9_]{1,63}$/;

type AssignmentKind = 'creator' | 'community' | null;
type ManualProvenance = 'founder_manual' | 'creator_manual' | 'partner_manual';

type ActivityAccess = {
  activityId: string;
  campaignId: string;
  organizationId: string;
  assignmentKind: AssignmentKind;
  creatorOwnerUserId: string | null;
  managerOwnerUserId: string | null;
  projectRead: boolean;
  projectWrite: boolean;
  contributorWrite: boolean;
};

type DeliverableRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  activity_id: string;
  platform: string;
  content_url: string;
  published_at: string | null;
  evidence_state: string;
  submitted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type MetricRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  activity_id: string;
  deliverable_id: string;
  metric_key: string;
  metric_value: number;
  provenance: string;
  observed_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

async function accessForActivity(db: Db, userId: string, activityId: string): Promise<ActivityAccess> {
  await ensureAttributionSchema(db);
  const row = await db.first<{
    activity_id: string;
    campaign_id: string;
    organization_id: string;
    project_status: string;
    project_verification_status: string;
    assignment_kind: AssignmentKind;
    creator_owner_user_id: string | null;
    manager_owner_user_id: string | null;
  }>(
    `SELECT a.id AS activity_id,
            a.campaign_id,
            c.organization_id,
            o.status AS project_status,
            o.verification_status AS project_verification_status,
            la.assignment_kind,
            cp.owner_user_id AS creator_owner_user_id,
            mp.owner_user_id AS manager_owner_user_id
       FROM campaign_activities a
       JOIN campaigns c ON c.id = a.campaign_id
       JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = a.id
       LEFT JOIN profiles cp ON cp.id = la.creator_profile_id
       LEFT JOIN partner_managers pm ON pm.id = la.partner_manager_id
       LEFT JOIN profiles mp ON mp.id = pm.profile_id
      WHERE a.id = ?`,
    [activityId],
  );
  if (!row) throw new HttpError(404, 'Activity not found', 'activity_not_found');
  if (row.project_status !== 'active' || row.project_verification_status !== 'verified_x') {
    throw new HttpError(409, 'This Project must be active and X-verified before recording campaign measurement evidence', 'project_verification_required');
  }

  const membership = await organizationMembership(db, userId, row.organization_id);
  const projectRead = Boolean(membership);
  const projectWrite = Boolean(membership && ['owner', 'admin', 'marketing_manager'].includes(membership.role));
  const contributorWrite = row.assignment_kind === 'creator'
    ? row.creator_owner_user_id === userId
    : row.assignment_kind === 'community'
      ? row.manager_owner_user_id === userId
      : false;

  if (!projectRead && !contributorWrite) throw new HttpError(403, 'Activity measurement access denied', 'forbidden');

  return {
    activityId: row.activity_id,
    campaignId: row.campaign_id,
    organizationId: row.organization_id,
    assignmentKind: row.assignment_kind,
    creatorOwnerUserId: row.creator_owner_user_id,
    managerOwnerUserId: row.manager_owner_user_id,
    projectRead,
    projectWrite,
    contributorWrite,
  };
}

function manualProvenance(access: ActivityAccess): ManualProvenance {
  if (access.projectWrite) return 'founder_manual';
  return access.assignmentKind === 'community' ? 'partner_manual' : 'creator_manual';
}

function normalizedHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new HttpError(400, 'Enter a valid published content URL', 'invalid_content_url');
  }
}

function normalizeTimestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Choose a valid publication time', 'invalid_published_at');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'Choose a valid publication time', 'invalid_published_at');
  return parsed.toISOString();
}

async function campaignReadAccess(db: Db, userId: string, campaignId: string): Promise<string> {
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ organization_id: string; project_status: string; project_verification_status: string }>(
    `SELECT c.organization_id,
            o.status AS project_status,
            o.verification_status AS project_verification_status
       FROM campaigns c
       JOIN organizations o ON o.id = c.organization_id
      WHERE c.id = ?`,
    [campaignId],
  );
  if (!campaign) throw new HttpError(404, 'Campaign not found', 'campaign_not_found');
  const membership = await organizationMembership(db, userId, campaign.organization_id);
  if (!membership) throw new HttpError(403, 'Campaign measurement access denied', 'forbidden');
  if (campaign.project_status !== 'active' || campaign.project_verification_status !== 'verified_x') {
    throw new HttpError(409, 'This Project must be active and X-verified before reading campaign measurement evidence', 'project_verification_required');
  }
  return campaign.organization_id;
}

export async function listActivityMeasurements(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const activityId = url.searchParams.get('activityId')?.trim() || null;
  const campaignId = url.searchParams.get('campaignId')?.trim() || null;
  if (!activityId && !campaignId) throw new HttpError(400, 'campaignId or activityId is required', 'measurement_scope_required');

  const db = new Db(requireDb(env));
  if (activityId) {
    await accessForActivity(db, auth.user.id, activityId);
  } else if (campaignId) {
    await campaignReadAccess(db, auth.user.id, campaignId);
  }

  const whereColumn = activityId ? 'activity_id' : 'campaign_id';
  const scope = activityId || campaignId as string;
  const deliverables = await db.all<DeliverableRow>(
    `SELECT id, organization_id, campaign_id, activity_id, platform, content_url, published_at, evidence_state,
            submitted_by_user_id, created_at, updated_at
       FROM campaign_activity_deliverables
      WHERE ${whereColumn} = ?
      ORDER BY created_at DESC`,
    [scope],
  );
  const metrics = await db.all<MetricRow>(
    `SELECT id, organization_id, campaign_id, activity_id, deliverable_id, metric_key, metric_value, provenance,
            observed_at, created_by_user_id, created_at, updated_at
       FROM campaign_activity_metrics
      WHERE ${whereColumn} = ?
      ORDER BY updated_at DESC`,
    [scope],
  );

  let firstParty: null | {
    clicks: number;
    identifiedClicks: number;
    estimatedUniqueClicks: number | null;
    repeatClicks: number | null;
    outcomes: number;
    attributedValueUsd: number;
  } = null;
  if (activityId) {
    const clickSummary = await db.first<{ clicks: number; identified_clicks: number; estimated_unique_clicks: number }>(
      `SELECT COUNT(click.id) AS clicks,
              COUNT(click.visitor_id_hash) AS identified_clicks,
              COUNT(DISTINCT click.visitor_id_hash) AS estimated_unique_clicks
         FROM tracked_links t
         LEFT JOIN tracked_link_clicks click ON click.tracked_link_id = t.id
        WHERE t.activity_id = ?`,
      [activityId],
    );
    const outcomeSummary = await db.first<{ outcomes: number; attributed_value_usd: number }>(
      `SELECT COUNT(id) AS outcomes,
              COALESCE(SUM(value_usd), 0) AS attributed_value_usd
         FROM conversion_events
        WHERE activity_id = ?`,
      [activityId],
    );
    const clicks = Number(clickSummary?.clicks || 0);
    const identifiedClicks = Number(clickSummary?.identified_clicks || 0);
    const estimatedUniqueClicks = identifiedClicks > 0 ? Number(clickSummary?.estimated_unique_clicks || 0) : null;
    firstParty = {
      clicks,
      identifiedClicks,
      estimatedUniqueClicks,
      repeatClicks: estimatedUniqueClicks === null ? null : Math.max(0, identifiedClicks - estimatedUniqueClicks),
      outcomes: Number(outcomeSummary?.outcomes || 0),
      attributedValueUsd: Number(outcomeSummary?.attributed_value_usd || 0),
    };
  }

  return json({ deliverables, metrics, firstParty });
}

export async function createActivityDeliverable(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ activityId?: string; platform?: string; contentUrl?: string; publishedAt?: string | null }>(request);
  if (!body.activityId) throw new HttpError(400, 'activityId is required', 'activity_required');
  const platform = body.platform?.trim().toLowerCase() || '';
  if (!PLATFORMS.has(platform)) throw new HttpError(400, 'Choose a supported content platform', 'invalid_platform');
  if (!body.contentUrl?.trim()) throw new HttpError(400, 'Published content URL is required', 'content_url_required');

  const db = new Db(requireDb(env));
  const access = await accessForActivity(db, auth.user.id, body.activityId);
  if (!access.projectWrite && !access.contributorWrite) throw new HttpError(403, 'You cannot submit evidence for this activity', 'forbidden');

  const contentUrl = normalizedHttpUrl(body.contentUrl);
  const publishedAt = normalizeTimestamp(body.publishedAt);
  const deliverableId = id('del');
  const timestamp = now();
  try {
    await db.run(
      `INSERT INTO campaign_activity_deliverables
        (id, organization_id, campaign_id, activity_id, platform, content_url, published_at, evidence_state, submitted_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
      [deliverableId, access.organizationId, access.campaignId, access.activityId, platform, contentUrl, publishedAt, auth.user.id, timestamp, timestamp],
    );
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) {
      throw new HttpError(409, 'This published content is already attached to the activity', 'deliverable_exists');
    }
    throw error;
  }
  return json({ id: deliverableId, evidenceState: 'submitted' }, { status: 201 });
}

export async function reviewActivityDeliverable(request: Request, env: Env, deliverableId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ evidenceState?: string }>(request);
  const evidenceState = body.evidenceState?.trim().toLowerCase() || '';
  if (!EVIDENCE_STATES.has(evidenceState)) throw new HttpError(400, 'Choose accepted or rejected', 'invalid_evidence_state');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const deliverable = await db.first<{ activity_id: string }>('SELECT activity_id FROM campaign_activity_deliverables WHERE id = ?', [deliverableId]);
  if (!deliverable) throw new HttpError(404, 'Published deliverable not found', 'deliverable_not_found');
  const access = await accessForActivity(db, auth.user.id, deliverable.activity_id);
  if (!access.projectWrite) throw new HttpError(403, 'Only the Project team can review submitted deliverables', 'forbidden');

  const timestamp = now();
  await db.run('UPDATE campaign_activity_deliverables SET evidence_state = ?, updated_at = ? WHERE id = ?', [evidenceState, timestamp, deliverableId]);
  return json({ ok: true, id: deliverableId, evidenceState, updatedAt: timestamp });
}

export async function saveActivityMetrics(request: Request, env: Env, deliverableId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ metrics?: Record<string, number>; observedAt?: string | null }>(request);
  const entries = Object.entries(body.metrics || {});
  if (!entries.length || entries.length > 30) throw new HttpError(400, 'Provide between 1 and 30 performance metrics', 'invalid_metrics');

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const deliverable = await db.first<DeliverableRow>(
    `SELECT id, organization_id, campaign_id, activity_id, platform, content_url, published_at, evidence_state,
            submitted_by_user_id, created_at, updated_at
       FROM campaign_activity_deliverables
      WHERE id = ?`,
    [deliverableId],
  );
  if (!deliverable) throw new HttpError(404, 'Published deliverable not found', 'deliverable_not_found');
  const access = await accessForActivity(db, auth.user.id, deliverable.activity_id);
  if (!access.projectWrite && !access.contributorWrite) throw new HttpError(403, 'You cannot record performance for this activity', 'forbidden');

  const observedAt = normalizeTimestamp(body.observedAt) || now();
  const provenance = manualProvenance(access);
  const timestamp = now();
  const statements = entries.map(([rawKey, rawValue]) => {
    const metricKey = rawKey.trim().toLowerCase();
    const metricValue = Number(rawValue);
    if (!METRIC_KEY.test(metricKey)) throw new HttpError(400, 'Performance metric keys must be simple lowercase identifiers', 'invalid_metric_key');
    if (!Number.isFinite(metricValue) || metricValue < 0) throw new HttpError(400, 'Performance metrics must be zero or greater', 'invalid_metric_value');
    return db.statement(
      `INSERT INTO campaign_activity_metrics
        (id, organization_id, campaign_id, activity_id, deliverable_id, metric_key, metric_value, provenance, observed_at, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(deliverable_id, metric_key, provenance) DO UPDATE SET
         metric_value = excluded.metric_value,
         observed_at = excluded.observed_at,
         created_by_user_id = excluded.created_by_user_id,
         updated_at = excluded.updated_at`,
      [id('met'), deliverable.organization_id, deliverable.campaign_id, deliverable.activity_id, deliverable.id, metricKey, metricValue, provenance, observedAt, auth.user.id, timestamp, timestamp],
    );
  });
  await db.batch(statements);
  return json({ ok: true, deliverableId, provenance, metricCount: statements.length, observedAt });
}
