import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json } from '../http';
import { requireAuth } from '../auth/session';
import { organizationMembership } from './organizations';

type Provenance = 'creator_manual' | 'partner_manual' | 'founder_manual' | 'linkary_first_party' | 'telegram_verified' | 'provider_verified' | 'estimated';
type PartnerAttributionSource = 'link_creation' | 'legacy_backfill' | 'current_fallback';

type CampaignRow = {
  id: string;
  name: string;
  source_type: string;
  execution_mode: string;
  status: string;
  budget_usd: number | null;
  actual_spend_usd: number;
  clicks: number;
  identified_clicks: number;
  estimated_unique_clicks: number;
  outcomes: number;
  attributed_value_usd: number;
};

type ActivityRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  title: string;
  activity_type: string;
  status: string;
  planned_cost_usd: number | null;
  actual_spend_usd: number;
  clicks: number;
  identified_clicks: number;
  estimated_unique_clicks: number;
  outcomes: number;
  attributed_value_usd: number;
  assignment_kind: 'creator' | 'community' | null;
  partner_key: string | null;
  partner_display_name: string | null;
  partner_handle: string | null;
};

type PartnerAttributionRow = {
  tracked_link_id: string;
  activity_id: string | null;
  partner_kind: 'creator' | 'community' | null;
  partner_key: string | null;
  partner_display_name: string | null;
  partner_handle: string | null;
  attribution_source: PartnerAttributionSource;
  clicks: number;
  outcomes: number;
  attributed_value_usd: number;
};

type DeliverableRow = {
  id: string;
  campaign_id: string;
  activity_id: string;
  platform: string;
  evidence_state: 'submitted' | 'accepted' | 'rejected';
};

type MetricRow = {
  deliverable_id: string;
  campaign_id: string;
  activity_id: string;
  metric_key: string;
  metric_value: number;
  provenance: Provenance;
};

type OutcomeEvidenceRow = { source: string; records: number };
type TrendRow = { day: string; clicks?: number; outcomes?: number; value?: number; spend?: number };

type SocialStats = { views: number; engagements: number; reportedJoins: number; deliverables: number };
type EvidenceMix = { manual: number; tracked: number; verified: number; estimated: number };
type PerformanceInput = SocialStats & {
  spend: number;
  clicks: number;
  uniqueClicks: number | null;
  outcomes: number;
  value: number;
};

type PartnerGroup = {
  key: string;
  label: string;
  kind: string;
  handle: string | null;
  activityIds: Set<string>;
  trackingLinks: number;
  clicks: number;
  outcomes: number;
  value: number;
  linkCreationLinks: number;
  legacyBackfillLinks: number;
  currentFallbackLinks: number;
};

const PROVENANCE_PRIORITY: Provenance[] = [
  'provider_verified',
  'telegram_verified',
  'linkary_first_party',
  'founder_manual',
  'partner_manual',
  'creator_manual',
  'estimated',
];

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptySocial(): SocialStats {
  return { views: 0, engagements: 0, reportedJoins: 0, deliverables: 0 };
}

function preferredMetric(metrics: Map<string, MetricRow>, deliverableId: string, keys: string[]): number {
  for (const key of keys) {
    const metric = metrics.get(`${deliverableId}:${key}`);
    if (metric) return number(metric.metric_value);
  }
  return 0;
}

function performance(input: PerformanceInput) {
  const { views, engagements, reportedJoins, deliverables, spend, clicks, uniqueClicks, outcomes, value } = input;
  return {
    deliverables,
    views,
    engagements,
    reported_joins: reportedJoins,
    actual_spend_usd: spend,
    tracked_clicks: clicks,
    estimated_unique_clicks: uniqueClicks,
    outcomes,
    attributed_value_usd: value,
    engagement_rate: views > 0 ? engagements / views : null,
    ctr: views > 0 ? clicks / views : null,
    cpm: spend > 0 && views > 0 ? (spend / views) * 1000 : null,
    cpc: spend > 0 && clicks > 0 ? spend / clicks : null,
    cpa: spend > 0 && outcomes > 0 ? spend / outcomes : null,
    cost_per_reported_join: spend > 0 && reportedJoins > 0 ? spend / reportedJoins : null,
    conversion_rate: clicks > 0 ? outcomes / clicks : null,
    roas: spend > 0 ? value / spend : null,
    value_per_click: clicks > 0 ? value / clicks : null,
  };
}

function partnerPerformance(group: PartnerGroup) {
  return {
    key: group.key,
    label: group.label,
    kind: group.kind,
    handle: group.handle,
    activities: group.activityIds.size,
    tracking_links: group.trackingLinks,
    spend_scope: 'not_allocated' as const,
    attribution_scope: 'tracking_link_partner_provenance' as const,
    snapshot_coverage: {
      link_creation: group.linkCreationLinks,
      legacy_backfill: group.legacyBackfillLinks,
      current_fallback: group.currentFallbackLinks,
    },
    deliverables: 0,
    views: 0,
    engagements: 0,
    reported_joins: 0,
    actual_spend_usd: null,
    tracked_clicks: group.clicks,
    estimated_unique_clicks: null,
    outcomes: group.outcomes,
    attributed_value_usd: group.value,
    engagement_rate: null,
    ctr: null,
    cpm: null,
    cpc: null,
    cpa: null,
    cost_per_reported_join: null,
    conversion_rate: group.clicks > 0 ? group.outcomes / group.clicks : null,
    roas: null,
    value_per_click: group.clicks > 0 ? group.value / group.clicks : null,
  };
}

function evidenceBucket(provenance: Provenance | string): keyof EvidenceMix {
  if (provenance === 'provider_verified' || provenance === 'telegram_verified') return 'verified';
  if (provenance === 'linkary_first_party' || provenance === 'linkary_tracked') return 'tracked';
  if (provenance === 'estimated') return 'estimated';
  return 'manual';
}

function addSocial(target: Map<string, SocialStats>, key: string, value: SocialStats) {
  const current = target.get(key) || emptySocial();
  current.views += value.views;
  current.engagements += value.engagements;
  current.reportedJoins += value.reportedJoins;
  current.deliverables += value.deliverables;
  target.set(key, current);
}

function channelForActivity(activity: ActivityRow, deliverablePlatforms: Map<string, Set<string>>): string {
  const platforms = Array.from(deliverablePlatforms.get(activity.id) || []);
  if (platforms.length === 1) return platforms[0];
  if (activity.activity_type === 'community_placement') return 'community';
  if (activity.activity_type === 'creator_content') return 'creator_content';
  return activity.activity_type || 'other';
}

function trendDays(days: number): string[] {
  const result: string[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const value = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    result.push(value.toISOString().slice(0, 10));
  }
  return result;
}

export async function founderGrowthIntelligence(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const organizationId = new URL(request.url).searchParams.get('organizationId')?.trim();
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  const requestedDays = Number(new URL(request.url).searchParams.get('range') || 30);
  const rangeDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const since = `-${rangeDays - 1} days`;

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const membership = await organizationMembership(db, auth.user.id, organizationId);
  if (!membership) throw new HttpError(403, 'Growth Intelligence access denied', 'forbidden');

  const [campaigns, activities, deliverables, rawMetrics, outcomeEvidence, projectClicks, partnerAttribution, clickTrend, outcomeTrend, spendTrend] = await Promise.all([
    db.all<CampaignRow>(
      `SELECT c.id, c.name, COALESCE(c.source_type, 'external') AS source_type,
              COALESCE(c.execution_mode, 'tracked_elsewhere') AS execution_mode, c.status, c.budget_usd,
              COALESCE((SELECT SUM(cost.usd_equivalent) FROM campaign_cost_entries cost WHERE cost.campaign_id = c.id AND cost.status = 'active'), 0) AS actual_spend_usd,
              COALESCE((SELECT COUNT(click.id) FROM tracked_links t JOIN tracked_link_clicks click ON click.tracked_link_id = t.id WHERE t.campaign_id = c.id), 0) AS clicks,
              COALESCE((SELECT COUNT(click.visitor_id_hash) FROM tracked_links t JOIN tracked_link_clicks click ON click.tracked_link_id = t.id WHERE t.campaign_id = c.id), 0) AS identified_clicks,
              COALESCE((SELECT COUNT(DISTINCT click.visitor_id_hash) FROM tracked_links t JOIN tracked_link_clicks click ON click.tracked_link_id = t.id WHERE t.campaign_id = c.id), 0) AS estimated_unique_clicks,
              COALESCE((SELECT COUNT(e.id) FROM conversion_events e WHERE e.campaign_id = c.id), 0) AS outcomes,
              COALESCE((SELECT SUM(COALESCE(e.value_usd, 0)) FROM conversion_events e WHERE e.campaign_id = c.id), 0) AS attributed_value_usd
         FROM campaigns c
        WHERE c.organization_id = ?
        ORDER BY c.created_at DESC
        LIMIT 250`,
      [organizationId],
    ),
    db.all<ActivityRow>(
      `SELECT a.id, a.campaign_id, c.name AS campaign_name, a.title, a.activity_type, a.status, a.planned_cost_usd,
              COALESCE((SELECT SUM(cost.usd_equivalent) FROM campaign_cost_entries cost WHERE cost.activity_id = a.id AND cost.status = 'active'), 0) AS actual_spend_usd,
              COALESCE((SELECT COUNT(click.id) FROM tracked_links t JOIN tracked_link_clicks click ON click.tracked_link_id = t.id WHERE t.activity_id = a.id), 0) AS clicks,
              COALESCE((SELECT COUNT(click.visitor_id_hash) FROM tracked_links t JOIN tracked_link_clicks click ON click.tracked_link_id = t.id WHERE t.activity_id = a.id), 0) AS identified_clicks,
              COALESCE((SELECT COUNT(DISTINCT click.visitor_id_hash) FROM tracked_links t JOIN tracked_link_clicks click ON click.tracked_link_id = t.id WHERE t.activity_id = a.id), 0) AS estimated_unique_clicks,
              COALESCE((SELECT COUNT(e.id) FROM conversion_events e WHERE e.activity_id = a.id), 0) AS outcomes,
              COALESCE((SELECT SUM(COALESCE(e.value_usd, 0)) FROM conversion_events e WHERE e.activity_id = a.id), 0) AS attributed_value_usd,
              la.assignment_kind,
              CASE WHEN la.assignment_kind = 'creator' THEN la.creator_profile_id ELSE la.partner_asset_id END AS partner_key,
              COALESCE(cp.display_name, pa.name, ne.display_name) AS partner_display_name,
              COALESCE(cpi.current_handle, pa.handle, ne.primary_handle) AS partner_handle
         FROM campaign_activities a
         JOIN campaigns c ON c.id = a.campaign_id
         LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = a.id
         LEFT JOIN project_network_entities ne ON ne.id = la.entity_id
         LEFT JOIN profiles cp ON cp.id = la.creator_profile_id
         LEFT JOIN platform_identities cpi ON cpi.id = cp.primary_platform_identity_id
         LEFT JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
        WHERE c.organization_id = ?
        ORDER BY a.updated_at DESC
        LIMIT 1000`,
      [organizationId],
    ),
    db.all<DeliverableRow>(
      `SELECT d.id, d.campaign_id, d.activity_id, d.platform, d.evidence_state
         FROM campaign_activity_deliverables d
         JOIN campaigns c ON c.id = d.campaign_id
        WHERE c.organization_id = ? AND d.evidence_state != 'rejected'
        ORDER BY d.created_at DESC
        LIMIT 2500`,
      [organizationId],
    ),
    db.all<MetricRow>(
      `SELECT m.deliverable_id, m.campaign_id, m.activity_id, m.metric_key, m.metric_value, m.provenance
         FROM campaign_activity_metrics m
         JOIN campaign_activity_deliverables d ON d.id = m.deliverable_id
         JOIN campaigns c ON c.id = m.campaign_id
        WHERE c.organization_id = ? AND d.evidence_state != 'rejected'
        ORDER BY m.updated_at DESC
        LIMIT 10000`,
      [organizationId],
    ),
    db.all<OutcomeEvidenceRow>(
      `SELECT source, COUNT(*) AS records
         FROM conversion_events
        WHERE organization_id = ?
        GROUP BY source`,
      [organizationId],
    ),
    db.first<{ clicks: number; identified_clicks: number; estimated_unique_clicks: number }>(
      `SELECT COUNT(click.id) AS clicks,
              COUNT(click.visitor_id_hash) AS identified_clicks,
              COUNT(DISTINCT click.visitor_id_hash) AS estimated_unique_clicks
         FROM tracked_links t
         JOIN tracked_link_clicks click ON click.tracked_link_id = t.id
        WHERE t.organization_id = ?`,
      [organizationId],
    ),
    db.all<PartnerAttributionRow>(
      `SELECT
          t.id AS tracked_link_id,
          t.activity_id,
          CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.assignment_kind ELSE la.assignment_kind END AS partner_kind,
          CASE
            WHEN snap.tracked_link_id IS NOT NULL THEN CASE WHEN snap.assignment_kind = 'creator' THEN snap.creator_profile_id ELSE snap.partner_asset_id END
            ELSE CASE WHEN la.assignment_kind = 'creator' THEN la.creator_profile_id ELSE la.partner_asset_id END
          END AS partner_key,
          CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.partner_display_name ELSE COALESCE(cp.display_name, pa.name, ne.display_name) END AS partner_display_name,
          CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.partner_handle ELSE COALESCE(cpi.current_handle, pa.handle, ne.primary_handle) END AS partner_handle,
          CASE WHEN snap.tracked_link_id IS NOT NULL THEN snap.snapshot_source ELSE 'current_fallback' END AS attribution_source,
          COALESCE((SELECT COUNT(click.id) FROM tracked_link_clicks click WHERE click.tracked_link_id = t.id), 0) AS clicks,
          COALESCE((SELECT COUNT(e.id) FROM conversion_events e WHERE e.tracked_link_id = t.id), 0) AS outcomes,
          COALESCE((SELECT SUM(COALESCE(e.value_usd, 0)) FROM conversion_events e WHERE e.tracked_link_id = t.id), 0) AS attributed_value_usd
        FROM tracked_links t
        LEFT JOIN tracked_link_partner_snapshots snap ON snap.tracked_link_id = t.id
        LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = t.activity_id
        LEFT JOIN project_network_entities ne ON ne.id = la.entity_id
        LEFT JOIN profiles cp ON cp.id = la.creator_profile_id
        LEFT JOIN platform_identities cpi ON cpi.id = cp.primary_platform_identity_id
        LEFT JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
       WHERE t.organization_id = ?
       ORDER BY t.created_at DESC
       LIMIT 5000`,
      [organizationId],
    ),
    db.all<TrendRow>(`SELECT substr(click.occurred_at, 1, 10) AS day, COUNT(*) AS clicks FROM tracked_link_clicks click JOIN tracked_links t ON t.id = click.tracked_link_id WHERE t.organization_id = ? AND click.occurred_at >= date('now', ?) GROUP BY substr(click.occurred_at, 1, 10)`, [organizationId, since]),
    db.all<TrendRow>(`SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS outcomes, COALESCE(SUM(value_usd), 0) AS value FROM conversion_events WHERE organization_id = ? AND occurred_at >= date('now', ?) GROUP BY substr(occurred_at, 1, 10)`, [organizationId, since]),
    db.all<TrendRow>(`SELECT substr(incurred_at, 1, 10) AS day, COALESCE(SUM(usd_equivalent), 0) AS spend FROM campaign_cost_entries WHERE organization_id = ? AND status = 'active' AND incurred_at >= date('now', ?) GROUP BY substr(incurred_at, 1, 10)`, [organizationId, since]),
  ]);

  const preferred = new Map<string, MetricRow>();
  for (const metric of rawMetrics) {
    const key = `${metric.deliverable_id}:${metric.metric_key}`;
    const current = preferred.get(key);
    if (!current || PROVENANCE_PRIORITY.indexOf(metric.provenance) < PROVENANCE_PRIORITY.indexOf(current.provenance)) preferred.set(key, metric);
  }

  const socialByActivity = new Map<string, SocialStats>();
  const socialByCampaign = new Map<string, SocialStats>();
  const deliverablePlatforms = new Map<string, Set<string>>();
  const evidenceMix: EvidenceMix = { manual: 0, tracked: 0, verified: 0, estimated: 0 };

  for (const metric of preferred.values()) evidenceMix[evidenceBucket(metric.provenance)] += 1;
  for (const row of outcomeEvidence) evidenceMix[evidenceBucket(row.source)] += number(row.records);

  for (const deliverable of deliverables) {
    const platforms = deliverablePlatforms.get(deliverable.activity_id) || new Set<string>();
    platforms.add(deliverable.platform || 'other');
    deliverablePlatforms.set(deliverable.activity_id, platforms);

    const social: SocialStats = {
      deliverables: 1,
      views: preferredMetric(preferred, deliverable.id, ['impressions', 'views', 'pageviews']),
      engagements:
        preferredMetric(preferred, deliverable.id, ['engagements']) +
        preferredMetric(preferred, deliverable.id, ['likes']) +
        preferredMetric(preferred, deliverable.id, ['comments']) +
        preferredMetric(preferred, deliverable.id, ['reposts']) +
        preferredMetric(preferred, deliverable.id, ['quotes']) +
        preferredMetric(preferred, deliverable.id, ['bookmarks']) +
        preferredMetric(preferred, deliverable.id, ['reactions']) +
        preferredMetric(preferred, deliverable.id, ['forwards']),
      reportedJoins: preferredMetric(preferred, deliverable.id, ['reported_joins']),
    };
    addSocial(socialByActivity, deliverable.activity_id, social);
    addSocial(socialByCampaign, deliverable.campaign_id, social);
  }

  const activityResults = activities.map((activity) => {
    const social = socialByActivity.get(activity.id) || emptySocial();
    const identified = number(activity.identified_clicks);
    const unique = identified > 0 ? number(activity.estimated_unique_clicks) : null;
    return {
      id: activity.id,
      campaign_id: activity.campaign_id,
      campaign_name: activity.campaign_name,
      title: activity.title,
      activity_type: activity.activity_type,
      channel: channelForActivity(activity, deliverablePlatforms),
      status: activity.status,
      planned_cost_usd: activity.planned_cost_usd,
      partner_kind: activity.assignment_kind,
      partner_key: activity.partner_key,
      partner_display_name: activity.partner_display_name,
      partner_handle: activity.partner_handle,
      ...performance({ ...social, spend: number(activity.actual_spend_usd), clicks: number(activity.clicks), uniqueClicks: unique, outcomes: number(activity.outcomes), value: number(activity.attributed_value_usd) }),
    };
  });

  const campaignResults = campaigns.map((campaign) => {
    const social = socialByCampaign.get(campaign.id) || emptySocial();
    const identified = number(campaign.identified_clicks);
    const unique = identified > 0 ? number(campaign.estimated_unique_clicks) : null;
    return {
      id: campaign.id,
      name: campaign.name,
      source_type: campaign.source_type,
      execution_mode: campaign.execution_mode,
      status: campaign.status,
      budget_usd: campaign.budget_usd,
      ...performance({ ...social, spend: number(campaign.actual_spend_usd), clicks: number(campaign.clicks), uniqueClicks: unique, outcomes: number(campaign.outcomes), value: number(campaign.attributed_value_usd) }),
    };
  });

  const partnerGroups = new Map<string, PartnerGroup>();
  const partnerAttributionCoverage = {
    tracking_links: partnerAttribution.length,
    assigned_links: 0,
    unassigned_links: 0,
    link_creation: 0,
    legacy_backfill: 0,
    current_fallback: 0,
  };
  for (const row of partnerAttribution) {
    partnerAttributionCoverage[row.attribution_source] += 1;
    if (!row.partner_kind || !row.partner_key || !row.partner_display_name) {
      partnerAttributionCoverage.unassigned_links += 1;
      continue;
    }
    partnerAttributionCoverage.assigned_links += 1;
    const key = `${row.partner_kind}:${row.partner_key}`;
    const current = partnerGroups.get(key) || {
      key,
      label: row.partner_display_name,
      kind: row.partner_kind,
      handle: row.partner_handle,
      activityIds: new Set<string>(),
      trackingLinks: 0,
      clicks: 0,
      outcomes: 0,
      value: 0,
      linkCreationLinks: 0,
      legacyBackfillLinks: 0,
      currentFallbackLinks: 0,
    };
    if (row.activity_id) current.activityIds.add(row.activity_id);
    current.trackingLinks += 1;
    current.clicks += number(row.clicks);
    current.outcomes += number(row.outcomes);
    current.value += number(row.attributed_value_usd);
    if (row.attribution_source === 'link_creation') current.linkCreationLinks += 1;
    else if (row.attribution_source === 'legacy_backfill') current.legacyBackfillLinks += 1;
    else current.currentFallbackLinks += 1;
    partnerGroups.set(key, current);
  }

  type ChannelGroup = SocialStats & { key: string; label: string; spend: number; clicks: number; outcomes: number; value: number; activities: number };
  const channelGroups = new Map<string, ChannelGroup>();
  for (const activity of activityResults) {
    const channel = activity.channel || 'other';
    const channelGroup = channelGroups.get(channel) || { ...emptySocial(), key: channel, label: channel, spend: 0, clicks: 0, outcomes: 0, value: 0, activities: 0 };
    channelGroup.views += activity.views;
    channelGroup.engagements += activity.engagements;
    channelGroup.reportedJoins += activity.reported_joins;
    channelGroup.deliverables += activity.deliverables;
    channelGroup.spend += activity.actual_spend_usd;
    channelGroup.clicks += activity.tracked_clicks;
    channelGroup.outcomes += activity.outcomes;
    channelGroup.value += activity.attributed_value_usd;
    channelGroup.activities += 1;
    channelGroups.set(channel, channelGroup);
  }

  const channelResult = (group: ChannelGroup) => ({
    key: group.key,
    label: group.label,
    kind: null,
    handle: null,
    activities: group.activities,
    spend_scope: 'activity_attached' as const,
    attribution_scope: 'activity_channel' as const,
    ...performance({ ...group, uniqueClicks: null }),
  });

  const projectSocial = Array.from(socialByCampaign.values()).reduce((sum, row) => ({
    views: sum.views + row.views,
    engagements: sum.engagements + row.engagements,
    reportedJoins: sum.reportedJoins + row.reportedJoins,
    deliverables: sum.deliverables + row.deliverables,
  }), emptySocial());
  const projectSpend = campaignResults.reduce((sum, row) => sum + row.actual_spend_usd, 0);
  const projectOutcomes = campaignResults.reduce((sum, row) => sum + row.outcomes, 0);
  const projectValue = campaignResults.reduce((sum, row) => sum + row.attributed_value_usd, 0);
  const projectClickCount = number(projectClicks?.clicks);
  const projectIdentified = number(projectClicks?.identified_clicks);
  const projectUnique = projectIdentified > 0 ? number(projectClicks?.estimated_unique_clicks) : null;

  const partnerResults = Array.from(partnerGroups.values())
    .map(partnerPerformance)
    .sort((a, b) => b.attributed_value_usd - a.attributed_value_usd || b.outcomes - a.outcomes || b.tracked_clicks - a.tracked_clicks)
    .slice(0, 100);
  const trend = new Map(trendDays(rangeDays).map((day) => [day, { day, clicks: 0, outcomes: 0, value: 0, spend: 0 }]));
  for (const row of clickTrend) { const point = trend.get(row.day); if (point) point.clicks += number(row.clicks); }
  for (const row of outcomeTrend) { const point = trend.get(row.day); if (point) { point.outcomes += number(row.outcomes); point.value += number(row.value); } }
  for (const row of spendTrend) { const point = trend.get(row.day); if (point) point.spend += number(row.spend); }

  return json({
    summary: {
      campaigns: campaignResults.length,
      activities: activityResults.length,
      evidence_mix: evidenceMix,
      ...performance({ ...projectSocial, spend: projectSpend, clicks: projectClickCount, uniqueClicks: projectUnique, outcomes: projectOutcomes, value: projectValue }),
    },
    campaigns: campaignResults,
    activities: activityResults,
    partners: partnerResults,
    trend: Array.from(trend.values()),
    trend_range_days: rangeDays,
    partner_attribution: partnerAttributionCoverage,
    channels: Array.from(channelGroups.values()).map(channelResult).sort((a, b) => b.attributed_value_usd - a.attributed_value_usd || b.outcomes - a.outcomes || b.tracked_clicks - a.tracked_clicks),
    methodology: {
      manual_social_metrics: 'Uses the strongest available provenance per deliverable metric key. Rejected deliverables are excluded.',
      unique_clicks: projectUnique === null ? 'Not measured because no privacy-conscious visitor hashes are available.' : 'Estimated from privacy-conscious Linkary visitor hashes. It is not a person-level identity count.',
      partner_channel_spend: 'Partner comparison uses tracking-link partner provenance only. Activity-level spend and social metrics are not automatically reassigned to historical partners. Channel cost metrics use only actual costs attached directly to activities, and campaign-level overhead is not allocated automatically.',
      partner_attribution: partnerAttributionCoverage.current_fallback > 0
        ? 'Some older tracking links do not yet have an immutable snapshot row, so those links are explicitly marked as current-assignment fallback until the protected D1 backfill migration is applied.'
        : partnerAttributionCoverage.legacy_backfill > 0
          ? 'New links use partner snapshots captured at link creation. Older links use clearly labeled legacy backfills and are not presented as proven creation-time history.'
          : 'Partner comparison uses immutable partner snapshots captured at tracking-link creation. Unassigned links remain unassigned even if the activity is assigned later.',
      missing_metrics: 'Unavailable denominators remain null. Linkary does not fabricate CPM, CPC, CPA, CTR or ROAS.',
    },
  });
}
