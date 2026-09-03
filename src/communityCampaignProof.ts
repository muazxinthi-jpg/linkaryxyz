import { Db } from './db/client';
import { ensureAttributionSchema } from './db/attributionSchema';

export type CommunityCampaignProofSummary = {
  tracked_campaigns: number;
  evidence_communities: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
};

export type CommunityCampaignProofAsset = {
  asset_id: string;
  community_name: string;
  verification_status: string;
  tracked_campaigns: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
};

export type CommunityCampaignProofRecord = {
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

function normaliseSummary(row: Partial<CommunityCampaignProofSummary> | null | undefined): CommunityCampaignProofSummary {
  return {
    tracked_campaigns: Number(row?.tracked_campaigns || 0),
    evidence_communities: Number(row?.evidence_communities || 0),
    tracked_clicks: Number(row?.tracked_clicks || 0),
    verified_outcomes: Number(row?.verified_outcomes || 0),
    attributed_value_usd: Number(row?.attributed_value_usd || 0),
  };
}

export async function exactCommunityCampaignProof(db: Db, managerId: string, assetId?: string | null) {
  await ensureAttributionSchema(db);
  const filter = assetId ? 'AND pa.id = ?' : '';
  const params = assetId ? [managerId, assetId] : [managerId];

  const summary = await db.first<CommunityCampaignProofSummary>(
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

  const communities = await db.all<CommunityCampaignProofAsset>(
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

  const records = await db.all<CommunityCampaignProofRecord>(
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
    summary: normaliseSummary(summary),
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
