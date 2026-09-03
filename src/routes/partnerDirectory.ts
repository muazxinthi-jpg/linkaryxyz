import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

type ManagerType = 'community_manager' | 'kol_manager';
type AssetType = 'telegram_community' | 'kol_creator';

type TelegramIdentity = {
  id: string;
  current_handle: string | null;
  current_display_name: string | null;
  ownership_verified_at: string | null;
};

function safeUrl(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new HttpError(400, 'Enter a valid URL', 'invalid_url');
  }
}

function cleanHandle(value: string | undefined | null): string | null {
  return value?.trim().replace(/^@/, '').slice(0, 80) || null;
}

async function telegramIdentityForUser(db: Db, userId: string): Promise<TelegramIdentity | null> {
  return db.first<TelegramIdentity>(
    `SELECT pi.id, pi.current_handle, pi.current_display_name, pi.ownership_verified_at
       FROM platform_identities pi
       JOIN platform_identity_links pil ON pil.platform_identity_id = pi.id
      WHERE pi.platform = 'telegram'
        AND pi.provider_object_type = 'person'
        AND pi.status = 'active'
        AND pi.ownership_verified_at IS NOT NULL
        AND pil.user_id = ?
        AND pil.link_type = 'owns'
        AND pil.ended_at IS NULL
      ORDER BY pil.verified_at DESC
      LIMIT 1`,
    [userId],
  );
}

async function requireTelegramIdentity(db: Db, userId: string): Promise<TelegramIdentity> {
  const identity = await telegramIdentityForUser(db, userId);
  if (!identity) {
    throw new HttpError(403, 'Verify your personal Telegram account before listing or managing Telegram communities.', 'telegram_identity_required');
  }
  return identity;
}

async function requireOwnedCreatorProfile(db: Db, userId: string, profileId: string) {
  const profile = await db.first<{ id: string; display_name: string; profile_type: string; owner_user_id: string | null }>(
    'SELECT id, display_name, profile_type, owner_user_id FROM profiles WHERE id = ?',
    [profileId],
  );
  if (!profile || profile.profile_type !== 'creator' || profile.owner_user_id !== userId) {
    throw new HttpError(403, 'Only your personal Linkary profile can create a manager listing', 'forbidden');
  }
  return profile;
}

async function requireOwnedManager(db: Db, userId: string, managerId: string) {
  const manager = await db.first<{ id: string; profile_id: string; manager_type: ManagerType }>(
    `SELECT m.id, m.profile_id, m.manager_type
       FROM partner_managers m
       JOIN profiles p ON p.id = m.profile_id
      WHERE m.id = ? AND p.owner_user_id = ? AND p.profile_type = 'creator'`,
    [managerId, userId],
  );
  if (!manager) throw new HttpError(403, 'Manager listing access denied', 'forbidden');
  return manager;
}

export async function listPartnerManagers(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const url = new URL(request.url);
  const type = url.searchParams.get('type') as ManagerType | null;
  if (type && !['community_manager', 'kol_manager'].includes(type)) throw new HttpError(400, 'Choose a valid manager type', 'invalid_manager_type');
  const search = url.searchParams.get('search')?.trim().toLowerCase();
  const managerId = url.searchParams.get('managerId')?.trim();
  const clauses = [`m.visibility = 'public'`];
  const params: unknown[] = [];
  if (type) { clauses.push('m.manager_type = ?'); params.push(type); }
  if (managerId) { clauses.push('m.id = ?'); params.push(managerId); }
  if (search) {
    const term = `%${search}%`;
    clauses.push(`(lower(m.display_name) LIKE ? OR lower(m.headline) LIKE ? OR lower(m.bio) LIKE ? OR lower(COALESCE(m.x_handle,'')) LIKE ? OR EXISTS (SELECT 1 FROM partner_manager_assets sa WHERE sa.manager_id = m.id AND (lower(sa.name) LIKE ? OR lower(COALESCE(sa.handle,'')) LIKE ?)))`);
    params.push(term, term, term, term, term, term);
  }

  const managers = await db.all<{
    id: string; profile_id: string; manager_type: ManagerType; display_name: string; headline: string; bio: string;
    x_handle: string | null; telegram_contact: string | null; email: string | null; website_url: string | null;
    verification_status: string; open_to_campaigns: number; updated_at: string; asset_count: number; combined_audience: number;
    estimated_unique_audience: number | null; audience_confidence: string | null; audience_methodology: string | null;
  }>(
    `SELECT m.id, m.profile_id, m.manager_type, m.display_name, m.headline, m.bio, m.x_handle, m.telegram_contact,
            m.email, m.website_url, m.verification_status, m.open_to_campaigns, m.updated_at,
            COUNT(a.id) AS asset_count,
            COALESCE(SUM(a.audience_size), 0) AS combined_audience,
            e.estimated_unique_audience,
            e.confidence AS audience_confidence,
            e.methodology AS audience_methodology
       FROM partner_managers m
       LEFT JOIN partner_manager_assets a ON a.manager_id = m.id
       LEFT JOIN partner_manager_audience_estimates e ON e.manager_id = m.id
      WHERE ${clauses.join(' AND ')}
      GROUP BY m.id
      ORDER BY m.verification_status = 'verified' DESC, m.updated_at DESC
      LIMIT 250`,
    params,
  );

  const telegramIdentity = await telegramIdentityForUser(db, auth.user.id);
  return json({
    telegram_identity: telegramIdentity ? {
      verified: true,
      current_handle: telegramIdentity.current_handle,
      current_display_name: telegramIdentity.current_display_name,
      ownership_verified_at: telegramIdentity.ownership_verified_at,
    } : null,
    managers: managers.map((manager) => {
      const combined = Number(manager.combined_audience || 0);
      const unique = manager.estimated_unique_audience === null || manager.estimated_unique_audience === undefined ? null : Number(manager.estimated_unique_audience);
      const overlapRate = unique !== null && combined > 0 ? Math.max(0, Math.min(1, 1 - (unique / combined))) : null;
      return {
        ...manager,
        asset_count: Number(manager.asset_count || 0),
        combined_audience: combined,
        estimated_unique_audience: unique,
        overlap_rate: overlapRate,
        open_to_campaigns: Boolean(manager.open_to_campaigns),
      };
    }),
  });
}

export async function savePartnerManager(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    managerId?: string;
    profileId?: string;
    managerType?: ManagerType;
    displayName?: string;
    headline?: string;
    bio?: string;
    xHandle?: string;
    telegramContact?: string;
    email?: string;
    websiteUrl?: string;
    visibility?: 'public' | 'private';
    openToCampaigns?: boolean;
    estimatedUniqueAudience?: number | null;
    audienceMethodology?: string;
  }>(request);
  const db = new Db(requireDb(env));

  let managerId = body.managerId;
  if (managerId) {
    const existing = await requireOwnedManager(db, auth.user.id, managerId);
    const telegramIdentity = existing.manager_type === 'community_manager' ? await requireTelegramIdentity(db, auth.user.id) : null;
    const displayName = body.displayName?.trim().slice(0, 120);
    if (!displayName) throw new HttpError(400, 'Display name is required', 'invalid_manager');
    await db.run(
      `UPDATE partner_managers SET display_name = ?, headline = ?, bio = ?, x_handle = ?, telegram_contact = ?, email = ?, website_url = ?, visibility = ?, open_to_campaigns = ?, updated_at = ? WHERE id = ?`,
      [displayName, body.headline?.trim().slice(0, 160) || '', body.bio?.trim().slice(0, 800) || '', cleanHandle(body.xHandle), telegramIdentity?.current_handle || body.telegramContact?.trim().slice(0, 120) || null, body.email?.trim().slice(0, 160) || null, safeUrl(body.websiteUrl), body.visibility === 'private' ? 'private' : 'public', body.openToCampaigns === false ? 0 : 1, now(), managerId],
    );
    if (body.estimatedUniqueAudience !== undefined) await saveAudienceEstimate(db, managerId, body.estimatedUniqueAudience, body.audienceMethodology || '');
    return json({ ok: true, id: managerId, managerType: existing.manager_type });
  }

  if (!body.profileId || !body.managerType || !['community_manager', 'kol_manager'].includes(body.managerType)) throw new HttpError(400, 'Profile and manager type are required', 'invalid_manager');
  const profile = await requireOwnedCreatorProfile(db, auth.user.id, body.profileId);
  const telegramIdentity = body.managerType === 'community_manager' ? await requireTelegramIdentity(db, auth.user.id) : null;
  const displayName = body.displayName?.trim().slice(0, 120) || profile.display_name;
  const existing = await db.first<{ id: string }>('SELECT id FROM partner_managers WHERE profile_id = ? AND manager_type = ?', [body.profileId, body.managerType]);
  if (existing) throw new HttpError(409, 'This manager listing already exists', 'manager_exists');
  managerId = id('mgr');
  const timestamp = now();
  await db.run(
    `INSERT INTO partner_managers (id, profile_id, manager_type, display_name, headline, bio, x_handle, telegram_contact, email, website_url, visibility, verification_status, open_to_campaigns, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?, ?)`,
    [managerId, body.profileId, body.managerType, displayName, body.headline?.trim().slice(0, 160) || '', body.bio?.trim().slice(0, 800) || '', cleanHandle(body.xHandle), telegramIdentity?.current_handle || body.telegramContact?.trim().slice(0, 120) || null, body.email?.trim().slice(0, 160) || null, safeUrl(body.websiteUrl), body.visibility === 'private' ? 'private' : 'public', body.openToCampaigns === false ? 0 : 1, auth.user.id, timestamp, timestamp],
  );
  if (body.estimatedUniqueAudience !== undefined) await saveAudienceEstimate(db, managerId, body.estimatedUniqueAudience, body.audienceMethodology || '');
  return json({ id: managerId }, { status: 201 });
}

async function saveAudienceEstimate(db: Db, managerId: string, value: number | null, methodology: string) {
  if (value !== null && (!Number.isFinite(value) || value < 0)) throw new HttpError(400, 'Unique audience must be a positive number', 'invalid_audience');
  const combined = await db.first<{ total: number }>('SELECT COALESCE(SUM(audience_size), 0) AS total FROM partner_manager_assets WHERE manager_id = ?', [managerId]);
  if (value !== null && Number(combined?.total || 0) > 0 && value > Number(combined?.total || 0)) throw new HttpError(400, 'Estimated unique audience cannot exceed combined audience', 'invalid_audience');
  await db.run(
    `INSERT INTO partner_manager_audience_estimates (manager_id, estimated_unique_audience, methodology, confidence, updated_at)
     VALUES (?, ?, ?, 'manual', ?)
     ON CONFLICT(manager_id) DO UPDATE SET estimated_unique_audience = excluded.estimated_unique_audience, methodology = excluded.methodology, confidence = 'manual', updated_at = excluded.updated_at`,
    [managerId, value, methodology.trim().slice(0, 500), now()],
  );
}

export async function listPartnerManagerAssets(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const managerId = new URL(request.url).searchParams.get('managerId');
  if (!managerId) throw new HttpError(400, 'managerId is required', 'manager_required');
  const db = new Db(requireDb(env));
  const manager = await db.first<{ visibility: string }>('SELECT visibility FROM partner_managers WHERE id = ?', [managerId]);
  if (!manager || manager.visibility !== 'public') throw new HttpError(404, 'Manager listing not found', 'manager_not_found');
  const assets = await db.all(
    `SELECT id, asset_type, name, platform, handle, url, audience_size, verification_status, notes, updated_at
       FROM partner_manager_assets WHERE manager_id = ? ORDER BY audience_size DESC, name ASC LIMIT 500`,
    [managerId],
  );
  return json({ assets });
}

export async function savePartnerManagerAsset(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    managerId?: string; assetId?: string; name?: string; platform?: string; handle?: string; url?: string; audienceSize?: number; notes?: string; remove?: boolean;
  }>(request);
  const db = new Db(requireDb(env));
  if (!body.managerId) throw new HttpError(400, 'Manager is required', 'manager_required');
  const manager = await requireOwnedManager(db, auth.user.id, body.managerId);
  if (manager.manager_type === 'community_manager') await requireTelegramIdentity(db, auth.user.id);

  if (body.assetId) {
    const asset = await db.first<{ id: string }>('SELECT id FROM partner_manager_assets WHERE id = ? AND manager_id = ?', [body.assetId, body.managerId]);
    if (!asset) throw new HttpError(404, 'Portfolio item not found', 'asset_not_found');
    if (body.remove) {
      await db.run('DELETE FROM partner_manager_assets WHERE id = ? AND manager_id = ?', [body.assetId, body.managerId]);
      return json({ ok: true, removed: true });
    }
    if (!body.name?.trim()) throw new HttpError(400, 'Name is required', 'invalid_asset');
    const audience = Number(body.audienceSize || 0);
    if (!Number.isFinite(audience) || audience < 0) throw new HttpError(400, 'Audience size must be zero or greater', 'invalid_audience');
    await db.run(
      `UPDATE partner_manager_assets SET name = ?, platform = ?, handle = ?, url = ?, audience_size = ?, notes = ?, verification_status = CASE WHEN COALESCE(handle,'') != COALESCE(?, '') OR COALESCE(url,'') != COALESCE(?, '') THEN 'unverified' ELSE verification_status END, updated_at = ? WHERE id = ? AND manager_id = ?`,
      [body.name.trim().slice(0, 140), body.platform?.trim().slice(0, 60) || '', cleanHandle(body.handle), safeUrl(body.url), Math.round(audience), body.notes?.trim().slice(0, 500) || '', cleanHandle(body.handle), safeUrl(body.url), now(), body.assetId, body.managerId],
    );
    return json({ ok: true, id: body.assetId });
  }

  if (!body.name?.trim()) throw new HttpError(400, 'Name is required', 'invalid_asset');
  const audience = Number(body.audienceSize || 0);
  if (!Number.isFinite(audience) || audience < 0) throw new HttpError(400, 'Audience size must be zero or greater', 'invalid_audience');
  const assetType: AssetType = manager.manager_type === 'community_manager' ? 'telegram_community' : 'kol_creator';
  const assetId = id('asset');
  const timestamp = now();
  await db.run(
    `INSERT INTO partner_manager_assets (id, manager_id, asset_type, name, platform, handle, url, audience_size, verification_status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?)`,
    [assetId, body.managerId, assetType, body.name.trim().slice(0, 140), manager.manager_type === 'community_manager' ? 'Telegram' : body.platform?.trim().slice(0, 60) || 'X', cleanHandle(body.handle), safeUrl(body.url), Math.round(audience), body.notes?.trim().slice(0, 500) || '', timestamp, timestamp],
  );
  return json({ id: assetId }, { status: 201 });
}
