import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import type { PlatformIdentityRow } from '../db/models';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const SYSTEM_ROUTES = new Set([
  '', 'api', 'onboarding', 'admin', 'app', 'assets', 'i', 'robots.txt', 'sitemap.xml',
  'pricing', 'about', 'blog', 'privacy', 'terms', 'support', 'help', 'status', 'security',
  'login', 'signup', 'dashboard', 'campaigns', 'creators', 'communities', 'tracking',
  'profile', 'invites', 'settings', 'wallets', 'partners', 'opportunities',
]);

export function normalizeXHandle(value: string): string {
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new HttpError(400, 'X handle is not valid', 'invalid_handle');
  return handle;
}

export function normalizeProfileUsername(value: string): string {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3 to 30 characters using letters, numbers, or underscores', 'invalid_username');
  }
  return username;
}

export function isSystemRoute(value: string): boolean { return SYSTEM_ROUTES.has(value.toLowerCase()); }

type AccountType = 'creator' | 'project';
interface AccessEntitlement {
  allowedAccountTypes: AccountType[];
  sources: ('invite' | 'earned_creator')[];
}

async function accessEntitlement(db: Db, userId: string): Promise<AccessEntitlement> {
  const allowed = new Set<AccountType>();
  const sources = new Set<'invite' | 'earned_creator'>();
  const inviteRows = await db.all<{ allowed_account_types_json: string }>(
    `SELECT i.allowed_account_types_json FROM invite_redemptions r JOIN invites i ON i.id = r.invite_id WHERE r.user_id = ?`,
    [userId],
  );
  for (const row of inviteRows) {
    try {
      const values = JSON.parse(row.allowed_account_types_json) as string[];
      for (const value of values) if (value === 'creator' || value === 'project') allowed.add(value);
      sources.add('invite');
    } catch {}
  }
  if (await db.first<{ id: string }>(`SELECT id FROM access_post_submissions WHERE user_id = ? AND status IN ('authenticated', 'consumed') LIMIT 1`, [userId])) {
    allowed.add('creator');
    sources.add('earned_creator');
  }
  return { allowedAccountTypes: [...allowed], sources: [...sources] };
}

async function primaryXIdentity(db: Db, userId: string): Promise<PlatformIdentityRow | null> {
  return db.first<PlatformIdentityRow>(
    `SELECT p.* FROM platform_identities p
     JOIN platform_identity_links l ON l.platform_identity_id = p.id
     WHERE l.user_id = ? AND l.link_type = 'owns' AND l.ended_at IS NULL AND p.platform = 'x'
     ORDER BY p.ownership_verified_at DESC LIMIT 1`,
    [userId],
  );
}

export async function onboardingStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profiles = await db.all<{ id: string; profile_type: string; username: string; display_name: string; bio: string; seo_title: string | null; seo_description: string | null; visibility: string; organization_id: string | null }>(
    `SELECT id, profile_type, username, display_name, bio, seo_title, seo_description, visibility, organization_id FROM profiles
     WHERE owner_user_id = ? OR organization_id IN (
       SELECT m.organization_id FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
     )
     ORDER BY CASE WHEN owner_user_id = ? AND profile_type = 'creator' THEN 0 WHEN profile_type = 'creator' THEN 1 ELSE 2 END, created_at ASC`,
    [auth.user.id, auth.user.id, auth.user.id],
  );
  const entitlement = await accessEntitlement(db, auth.user.id);
  const xIdentity = await primaryXIdentity(db, auth.user.id);
  const suggestedUsername = xIdentity?.current_handle && !isSystemRoute(xIdentity.current_handle)
    ? xIdentity.current_handle
    : null;
  return json({
    user: { id: auth.user.id, displayName: auth.user.display_name, email: auth.user.email },
    access: entitlement.allowedAccountTypes.length > 0,
    allowedAccountTypes: entitlement.allowedAccountTypes,
    accessSources: entitlement.sources,
    suggestedUsername,
    xIdentity,
    profiles,
  });
}

interface CompleteBody {
  accountType?: AccountType;
  username?: string;
  organizationName?: string;
  displayName?: string;
}

async function recoverLegacyProject(
  db: Db,
  auth: { user: { id: string } },
  identity: PlatformIdentityRow,
  profile: { id: string; organization_id: string | null },
  username: string,
): Promise<Response> {
  if (!profile.organization_id) throw new HttpError(409, 'This username is not a recoverable Project', 'username_claimed');
  const linkedIdentity = await db.first<{ id: string }>(`SELECT id FROM platform_identity_links WHERE organization_id = ? AND ended_at IS NULL LIMIT 1`, [profile.organization_id]);
  const organization = await db.first<{ verification_status: string }>(`SELECT verification_status FROM organizations WHERE id = ?`, [profile.organization_id]);
  if (linkedIdentity || organization?.verification_status === 'verified_x') {
    throw new HttpError(409, 'This Project is already claimed through a verified X identity', 'project_already_verified');
  }
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE organizations SET status = 'active', verification_status = 'verified_x', updated_at = ? WHERE id = ?`, [timestamp, profile.organization_id]),
    db.statement(`UPDATE profiles SET primary_platform_identity_id = ?, verification_status = 'verified_x', updated_at = ? WHERE id = ?`, [identity.id, timestamp, profile.id]),
    db.statement(`UPDATE organization_memberships SET role = 'admin', billing_manager = 0, updated_at = ? WHERE organization_id = ? AND status = 'active' AND role = 'owner' AND user_id != ?`, [timestamp, profile.organization_id, auth.user.id]),
    db.statement(`INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 1, 'active', ?, ?) ON CONFLICT(user_id, organization_id) DO UPDATE SET role = 'owner', billing_manager = 1, status = 'active', updated_at = excluded.updated_at`, [id('mem'), auth.user.id, profile.organization_id, timestamp, timestamp]),
    db.statement(`INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at) VALUES (?, ?, ?, ?, ?, 'represents', ?, NULL)`, [id('pil'), identity.id, auth.user.id, profile.organization_id, profile.id, timestamp]),
    db.statement(`UPDATE access_post_submissions SET status = 'consumed', consumed_at = ? WHERE user_id = ? AND status = 'authenticated'`, [timestamp, auth.user.id]),
    db.statement(`UPDATE invite_redemptions SET chosen_account_type = 'project', organization_id = COALESCE(organization_id, ?) WHERE user_id = ? AND chosen_account_type IS NULL`, [profile.organization_id, auth.user.id]),
    db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'user', 'project.legacy_recovered_by_verified_x', 'profile', ?, ?, ?, ?)`, [id('aud'), auth.user.id, profile.id, profile.organization_id, JSON.stringify({ username, platformIdentityId: identity.id }), timestamp]),
  ]);
  return json({ profileId: profile.id, organizationId: profile.organization_id, username, profileType: 'project', visibility: 'private', verificationStatus: 'verified_x', recovered: true });
}

export async function completeOnboarding(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const entitlement = await accessEntitlement(db, auth.user.id);
  if (!entitlement.allowedAccountTypes.length) throw new HttpError(403, 'A valid Linkary access path is required', 'access_required');

  const body = await readJson<CompleteBody>(request);
  if (body.accountType !== 'creator' && body.accountType !== 'project') {
    throw new HttpError(400, 'Choose Creator or Company / Project', 'invalid_account_type');
  }
  if (!entitlement.allowedAccountTypes.includes(body.accountType)) {
    throw new HttpError(403, 'This access path does not allow the selected account type', 'account_type_not_allowed');
  }
  const identity = await primaryXIdentity(db, auth.user.id);
  const username = normalizeProfileUsername(body.username || '');
  if (isSystemRoute(username)) throw new HttpError(409, 'This username is reserved by Linkary', 'route_collision');

  if (body.accountType === 'project' && !identity) {
    throw new HttpError(403, 'Sign in with the Project’s X account to register this Project on Linkary', 'project_x_identity_required');
  }
  if (body.accountType === 'project') {
    const verifiedHandle = identity?.current_handle ? normalizeProfileUsername(identity.current_handle) : null;
    if (!verifiedHandle || username !== verifiedHandle) throw new HttpError(409, 'A Project Linkary username must match the verified Project X handle', 'project_handle_mismatch');
  }
  const claimedProfile = await db.first<{ id: string; profile_type: AccountType; organization_id: string | null }>(`SELECT id, profile_type, organization_id FROM profiles WHERE username = ?`, [username]);
  if (claimedProfile) {
    if (body.accountType === 'project' && claimedProfile.profile_type === 'project' && identity) {
      return recoverLegacyProject(db, auth, identity, claimedProfile, username);
    }
    throw new HttpError(409, 'This Linkary username is already claimed', 'username_claimed');
  }
  const verificationStatus = identity ? 'verified_x' : 'pending';
  const timestamp = now();
  let profileId: string;
  let organizationId: string | null = null;

  if (body.accountType === 'creator') {
    if (await db.first<{ id: string }>(`SELECT id FROM profiles WHERE owner_user_id = ? AND profile_type = 'creator'`, [auth.user.id])) {
      throw new HttpError(409, 'Creator profile already exists', 'creator_profile_exists');
    }
    profileId = id('pro');
    const displayName = body.displayName?.trim() || identity?.current_display_name || auth.user.display_name || username;
    await db.run(
      `INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'creator', ?, ?, '', NULL, 'private', ?, NULL, NULL, NULL, ?, ?)`,
      [profileId, auth.user.id, identity?.id || null, username, displayName, verificationStatus, timestamp, timestamp],
    );
  } else {
    const orgName = body.organizationName?.trim() || body.displayName?.trim() || identity?.current_display_name || username;
    if (orgName.length < 2 || orgName.length > 100) throw new HttpError(400, 'Company or project name must be 2 to 100 characters', 'invalid_organization_name');
    organizationId = id('org');
    profileId = id('pro');
    const internalSlug = `${username}-${organizationId.slice(-6)}`;
    await db.batch([
      db.statement(
        `INSERT INTO organizations (id, name, slug_internal, website, status, verification_status, created_by_user_id, archived_at, archived_by_user_id, merged_into_organization_id, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'active', ?, ?, NULL, NULL, NULL, ?, ?)`,
        [organizationId, orgName, internalSlug, verificationStatus, auth.user.id, timestamp, timestamp],
      ),
      db.statement(
        `INSERT INTO organization_memberships (id, user_id, organization_id, role, billing_manager, status, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 1, 'active', ?, ?)`,
        [id('mem'), auth.user.id, organizationId, timestamp, timestamp],
      ),
      db.statement(
        `INSERT INTO profiles (id, owner_user_id, organization_id, primary_platform_identity_id, profile_type, username, display_name, bio, avatar_url, visibility, verification_status, seo_title, seo_description, published_at, created_at, updated_at)
         VALUES (?, NULL, ?, ?, 'project', ?, ?, '', NULL, 'private', ?, NULL, NULL, NULL, ?, ?)`,
        [profileId, organizationId, identity?.id || null, username, orgName, verificationStatus, timestamp, timestamp],
      ),
    ]);
  }

  await db.run(
    `INSERT INTO profile_username_history (id, profile_id, username, claimed_at, released_at, redirect_until, release_review_state)
     VALUES (?, ?, ?, ?, NULL, NULL, 'held')`,
    [id('puh'), profileId, username, timestamp],
  );

  const inviteOwnerType = body.accountType === 'creator' ? 'profile' : 'organization';
  const inviteOwnerId = body.accountType === 'creator' ? profileId : organizationId!;
  const initialInviteCredits = body.accountType === 'creator' ? 10 : 50;
  await db.batch([
    db.statement(
      `INSERT INTO invite_balances (id, owner_type, owner_id, available_credits, lifetime_granted, lifetime_used, quality_score, privileges_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)`,
      [id('ibal'), inviteOwnerType, inviteOwnerId, initialInviteCredits, initialInviteCredits, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO invite_ledger (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at)
       VALUES (?, ?, ?, 'grant', ?, 'initial_onboarding_allocation', NULL, ?)`,
      [id('iled'), inviteOwnerType, inviteOwnerId, initialInviteCredits, timestamp],
    ),
  ]);

  if (identity) {
    if (body.accountType === 'creator') {
      const ownerLink = await db.first<{ id: string }>(
        `SELECT id FROM platform_identity_links WHERE platform_identity_id = ? AND user_id = ? AND link_type = 'owns' AND ended_at IS NULL ORDER BY verified_at DESC LIMIT 1`,
        [identity.id, auth.user.id],
      );
      if (ownerLink) await db.run(`UPDATE platform_identity_links SET profile_id = ? WHERE id = ?`, [profileId, ownerLink.id]);
    } else {
      await db.run(
        `INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at)
         VALUES (?, ?, ?, ?, ?, 'represents', ?, NULL)`,
        [id('pil'), identity.id, auth.user.id, organizationId, profileId, timestamp],
      );
    }
  }

  await db.run(`UPDATE access_post_submissions SET status = 'consumed', consumed_at = ? WHERE user_id = ? AND status = 'authenticated'`, [timestamp, auth.user.id]);
  await db.run(
    `UPDATE invite_redemptions SET chosen_account_type = ?, organization_id = COALESCE(organization_id, ?)
     WHERE user_id = ? AND chosen_account_type IS NULL`,
    [body.accountType, organizationId, auth.user.id],
  );
  await db.run(
    `INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'user', 'onboarding.completed', 'profile', ?, ?, ?, ?)`,
    [id('aud'), auth.user.id, profileId, organizationId, JSON.stringify({ accountType: body.accountType, username, verificationStatus }), timestamp],
  );

  return json({
    profileId,
    organizationId,
    username,
    profileType: body.accountType,
    visibility: 'private',
    verificationStatus,
    initialInviteCredits,
  }, { status: 201 });
}
