import type { Env } from '../env';
import type { D1PreparedStatement } from '../platform';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { requireOperationalProjectAccess } from './organizations';
import { publicProfileUrl } from '../urls';

const id = (prefix = 'act') => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type ActivityPartnerInput = {
  kind?: 'creator' | 'community';
  creatorProfileId?: string;
  partnerManagerId?: string;
  partnerAssetId?: string;
};

type NetworkInsert = {
  id: string;
  entityType: 'creator' | 'community';
  displayName: string;
  primaryHandle: string | null;
  primaryUrl: string | null;
  verificationStatus: 'unverified' | 'submitted' | 'verified' | 'rejected';
  notes: string;
};

type ResolvedPartner = {
  kind: 'creator' | 'community';
  entityId: string;
  creatorProfileId: string | null;
  partnerManagerId: string | null;
  partnerAssetId: string | null;
  participantRole: 'creator' | 'community_host';
  networkInsert: NetworkInsert | null;
};

async function authorize(db: Db, userId: string, campaignId: string, write = false) {
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) throw new HttpError(404, 'Campaign not found', 'campaign_not_found');
  await requireOperationalProjectAccess(db, userId, campaign.organization_id, write);
  return campaign;
}

async function authorizeActivity(db: Db, userId: string, activityId: string) {
  await ensureAttributionSchema(db);
  const activity = await db.first<{ campaign_id: string; organization_id: string }>(
    `SELECT a.campaign_id, c.organization_id
       FROM campaign_activities a
       JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.id = ?`,
    [activityId],
  );
  if (!activity) throw new HttpError(404, 'Activity not found', 'activity_not_found');
  await requireOperationalProjectAccess(db, userId, activity.organization_id, true);
  return activity;
}

async function findNetworkEntity(
  db: Db,
  organizationId: string,
  entityType: 'creator' | 'community',
  primaryUrl: string | null,
  primaryHandle: string | null,
  displayName: string,
): Promise<string | null> {
  if (primaryUrl && primaryHandle) {
    const row = await db.first<{ id: string }>(
      `SELECT id FROM project_network_entities
        WHERE organization_id = ? AND entity_type = ?
          AND (primary_url = ? OR lower(COALESCE(primary_handle, '')) = lower(?))
        LIMIT 1`,
      [organizationId, entityType, primaryUrl, primaryHandle],
    );
    if (row) return row.id;
  } else if (primaryUrl) {
    const row = await db.first<{ id: string }>(
      'SELECT id FROM project_network_entities WHERE organization_id = ? AND entity_type = ? AND primary_url = ? LIMIT 1',
      [organizationId, entityType, primaryUrl],
    );
    if (row) return row.id;
  } else if (primaryHandle) {
    const row = await db.first<{ id: string }>(
      `SELECT id FROM project_network_entities
        WHERE organization_id = ? AND entity_type = ? AND lower(COALESCE(primary_handle, '')) = lower(?)
        LIMIT 1`,
      [organizationId, entityType, primaryHandle],
    );
    if (row) return row.id;
  }

  const fallback = await db.first<{ id: string }>(
    'SELECT id FROM project_network_entities WHERE organization_id = ? AND entity_type = ? AND lower(display_name) = lower(?) LIMIT 1',
    [organizationId, entityType, displayName],
  );
  return fallback?.id || null;
}

async function resolveLinkaryPartner(
  db: Db,
  request: Request,
  env: Env,
  organizationId: string,
  partner: ActivityPartnerInput,
): Promise<ResolvedPartner> {
  if (partner.kind === 'creator') {
    if (!partner.creatorProfileId || partner.partnerManagerId || partner.partnerAssetId) {
      throw new HttpError(400, 'Choose a valid Linkary creator', 'invalid_partner_assignment');
    }
    const creator = await db.first<{
      id: string;
      username: string;
      display_name: string;
      verification_status: string;
      current_handle: string | null;
    }>(
      `SELECT p.id, p.username, p.display_name, p.verification_status, pi.current_handle
         FROM profiles p
         LEFT JOIN platform_identities pi ON pi.id = p.primary_platform_identity_id
        WHERE p.id = ? AND p.profile_type = 'creator' AND p.visibility = 'published'`,
      [partner.creatorProfileId],
    );
    if (!creator) throw new HttpError(404, 'Creator profile not found', 'partner_not_found');

    const profileUrl = publicProfileUrl(request, env, creator.username);
    const existingEntityId = await findNetworkEntity(db, organizationId, 'creator', profileUrl, creator.current_handle, creator.display_name);
    const entityId = existingEntityId || id('net');
    return {
      kind: 'creator',
      entityId,
      creatorProfileId: creator.id,
      partnerManagerId: null,
      partnerAssetId: null,
      participantRole: 'creator',
      networkInsert: existingEntityId ? null : {
        id: entityId,
        entityType: 'creator',
        displayName: creator.display_name.slice(0, 120),
        primaryHandle: creator.current_handle?.slice(0, 80) || null,
        primaryUrl: profileUrl,
        verificationStatus: creator.verification_status === 'verified_x' ? 'verified' : 'unverified',
        notes: 'Linked from a Linkary creator profile',
      },
    };
  }

  if (partner.kind === 'community') {
    if (!partner.partnerManagerId || !partner.partnerAssetId || partner.creatorProfileId) {
      throw new HttpError(400, 'Choose a Community Manager and exact Telegram Community', 'invalid_partner_assignment');
    }
    const community = await db.first<{
      asset_id: string;
      name: string;
      handle: string | null;
      url: string | null;
      verification_status: 'unverified' | 'submitted' | 'verified' | 'rejected';
      manager_id: string;
      manager_name: string;
      owner_user_id: string | null;
    }>(
      `SELECT a.id AS asset_id,
              a.name,
              a.handle,
              a.url,
              a.verification_status,
              m.id AS manager_id,
              m.display_name AS manager_name,
              mp.owner_user_id
         FROM partner_manager_assets a
         JOIN partner_managers m ON m.id = a.manager_id
         JOIN profiles mp ON mp.id = m.profile_id
        WHERE a.id = ?
          AND m.id = ?
          AND a.asset_type = 'telegram_community'
          AND m.manager_type = 'community_manager'
          AND m.visibility = 'public'`,
      [partner.partnerAssetId, partner.partnerManagerId],
    );
    if (!community) throw new HttpError(404, 'Telegram Community not found', 'partner_not_found');

    const telegramIdentity = community.owner_user_id && await db.first<{ id: string }>(
      `SELECT pi.id
         FROM platform_identities pi
         JOIN platform_identity_links pil ON pil.platform_identity_id = pi.id
        WHERE pil.user_id = ?
          AND pil.link_type = 'owns'
          AND pil.ended_at IS NULL
          AND pi.platform = 'telegram'
          AND pi.provider_object_type = 'person'
          AND pi.status = 'active'
          AND pi.ownership_verified_at IS NOT NULL
        LIMIT 1`,
      [community.owner_user_id],
    );
    if (!telegramIdentity) {
      throw new HttpError(409, 'The Community Manager must verify their personal Telegram identity before this Community can be assigned.', 'community_manager_telegram_required');
    }

    const handle = community.handle?.replace(/^@/, '').slice(0, 80) || null;
    const communityUrl = community.url || (handle ? `https://t.me/${handle}` : null);
    const existingEntityId = await findNetworkEntity(db, organizationId, 'community', communityUrl, handle, community.name);
    const entityId = existingEntityId || id('net');
    return {
      kind: 'community',
      entityId,
      creatorProfileId: null,
      partnerManagerId: community.manager_id,
      partnerAssetId: community.asset_id,
      participantRole: 'community_host',
      networkInsert: existingEntityId ? null : {
        id: entityId,
        entityType: 'community',
        displayName: community.name.slice(0, 120),
        primaryHandle: handle,
        primaryUrl: communityUrl,
        verificationStatus: community.verification_status,
        notes: `Linked from a Linkary Telegram Community managed by ${community.manager_name}`.slice(0, 500),
      },
    };
  }

  throw new HttpError(400, 'Choose a valid Linkary partner type', 'invalid_partner_assignment');
}

function pushNetworkInsert(statements: D1PreparedStatement[], db: Db, organizationId: string, userId: string, network: NetworkInsert | null, timestamp: string) {
  if (!network) return;
  statements.push(db.statement(
    `INSERT INTO project_network_entities
      (id, organization_id, entity_type, display_name, primary_handle, primary_url, verification_status, notes, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [network.id, organizationId, network.entityType, network.displayName, network.primaryHandle, network.primaryUrl, network.verificationStatus, network.notes, userId, timestamp, timestamp],
  ));
}

async function saveExistingActivityAssignment(db: Db, request: Request, env: Env, userId: string, activityId: string, organizationId: string, partner: ActivityPartnerInput) {
  const resolved = await resolveLinkaryPartner(db, request, env, organizationId, partner);
  const current = await db.first<{ participant_id: string; participant_created_by_assignment: number }>(
    'SELECT participant_id, participant_created_by_assignment FROM campaign_activity_linkary_assignments WHERE activity_id = ?',
    [activityId],
  );
  const participant = await db.first<{ id: string }>(
    'SELECT id FROM campaign_activity_participants WHERE activity_id = ? AND entity_id = ? LIMIT 1',
    [activityId, resolved.entityId],
  );
  const participantId = participant?.id || id('cap');
  const participantCreatedByAssignment = participant
    ? current?.participant_id === participant.id
      ? Number(current.participant_created_by_assignment || 0)
      : 0
    : 1;
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];

  pushNetworkInsert(statements, db, organizationId, userId, resolved.networkInsert, timestamp);
  if (!participant) {
    statements.push(db.statement(
      `INSERT INTO campaign_activity_participants (id, activity_id, entity_id, participation_role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [participantId, activityId, resolved.entityId, resolved.participantRole, timestamp],
    ));
  }
  statements.push(db.statement(
    `INSERT INTO campaign_activity_linkary_assignments
      (activity_id, participant_id, participant_created_by_assignment, entity_id, assignment_kind, creator_profile_id, partner_manager_id, partner_asset_id, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       participant_id = excluded.participant_id,
       participant_created_by_assignment = excluded.participant_created_by_assignment,
       entity_id = excluded.entity_id,
       assignment_kind = excluded.assignment_kind,
       creator_profile_id = excluded.creator_profile_id,
       partner_manager_id = excluded.partner_manager_id,
       partner_asset_id = excluded.partner_asset_id,
       created_by_user_id = excluded.created_by_user_id,
       updated_at = excluded.updated_at`,
    [activityId, participantId, participantCreatedByAssignment, resolved.entityId, resolved.kind, resolved.creatorProfileId, resolved.partnerManagerId, resolved.partnerAssetId, userId, timestamp, timestamp],
  ));
  if (current && current.participant_id !== participantId && Number(current.participant_created_by_assignment || 0) === 1) {
    statements.push(db.statement('DELETE FROM campaign_activity_participants WHERE id = ?', [current.participant_id]));
  }
  await db.batch(statements);
}

async function clearExistingActivityAssignment(db: Db, activityId: string) {
  const current = await db.first<{ participant_id: string; participant_created_by_assignment: number }>(
    'SELECT participant_id, participant_created_by_assignment FROM campaign_activity_linkary_assignments WHERE activity_id = ?',
    [activityId],
  );
  if (!current) return;
  const statements: D1PreparedStatement[] = [
    db.statement('DELETE FROM campaign_activity_linkary_assignments WHERE activity_id = ?', [activityId]),
  ];
  if (Number(current.participant_created_by_assignment || 0) === 1) {
    statements.push(db.statement('DELETE FROM campaign_activity_participants WHERE id = ?', [current.participant_id]));
  }
  await db.batch(statements);
}

export async function listActivities(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const campaignId = new URL(request.url).searchParams.get('campaignId');
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');
  const db = new Db(requireDb(env));
  await authorize(db, auth.user.id, campaignId);
  const activities = await db.all<Record<string, unknown> & { id: string }>(
    `SELECT a.id,
            a.title,
            a.activity_type,
            a.destination_url,
            a.planned_cost_usd,
            a.status,
            a.created_at,
            la.assignment_kind AS partner_kind,
            la.entity_id AS partner_entity_id,
            la.creator_profile_id AS partner_profile_id,
            la.partner_manager_id,
            la.partner_asset_id,
            COALESCE(cp.display_name, pa.name, ne.display_name) AS partner_display_name,
            COALESCE(cpi.current_handle, pa.handle, ne.primary_handle) AS partner_handle,
            CASE
              WHEN la.assignment_kind = 'creator' THEN CASE WHEN cp.verification_status = 'verified_x' THEN 'verified' ELSE 'unverified' END
              WHEN la.assignment_kind = 'community' THEN COALESCE(pa.verification_status, 'unverified')
              ELSE NULL
            END AS partner_verification_status,
            cp.username AS partner_username,
            pm.display_name AS partner_manager_name,
            pa.url AS partner_asset_url
       FROM campaign_activities a
       LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = a.id
       LEFT JOIN project_network_entities ne ON ne.id = la.entity_id
       LEFT JOIN profiles cp ON cp.id = la.creator_profile_id
       LEFT JOIN platform_identities cpi ON cpi.id = cp.primary_platform_identity_id
       LEFT JOIN partner_managers pm ON pm.id = la.partner_manager_id
       LEFT JOIN partner_manager_assets pa ON pa.id = la.partner_asset_id
      WHERE a.campaign_id = ?
      ORDER BY a.created_at DESC`,
    [campaignId],
  );
  const participants = await db.all<{
    activity_id: string;
    entity_id: string;
    entity_type: 'creator' | 'community';
    display_name: string;
    primary_handle: string | null;
    verification_status: string;
    participation_role: string;
    is_exact_linkary_assignment: number;
  }>(
    `SELECT p.activity_id,
            p.entity_id,
            n.entity_type,
            n.display_name,
            n.primary_handle,
            n.verification_status,
            p.participation_role,
            CASE WHEN la.participant_id = p.id THEN 1 ELSE 0 END AS is_exact_linkary_assignment
       FROM campaign_activity_participants p
       JOIN campaign_activities a ON a.id = p.activity_id
       JOIN project_network_entities n ON n.id = p.entity_id
       LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = p.activity_id
      WHERE a.campaign_id = ?
      ORDER BY n.display_name ASC, p.created_at ASC`,
    [campaignId],
  );
  const participantsByActivity = new Map<string, typeof participants>();
  for (const participant of participants) {
    const current = participantsByActivity.get(participant.activity_id) || [];
    current.push(participant);
    participantsByActivity.set(participant.activity_id, current);
  }
  return json({ activities: activities.map((activity) => ({ ...activity, participants: participantsByActivity.get(activity.id) || [] })) });
}

export async function createActivity(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    activityId?: string;
    clearPartner?: boolean;
    campaignId?: string;
    title?: string;
    activityType?: string;
    destinationUrl?: string;
    plannedCostUsd?: number;
    partner?: ActivityPartnerInput;
  }>(request);
  const db = new Db(requireDb(env));

  if (body.activityId) {
    const activity = await authorizeActivity(db, auth.user.id, body.activityId);
    if (body.clearPartner) {
      await clearExistingActivityAssignment(db, body.activityId);
      return json({ ok: true, id: body.activityId, partnerAssigned: false });
    }
    if (!body.partner) throw new HttpError(400, 'Choose a Linkary partner to assign', 'partner_required');
    await saveExistingActivityAssignment(db, request, env, auth.user.id, body.activityId, activity.organization_id, body.partner);
    return json({ ok: true, id: body.activityId, partnerAssigned: true });
  }

  if (!body.campaignId || !body.title?.trim()) throw new HttpError(400, 'Campaign and activity title are required', 'invalid_activity');
  const allowed = new Set(['creator_content', 'community_placement', 'website', 'video', 'other']);
  if (!body.activityType || !allowed.has(body.activityType)) throw new HttpError(400, 'Invalid activity type', 'invalid_activity_type');

  let destination: string | null = null;
  if (body.destinationUrl) {
    try {
      const url = new URL(body.destinationUrl);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      destination = url.toString();
    } catch {
      throw new HttpError(400, 'Invalid destination URL', 'invalid_url');
    }
  }
  const plannedCost = body.plannedCostUsd === undefined ? null : Number(body.plannedCostUsd);
  if (plannedCost !== null && (!Number.isFinite(plannedCost) || plannedCost < 0)) {
    throw new HttpError(400, 'Planned cost must be zero or greater', 'invalid_planned_cost');
  }

  const campaign = await authorize(db, auth.user.id, body.campaignId, true);
  const activityId = id();
  const timestamp = now();

  if (!body.partner) {
    await db.run(
      `INSERT INTO campaign_activities
        (id, campaign_id, title, activity_type, destination_url, planned_cost_usd, status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
      [activityId, body.campaignId, body.title.trim().slice(0, 140), body.activityType, destination, plannedCost, auth.user.id, timestamp, timestamp],
    );
    return json({ id: activityId, partnerAssigned: false }, { status: 201 });
  }

  const resolved = await resolveLinkaryPartner(db, request, env, campaign.organization_id, body.partner);
  const participantId = id('cap');
  const statements: D1PreparedStatement[] = [];
  pushNetworkInsert(statements, db, campaign.organization_id, auth.user.id, resolved.networkInsert, timestamp);
  statements.push(db.statement(
    `INSERT INTO campaign_activities
      (id, campaign_id, title, activity_type, destination_url, planned_cost_usd, status, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
    [activityId, body.campaignId, body.title.trim().slice(0, 140), body.activityType, destination, plannedCost, auth.user.id, timestamp, timestamp],
  ));
  statements.push(db.statement(
    `INSERT INTO campaign_activity_participants (id, activity_id, entity_id, participation_role, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [participantId, activityId, resolved.entityId, resolved.participantRole, timestamp],
  ));
  statements.push(db.statement(
    `INSERT INTO campaign_activity_linkary_assignments
      (activity_id, participant_id, participant_created_by_assignment, entity_id, assignment_kind, creator_profile_id, partner_manager_id, partner_asset_id, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [activityId, participantId, resolved.entityId, resolved.kind, resolved.creatorProfileId, resolved.partnerManagerId, resolved.partnerAssetId, auth.user.id, timestamp, timestamp],
  ));
  await db.batch(statements);
  return json({ id: activityId, partnerAssigned: true }, { status: 201 });
}
