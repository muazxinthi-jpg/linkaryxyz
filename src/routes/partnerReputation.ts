import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
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

type CommunityProofSummary = {
  tracked_campaigns: number;
  evidence_communities: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
};

type CommunityProofAsset = {
  asset_id: string;
  community_name: string;
  verification_status: string;
  tracked_campaigns: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
};

type CommunityProofRecord = {
  activity_id: string;
  activity_title: string;
  activity_status: string;
  asset_id: string;
  community_name: string;
  community_verification_status: string;
  campaign_id: string;
  campaign_name: string;
  organization_id: string;
  project_name: string;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  updated_at: string;
};

function normaliseCommunityProofSummary(row: Partial<CommunityProofSummary> | null | undefined): CommunityProofSummary {
  return {
    tracked_campaigns: Number(row?.tracked_campaigns || 0),
    evidence_communities: Number(row?.evidence_communities || 0),
    tracked_clicks: Number(row?.tracked_clicks || 0),
    verified_outcomes: Number(row?.verified_outcomes || 0),
    attributed_value_usd: Number(row?.attributed_value_usd || 0),
  };
}

async function exactCommunityCampaignProof(db: Db, managerId: string, assetId?: string | null) {
  await ensureAttributionSchema(db);
  const filter = assetId ? 'AND pa.id = ?' : '';
  const params = assetId ? [managerId, assetId] : [managerId];

  const summary = await db.first<CommunityProofSummary>(
    `SELECT
        COUNT(DISTINCT CASE
          WHEN EXISTS (SELECT 1 FROM tracked_links tl WHERE tl.activity_id = la.activity_id)
            OR EXISTS (SELECT 1 FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))
          THEN c.id END) AS tracked_campaigns,
        COUNT(DISTINCT CASE
          WHEN EXISTS (SELECT 1 FROM tracked_links tl WHERE tl.activity_id = la.activity_id)
            OR EXISTS (SELECT 1 FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))
          THEN pa.id END) AS evidence_communities,
        COALESCE(SUM((SELECT COUNT(*) FROM tracked_links tl JOIN tracked_link_clicks cl ON cl.tracked_link_id = tl.id WHERE tl.activity_id = la.activity_id)), 0) AS tracked_clicks,
        COALESCE(SUM((SELECT COUNT(*) FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))), 0) AS verified_outcomes,
        COALESCE(SUM((SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0) FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))), 0) AS attributed_value_usd
       FROM campaign_activity_linkary_assignments la
       JOIN campaign_activities a ON a.id = la.activity_id
       JOIN campaigns c ON c.id = a.campaign_id
       JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
      WHERE la.assignment_kind = 'community'
        AND la.partner_manager_id = ?
        AND pa.asset_type = 'telegram_community'
        ${filter}`,
    params,
  );

  const communities = await db.all<CommunityProofAsset>(
    `SELECT pa.id AS asset_id,
            pa.name AS community_name,
            pa.verification_status,
            COUNT(DISTINCT CASE
              WHEN EXISTS (SELECT 1 FROM tracked_links tl WHERE tl.activity_id = la.activity_id)
                OR EXISTS (SELECT 1 FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))
              THEN c.id END) AS tracked_campaigns,
            COALESCE(SUM((SELECT COUNT(*) FROM tracked_links tl JOIN tracked_link_clicks cl ON cl.tracked_link_id = tl.id WHERE tl.activity_id = la.activity_id)), 0) AS tracked_clicks,
            COALESCE(SUM((SELECT COUNT(*) FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))), 0) AS verified_outcomes,
            COALESCE(SUM((SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0) FROM conversion_events ce WHERE ce.activity_id = la.activity_id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))), 0) AS attributed_value_usd
       FROM partner_manager_assets pa
       LEFT JOIN campaign_activity_linkary_assignments la ON la.partner_asset_id = pa.id AND la.assignment_kind = 'community'
       LEFT JOIN campaign_activities a ON a.id = la.activity_id
       LEFT JOIN campaigns c ON c.id = a.campaign_id
      WHERE pa.manager_id = ?
        AND pa.asset_type = 'telegram_community'
        ${assetId ? 'AND pa.id = ?' : ''}
      GROUP BY pa.id
      HAVING tracked_campaigns > 0 OR tracked_clicks > 0 OR verified_outcomes > 0 OR attributed_value_usd > 0
      ORDER BY attributed_value_usd DESC, verified_outcomes DESC, tracked_clicks DESC, tracked_campaigns DESC`,
    params,
  );

  const records = await db.all<CommunityProofRecord>(
    `SELECT a.id AS activity_id,
            a.title AS activity_title,
            a.status AS activity_status,
            pa.id AS asset_id,
            pa.name AS community_name,
            pa.verification_status AS community_verification_status,
            c.id AS campaign_id,
            c.name AS campaign_name,
            c.organization_id,
            o.name AS project_name,
            (SELECT COUNT(*) FROM tracked_links tl JOIN tracked_link_clicks cl ON cl.tracked_link_id = tl.id WHERE tl.activity_id = a.id) AS tracked_clicks,
            (SELECT COUNT(*) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified')) AS verified_outcomes,
            (SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified')) AS attributed_value_usd,
            a.updated_at
       FROM campaign_activity_linkary_assignments la
       JOIN campaign_activities a ON a.id = la.activity_id
       JOIN campaigns c ON c.id = a.campaign_id
       JOIN organizations o ON o.id = c.organization_id
       JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
      WHERE la.assignment_kind = 'community'
        AND la.partner_manager_id = ?
        AND pa.asset_type = 'telegram_community'
        ${filter}
        AND (
          EXISTS (SELECT 1 FROM tracked_links tl WHERE tl.activity_id = a.id)
          OR EXISTS (SELECT 1 FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))
        )
      ORDER BY a.updated_at DESC
      LIMIT 50`,
    params,
  );

  return {
    summary: normaliseCommunityProofSummary(summary),
    communities: communities.map((item) => ({
      ...item,
      tracked_campaigns: Number(item.tracked_campaigns || 0),
      tracked_clicks: Number(item.tracked_clicks || 0),
      verified_outcomes: Number(item.verified_outcomes || 0),
      attributed_value_usd: Number(item.attributed_value_usd || 0),
    })),
    records: records.map((item) => ({
      ...item,
      tracked_clicks: Number(item.tracked_clicks || 0),
      verified_outcomes: Number(item.verified_outcomes || 0),
      attributed_value_usd: Number(item.attributed_value_usd || 0),
    })),
    evidence_note: 'Community Campaign Proof is derived only from exact Linkary Community activity assignments. Tracked clicks come from Linkary links. Public outcomes/value exclude manual conversion records. Community listing, verification, shortlisting and inquiry acceptance do not count as campaign performance.',
  };
}

export async function partnerManagerReputation(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const url = new URL(request.url);
  const managerIdParam = url.searchParams.get('managerId');
  const assetId = url.searchParams.get('assetId');
  if (!managerIdParam && !assetId) throw new HttpError(400, 'Manager or Community is required', 'manager_required');
  const db = new Db(requireDb(env));

  const resolved = assetId
    ? await db.first<{ id: string; visibility: string; asset_id: string; asset_type: string }>(
        `SELECT m.id, m.visibility, a.id AS asset_id, a.asset_type
           FROM partner_manager_assets a
           JOIN partner_managers m ON m.id = a.manager_id
          WHERE a.id = ?`,
        [assetId],
      )
    : await db.first<{ id: string; visibility: string; asset_id: string | null; asset_type: string | null }>(
        'SELECT id, visibility, NULL AS asset_id, NULL AS asset_type FROM partner_managers WHERE id = ?',
        [managerIdParam],
      );

  if (!resolved || resolved.visibility !== 'public') throw new HttpError(404, 'Manager listing not found', 'manager_not_found');
  if (assetId && resolved.asset_type !== 'telegram_community') throw new HttpError(400, 'Community Campaign Proof applies to Telegram Communities', 'invalid_asset_type');
  const managerId = resolved.id;

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
  const communityCampaignProof = await exactCommunityCampaignProof(db, managerId, assetId);

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
    community_campaign_proof: communityCampaignProof,
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
