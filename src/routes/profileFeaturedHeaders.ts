import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const CTA_TYPES = new Set(['join','register','book_now','learn_more','visit','explore','trade','mint','buy','view']);

interface ProfileAccessRow {
  id: string;
  owner_user_id: string | null;
  organization_id: string | null;
}

async function requireProfileManager(db: Db, profileId: string, userId: string): Promise<void> {
  const profile = await db.first<ProfileAccessRow>(`SELECT id, owner_user_id, organization_id FROM profiles WHERE id = ?`, [profileId]);
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  if (profile.owner_user_id === userId) return;
  if (profile.organization_id) {
    const membership = await db.first<{ id: string }>(
      `SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner','admin','marketing_manager') LIMIT 1`,
      [profile.organization_id, userId],
    );
    if (membership) return;
  }
  throw new HttpError(403, 'Profile management access required', 'profile_forbidden');
}

function safeHttpUrl(value: unknown, field: string): string {
  const raw = String(value || '').trim();
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    return url.toString();
  } catch {
    throw new HttpError(400, `${field} must be a valid http(s) URL`, `invalid_${field}`);
  }
}

export async function getFeaturedHeader(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireProfileManager(db, profileId, auth.user.id);
  const header = await db.first(
    `SELECT id, profile_id, preferred_project_profile_id, project_name, banner_url, destination_url, tracking_code, cta_type, enabled,
            impressions_count, banner_clicks_count, cta_clicks_count, created_at, updated_at
       FROM profile_featured_headers WHERE profile_id = ?`,
    [profileId],
  );
  return json({ header: header || null });
}

export async function upsertFeaturedHeader(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    enabled?: boolean;
    preferredProjectProfileId?: string | null;
    projectName?: string;
    bannerUrl?: string;
    destinationUrl?: string;
    ctaType?: string;
  }>(request);
  const db = new Db(requireDb(env));
  await requireProfileManager(db, profileId, auth.user.id);

  const projectName = String(body.projectName || '').trim();
  if (!projectName || projectName.length > 120) throw new HttpError(400, 'Project name is required', 'invalid_project_name');
  const bannerUrl = safeHttpUrl(body.bannerUrl, 'banner_url');
  const destinationUrl = safeHttpUrl(body.destinationUrl, 'destination_url');
  const ctaType = String(body.ctaType || 'visit').trim();
  if (!CTA_TYPES.has(ctaType)) throw new HttpError(400, 'Invalid CTA', 'invalid_cta_type');

  let preferredProjectProfileId: string | null = null;
  if (body.preferredProjectProfileId) {
    const preferred = await db.first<{ id: string }>(`SELECT id FROM profiles WHERE id = ?`, [body.preferredProjectProfileId]);
    if (!preferred) throw new HttpError(400, 'Preferred project profile not found', 'preferred_project_not_found');
    preferredProjectProfileId = preferred.id;
  }

  const timestamp = now();
  const existing = await db.first<{ id: string; tracking_code: string }>(`SELECT id, tracking_code FROM profile_featured_headers WHERE profile_id = ?`, [profileId]);
  if (existing) {
    await db.run(
      `UPDATE profile_featured_headers
          SET owner_user_id = ?, preferred_project_profile_id = ?, project_name = ?, banner_url = ?, destination_url = ?, cta_type = ?, enabled = ?, updated_at = ?
        WHERE id = ?`,
      [auth.user.id, preferredProjectProfileId, projectName, bannerUrl, destinationUrl, ctaType, body.enabled === false ? 0 : 1, timestamp, existing.id],
    );
    return json({ ok: true, id: existing.id, trackingCode: existing.tracking_code });
  }

  const headerId = makeId('pfh');
  const trackingCode = crypto.randomUUID().replace(/-/g, '');
  await db.run(
    `INSERT INTO profile_featured_headers
      (id, profile_id, owner_user_id, preferred_project_profile_id, project_name, banner_url, destination_url, tracking_code, cta_type, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [headerId, profileId, auth.user.id, preferredProjectProfileId, projectName, bannerUrl, destinationUrl, trackingCode, ctaType, body.enabled === false ? 0 : 1, timestamp, timestamp],
  );
  return json({ ok: true, id: headerId, trackingCode }, { status: 201 });
}
