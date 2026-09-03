import { Db } from './db/client';
import { ensureAttributionSchema } from './db/attributionSchema';
import { ensureCollaborationInquirySchema } from './db/collaborationInquirySchema';

export type RelationshipKind = 'creator' | 'community_manager';
export type RelationshipState = 'new' | 'inquiry_pending' | 'in_discussion' | 'active' | 'worked_before';

export type PartnerRelationshipSummary = {
  state: RelationshipState;
  inquiries_sent: number;
  accepted_inquiries: number;
  activated_inquiries: number;
  campaigns: number;
  activities: number;
  active_activities: number;
  completed_activities: number;
  communities_used: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  manual_outcomes: number;
  manual_value_usd: number;
  planned_cost_usd: number;
  last_activity_at: string | null;
};

type PerformanceRow = {
  assignment_kind: 'creator' | 'community';
  target_key: string;
  campaigns: number;
  activities: number;
  active_activities: number;
  completed_activities: number;
  communities_used: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  manual_outcomes: number;
  manual_value_usd: number;
  planned_cost_usd: number;
  last_activity_at: string | null;
};

type InquiryRow = {
  target_kind: 'creator' | 'community_manager';
  target_key: string;
  inquiries_sent: number;
  pending_inquiries: number;
  accepted_inquiries: number;
  open_accepted_inquiries: number;
  activated_inquiries: number;
};

export type RelationshipActivity = {
  activity_id: string;
  activity_title: string;
  activity_type: string;
  activity_status: string;
  campaign_id: string;
  campaign_name: string;
  partner_asset_id: string | null;
  community_name: string | null;
  community_verification_status: string | null;
  planned_cost_usd: number | null;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  manual_outcomes: number;
  manual_value_usd: number;
  updated_at: string;
};

export type RelationshipInquiry = {
  inquiry_id: string;
  inquiry_type: string;
  status: string;
  campaign_id: string | null;
  campaign_name: string | null;
  partner_asset_id: string | null;
  community_name: string | null;
  community_verification_status: string | null;
  budget_usd: number | null;
  created_at: string;
  responded_at: string | null;
  activated_activity_id: string | null;
  activated_activity_title: string | null;
  activated_campaign_name: string | null;
  activated_at: string | null;
};

export type RelationshipCommunity = {
  asset_id: string;
  community_name: string;
  verification_status: string;
  campaigns: number;
  activities: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  last_activity_at: string | null;
};

const emptySummary = (): PartnerRelationshipSummary => ({
  state: 'new',
  inquiries_sent: 0,
  accepted_inquiries: 0,
  activated_inquiries: 0,
  campaigns: 0,
  activities: 0,
  active_activities: 0,
  completed_activities: 0,
  communities_used: 0,
  tracked_clicks: 0,
  verified_outcomes: 0,
  attributed_value_usd: 0,
  manual_outcomes: 0,
  manual_value_usd: 0,
  planned_cost_usd: 0,
  last_activity_at: null,
});

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function relationshipState(summary: PartnerRelationshipSummary, pending: number, openAccepted: number): RelationshipState {
  if (pending > 0) return 'inquiry_pending';
  if (openAccepted > 0) return 'in_discussion';
  if (summary.active_activities > 0) return 'active';
  if (summary.completed_activities > 0) return 'worked_before';
  return 'new';
}

function key(kind: RelationshipKind, id: string): string {
  return `${kind}:${id}`;
}

async function prepareRelationshipSchema(db: Db): Promise<void> {
  await Promise.all([
    ensureAttributionSchema(db),
    ensureCollaborationInquirySchema(db),
  ]);
}

export async function loadProjectRelationshipSummaries(db: Db, organizationId: string): Promise<Map<string, PartnerRelationshipSummary>> {
  await prepareRelationshipSchema(db);
  const [performanceRows, inquiryRows] = await Promise.all([
    db.all<PerformanceRow>(
      `SELECT la.assignment_kind,
              CASE WHEN la.assignment_kind = 'creator' THEN la.creator_profile_id ELSE la.partner_manager_id END AS target_key,
              COUNT(DISTINCT c.id) AS campaigns,
              COUNT(DISTINCT a.id) AS activities,
              COALESCE(SUM(CASE WHEN a.status IN ('planned','live') THEN 1 ELSE 0 END), 0) AS active_activities,
              COALESCE(SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_activities,
              COUNT(DISTINCT CASE WHEN la.assignment_kind = 'community' THEN la.partner_asset_id END) AS communities_used,
              COALESCE(SUM((SELECT COUNT(*)
                FROM tracked_links tl
                JOIN tracked_link_clicks cl ON cl.tracked_link_id = tl.id
               WHERE tl.activity_id = a.id)), 0) AS tracked_clicks,
              COALESCE(SUM((SELECT COUNT(*)
                FROM conversion_events ce
               WHERE ce.activity_id = a.id
                 AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))), 0) AS verified_outcomes,
              COALESCE(SUM((SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0)
                FROM conversion_events ce
               WHERE ce.activity_id = a.id
                 AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))), 0) AS attributed_value_usd,
              COALESCE(SUM((SELECT COUNT(*)
                FROM conversion_events ce
               WHERE ce.activity_id = a.id AND ce.source = 'manual')), 0) AS manual_outcomes,
              COALESCE(SUM((SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0)
                FROM conversion_events ce
               WHERE ce.activity_id = a.id AND ce.source = 'manual')), 0) AS manual_value_usd,
              COALESCE(SUM(CASE WHEN a.status != 'cancelled' THEN COALESCE(a.planned_cost_usd,0) ELSE 0 END), 0) AS planned_cost_usd,
              MAX(CASE WHEN a.status != 'cancelled' THEN a.updated_at END) AS last_activity_at
         FROM campaign_activity_linkary_assignments la
         JOIN campaign_activities a ON a.id = la.activity_id
         JOIN campaigns c ON c.id = a.campaign_id
        WHERE c.organization_id = ?
        GROUP BY la.assignment_kind,
                 CASE WHEN la.assignment_kind = 'creator' THEN la.creator_profile_id ELSE la.partner_manager_id END`,
      [organizationId],
    ),
    db.all<InquiryRow>(
      `SELECT ci.target_kind,
              CASE WHEN ci.target_kind = 'creator' THEN ci.target_profile_id ELSE ci.partner_manager_id END AS target_key,
              COUNT(*) AS inquiries_sent,
              COALESCE(SUM(CASE WHEN ci.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_inquiries,
              COALESCE(SUM(CASE WHEN ci.status = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted_inquiries,
              COALESCE(SUM(CASE WHEN ci.status = 'accepted' AND ia.inquiry_id IS NULL THEN 1 ELSE 0 END), 0) AS open_accepted_inquiries,
              COALESCE(SUM(CASE WHEN ia.inquiry_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS activated_inquiries
         FROM collaboration_inquiries ci
         LEFT JOIN collaboration_inquiry_activations ia ON ia.inquiry_id = ci.id
        WHERE ci.organization_id = ?
        GROUP BY ci.target_kind,
                 CASE WHEN ci.target_kind = 'creator' THEN ci.target_profile_id ELSE ci.partner_manager_id END`,
      [organizationId],
    ),
  ]);

  const summaries = new Map<string, PartnerRelationshipSummary>();
  for (const row of performanceRows) {
    if (!row.target_key) continue;
    const kind: RelationshipKind = row.assignment_kind === 'creator' ? 'creator' : 'community_manager';
    summaries.set(key(kind, row.target_key), {
      ...emptySummary(),
      campaigns: number(row.campaigns),
      activities: number(row.activities),
      active_activities: number(row.active_activities),
      completed_activities: number(row.completed_activities),
      communities_used: number(row.communities_used),
      tracked_clicks: number(row.tracked_clicks),
      verified_outcomes: number(row.verified_outcomes),
      attributed_value_usd: number(row.attributed_value_usd),
      manual_outcomes: number(row.manual_outcomes),
      manual_value_usd: number(row.manual_value_usd),
      planned_cost_usd: number(row.planned_cost_usd),
      last_activity_at: row.last_activity_at || null,
    });
  }

  for (const row of inquiryRows) {
    if (!row.target_key) continue;
    const mapKey = key(row.target_kind, row.target_key);
    const current = summaries.get(mapKey) || emptySummary();
    current.inquiries_sent = number(row.inquiries_sent);
    current.accepted_inquiries = number(row.accepted_inquiries);
    current.activated_inquiries = number(row.activated_inquiries);
    current.state = relationshipState(current, number(row.pending_inquiries), number(row.open_accepted_inquiries));
    summaries.set(mapKey, current);
  }

  for (const [mapKey, current] of summaries) {
    if (current.state === 'new') current.state = relationshipState(current, 0, 0);
    summaries.set(mapKey, current);
  }

  return summaries;
}

export async function loadProjectPartnerRelationship(
  db: Db,
  organizationId: string,
  kind: RelationshipKind,
  targetId: string,
) {
  const summaries = await loadProjectRelationshipSummaries(db, organizationId);
  const summary = summaries.get(key(kind, targetId)) || emptySummary();
  const assignmentClause = kind === 'creator' ? "la.assignment_kind = 'creator' AND la.creator_profile_id = ?" : "la.assignment_kind = 'community' AND la.partner_manager_id = ?";
  const inquiryClause = kind === 'creator' ? "ci.target_kind = 'creator' AND ci.target_profile_id = ?" : "ci.target_kind = 'community_manager' AND ci.partner_manager_id = ?";

  const [activities, inquiries, communities] = await Promise.all([
    db.all<RelationshipActivity>(
      `SELECT a.id AS activity_id,
              a.title AS activity_title,
              a.activity_type,
              a.status AS activity_status,
              c.id AS campaign_id,
              c.name AS campaign_name,
              la.partner_asset_id,
              pa.name AS community_name,
              pa.verification_status AS community_verification_status,
              a.planned_cost_usd,
              (SELECT COUNT(*) FROM tracked_links tl JOIN tracked_link_clicks cl ON cl.tracked_link_id = tl.id WHERE tl.activity_id = a.id) AS tracked_clicks,
              (SELECT COUNT(*) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified')) AS verified_outcomes,
              (SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified')) AS attributed_value_usd,
              (SELECT COUNT(*) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source = 'manual') AS manual_outcomes,
              (SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source = 'manual') AS manual_value_usd,
              a.updated_at
         FROM campaign_activity_linkary_assignments la
         JOIN campaign_activities a ON a.id = la.activity_id
         JOIN campaigns c ON c.id = a.campaign_id
         LEFT JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
        WHERE c.organization_id = ? AND ${assignmentClause}
        ORDER BY a.updated_at DESC
        LIMIT 50`,
      [organizationId, targetId],
    ),
    db.all<RelationshipInquiry>(
      `SELECT ci.id AS inquiry_id,
              ci.inquiry_type,
              ci.status,
              ci.campaign_id,
              c.name AS campaign_name,
              ci.partner_asset_id,
              pa.name AS community_name,
              pa.verification_status AS community_verification_status,
              ci.budget_usd,
              ci.created_at,
              ci.responded_at,
              ia.activity_id AS activated_activity_id,
              aa.title AS activated_activity_title,
              ac.name AS activated_campaign_name,
              ia.activated_at
         FROM collaboration_inquiries ci
         LEFT JOIN campaigns c ON c.id = ci.campaign_id
         LEFT JOIN partner_manager_assets pa ON pa.id = ci.partner_asset_id
         LEFT JOIN collaboration_inquiry_activations ia ON ia.inquiry_id = ci.id
         LEFT JOIN campaign_activities aa ON aa.id = ia.activity_id
         LEFT JOIN campaigns ac ON ac.id = aa.campaign_id
        WHERE ci.organization_id = ? AND ${inquiryClause}
        ORDER BY ci.created_at DESC
        LIMIT 30`,
      [organizationId, targetId],
    ),
    kind === 'community_manager'
      ? db.all<RelationshipCommunity>(
          `SELECT pa.id AS asset_id,
                  pa.name AS community_name,
                  pa.verification_status,
                  COUNT(DISTINCT c.id) AS campaigns,
                  COUNT(DISTINCT a.id) AS activities,
                  COALESCE(SUM((SELECT COUNT(*) FROM tracked_links tl JOIN tracked_link_clicks cl ON cl.tracked_link_id = tl.id WHERE tl.activity_id = a.id)),0) AS tracked_clicks,
                  COALESCE(SUM((SELECT COUNT(*) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))),0) AS verified_outcomes,
                  COALESCE(SUM((SELECT COALESCE(SUM(COALESCE(ce.value_usd,0)),0) FROM conversion_events ce WHERE ce.activity_id = a.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified'))),0) AS attributed_value_usd,
                  MAX(CASE WHEN a.status != 'cancelled' THEN a.updated_at END) AS last_activity_at
             FROM campaign_activity_linkary_assignments la
             JOIN campaign_activities a ON a.id = la.activity_id
             JOIN campaigns c ON c.id = a.campaign_id
             JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
            WHERE c.organization_id = ?
              AND la.assignment_kind = 'community'
              AND la.partner_manager_id = ?
            GROUP BY pa.id
            ORDER BY last_activity_at DESC, attributed_value_usd DESC`,
          [organizationId, targetId],
        )
      : Promise.resolve([] as RelationshipCommunity[]),
  ]);

  return {
    summary,
    activities: activities.map((item) => ({
      ...item,
      planned_cost_usd: item.planned_cost_usd === null ? null : number(item.planned_cost_usd),
      tracked_clicks: number(item.tracked_clicks),
      verified_outcomes: number(item.verified_outcomes),
      attributed_value_usd: number(item.attributed_value_usd),
      manual_outcomes: number(item.manual_outcomes),
      manual_value_usd: number(item.manual_value_usd),
    })),
    inquiries: inquiries.map((item) => ({
      ...item,
      budget_usd: item.budget_usd === null ? null : number(item.budget_usd),
    })),
    communities: communities.map((item) => ({
      ...item,
      campaigns: number(item.campaigns),
      activities: number(item.activities),
      tracked_clicks: number(item.tracked_clicks),
      verified_outcomes: number(item.verified_outcomes),
      attributed_value_usd: number(item.attributed_value_usd),
    })),
    evidence_note: 'Relationship memory is Project-private and derived from exact Linkary partner assignments plus inquiry history. Tracked clicks are first-party Linkary evidence. Verified outcomes and attributed value exclude manual conversions. Manual outcomes remain separate and visibly Manual.',
  };
}
