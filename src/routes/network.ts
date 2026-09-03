import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';
import { publicProfileUrl } from '../urls';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type DiscoveryType = 'creator' | 'community_manager';

function validateProfileUrl(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new HttpError(400, 'Enter a valid profile URL', 'invalid_url');
  }
}

function positiveInt(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, 'Choose a valid filter value', 'invalid_filter');
  return Math.floor(parsed);
}

async function listDiscoveryPartners(request: Request, env: Env, db: Db, url: URL): Promise<Response> {
  const type = (url.searchParams.get('type') || 'creator') as DiscoveryType;
  if (!['creator', 'community_manager'].includes(type)) throw new HttpError(400, 'Choose a valid discovery type', 'invalid_partner_type');

  const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
  const verifiedOnly = url.searchParams.get('verified') === '1';
  const openOnly = url.searchParams.get('open') === '1';
  const minAudience = positiveInt(url.searchParams.get('minAudience'));
  const minCommunities = positiveInt(url.searchParams.get('minCommunities'));

  if (type === 'creator') {
    const clauses = ["p.profile_type = 'creator'", "p.visibility = 'published'"];
    const params: unknown[] = [];
    if (verifiedOnly) clauses.push("p.verification_status = 'verified_x'");
    if (openOnly) clauses.push("EXISTS (SELECT 1 FROM profile_blocks wb WHERE wb.profile_id = p.id AND wb.enabled = 1 AND wb.block_type = 'work_with_me')");
    if (search) {
      const term = `%${search}%`;
      clauses.push("(lower(p.display_name) LIKE ? OR lower(p.username) LIKE ? OR lower(p.bio) LIKE ? OR lower(COALESCE(pi.current_handle,'')) LIKE ?)");
      params.push(term, term, term, term);
    }

    const rows = await db.all<{
      profile_id: string;
      username: string;
      display_name: string;
      bio: string;
      avatar_url: string | null;
      verification_status: string;
      x_handle: string | null;
      open_to_collaborations: number;
      accepted_campaigns: number;
    }>(
      `SELECT p.id AS profile_id,
              p.username,
              p.display_name,
              p.bio,
              p.avatar_url,
              p.verification_status,
              pi.current_handle AS x_handle,
              CASE WHEN EXISTS (
                SELECT 1 FROM profile_blocks wb
                 WHERE wb.profile_id = p.id AND wb.enabled = 1 AND wb.block_type = 'work_with_me'
              ) THEN 1 ELSE 0 END AS open_to_collaborations,
              COALESCE((
                SELECT COUNT(*) FROM campaign_opportunity_applications app
                 WHERE app.applicant_profile_id = p.id AND app.status = 'accepted'
              ), 0) AS accepted_campaigns
         FROM profiles p
         LEFT JOIN platform_identities pi ON pi.id = p.primary_platform_identity_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY open_to_collaborations DESC,
                 p.verification_status = 'verified_x' DESC,
                 p.published_at DESC,
                 p.display_name ASC
        LIMIT 250`,
      params,
    );

    return json({
      discovery: true,
      type,
      partners: rows.map((row) => ({
        kind: 'creator' as const,
        id: row.profile_id,
        profile_id: row.profile_id,
        username: row.username,
        display_name: row.display_name,
        bio: row.bio,
        avatar_url: row.avatar_url,
        x_handle: row.x_handle,
        verified: row.verification_status === 'verified_x',
        open_to_collaborations: Boolean(row.open_to_collaborations),
        accepted_campaigns: Number(row.accepted_campaigns || 0),
        public_url: publicProfileUrl(request, env, row.username),
      })),
    });
  }

  const where = ["m.manager_type = 'community_manager'", "m.visibility = 'public'"];
  const whereParams: unknown[] = [];
  if (openOnly) where.push('m.open_to_campaigns = 1');
  if (verifiedOnly) where.push("EXISTS (SELECT 1 FROM partner_manager_assets va WHERE va.manager_id = m.id AND va.asset_type = 'telegram_community' AND va.verification_status = 'verified')");
  if (search) {
    const term = `%${search}%`;
    where.push("(lower(m.display_name) LIKE ? OR lower(m.headline) LIKE ? OR lower(m.bio) LIKE ? OR lower(p.username) LIKE ? OR EXISTS (SELECT 1 FROM partner_manager_assets sa WHERE sa.manager_id = m.id AND (lower(sa.name) LIKE ? OR lower(COALESCE(sa.handle,'')) LIKE ?)))");
    whereParams.push(term, term, term, term, term, term);
  }

  const having: string[] = [];
  const havingParams: unknown[] = [];
  if (minAudience !== null) { having.push('COALESCE(SUM(a.audience_size), 0) >= ?'); havingParams.push(minAudience); }
  if (minCommunities !== null) { having.push('COUNT(a.id) >= ?'); havingParams.push(minCommunities); }

  const rows = await db.all<{
    manager_id: string;
    profile_id: string;
    username: string;
    avatar_url: string | null;
    display_name: string;
    headline: string;
    bio: string;
    manager_verification_status: string;
    open_to_campaigns: number;
    telegram_verified: number;
    community_count: number;
    verified_communities: number;
    combined_audience: number;
  }>(
    `SELECT m.id AS manager_id,
            m.profile_id,
            p.username,
            p.avatar_url,
            m.display_name,
            m.headline,
            m.bio,
            m.verification_status AS manager_verification_status,
            m.open_to_campaigns,
            CASE WHEN EXISTS (
              SELECT 1
                FROM platform_identity_links pil
                JOIN platform_identities tpi ON tpi.id = pil.platform_identity_id
               WHERE pil.user_id = p.owner_user_id
                 AND pil.link_type = 'owns'
                 AND pil.ended_at IS NULL
                 AND tpi.platform = 'telegram'
                 AND tpi.provider_object_type = 'person'
                 AND tpi.status = 'active'
                 AND tpi.ownership_verified_at IS NOT NULL
            ) THEN 1 ELSE 0 END AS telegram_verified,
            COUNT(a.id) AS community_count,
            COALESCE(SUM(CASE WHEN a.verification_status = 'verified' THEN 1 ELSE 0 END), 0) AS verified_communities,
            COALESCE(SUM(a.audience_size), 0) AS combined_audience
       FROM partner_managers m
       JOIN profiles p ON p.id = m.profile_id AND p.profile_type = 'creator'
       LEFT JOIN partner_manager_assets a ON a.manager_id = m.id AND a.asset_type = 'telegram_community'
      WHERE ${where.join(' AND ')}
      GROUP BY m.id
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
      ORDER BY m.open_to_campaigns DESC,
               verified_communities DESC,
               combined_audience DESC,
               m.updated_at DESC
      LIMIT 250`,
    [...whereParams, ...havingParams],
  );

  return json({
    discovery: true,
    type,
    partners: rows.map((row) => ({
      kind: 'community_manager' as const,
      id: row.manager_id,
      manager_id: row.manager_id,
      profile_id: row.profile_id,
      username: row.username,
      avatar_url: row.avatar_url,
      display_name: row.display_name,
      headline: row.headline,
      bio: row.bio,
      telegram_verified: Boolean(row.telegram_verified),
      manager_verification_status: row.manager_verification_status,
      open_to_campaigns: Boolean(row.open_to_campaigns),
      community_count: Number(row.community_count || 0),
      verified_communities: Number(row.verified_communities || 0),
      combined_audience: Number(row.combined_audience || 0),
      public_url: publicProfileUrl(request, env, row.username),
    })),
  });
}

export async function listNetworkEntities(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId');
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  const db = new Db(requireDb(env));
  if (!(await organizationMembership(db, auth.user.id, organizationId))) throw new HttpError(403, 'Network access denied', 'forbidden');

  if (url.searchParams.get('discovery') === '1') return listDiscoveryPartners(request, env, db, url);

  const type = url.searchParams.get('type')?.trim();
  if (type && !['creator', 'community'].includes(type)) throw new HttpError(400, 'Choose a valid network type', 'invalid_network_type');
  const search = url.searchParams.get('search')?.trim().toLowerCase();
  const clauses = ['n.organization_id = ?'];
  const params: unknown[] = [organizationId];
  if (type) { clauses.push('n.entity_type = ?'); params.push(type); }
  if (search) {
    const term = `%${search}%`;
    clauses.push('(lower(n.display_name) LIKE ? OR lower(COALESCE(n.primary_handle, \'\')) LIKE ? OR lower(COALESCE(n.notes, \'\')) LIKE ?)');
    params.push(term, term, term);
  }

  const entities = await db.all(
    `SELECT
       n.id,
       n.entity_type,
       n.display_name,
       n.primary_handle,
       n.primary_url,
       n.verification_status,
       n.notes,
       n.created_at,
       n.updated_at,
       (SELECT COUNT(*) FROM campaign_activity_participants p WHERE p.entity_id = n.id) AS activity_count,
       (SELECT COUNT(*)
          FROM tracked_link_clicks cl
          JOIN tracked_links tl ON tl.id = cl.tracked_link_id
          JOIN campaign_activity_participants p ON p.activity_id = tl.activity_id
         WHERE p.entity_id = n.id) AS tracked_clicks,
       (SELECT COUNT(*)
          FROM conversion_events ce
          JOIN campaign_activity_participants p ON p.activity_id = ce.activity_id
         WHERE p.entity_id = n.id) AS outcomes,
       COALESCE((SELECT SUM(ce.value_usd)
          FROM conversion_events ce
          JOIN campaign_activity_participants p ON p.activity_id = ce.activity_id
         WHERE p.entity_id = n.id), 0) AS attributed_value
     FROM project_network_entities n
     WHERE ${clauses.join(' AND ')}
     ORDER BY n.created_at DESC
     LIMIT 500`,
    params,
  );
  return json({ entities });
}

export async function createNetworkEntity(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    organizationId?: string;
    entityId?: string;
    entityType?: 'creator' | 'community';
    displayName?: string;
    handle?: string;
    url?: string;
    notes?: string;
    requestVerification?: boolean;
  }>(request);
  const db = new Db(requireDb(env));

  if (body.entityId) {
    const entity = await db.first<{ organization_id: string; display_name: string; primary_handle: string | null; primary_url: string | null; notes: string; verification_status: string }>(
      'SELECT organization_id, display_name, primary_handle, primary_url, notes, verification_status FROM project_network_entities WHERE id = ?',
      [body.entityId],
    );
    if (!entity) throw new HttpError(404, 'Network record not found', 'network_entity_not_found');
    await requireOperationalProjectAccess(db, auth.user.id, entity.organization_id, true);
    const displayName = body.displayName === undefined ? entity.display_name : body.displayName.trim().slice(0, 120);
    if (!displayName) throw new HttpError(400, 'Name is required', 'invalid_network_entity');
    const handle = body.handle === undefined ? entity.primary_handle : body.handle.trim().replace(/^@/, '').slice(0, 80) || null;
    const profileUrl = body.url === undefined ? entity.primary_url : validateProfileUrl(body.url);
    const notes = body.notes === undefined ? entity.notes : body.notes.trim().slice(0, 500);
    let verificationStatus = entity.verification_status;
    const identityChanged = handle !== entity.primary_handle || profileUrl !== entity.primary_url;
    if (identityChanged && verificationStatus === 'verified') verificationStatus = 'unverified';
    if (body.requestVerification === true && verificationStatus !== 'verified') verificationStatus = 'submitted';
    await db.run(
      `UPDATE project_network_entities
          SET display_name = ?, primary_handle = ?, primary_url = ?, notes = ?, verification_status = ?, updated_at = ?
        WHERE id = ?`,
      [displayName, handle, profileUrl, notes, verificationStatus, now(), body.entityId],
    );
    return json({ ok: true, id: body.entityId, verificationStatus });
  }

  if (!body.organizationId || !['creator', 'community'].includes(body.entityType || '') || !body.displayName?.trim()) throw new HttpError(400, 'Project, type, and name are required', 'invalid_network_entity');
  const profileUrl = validateProfileUrl(body.url);
  await requireOperationalProjectAccess(db, auth.user.id, body.organizationId, true);
  const timestamp = now();
  const entityId = id('net');
  await db.run(
    `INSERT INTO project_network_entities (id, organization_id, entity_type, display_name, primary_handle, primary_url, verification_status, notes, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?, ?)`,
    [entityId, body.organizationId, body.entityType, body.displayName.trim().slice(0, 120), body.handle?.trim().replace(/^@/, '').slice(0, 80) || null, profileUrl, body.notes?.trim().slice(0, 500) || '', auth.user.id, timestamp, timestamp],
  );
  return json({ id: entityId }, { status: 201 });
}

export async function assignNetworkEntity(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ activityId?: string; entityId?: string; role?: string }>(request);
  if (!body.activityId || !body.entityId) throw new HttpError(400, 'Activity and network entity are required', 'invalid_assignment');
  const db = new Db(requireDb(env));
  const activity = await db.first<{ organization_id: string }>(
    `SELECT c.organization_id FROM campaign_activities a JOIN campaigns c ON c.id = a.campaign_id WHERE a.id = ?`,
    [body.activityId],
  );
  const entity = activity && await db.first<{ id: string }>(
    `SELECT id FROM project_network_entities WHERE id = ? AND organization_id = ?`,
    [body.entityId, activity.organization_id],
  );
  if (!activity || !entity) throw new HttpError(404, 'Activity or Project network entity not found', 'assignment_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, activity.organization_id, true);
  await db.run(
    `INSERT INTO campaign_activity_participants (id, activity_id, entity_id, participation_role, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(activity_id, entity_id) DO UPDATE SET participation_role = excluded.participation_role`,
    [id('cap'), body.activityId, body.entityId, ['creator', 'community_host', 'contributor', 'distribution_partner'].includes(body.role || '') ? body.role : 'contributor', now()],
  );
  return json({ ok: true });
}
