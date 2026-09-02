import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { isSystemRoute, normalizeProfileUsername } from './onboarding';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
type OrgRole = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';

interface CreateOrganizationBody {
  name?: string;
  username?: string;
  displayName?: string;
}

export async function organizationMembership(db: Db, userId: string, organizationId: string): Promise<{ role: OrgRole; billing_manager: number } | null> {
  return db.first<{ role: OrgRole; billing_manager: number }>(`SELECT role, billing_manager FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, [userId, organizationId]);
}

export async function listOrganizations(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const rows = await db.all<{ id: string; name: string; status: string; verification_status: string; role: OrgRole; billing_manager: number; profile_id: string | null; username: string | null }>(`SELECT o.id, o.name, o.status, o.verification_status, m.role, m.billing_manager, p.id AS profile_id, p.username AS username FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id LEFT JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project' WHERE m.user_id = ? AND m.status = 'active' ORDER BY o.created_at ASC`, [auth.user.id]);
  return json({ organizations: rows });
}
export async function requireOperationalProjectAccess(db: Db, userId: string, organizationId: string, write = false): Promise<{ role: OrgRole }> { const membership = await organizationMembership(db, userId, organizationId); if (!membership || (write && !['owner', 'admin', 'marketing_manager'].includes(membership.role))) throw new HttpError(403, 'Project operational access denied', 'forbidden'); const project = await db.first<{ status: string; verification_status: string }>('SELECT status, verification_status FROM organizations WHERE id = ?', [organizationId]); if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') throw new HttpError(409, 'This Project must be active and X-verified before operating campaigns or attribution', 'project_verification_required'); return membership; }

export async function createOrganization(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  throw new HttpError(403, 'Projects must be registered through their own authenticated X identity before they can be managed in a workspace', 'project_registration_required');
  /* Legacy free-form creation remains below temporarily for schema reference; it is intentionally unreachable. */
  const body = await readJson<CreateOrganizationBody>(request);
  const name = body.name?.trim() || body.displayName?.trim() || '';
  if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Project name must be 2 to 100 characters', 'invalid_organization_name');
  if (!body.username) throw new HttpError(400, 'Choose a Linkary username for this project', 'username_required');
  const username = normalizeProfileUsername(body.username);
  if (isSystemRoute(username)) throw new HttpError(409, 'This username is reserved by Linkary', 'route_collision');
  const db = new Db(requireDb(env));
  if (await db.first<{ id: string }>('SELECT id FROM profiles WHERE username = ?', [username])) {
    throw new HttpError(409, 'This Linkary username is already claimed', 'username_claimed');
  }
  const organizationId = id('org');
  const profileId = id('pro');
  const timestamp = now();
  await db.batch([
    db.statement(
      `INSERT INTO organizations (id, name, slug_internal, website, status, verification_status, created_by_user_id, archived_at, archived_by_user_id, merged_into_organization_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'active', 'pending', ?, NULL, NULL, NULL, ?, ?)`,
      [organizationId, name, `${username}-${organizationId.slice(-6)}`, auth.user.id, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 1, 'active', ?, ?)`,
      [id('mem'), auth.user.id, organizationId, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at)
       VALUES (?, NULL, ?, NULL, 'project', ?, ?, '', NULL, 'private', 'pending', NULL, NULL, NULL, ?, ?)`,
      [profileId, organizationId, username, name, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO profile_username_history (id, profile_id, username, claimed_at, released_at, redirect_until, release_review_state)
       VALUES (?, ?, ?, ?, NULL, NULL, 'held')`,
      [id('puh'), profileId, username, timestamp],
    ),
    db.statement(
      `INSERT INTO invite_balances (id, owner_type, owner_id, available_credits, lifetime_granted, lifetime_used, quality_score, privileges_status, created_at, updated_at)
       VALUES (?, 'organization', ?, 50, 50, 0, 0, 'active', ?, ?)`,
      [id('ibal'), organizationId, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at)
       VALUES (?, 'organization', ?, 'grant', 50, 'initial_project_workspace_allocation', NULL, ?)`,
      [id('iled'), organizationId, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'user', 'organization.created', 'organization', ?, ?, ?, ?)`,
      [id('aud'), auth.user.id, organizationId, organizationId, JSON.stringify({ profileId, username, profileType: 'project' }), timestamp],
    ),
  ]);
  return json({ organizationId, profileId, username, profileType: 'project', initialInviteCredits: 50 }, { status: 201 });
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
