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

export async function searchRegisteredProjects(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const query = new URL(request.url).searchParams.get('query')?.trim().toLowerCase() || '';
  if (query.length < 2) return json({ projects: [] });
  const db = new Db(requireDb(env));
  const projects = await db.all<{ organization_id: string; name: string; username: string }>(
    `SELECT o.id AS organization_id, o.name, p.username
       FROM organizations o
       JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project'
      WHERE o.status = 'active' AND o.verification_status = 'verified_x'
        AND (lower(o.name) LIKE ? OR p.username LIKE ?)
      ORDER BY o.name LIMIT 20`,
    [`%${query}%`, `%${query}%`],
  );
  return json({ projects, actorUserId: auth.user.id });
}

export async function requestProjectAccess(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ role?: RequestedRole; note?: string }>(request);
  if (!roles.has(body.role || 'viewer')) throw new HttpError(400, 'Choose a valid Project role', 'invalid_project_role');
  const db = new Db(requireDb(env));
  const project = await db.first<{ id: string }>(
    `SELECT id FROM organizations WHERE id = ? AND status = 'active' AND verification_status = 'verified_x'`,
    [organizationId],
  );
  if (!project) throw new HttpError(404, 'Registered Project not found', 'project_not_found');
  if (await organizationMembership(db, auth.user.id, organizationId)) throw new HttpError(409, 'You already manage this Project', 'already_member');
  const pending = await db.first<{ id: string }>(
    `SELECT id FROM project_access_requests WHERE organization_id = ? AND requested_by_user_id = ? AND status = 'submitted'`,
    [organizationId, auth.user.id],
  );
  if (pending) return json({ ok: true, id: pending.id, duplicate: true });

  const timestamp = now();
  const requestId = id('par');
  try {
    await db.run(
      `INSERT INTO project_access_requests (id, organization_id, requested_by_user_id, requested_role, note, status, reviewed_by_user_id, reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'submitted', NULL, NULL, ?, ?)`,
      [requestId, organizationId, auth.user.id, body.role, body.note?.trim().slice(0, 500) || '', timestamp, timestamp],
    );
  } catch (error) {
    const concurrent = await db.first<{ id: string }>(
      `SELECT id FROM project_access_requests WHERE organization_id = ? AND requested_by_user_id = ? AND status = 'submitted'`,
      [organizationId, auth.user.id],
    );
    if (concurrent) return json({ ok: true, id: concurrent.id, duplicate: true });
    throw error;
  }
  return json({ ok: true, id: requestId, duplicate: false }, { status: 201 });
}

export async function listMyProjectAccessRequests(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const requests = await db.all<{ id: string; organization_id: string; name: string; username: string; requested_role: string; status: string; note: string; created_at: string }>(
    `SELECT r.id, r.organization_id, o.name, p.username, r.requested_role, r.status, r.note, r.created_at
       FROM project_access_requests r
       JOIN organizations o ON o.id = r.organization_id
       JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project'
      WHERE r.requested_by_user_id = ?
      ORDER BY r.created_at DESC LIMIT 100`,
    [auth.user.id],
  );
  return json({ requests });
}

export async function cancelMyProjectAccessRequest(request: Request, env: Env, requestId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const row = await db.first<{ organization_id: string; status: string }>(
    `SELECT organization_id, status FROM project_access_requests WHERE id = ? AND requested_by_user_id = ?`,
    [requestId, auth.user.id],
  );
  if (!row) throw new HttpError(404, 'Access request not found', 'access_request_not_found');
  if (row.status !== 'submitted') throw new HttpError(409, 'This access request has already changed. Refresh and try again.', 'access_request_conflict');

  const timestamp = now();
  await db.batch([
    db.statement(
      `UPDATE project_access_requests
          SET status = 'cancelled', updated_at = ?
        WHERE id = ? AND requested_by_user_id = ? AND status = 'submitted'`,
      [timestamp, requestId, auth.user.id],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'user', 'project_access.cancelled', 'project_access_request', r.id, r.organization_id, '{}', ?
         FROM project_access_requests r
        WHERE r.id = ? AND r.requested_by_user_id = ? AND r.status = 'cancelled' AND r.updated_at = ?`,
      [id('aud'), auth.user.id, timestamp, requestId, auth.user.id, timestamp],
    ),
  ]);

  const resulting = await db.first<{ status: string; updated_at: string }>(
    `SELECT status, updated_at FROM project_access_requests WHERE id = ? AND requested_by_user_id = ?`,
    [requestId, auth.user.id],
  );
  if (!resulting || resulting.status !== 'cancelled' || resulting.updated_at !== timestamp) {
    throw new HttpError(409, 'This access request changed before cancellation completed. Refresh and try again.', 'access_request_conflict');
  }
  return json({ ok: true });
}

export async function listProjectAccessRequests(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const membership = await organizationMembership(db, auth.user.id, organizationId);
  if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'Project Admin access required', 'forbidden');
  const requests = await db.all<{ id: string; requested_role: RequestedRole; note: string; created_at: string; display_name: string; username: string | null }>(
    `SELECT r.id, r.requested_role, r.note, r.created_at, u.display_name,
            (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username
       FROM project_access_requests r
       JOIN users u ON u.id = r.requested_by_user_id
      WHERE r.organization_id = ? AND r.status = 'submitted'
      ORDER BY r.created_at ASC`,
    [organizationId],
  );
  return json({ requests });
}

export async function reviewProjectAccessRequest(request: Request, env: Env, requestId: string, decision: 'approve' | 'reject'): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const row = await db.first<{ organization_id: string; requested_by_user_id: string; requested_role: RequestedRole }>(
    `SELECT organization_id, requested_by_user_id, requested_role FROM project_access_requests WHERE id = ? AND status = 'submitted'`,
    [requestId],
  );
  if (!row) throw new HttpError(404, 'Access request not found', 'access_request_not_found');
  const membership = await organizationMembership(db, auth.user.id, row.organization_id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'Project Admin access required', 'forbidden');
  if (membership.role === 'admin' && row.requested_role === 'admin') throw new HttpError(403, 'Only a Project Owner can grant Project Admin access', 'owner_required');

  const timestamp = now();
  if (decision === 'approve') {
    await db.batch([
      db.statement(
        `UPDATE project_access_requests
            SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
          WHERE id = ? AND status = 'submitted'
            AND EXISTS (
              SELECT 1 FROM organization_memberships actor
               WHERE actor.user_id = ?
                 AND actor.organization_id = project_access_requests.organization_id
                 AND actor.status = 'active'
                 AND (actor.role = 'owner' OR (actor.role = 'admin' AND project_access_requests.requested_role != 'admin'))
            )
            AND NOT EXISTS (
              SELECT 1 FROM organization_memberships target
               WHERE target.user_id = project_access_requests.requested_by_user_id
                 AND target.organization_id = project_access_requests.organization_id
                 AND target.status = 'active'
            )`,
        [auth.user.id, timestamp, timestamp, requestId, auth.user.id],
      ),
      db.statement(
        `INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at)
         SELECT ?, r.requested_by_user_id, r.organization_id, r.requested_role, 0, 'active', ?, ?
           FROM project_access_requests r
          WHERE r.id = ? AND r.status = 'approved' AND r.reviewed_by_user_id = ? AND r.reviewed_at = ?
         ON CONFLICT(user_id, organization_id) DO UPDATE SET
           role = excluded.role,
           billing_manager = 0,
           status = 'active',
           updated_at = excluded.updated_at
         WHERE organization_memberships.role != 'owner' AND organization_memberships.status != 'active'`,
        [id('mem'), timestamp, timestamp, requestId, auth.user.id, timestamp],
      ),
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         SELECT ?, ?, 'user', 'project_access.approved', 'project_access_request', r.id, r.organization_id, ?, ?
           FROM project_access_requests r
          WHERE r.id = ? AND r.status = 'approved' AND r.reviewed_by_user_id = ? AND r.reviewed_at = ?
            AND EXISTS (
              SELECT 1 FROM organization_memberships m
               WHERE m.user_id = r.requested_by_user_id AND m.organization_id = r.organization_id
                 AND m.role = r.requested_role AND m.status = 'active' AND m.updated_at = ?
            )`,
        [id('aud'), auth.user.id, JSON.stringify({ requestedRole: row.requested_role }), timestamp, requestId, auth.user.id, timestamp, timestamp],
      ),
    ]);
  } else {
    await db.batch([
      db.statement(
        `UPDATE project_access_requests
            SET status = 'rejected', reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
          WHERE id = ? AND status = 'submitted'
            AND EXISTS (
              SELECT 1 FROM organization_memberships actor
               WHERE actor.user_id = ?
                 AND actor.organization_id = project_access_requests.organization_id
                 AND actor.status = 'active'
                 AND actor.role IN ('owner', 'admin')
            )`,
        [auth.user.id, timestamp, timestamp, requestId, auth.user.id],
      ),
      db.statement(
        `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
         SELECT ?, ?, 'user', 'project_access.rejected', 'project_access_request', r.id, r.organization_id, ?, ?
           FROM project_access_requests r
          WHERE r.id = ? AND r.status = 'rejected' AND r.reviewed_by_user_id = ? AND r.reviewed_at = ?`,
        [id('aud'), auth.user.id, JSON.stringify({ requestedRole: row.requested_role }), timestamp, requestId, auth.user.id, timestamp],
      ),
    ]);
  }

  const resulting = await db.first<{ status: string; reviewed_by_user_id: string | null; reviewed_at: string | null; requested_role: RequestedRole; requested_by_user_id: string; organization_id: string }>(
    `SELECT status, reviewed_by_user_id, reviewed_at, requested_role, requested_by_user_id, organization_id FROM project_access_requests WHERE id = ?`,
    [requestId],
  );
  if (!resulting || resulting.status !== (decision === 'approve' ? 'approved' : 'rejected') || resulting.reviewed_by_user_id !== auth.user.id || resulting.reviewed_at !== timestamp) {
    throw new HttpError(409, 'This access request was reviewed by another action. Refresh and try again.', 'access_review_conflict');
  }
  if (decision === 'approve') {
    const resultingMembership = await db.first<{ role: MemberRole; status: string; updated_at: string }>(
      `SELECT role, status, updated_at FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
      [resulting.requested_by_user_id, resulting.organization_id],
    );
    if (!resultingMembership || resultingMembership.role !== resulting.requested_role || resultingMembership.status !== 'active' || resultingMembership.updated_at !== timestamp) {
      throw new HttpError(409, 'Project membership changed before approval completed. Refresh and try again.', 'access_review_conflict');
    }
  }
  return json({ ok: true });
}

export async function listProjectMembers(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireProjectAdmin(db, auth.user.id, organizationId);
  const members = await db.all<{ user_id: string; role: MemberRole; billing_manager: number; created_at: string; display_name: string; username: string | null }>(
    `SELECT m.user_id, m.role, m.billing_manager, m.created_at, u.display_name,
            (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username
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
    `SELECT u.id, u.display_name,
            (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username
       FROM users u
      WHERE u.status = 'active'
        AND (lower(u.display_name) LIKE ? OR EXISTS (
          SELECT 1 FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' AND lower(p.username) LIKE ?
        ))
        AND NOT EXISTS (
          SELECT 1 FROM organization_memberships m WHERE m.organization_id = ? AND m.user_id = u.id AND m.status = 'active'
        )
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
    db.statement(
      `INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at)
       SELECT ?, ?, ?, ?, 0, 'active', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM organization_memberships actor
           WHERE actor.user_id = ? AND actor.organization_id = ? AND actor.status = 'active'
             AND (actor.role = 'owner' OR (actor.role = 'admin' AND ? != 'admin'))
        )
       ON CONFLICT(user_id, organization_id) DO UPDATE SET
         role = excluded.role,
         billing_manager = 0,
         status = 'active',
         updated_at = excluded.updated_at
       WHERE organization_memberships.role != 'owner' AND organization_memberships.status != 'active'`,
      [id('mem'), body.userId, organizationId, body.role, timestamp, timestamp, auth.user.id, organizationId, body.role],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'user', 'project_member.added', 'organization_membership', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM organization_memberships
           WHERE user_id = ? AND organization_id = ? AND role = ? AND status = 'active' AND updated_at = ?
        )`,
      [id('aud'), auth.user.id, `${organizationId}:${body.userId}`, organizationId, JSON.stringify({ role: body.role }), timestamp, body.userId, organizationId, body.role, timestamp],
    ),
  ]);

  const resulting = await db.first<{ role: MemberRole; status: string; updated_at: string }>(
    `SELECT role, status, updated_at FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    [body.userId, organizationId],
  );
  if (resulting?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be changed through add-member', 'owner_protected');
  if (!resulting || resulting.status !== 'active' || resulting.role !== body.role || resulting.updated_at !== timestamp) {
    throw new HttpError(409, 'Project membership changed before this request completed. Refresh and try again.', 'membership_conflict');
  }
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
    db.statement(
      `UPDATE organization_memberships
          SET role = ?, updated_at = ?
        WHERE user_id = ? AND organization_id = ? AND status = 'active' AND role = ? AND role != 'owner'
          AND EXISTS (
            SELECT 1 FROM organization_memberships actor
             WHERE actor.user_id = ? AND actor.organization_id = ? AND actor.status = 'active'
               AND (actor.role = 'owner' OR (actor.role = 'admin' AND ? != 'admin' AND ? != 'admin'))
          )`,
      [body.role, timestamp, userId, organizationId, target.role, auth.user.id, organizationId, target.role, body.role],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'user', 'project_member.role_changed', 'organization_membership', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM organization_memberships
           WHERE user_id = ? AND organization_id = ? AND role = ? AND status = 'active' AND updated_at = ?
        )`,
      [id('aud'), auth.user.id, `${organizationId}:${userId}`, organizationId, JSON.stringify({ previousRole: target.role, role: body.role }), timestamp, userId, organizationId, body.role, timestamp],
    ),
  ]);

  const resulting = await db.first<{ role: MemberRole; status: string; updated_at: string }>(
    `SELECT role, status, updated_at FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    [userId, organizationId],
  );
  if (resulting?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be changed here', 'owner_protected');
  if (!resulting || resulting.status !== 'active' || resulting.role !== body.role || resulting.updated_at !== timestamp) {
    throw new HttpError(409, 'Project membership changed before this role update completed. Refresh and try again.', 'membership_conflict');
  }
  return json({ ok: true });
}

export async function removeProjectMember(request: Request, env: Env, organizationId: string, userId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const actor = await requireProjectAdmin(db, auth.user.id, organizationId);
  const target = await db.first<{ role: MemberRole }>(
    `SELECT role FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`,
    [userId, organizationId],
  );
  if (!target) throw new HttpError(404, 'Project member not found', 'member_not_found');
  if (target.role === 'owner') throw new HttpError(403, 'Project ownership cannot be removed here', 'owner_protected');
  if (userId === auth.user.id) throw new HttpError(403, 'You cannot remove yourself from this Project', 'self_remove_forbidden');
  if (actor.role === 'admin' && target.role === 'admin') throw new HttpError(403, 'Only a Project Owner can remove Project Admins', 'owner_required');

  const timestamp = now();
  await db.batch([
    db.statement(
      `UPDATE organization_memberships
          SET status = 'removed', billing_manager = 0, updated_at = ?
        WHERE user_id = ? AND organization_id = ? AND status = 'active' AND role = ? AND role != 'owner'
          AND EXISTS (
            SELECT 1 FROM organization_memberships actor
             WHERE actor.user_id = ? AND actor.organization_id = ? AND actor.status = 'active'
               AND (actor.role = 'owner' OR (actor.role = 'admin' AND ? != 'admin'))
          )`,
      [timestamp, userId, organizationId, target.role, auth.user.id, organizationId, target.role],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'user', 'project_member.removed', 'organization_membership', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM organization_memberships
           WHERE user_id = ? AND organization_id = ? AND role = ? AND status = 'removed' AND updated_at = ?
        )`,
      [id('aud'), auth.user.id, `${organizationId}:${userId}`, organizationId, JSON.stringify({ previousRole: target.role }), timestamp, userId, organizationId, target.role, timestamp],
    ),
  ]);

  const resulting = await db.first<{ role: MemberRole; status: string; updated_at: string }>(
    `SELECT role, status, updated_at FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    [userId, organizationId],
  );
  if (resulting?.role === 'owner') throw new HttpError(403, 'Project ownership cannot be removed here', 'owner_protected');
  if (!resulting || resulting.status !== 'removed' || resulting.updated_at !== timestamp) {
    throw new HttpError(409, 'Project membership changed before removal completed. Refresh and try again.', 'membership_conflict');
  }
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
  const target = await db.first<{ role: MemberRole }>(
    `SELECT role FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`,
    [body.userId, organizationId],
  );
  if (!target) throw new HttpError(404, 'Active Project member not found', 'member_not_found');
  if (target.role === 'owner') throw new HttpError(409, 'Project ownership has already changed. Refresh and try again.', 'ownership_conflict');

  const timestamp = now();
  await db.batch([
    db.statement(
      `UPDATE organization_memberships
          SET role = 'admin', billing_manager = 0, updated_at = ?
        WHERE user_id = ? AND organization_id = ? AND role = 'owner' AND status = 'active'
          AND (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ? AND status = 'active' AND role = 'owner') = 1
          AND EXISTS (
            SELECT 1 FROM organization_memberships target
             WHERE target.user_id = ? AND target.organization_id = ? AND target.status = 'active' AND target.role != 'owner'
          )`,
      [timestamp, auth.user.id, organizationId, organizationId, body.userId, organizationId],
    ),
    db.statement(
      `UPDATE organization_memberships
          SET role = 'owner', billing_manager = 1, updated_at = ?
        WHERE user_id = ? AND organization_id = ? AND status = 'active' AND role != 'owner'
          AND NOT EXISTS (
            SELECT 1 FROM organization_memberships existing_owner
             WHERE existing_owner.organization_id = ? AND existing_owner.status = 'active' AND existing_owner.role = 'owner'
          )
          AND EXISTS (
            SELECT 1 FROM organization_memberships previous_owner
             WHERE previous_owner.user_id = ? AND previous_owner.organization_id = ?
               AND previous_owner.status = 'active' AND previous_owner.role = 'admin' AND previous_owner.updated_at = ?
          )`,
      [timestamp, body.userId, organizationId, organizationId, auth.user.id, organizationId, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       SELECT ?, ?, 'user', 'project.ownership_transferred', 'organization', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM organization_memberships previous_owner
           WHERE previous_owner.user_id = ? AND previous_owner.organization_id = ?
             AND previous_owner.status = 'active' AND previous_owner.role = 'admin' AND previous_owner.updated_at = ?
        )
          AND EXISTS (
            SELECT 1 FROM organization_memberships new_owner
             WHERE new_owner.user_id = ? AND new_owner.organization_id = ?
               AND new_owner.status = 'active' AND new_owner.role = 'owner' AND new_owner.updated_at = ?
          )
          AND (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ? AND status = 'active' AND role = 'owner') = 1`,
      [id('aud'), auth.user.id, organizationId, organizationId, JSON.stringify({ previousOwnerUserId: auth.user.id, newOwnerUserId: body.userId, previousTargetRole: target.role }), timestamp, auth.user.id, organizationId, timestamp, body.userId, organizationId, timestamp, organizationId],
    ),
  ]);

  const [resultingActor, resultingTarget, ownerCount] = await Promise.all([
    db.first<{ role: MemberRole; status: string; updated_at: string }>(
      `SELECT role, status, updated_at FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
      [auth.user.id, organizationId],
    ),
    db.first<{ role: MemberRole; status: string; updated_at: string }>(
      `SELECT role, status, updated_at FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
      [body.userId, organizationId],
    ),
    db.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM organization_memberships WHERE organization_id = ? AND status = 'active' AND role = 'owner'`,
      [organizationId],
    ),
  ]);

  if (
    !resultingActor || resultingActor.role !== 'admin' || resultingActor.status !== 'active' || resultingActor.updated_at !== timestamp ||
    !resultingTarget || resultingTarget.role !== 'owner' || resultingTarget.status !== 'active' || resultingTarget.updated_at !== timestamp ||
    ownerCount?.count !== 1
  ) {
    throw new HttpError(409, 'Project ownership changed before this transfer completed. Refresh and try again.', 'ownership_conflict');
  }

  return json({ ok: true, organizationId, newOwnerUserId: body.userId });
}
