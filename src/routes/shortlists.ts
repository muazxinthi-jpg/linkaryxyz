import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { requireOperationalProjectAccess, organizationMembership } from './organizations';

const id = () => `psl_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const canonicalStatuses = new Set(['interested', 'contacted', 'negotiating', 'active', 'completed', 'not_a_fit']);
const partnerKinds = new Set(['community_manager', 'kol_manager', 'creator', 'community', 'collaboration_manager']);
const stageToStored: Record<string, string> = { saved: 'interested', contacted: 'contacted', in_discussion: 'negotiating', approved: 'active', active: 'active', completed: 'completed', not_now: 'not_a_fit' };
const stageFromStored: Record<string, string> = { interested: 'saved', contacted: 'contacted', negotiating: 'in_discussion', active: 'approved', completed: 'completed', not_a_fit: 'not_now' };
function storedStage(value: string) { return stageToStored[value] || value; }

export async function listProjectShortlist(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  const db = new Db(requireDb(env));
  if (!(await organizationMembership(db, auth.user.id, organizationId))) throw new HttpError(403, 'Project access denied', 'forbidden');
  const partners = await db.all<Record<string, unknown>>(
    `SELECT s.*, COALESCE(m.display_name,n.display_name) AS display_name, COALESCE(m.x_handle,n.primary_handle) AS primary_handle, CASE WHEN s.partner_manager_id IS NOT NULL THEN m.manager_type ELSE n.entity_type END AS resolved_kind FROM project_partner_shortlists s LEFT JOIN partner_managers m ON m.id=s.partner_manager_id LEFT JOIN project_network_entities n ON n.id=s.network_entity_id WHERE s.organization_id=? ORDER BY s.updated_at DESC`,
    [organizationId],
  );
  return json({ partners: partners.map((partner) => ({ ...partner, partner_kind: partner.resolved_kind, status: stageFromStored[String(partner.status)] || partner.status })) });
}

export async function saveProjectShortlist(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ organizationId?: string; shortlistId?: string; partnerManagerId?: string; networkEntityId?: string; partnerKind?: string; status?: string; notes?: string }>(request);
  const db = new Db(requireDb(env));
  if (body.shortlistId) {
    const row = await db.first<{ organization_id: string }>('SELECT organization_id FROM project_partner_shortlists WHERE id=?', [body.shortlistId]);
    if (!row) throw new HttpError(404, 'Shortlisted partner not found', 'shortlist_not_found');
    await requireOperationalProjectAccess(db, auth.user.id, row.organization_id, true);
    const status = storedStage(body.status || '');
    if (!canonicalStatuses.has(status)) throw new HttpError(400, 'Choose a valid collaboration status', 'invalid_shortlist_status');
    await db.run('UPDATE project_partner_shortlists SET status=?,notes=?,updated_at=? WHERE id=?', [status, body.notes?.trim().slice(0, 1000) || '', now(), body.shortlistId]);
    return json({ ok: true, id: body.shortlistId });
  }
  if (!body.organizationId || (!body.partnerManagerId && !body.networkEntityId) || !partnerKinds.has(body.partnerKind || '')) throw new HttpError(400, 'Project and partner are required', 'invalid_shortlist');
  await requireOperationalProjectAccess(db, auth.user.id, body.organizationId, true);
  if (body.partnerManagerId) {
    const manager = await db.first<{ id: string; manager_type: string }>("SELECT id,manager_type FROM partner_managers WHERE id=? AND visibility='public'", [body.partnerManagerId]);
    if (!manager) throw new HttpError(404, 'Partner listing not found', 'partner_not_found');
    if (manager.manager_type !== body.partnerKind) throw new HttpError(400, 'Partner type does not match listing', 'invalid_shortlist');
  }
  if (body.networkEntityId) {
    const entity = await db.first<{ id: string; entity_type: string }>('SELECT id,entity_type FROM project_network_entities WHERE id=? AND organization_id=?', [body.networkEntityId, body.organizationId]);
    if (!entity) throw new HttpError(404, 'Project network partner not found', 'partner_not_found');
    if (entity.entity_type !== body.partnerKind) throw new HttpError(400, 'Partner type does not match network record', 'invalid_shortlist');
  }
  const shortlistId = id();
  try {
    await db.run("INSERT INTO project_partner_shortlists (id,organization_id,partner_manager_id,network_entity_id,partner_kind,status,notes,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,'interested',?,?,?,?)", [shortlistId, body.organizationId, body.partnerManagerId || null, body.networkEntityId || null, body.partnerKind, body.notes?.trim().slice(0, 1000) || '', auth.user.id, now(), now()]);
  } catch { throw new HttpError(409, 'This partner is already on the Project shortlist', 'partner_already_shortlisted'); }
  return json({ id: shortlistId }, { status: 201 });
}

export async function promoteShortlistPartner(request: Request, env: Env, shortlistId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const partner = await db.first<{ organization_id: string; display_name: string | null; primary_handle: string | null; resolved_kind: string | null; notes: string | null }>(
    `SELECT s.organization_id, COALESCE(m.display_name,n.display_name) AS display_name, COALESCE(m.x_handle,n.primary_handle) AS primary_handle, CASE WHEN s.partner_manager_id IS NOT NULL THEN m.manager_type ELSE n.entity_type END AS resolved_kind, s.notes FROM project_partner_shortlists s LEFT JOIN partner_managers m ON m.id=s.partner_manager_id LEFT JOIN project_network_entities n ON n.id=s.network_entity_id WHERE s.id=?`,
    [shortlistId],
  );
  if (!partner?.display_name || !partner.resolved_kind) throw new HttpError(404, 'Shortlisted partner not found', 'shortlist_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, partner.organization_id, true);
  const entityType = partner.resolved_kind === 'community' || partner.resolved_kind === 'community_manager' ? 'community' : 'creator';
  const existing = partner.primary_handle
    ? await db.first<{ id: string }>('SELECT id FROM project_network_entities WHERE organization_id=? AND lower(COALESCE(primary_handle,\'\'))=lower(?) LIMIT 1', [partner.organization_id, partner.primary_handle])
    : await db.first<{ id: string }>('SELECT id FROM project_network_entities WHERE organization_id=? AND lower(display_name)=lower(?) LIMIT 1', [partner.organization_id, partner.display_name]);
  if (existing) return json({ id: existing.id, existing: true });
  const entityId = id('net');
  const timestamp = now();
  await db.run(
    `INSERT INTO project_network_entities (id,organization_id,entity_type,display_name,primary_handle,primary_url,verification_status,notes,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,NULL,'unverified',?,?,?,?)`,
    [entityId, partner.organization_id, entityType, partner.display_name.slice(0, 120), partner.primary_handle?.slice(0, 80) || null, partner.notes?.slice(0, 500) || '', auth.user.id, timestamp, timestamp],
  );
  return json({ id: entityId, existing: false }, { status: 201 });
}
