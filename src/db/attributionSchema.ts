import { Db } from './client';

let attributionSchemaReady: Promise<void> | null = null;

/**
 * Formal D1 migrations remain the source of truth. This additive runtime guard is
 * only a safety net for the core attribution tables. Cache it per Worker isolate
 * so normal campaign, tracking and outcome requests do not repeat schema DDL.
 */
async function applyAttributionRuntimeSchema(db: Db): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    budget_usd REAL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    starts_at TEXT,
    ends_at TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON campaigns(organization_id, created_at DESC)');

  await db.run(`CREATE TABLE IF NOT EXISTS campaign_activities (
    id TEXT PRIMARY KEY NOT NULL,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    title TEXT NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('creator_content', 'community_placement', 'website', 'video', 'other')),
    destination_url TEXT,
    planned_cost_usd REAL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'live', 'completed', 'cancelled')),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_activities_campaign ON campaign_activities(campaign_id, created_at DESC)');

  await db.run(`CREATE TABLE IF NOT EXISTS campaign_activity_linkary_assignments (
    activity_id TEXT PRIMARY KEY NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES campaign_activity_participants(id),
    participant_created_by_assignment INTEGER NOT NULL DEFAULT 1 CHECK (participant_created_by_assignment IN (0, 1)),
    entity_id TEXT NOT NULL REFERENCES project_network_entities(id),
    assignment_kind TEXT NOT NULL CHECK (assignment_kind IN ('creator', 'community')),
    creator_profile_id TEXT REFERENCES profiles(id),
    partner_manager_id TEXT REFERENCES partner_managers(id),
    partner_asset_id TEXT REFERENCES partner_manager_assets(id),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (assignment_kind = 'creator' AND creator_profile_id IS NOT NULL AND partner_manager_id IS NULL AND partner_asset_id IS NULL)
      OR
      (assignment_kind = 'community' AND creator_profile_id IS NULL AND partner_manager_id IS NOT NULL AND partner_asset_id IS NOT NULL)
    )
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_activity_linkary_assignments_entity ON campaign_activity_linkary_assignments(entity_id, updated_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_activity_linkary_assignments_creator ON campaign_activity_linkary_assignments(creator_profile_id) WHERE creator_profile_id IS NOT NULL');
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_activity_linkary_assignments_community ON campaign_activity_linkary_assignments(partner_asset_id) WHERE partner_asset_id IS NOT NULL');

  await db.run(`CREATE TABLE IF NOT EXISTS campaign_activity_deliverables (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    activity_id TEXT NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('x', 'telegram', 'youtube', 'article', 'website', 'other')),
    content_url TEXT NOT NULL,
    published_at TEXT,
    evidence_state TEXT NOT NULL DEFAULT 'submitted' CHECK (evidence_state IN ('submitted', 'accepted', 'rejected')),
    submitted_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_activity_deliverables_activity ON campaign_activity_deliverables(activity_id, created_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_activity_deliverables_campaign ON campaign_activity_deliverables(campaign_id, created_at DESC)');
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_deliverables_exact_url ON campaign_activity_deliverables(activity_id, content_url)');

  await db.run(`CREATE TABLE IF NOT EXISTS campaign_activity_metrics (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    activity_id TEXT NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
    deliverable_id TEXT NOT NULL REFERENCES campaign_activity_deliverables(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL,
    metric_value REAL NOT NULL CHECK (metric_value >= 0),
    provenance TEXT NOT NULL CHECK (provenance IN ('creator_manual', 'partner_manual', 'founder_manual', 'linkary_first_party', 'telegram_verified', 'provider_verified', 'estimated')),
    observed_at TEXT,
    created_by_user_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(deliverable_id, metric_key, provenance)
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_activity_metrics_activity ON campaign_activity_metrics(activity_id, updated_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_activity_metrics_campaign ON campaign_activity_metrics(campaign_id, updated_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_activity_metrics_deliverable ON campaign_activity_metrics(deliverable_id, updated_at DESC)');

  await db.run(`CREATE TABLE IF NOT EXISTS campaign_cost_entries (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    activity_id TEXT REFERENCES campaign_activities(id) ON DELETE SET NULL,
    cost_type TEXT NOT NULL DEFAULT 'partner' CHECK (cost_type IN ('partner', 'media', 'platform', 'agency', 'other')),
    amount_original REAL NOT NULL CHECK (amount_original >= 0),
    currency TEXT NOT NULL,
    usd_equivalent REAL NOT NULL CHECK (usd_equivalent >= 0),
    provenance TEXT NOT NULL DEFAULT 'founder_manual' CHECK (provenance IN ('founder_manual', 'provider_verified')),
    note TEXT NOT NULL DEFAULT '',
    incurred_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    voided_by_user_id TEXT REFERENCES users(id),
    voided_at TEXT,
    void_reason TEXT
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_cost_entries_campaign ON campaign_cost_entries(campaign_id, status, incurred_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_cost_entries_activity ON campaign_cost_entries(activity_id, status, incurred_at DESC) WHERE activity_id IS NOT NULL');
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaign_cost_entries_organization ON campaign_cost_entries(organization_id, status, incurred_at DESC)');

  await db.run(`CREATE TABLE IF NOT EXISTS tracked_links (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    campaign_id TEXT REFERENCES campaigns(id),
    activity_id TEXT REFERENCES campaign_activities(id),
    code TEXT NOT NULL UNIQUE,
    destination_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS tracked_link_clicks (
    id TEXT PRIMARY KEY NOT NULL,
    tracked_link_id TEXT NOT NULL REFERENCES tracked_links(id),
    visitor_id_hash TEXT,
    referrer_host TEXT,
    occurred_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_tracked_links_activity ON tracked_links(activity_id, created_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_tracked_link_clicks_link ON tracked_link_clicks(tracked_link_id, occurred_at DESC)');

  await db.run(`CREATE TABLE IF NOT EXISTS conversion_events (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    campaign_id TEXT REFERENCES campaigns(id),
    activity_id TEXT REFERENCES campaign_activities(id),
    tracked_link_id TEXT REFERENCES tracked_links(id),
    external_event_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    value_usd REAL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'linkary_tracked', 'telegram_verified', 'provider_verified')),
    attribution_confidence TEXT NOT NULL DEFAULT 'tracked' CHECK (attribution_confidence IN ('manual', 'tracked', 'correlated', 'verified')),
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(organization_id, external_event_key)
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_conversion_events_campaign ON conversion_events(campaign_id, occurred_at DESC)');
}

export async function ensureAttributionSchema(db: Db): Promise<void> {
  if (!attributionSchemaReady) {
    attributionSchemaReady = applyAttributionRuntimeSchema(db).catch((error) => {
      attributionSchemaReady = null;
      throw error;
    });
  }
  await attributionSchemaReady;
}
