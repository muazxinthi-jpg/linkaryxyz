import type { Env } from './env';
import type { Db } from './db/client';

export type PlatformProfileType = 'creator' | 'project';
export type SuperadminPlatformPlan = 'personal_pro' | 'project_growth';

/**
 * Platform-owner access unlocks the highest relevant public feature set for the
 * canonical Superadmin without manufacturing a subscription or coupon.
 *
 * Authorization still happens before this helper is used: Personal profiles
 * must belong to the actor and Project profiles still require active Project
 * membership. This helper changes feature entitlement only, never data access.
 */
export function superadminPlatformPlan(isSuperadmin: boolean, profileType: PlatformProfileType): SuperadminPlatformPlan | null {
  if (!isSuperadmin) return null;
  return profileType === 'creator' ? 'personal_pro' : 'project_growth';
}

/**
 * AI runtime does not receive an AuthContext, so re-check the canonical owner
 * directly before exempting the platform owner from per-account Usage Credit
 * balance. This intentionally fails closed when SUPERADMIN_EMAIL is missing.
 */
export async function isCanonicalSuperadminUser(db: Db, env: Env, userId: string): Promise<boolean> {
  const configuredEmail = env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return false;

  const row = await db.first<{ email: string | null; grant_id: string | null }>(
    `SELECT u.email, ag.id AS grant_id
       FROM users u
       LEFT JOIN admin_grants ag
         ON ag.user_id = u.id
        AND ag.role = 'superadmin'
        AND ag.status = 'active'
      WHERE u.id = ? AND u.status = 'active'
      LIMIT 1`,
    [userId],
  );

  return Boolean(
    row?.grant_id
    && row.email?.trim().toLowerCase() === configuredEmail,
  );
}
