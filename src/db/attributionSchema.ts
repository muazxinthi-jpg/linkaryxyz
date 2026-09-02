import { Db } from './client';

/**
 * Keeps Linkary's first-party attribution path operational even when a deployment
 * token cannot apply D1 migrations. Formal migrations remain the source of truth;
 * these idempotent guards are a production safety net for the core growth tables.
 */
export async function ensureAttributionSchema(db: Db): Promise<void> {
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
