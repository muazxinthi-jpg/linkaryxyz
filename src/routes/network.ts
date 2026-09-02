import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

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

export async function listNetworkEntities(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId');
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  const db = new Db(requireDb(env));
  if (!(await organizationMembership(db, auth.user.id, organizationId))) throw new HttpError(403, 'Network access denied', 'forbidden');

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
