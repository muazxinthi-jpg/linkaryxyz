import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import type { PlatformIdentityRow } from '../db/models';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const SYSTEM_ROUTES = new Set(['', 'api', 'onboarding', 'admin', 'app', 'login', 'assets', 'robots.txt', 'sitemap.xml', 'pricing', 'about', 'blog', 'privacy', 'terms', 'support', 'help', 'status', 'security']);

export function normalizeLinkaryUsername(value: string): string {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,30}$/.test(username)) throw new HttpError(400, 'Username may contain only letters, numbers, and underscores', 'invalid_username');
  return username;
}
export function isSystemRoute(value: string): boolean { return SYSTEM_ROUTES.has(value.toLowerCase()); }

async function accessState(db: Db, userId: string): Promise<{ allowed: boolean; invite: boolean; earnedCreator: boolean }> {
  const invite = Boolean(await db.first<{ id: string }>(`SELECT id FROM invite_redemptions WHERE user_id = ?`, [userId]));
  const earnedCreator = Boolean(await db.first<{ id: string }>(`SELECT id FROM access_post_submissions WHERE user_id = ? AND status IN ('authenticated', 'consumed')`, [userId]));
  return { allowed: invite || earnedCreator, invite, earnedCreator };
}

async function ownedPlatformIdentity(db: Db, userId: string, platform: 'x' | 'telegram'): Promise<PlatformIdentityRow | null> {
  return db.first<PlatformIdentityRow>(`SELECT p.* FROM platform_identities p JOIN platform_identity_links l ON l.platform_identity_id = p.id WHERE l.user_id = ? AND l.link_type = 'owns' AND l.ended_at IS NULL AND p.platform = ? ORDER BY p.ownership_verified_at DESC LIMIT 1`, [userId, platform]);
}

async function preferredIdentity(db: Db, userId: string): Promise<PlatformIdentityRow | null> {
  return (await ownedPlatformIdentity(db, userId, 'x')) || (await ownedPlatformIdentity(db, userId, 'telegram'));
}

function suggestedUsername(xIdentity: PlatformIdentityRow | null, telegramIdentity: PlatformIdentityRow | null): string | null {
  const value = xIdentity?.current_handle || telegramIdentity?.current_handle;
  if (!value) return null;
  try { return normalizeLinkaryUsername(value); } catch { return null; }
}

export async function onboardingStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profiles = await db.all<{ id: string; profile_type: string; username: string; visibility: string }>(`SELECT id, profile_type, username, visibility FROM profiles WHERE owner_user_id = ? OR organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = ? AND status = 'active')`, [auth.user.id, auth.user.id]);
  const xIdentity = await ownedPlatformIdentity(db, auth.user.id, 'x');
  const telegramIdentity = await ownedPlatformIdentity(db, auth.user.id, 'telegram');
  const access = await accessState(db, auth.user.id);
  return json({
    user: { id: auth.user.id, displayName: auth.user.display_name, email: auth.user.email },
    access,
    xIdentity,
    telegramIdentity,
    suggestedUsername: suggestedUsername(xIdentity, telegramIdentity),
    profiles,
  });
}

interface CompleteBody { accountType?: 'creator' | 'project'; username?: string; organizationName?: string; displayName?: string; }

export async function completeOnboarding(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const access = await accessState(db, auth.user.id);
  if (!access.allowed) throw new HttpError(403, 'A valid Linkary access path is required', 'access_required');
  const body = await readJson<CompleteBody>(request);
  if (body.accountType !== 'creator' && body.accountType !== 'project') throw new HttpError(400, 'Choose Creator or Company / Project', 'invalid_account_type');
  if (access.earnedCreator && !access.invite && body.accountType !== 'creator') throw new HttpError(403, 'Earn Access creates a Creator account. A project invitation is required for Company / Project onboarding.', 'creator_access_only');

  const xIdentity = await ownedPlatformIdentity(db, auth.user.id, 'x');
  const telegramIdentity = await ownedPlatformIdentity(db, auth.user.id, 'telegram');
  const identity = await preferredIdentity(db, auth.user.id);
  const usernameSource = body.username?.trim() || xIdentity?.current_handle || telegramIdentity?.current_handle;
  if (!usernameSource) throw new HttpError(400, 'Choose a Linkary username', 'username_required');
  const username = normalizeLinkaryUsername(usernameSource);
  if (isSystemRoute(username)) throw new HttpError(409, 'This username is reserved by Linkary', 'route_collision');
  if (await db.first<{ id: string }>(`SELECT id FROM profiles WHERE username = ?`, [username])) throw new HttpError(409, 'This Linkary username is already claimed', 'username_claimed');

  const verificationStatus = xIdentity ? 'verified_x' : telegramIdentity ? 'verified_telegram' : 'unverified';
  const timestamp = now();
  let profileId: string;
  let organizationId: string | null = null;

  if (body.accountType === 'creator') {
    if (await db.first<{ id: string }>(`SELECT id FROM profiles WHERE owner_user_id = ? AND profile_type = 'creator'`, [auth.user.id])) throw new HttpError(409, 'Creator profile already exists', 'creator_profile_exists');
    profileId = id('pro');
    const displayName = body.displayName?.trim() || identity?.current_display_name || auth.user.display_name || username;
    await db.run(`INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at) VALUES (?, ?, NULL, ?, 'creator', ?, ?, '', NULL, 'private', ?, NULL, NULL, NULL, ?, ?)`, [profileId, auth.user.id, identity?.id || null, username, displayName, verificationStatus, timestamp, timestamp]);
  } else {
    const orgName = body.organizationName?.trim() || body.displayName?.trim() || identity?.current_display_name || auth.user.display_name || username;
    organizationId = id('org');
    profileId = id('pro');
    const internalSlug = `${username}-${organizationId.slice(-6)}`;
    await db.batch([
      db.statement(`INSERT INTO organizations (id, name, slug_internal, website, status, verification_status, created_by_user_id, archived_at, archived_by_user_id, merged_into_organization_id, created_at, updated_at) VALUES (?, ?, ?, NULL, 'active', ?, ?, NULL, NULL, NULL, ?, ?)`, [organizationId, orgName, internalSlug, verificationStatus, auth.user.id, timestamp, timestamp]),
      db.statement(`INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 1, 'active', ?, ?)`, [id('mem'), auth.user.id, organizationId, timestamp, timestamp]),
      db.statement(`INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at) VALUES (?, NULL, ?, ?, 'project', ?, ?, '', NULL, 'private', ?, NULL, NULL, NULL, ?, ?)`, [profileId, organizationId, identity?.id || null, username, orgName, verificationStatus, timestamp, timestamp]),
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

  if (identity) {
    if (body.accountType === 'creator') {
      await db.run(`UPDATE platform_identity_links SET profile_id = COALESCE(profile_id, ?) WHERE platform_identity_id = ? AND user_id = ? AND link_type = 'owns' AND ended_at IS NULL`, [profileId, identity.id, auth.user.id]);
    } else {
      const existingRepresentation = await db.first<{ id: string }>(`SELECT id FROM platform_identity_links WHERE platform_identity_id = ? AND user_id = ? AND organization_id = ? AND profile_id = ? AND link_type = 'represents' AND ended_at IS NULL`, [identity.id, auth.user.id, organizationId, profileId]);
      if (!existingRepresentation) await db.run(`INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at) VALUES (?, ?, ?, ?, ?, 'represents', ?, NULL)`, [id('pil'), identity.id, auth.user.id, organizationId, profileId, timestamp]);
    }
  }

  await db.run(`UPDATE access_post_submissions SET status = 'consumed', consumed_at = ? WHERE user_id = ? AND status = 'authenticated'`, [timestamp, auth.user.id]);
  await db.run(`UPDATE invite_redemptions SET chosen_account_type = ?, organization_id = COALESCE(organization_id, ?) WHERE user_id = ? AND chosen_account_type IS NULL`, [body.accountType, organizationId, auth.user.id]);
  await db.run(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'onboarding.completed', 'profile', ?, ?, ?, ?)`, [id('aud'), auth.user.id, profileId, organizationId, JSON.stringify({ accountType: body.accountType, username, verificationStatus }), timestamp]);
  return json({ profileId, organizationId, username, profileType: body.accountType, visibility: 'private', verificationStatus, initialInviteCredits }, { status: 201 });
}
