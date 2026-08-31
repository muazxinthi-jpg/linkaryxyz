import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import type { PlatformIdentityRow } from '../db/models';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const SYSTEM_ROUTES = new Set(['', 'api', 'onboarding', 'admin', 'app', 'assets', 'robots.txt', 'sitemap.xml', 'pricing', 'about', 'blog', 'privacy', 'terms', 'support', 'help', 'status', 'security']);

export function normalizeXHandle(value: string): string {
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new HttpError(400, 'X handle is not valid', 'invalid_handle');
  return handle;
}
export function isSystemRoute(value: string): boolean { return SYSTEM_ROUTES.has(value.toLowerCase()); }

async function hasAccess(db: Db, userId: string): Promise<boolean> {
  if (await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE user_id = ?`, [userId])) return true;
  return Boolean(await db.first<{ id: string }>(`SELECT id FROM access_post_submissions WHERE user_id = ? AND status IN ('authenticated', 'consumed')`, [userId]));
}

async function primaryXIdentity(db: Db, userId: string): Promise<PlatformIdentityRow | null> {
  return db.first<PlatformIdentityRow>(`SELECT p.* FROM platform_identities p JOIN platform_identity_links l ON l.platform_identity_id = p.id WHERE l.user_id = ? AND l.link_type = 'owns' AND l.ended_at IS NULL AND p.platform = 'x' ORDER BY p.ownership_verified_at DESC LIMIT 1`, [userId]);
}

export async function onboardingStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profiles = await db.all<{ id: string; profile_type: string; username: string; visibility: string }>(`SELECT id, profile_type, username, visibility FROM profiles WHERE owner_user_id = ? OR organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = ? AND status = 'active')`, [auth.user.id, auth.user.id]);
  return json({ user: { id: auth.user.id, displayName: auth.user.display_name }, access: await hasAccess(db, auth.user.id), xIdentity: await primaryXIdentity(db, auth.user.id), profiles });
}

interface CompleteBody { accountType?: 'creator' | 'project'; organizationName?: string; displayName?: string; }

export async function completeOnboarding(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  if (!(await hasAccess(db, auth.user.id))) throw new HttpError(403, 'A valid Linkary access path is required', 'access_required');
  const body = await readJson<CompleteBody>(request);
  if (body.accountType !== 'creator' && body.accountType !== 'project') throw new HttpError(400, 'Choose Creator or Company / Project', 'invalid_account_type');
  const identity = await primaryXIdentity(db, auth.user.id);
  if (!identity?.current_handle) throw new HttpError(409, 'A verified X identity is required', 'x_identity_required');
  const username = normalizeXHandle(identity.current_handle);
  if (isSystemRoute(username)) throw new HttpError(409, 'This verified handle conflicts with a Linkary system route and requires review', 'route_collision');
  if (await db.first<{ id: string }>(`SELECT id FROM profiles WHERE username = ?`, [username])) throw new HttpError(409, 'This Linkary profile is already claimed', 'username_claimed');
  const timestamp = now();
  let profileId: string;
  let organizationId: string | null = null;

  if (body.accountType === 'creator') {
    if (await db.first<{ id: string }>(`SELECT id FROM profiles WHERE owner_user_id = ? AND profile_type = 'creator'`, [auth.user.id])) throw new HttpError(409, 'Creator profile already exists', 'creator_profile_exists');
    profileId = id('pro');
    await db.run(`INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at) VALUES (?, ?, NULL, ?, 'creator', ?, ?, '', NULL, 'private', 'verified_x', NULL, NULL, NULL, ?, ?)`, [profileId, auth.user.id, identity.id, username, body.displayName?.trim() || identity.current_display_name || username, timestamp, timestamp]);
  } else {
    const orgName = body.organizationName?.trim() || identity.current_display_name || username;
    organizationId = id('org');
    profileId = id('pro');
    const internalSlug = `${username}-${organizationId.slice(-6)}`;
    await db.batch([
      db.statement(`INSERT INTO organizations (id, name, slug_internal, website, status, verification_status, created_by_user_id, archived_at, archived_by_user_id, merged_into_organization_id, created_at, updated_at) VALUES (?, ?, ?, NULL, 'active', 'verified_x', ?, NULL, NULL, NULL, ?, ?)`, [organizationId, orgName, internalSlug, auth.user.id, timestamp, timestamp]),
      db.statement(`INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 1, 'active', ?, ?)`, [id('mem'), auth.user.id, organizationId, timestamp, timestamp]),
      db.statement(`INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at) VALUES (?, NULL, ?, ?, 'project', ?, ?, '', NULL, 'private', 'verified_x', NULL, NULL, NULL, ?, ?)`, [profileId, organizationId, identity.id, username, orgName, timestamp, timestamp]),
    ]);
  }

  await db.run(`INSERT INTO profile_username_history (id, profile_id, username, claimed_at, released_at, redirect_until, release_review_state) VALUES (?, ?, ?, ?, NULL, NULL, 'held')`, [id('puh'), profileId, username, timestamp]);
  const inviteOwnerType = body.accountType === 'creator' ? 'profile' : 'organization';
  const inviteOwnerId = body.accountType === 'creator' ? profileId : organizationId!;
  const initialInviteCredits = body.accountType === 'creator' ? 10 : 50;
  await db.batch([
    db.statement(`INSERT INTO invite_balances (id, owner_type, owner_id, available_credits, lifetime_granted, lifetime_used, quality_score, privileges_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)`, [id('ibal'), inviteOwnerType, inviteOwnerId, initialInviteCredits, initialInviteCredits, timestamp, timestamp]),
    db.statement(`INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at) VALUES (?, ?, ?, 'grant', ?, 'initial_onboarding_allocation', NULL, ?)`, [id('iled'), inviteOwnerType, inviteOwnerId, initialInviteCredits, timestamp]),
  ]);
  await db.run(`INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`, [id('pil'), identity.id, auth.user.id, organizationId, profileId, body.accountType === 'creator' ? 'owns' : 'represents', timestamp]);
  await db.run(`UPDATE access_post_submissions SET status = 'consumed', consumed_at = ? WHERE user_id = ? AND status = 'authenticated'`, [timestamp, auth.user.id]);
  await db.run(`UPDATE invite_redemptions SET chosen_account_type = ?, organization_id = COALESCE(organization_id, ?) WHERE user_id = ? AND chosen_account_type IS NULL`, [body.accountType, organizationId, auth.user.id]);
  await db.run(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'onboarding.completed', 'profile', ?, ?, ?, ?)`, [id('aud'), auth.user.id, profileId, organizationId, JSON.stringify({ accountType: body.accountType, username }), timestamp]);
  return json({ profileId, organizationId, username, profileType: body.accountType, visibility: 'private', initialInviteCredits }, { status: 201 });
}
