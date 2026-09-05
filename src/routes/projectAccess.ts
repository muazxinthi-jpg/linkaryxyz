import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
type RequestedRole = 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
const roles = new Set<RequestedRole>(['admin', 'marketing_manager', 'analyst', 'viewer']);
type MemberRole = 'owner' | RequestedRole;

async function requireProjectAdmin(db: Db, userId: string, organizationId: string) {
  const membership = await organizationMembership(db, userId, organizationId);
  if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'Project Admin access required', 'forbidden');
  return membership;
}

export async function searchRegisteredProjects(request: Request, env: Env): Promise<Response> { const auth = await requireAuth(request, env); const query = new URL(request.url).searchParams.get('query')?.trim().toLowerCase() || ''; if (query.length < 2) return json({ projects: [] }); const db = new Db(requireDb(env)); const projects = await db.all<{ organization_id: string; name: string; username: string }>(`SELECT o.id AS organization_id, o.name, p.username FROM organizations o JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project' WHERE o.status = 'active' AND o.verification_status = 'verified_x' AND (lower(o.name) LIKE ? OR p.username LIKE ?) ORDER BY o.name LIMIT 20`, [`%${query}%`, `%${query}%`]); return json({ projects, actorUserId: auth.user.id }); }
export async function requestProjectAccess(request: Request, env: Env, organizationId: string): Promise<Response> { const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const body = await readJson<{ role?: RequestedRole; note?: string }>(request); if (!roles.has(body.role || 'viewer')) throw new HttpError(400, 'Choose a valid Project role', 'invalid_project_role'); const db = new Db(requireDb(env)); const project = await db.first<{ id: string }>(`SELECT id FROM organizations WHERE id = ? AND status = 'active' AND verification_status = 'verified_x'`, [organizationId]); if (!project) throw new HttpError(404, 'Registered Project not found', 'project_not_found'); if (await organizationMembership(db, auth.user.id, organizationId)) throw new HttpError(409, 'You already manage this Project', 'already_member'); const pending = await db.first<{ id: string }>(`SELECT id FROM project_access_requests WHERE organization_id = ? AND requested_by_user_id = ? AND status = 'submitted'`, [organizationId, auth.user.id]); if (pending) return json({ ok: true, id: pending.id, duplicate: true }); const timestamp = now(); const requestId = id('par'); await db.run(`INSERT INTO project_access_requests (id, organization_id, requested_by_user_id, requested_role, note, status, reviewed_by_user_id, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'submitted', NULL, NULL, ?, ?)`, [requestId, organizationId, auth.user.id, body.role, body.note?.trim().slice(0, 500) || '', timestamp, timestamp]); return json({ ok: true, id: requestId, duplicate: false }, { status: 201 }); }
export async function listMyProjectAccessRequests(request: Request, env: Env): Promise<Response> { const auth = await requireAuth(request, env); const db = new Db(requireDb(env)); const requests = await db.all<{ id: string; organization_id: string; name: string; username: string; requested_role: string; status: string; note: string; created_at: string }>(`SELECT r.id, r.organization_id, o.name, p.username, r.requested_role, r.status, r.note, r.created_at FROM project_access_requests r JOIN organizations o ON o.id = r.organization_id JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project' WHERE r.requested_by_user_id = ? ORDER BY r.created_at DESC LIMIT 100`, [auth.user.id]); return json({ requests }); }
export async function cancelMyProjectAccessRequest(request: Request, env: Env, requestId: string): Promise<Response> { const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const db = new Db(requireDb(env)); const row = await db.first<{ organization_id: string }>(`SELECT organization_id FROM project_access_requests WHERE id = ? AND requested_by_user_id = ? AND status = 'submitted'`, [requestId, auth.user.id]); if (!row) throw new HttpError(404, 'Pending access request not found', 'access_request_not_found'); const timestamp = now(); await db.batch([db.statement(`UPDATE project_access_requests SET status = 'cancelled', updated_at = ? WHERE id = ?`, [timestamp, requestId]), db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'project_access.cancelled', 'project_access_request', ?, ?, '{}', ?)`, [id('aud'), auth.user.id, requestId, row.organization_id, timestamp])]); return json({ ok: true }); }
export async function listProjectAccessRequests(request: Request, env: Env, organizationId: string): Promise<Response> { const auth = await requireAuth(request, env); const db = new Db(requireDb(env)); const membership = await organizationMembership(db, auth.user.id, organizationId); if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'Project Admin access required', 'forbidden'); const requests = await db.all<{ id: string; requested_role: RequestedRole; note: string; created_at: string; display_name: string; username: string | null }>(`SELECT r.id, r.requested_role, r.note, r.created_at, u.display_name, (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username FROM project_access_requests r JOIN users u ON u.id = r.requested_by_user_id WHERE r.organization_id = ? AND r.status = 'submitted' ORDER BY r.created_at ASC`, [organizationId]); return json({ requests }); }
export async function reviewProjectAccessRequest(request: Request, env: Env, requestId: string, decision: 'approve' | 'reject'): Promise<Response> { const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const db = new Db(requireDb(env)); const row = await db.first<{ organization_id: string; requested_by_user_id: string; requested_role: RequestedRole }>(`SELECT organization_id, requested_by_user_id, requested_role FROM project_access_requests WHERE id = ? AND status = 'submitted'`, [requestId]); if (!row) throw new HttpError(404, 'Access request not found', 'access_request_not_found'); const membership = await organizationMembership(db, auth.user.id, row.organization_id); if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'Project Admin access required', 'forbidden'); if (membership.role === 'admin' && row.requested_role === 'admin') throw new HttpError(403, 'Only a Project Owner can grant Project Admin access', 'owner_required'); const timestamp = now(); const statements = [db.statement(`UPDATE project_access_requests SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`, [decision === 'approve' ? 'approved' : 'rejected', auth.user.id, timestamp, timestamp, requestId]), db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', ?, 'project_access_request', ?, ?, ?, ?)`, [id('aud'), auth.user.id, decision === 'approve' ? 'project_access.approved' : 'project_access.rejected', requestId, row.organization_id, JSON.stringify({ requestedRole: row.requested_role }), timestamp])]; if (decision === 'approve') statements.splice(1, 0, db.statement(`INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?) ON CONFLICT(user_id, organization_id) DO UPDATE SET role = excluded.role, status = 'active', updated_at = excluded.updated_at WHERE organization_memberships.role != 'owner'`, [id('mem'), row.requested_by_user_id, row.organization_id, row.requested_role, timestamp, timestamp])); await db.batch(statements); return json({ ok: true }); }

export async function listProjectMembers(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireProjectAdmin(db, auth.user.id, organizationId);
  const members = await db.all<{ user_id: string; role: MemberRole; billing_manager: number; created_at: string; display_name: string; username: string | null }>(
    `SELECT m.user_id, m.role, m.billing_manager, m.created_at, u.display_name, (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username
     FROM organization_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ? AND m.status = 'active'
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC`,
    [organizationId],
  );
  return json({ members });
}

export async function searchEligibleProjectMembers(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireProjectAdmin(db, auth.user.id, organizationId);
  const query = new URL(request.url).searchParams.get('query')?.trim() || '';
  if (query.length < 2) return json({ users: [] });
  const like = `%${query.toLowerCase()}%`;
  const users = await db.all<{ id: string; display_name: string; username: string | null }>(
    `SELECT u.id, u.display_name, (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username FROM users u
     WHERE u.status = 'active' AND (lower(u.display_name) LIKE ? OR EXISTS (SELECT 1 FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' AND lower(p.username) LIKE ?))
       AND NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = ? AND m.user_id = u.id AND m.status = 'active')
     ORDER BY u.display_name ASC LIMIT 12`,
    [like, like, organizationId],
  );
  return json({ users });
}

export async function addProjectMember(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ userId?: string; role?: RequestedRole }>(request);
  if (!body.userId || !roles.has(body.role || 'viewer')) throw new HttpError(400, 'Choose a Linkary member and Project role', 'invalid_project_member');
  const db = new Db(requireDb(env));
  const actor = await requireProjectAdmin(db, auth.user.id, organizationId);
  if (actor.role === 'admin' && body.role === 'admin') throw new HttpError(403, 'Only a Project Owner can add a Project Admin', 'owner_required');
  const user = await db.first<{ id: string }>(`SELECT id FROM users WHERE id = ? AND status = 'active'`, [body.userId]);
  if (!user) throw new HttpError(404, 'Active Linkary member not found', 'user_not_found');
  const existing = await db.first<{ role: MemberRole; status: string }>(
    `SELECT role, status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    [body.userId, organizationId],
  );
  if (existing?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be changed through add-member', 'owner_protected');
  if (existing?.status === 'active') throw new HttpError(409, 'This user is already an active Project member', 'already_member');
  const timestamp = now();
  await db.batch([
    db.statement(`INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?) ON CONFLICT(user_id, organization_id) DO UPDATE SET role = excluded.role, billing_manager = 0, status = 'active', updated_at = excluded.updated_at WHERE organization_memberships.role != 'owner'`, [id('mem'), body.userId, organizationId, body.role, timestamp, timestamp]),
    db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
      SELECT ?, ?, 'user', 'project_member.added', 'organization_membership', ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM organization_memberships
         WHERE user_id = ? AND organization_id = ? AND role = ? AND status = 'active' AND updated_at = ?
      )`, [id('aud'), auth.user.id, `${organizationId}:${body.userId}`, organizationId, JSON.stringify({ role: body.role }), timestamp, body.userId, organizationId, body.role, timestamp]),
  ]);
  const resulting = await db.first<{ role: MemberRole; status: string }>(
    `SELECT role, status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    [body.userId, organizationId],
  );
  if (resulting?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be changed through add-member', 'owner_protected');
  if (!resulting || resulting.status !== 'active' || resulting.role !== body.role) throw new HttpError(409, 'Project membership changed before this request completed. Refresh and try again.', 'membership_conflict');
  return json({ ok: true });
}

export async function updateProjectMember(request: Request, env: Env, organizationId: string, userId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ role?: RequestedRole }>(request);
  if (!roles.has(body.role || 'viewer')) throw new HttpError(400, 'Choose a valid member role', 'invalid_project_role');
  const db = new Db(requireDb(env));
  const actor = await requireProjectAdmin(db, auth.user.id, organizationId);
  const target = await db.first<{ role: MemberRole; billing_manager: number }>(
    `SELECT role, billing_manager FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`,
    [userId, organizationId],
  );
  if (!target) throw new HttpError(404, 'Project member not found', 'member_not_found');
  if (target.role === 'owner') throw new HttpError(403, 'Project ownership cannot be changed here', 'owner_protected');
  if (userId === auth.user.id) throw new HttpError(403, 'You cannot change your own Project role', 'self_change_forbidden');
  if (actor.role === 'admin' && (target.role === 'admin' || body.role === 'admin')) throw new HttpError(403, 'Only a Project Owner can manage Project Admins', 'owner_required');
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE organization_memberships SET role = ?, updated_at = ? WHERE user_id = ? AND organization_id = ? AND role != 'owner'`, [body.role, timestamp, userId, organizationId]),
    db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'project_member.role_changed', 'organization_membership', ?, ?, ?, ?)`, [id('aud'), auth.user.id, `${organizationId}:${userId}`, organizationId, JSON.stringify({ previousRole: target.role, role: body.role }), timestamp]),
  ]);
  const resulting = await db.first<{ role: MemberRole }>(`SELECT role FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, [userId, organizationId]);
  if (resulting?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be changed here', 'owner_protected');
  return json({ ok: true });
}

export async function removeProjectMember(request: Request, env: Env, organizationId: string, userId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const actor = await requireProjectAdmin(db, auth.user.id, organizationId);
  const target = await db.first<{ role: MemberRole }>(`SELECT role FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, [userId, organizationId]);
  if (!target) throw new HttpError(404, 'Project member not found', 'member_not_found');
  if (target.role === 'owner') throw new HttpError(403, 'Project ownership cannot be removed here', 'owner_protected');
  if (userId === auth.user.id) throw new HttpError(403, 'You cannot remove yourself from this Project', 'self_remove_forbidden');
  if (actor.role === 'admin' && target.role === 'admin') throw new HttpError(403, 'Only a Project Owner can remove Project Admins', 'owner_required');
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE organization_memberships SET status = 'removed', billing_manager = 0, updated_at = ? WHERE user_id = ? AND organization_id = ? AND role != 'owner'`, [timestamp, userId, organizationId]),
    db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'project_member.removed', 'organization_membership', ?, ?, ?, ?)`, [id('aud'), auth.user.id, `${organizationId}:${userId}`, organizationId, JSON.stringify({ previousRole: target.role }), timestamp]),
  ]);
  const resulting = await db.first<{ role: MemberRole; status: string }>(`SELECT role, status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`, [userId, organizationId]);
  if (resulting?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be removed here', 'owner_protected');
  return json({ ok: true });
}

export async function transferProjectOwnership(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ userId?: string }>(request);
  if (!body.userId) throw new HttpError(400, 'Choose an active Project member to transfer ownership', 'member_required');
  if (body.userId === auth.user.id) throw new HttpError(400, 'Choose another Project member to transfer ownership', 'invalid_owner_transfer');
  const db = new Db(requireDb(env));
  const actor = await organizationMembership(db, auth.user.id, organizationId);
  if (!actor || actor.role !== 'owner') throw new HttpError(403, 'Only the current Project Owner can transfer ownership', 'owner_required');
  const target = await db.first<{ role: MemberRole }>(`SELECT role FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, [body.userId, organizationId]);
  if (!target) throw new HttpError(404, 'Active Project member not found', 'member_not_found');
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE organization_memberships SET role = 'admin', billing_manager = 0, updated_at = ? WHERE user_id = ? AND organization_id = ?`, [timestamp, auth.user.id, organizationId]),
    db.statement(`UPDATE organization_memberships SET role = 'owner', billing_manager = 1, updated_at = ? WHERE user_id = ? AND organization_id = ?`, [timestamp, body.userId, organizationId]),
    db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'project.ownership_transferred', 'organization', ?, ?, ?, ?)`, [id('aud'), auth.user.id, organizationId, organizationId, JSON.stringify({ previousOwnerUserId: auth.user.id, newOwnerUserId: body.userId, previousTargetRole: target.role }), timestamp]),
  ]);
  return json({ ok: true, organizationId, newOwnerUserId: body.userId });
}
