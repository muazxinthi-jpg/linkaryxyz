import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
type OrgRole = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';

export async function organizationMembership(db: Db, userId: string, organizationId: string): Promise<{ role: OrgRole; billing_manager: number } | null> {
  return db.first<{ role: OrgRole; billing_manager: number }>(`SELECT role, billing_manager FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, [userId, organizationId]);
}

export async function listOrganizations(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const rows = await db.all<{ id: string; name: string; status: string; verification_status: string; role: OrgRole; billing_manager: number; profile_id: string | null; username: string | null }>(`SELECT o.id, o.name, o.status, o.verification_status, m.role, m.billing_manager, p.id AS profile_id, p.username AS username FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id LEFT JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project' WHERE m.user_id = ? AND m.status = 'active' ORDER BY o.created_at ASC`, [auth.user.id]);
  return json({ organizations: rows });
}

async function requireOwner(db: Db, userId: string, organizationId: string): Promise<void> {
  const membership = await organizationMembership(db, userId, organizationId);
  if (!membership) throw new HttpError(404, 'Organization not found', 'organization_not_found');
  if (membership.role !== 'owner') throw new HttpError(403, 'Owner access required', 'forbidden');
}

export async function archiveOrganization(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const db = new Db(requireDb(env)); await requireOwner(db, auth.user.id, organizationId); const timestamp = now();
  await db.batch([db.statement(`UPDATE organizations SET status = 'archived', archived_at = ?, archived_by_user_id = ?, updated_at = ? WHERE id = ? AND status = 'active'`, [timestamp, auth.user.id, timestamp, organizationId]), db.statement(`UPDATE profiles SET visibility = 'archived', updated_at = ? WHERE organization_id = ? AND visibility != 'archived'`, [timestamp, organizationId]), db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'organization.archived', 'organization', ?, ?, '{}', ?)`, [id('aud'), auth.user.id, organizationId, organizationId, timestamp])]);
  return json({ ok: true, organizationId, status: 'archived' });
}

export async function restoreOrganization(request: Request, env: Env, organizationId: string): Promise<Response> {
  const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const db = new Db(requireDb(env)); await requireOwner(db, auth.user.id, organizationId); const timestamp = now();
  await db.batch([db.statement(`UPDATE organizations SET status = 'active', archived_at = NULL, archived_by_user_id = NULL, updated_at = ? WHERE id = ? AND status = 'archived'`, [timestamp, organizationId]), db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'organization.restored', 'organization', ?, ?, '{}', ?)`, [id('aud'), auth.user.id, organizationId, organizationId, timestamp])]);
  return json({ ok: true, organizationId, status: 'active' });
}
