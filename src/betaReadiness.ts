import type { Db } from './db/client';
import type { Env } from './env';

export type SchemaObject = { type: string; name: string };

export const REQUIRED_BETA_TABLES = [
  'users',
  'profiles',
  'profile_blocks',
  'organizations',
  'organization_memberships',
  'platform_identities',
  'platform_identity_links',
  'admin_grants',
  'admin_settings',
  'creator_access_claims',
  'invites',
  'invite_balances',
  'invite_ledger',
  'invite_click_events',
  'invite_redemptions',
  'campaigns',
  'campaign_activities',
  'campaign_activity_participants',
  'tracked_links',
  'tracked_link_clicks',
  'conversion_events',
  'profile_engagement_events',
  'project_access_requests',
  'project_network_entities',
  'profile_wallet_destinations',
  'partner_managers',
  'partner_manager_assets',
  'campaign_opportunities',
  'campaign_opportunity_applications',
  'partner_manager_collaborations',
  'project_partner_shortlists',
] as const;

export const REQUIRED_BETA_TRIGGERS = [
  'trg_profiles_verified_x_avatar_after_insert',
  'trg_profiles_verified_x_avatar_after_identity_update',
  'trg_team_invite_redemption_guard_before_insert',
  'trg_team_invite_membership_after_redemption',
] as const;

export const REQUIRED_BETA_CONFIGURATION = [
  'D1 database binding',
  'Coinbase CDP project',
  'Coinbase CDP server credentials',
  'Creator access claim signing secret',
  'Tracking visitor privacy salt',
  'Public profile URL',
  'Authenticated app URL',
] as const;

export type BetaSchemaReadiness = {
  ready: boolean;
  requiredTableCount: number;
  presentRequiredTableCount: number;
  missingTables: string[];
  requiredTriggerCount: number;
  presentRequiredTriggerCount: number;
  missingTriggers: string[];
  migrationLedgerPresent: boolean;
};

export type BetaConfigurationReadiness = {
  ready: boolean;
  requiredCount: number;
  presentCount: number;
  missing: string[];
};

export function assessBetaSchema(objects: SchemaObject[]): BetaSchemaReadiness {
  const tables = new Set(objects.filter((item) => item.type === 'table').map((item) => item.name));
  const triggers = new Set(objects.filter((item) => item.type === 'trigger').map((item) => item.name));
  const missingTables = REQUIRED_BETA_TABLES.filter((name) => !tables.has(name));
  const missingTriggers = REQUIRED_BETA_TRIGGERS.filter((name) => !triggers.has(name));

  return {
    ready: missingTables.length === 0 && missingTriggers.length === 0,
    requiredTableCount: REQUIRED_BETA_TABLES.length,
    presentRequiredTableCount: REQUIRED_BETA_TABLES.length - missingTables.length,
    missingTables: [...missingTables],
    requiredTriggerCount: REQUIRED_BETA_TRIGGERS.length,
    presentRequiredTriggerCount: REQUIRED_BETA_TRIGGERS.length - missingTriggers.length,
    missingTriggers: [...missingTriggers],
    migrationLedgerPresent: tables.has('d1_migrations'),
  };
}

export function assessBetaConfiguration(env: Env): BetaConfigurationReadiness {
  const checks = [
    Boolean(env.DB),
    Boolean(env.CDP_PROJECT_ID?.trim()),
    Boolean(env.CDP_API_KEY_ID?.trim() && env.CDP_API_KEY_SECRET?.trim()),
    Boolean(env.SESSION_SECRET?.trim()),
    Boolean(env.TRACKING_HASH_SALT?.trim()),
    Boolean(env.PUBLIC_SITE_URL?.trim()),
    Boolean(env.APP_BASE_URL?.trim()),
  ];
  const missing = REQUIRED_BETA_CONFIGURATION.filter((_, index) => !checks[index]);
  return {
    ready: missing.length === 0,
    requiredCount: REQUIRED_BETA_CONFIGURATION.length,
    presentCount: REQUIRED_BETA_CONFIGURATION.length - missing.length,
    missing: [...missing],
  };
}

export async function readBetaSchemaReadiness(db: Db): Promise<BetaSchemaReadiness> {
  const objects = await db.all<SchemaObject>(
    `SELECT type, name
       FROM sqlite_master
      WHERE type IN ('table', 'trigger')`,
  );
  return assessBetaSchema(objects);
}
