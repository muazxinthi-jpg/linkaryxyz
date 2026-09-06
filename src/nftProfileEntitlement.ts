import type { Env } from './env';
import { requireDb } from './env';
import { Db } from './db/client';
import { requireAuth } from './auth/session';
import { HttpError } from './http';

const PERSONAL_NFT_PLAN_CODE = 'personal_pro';

type ProfileAccessRow = {
  id: string;
  profile_type: 'creator' | 'project';
  owner_user_id: string | null;
};

async function activePersonalPlanCode(db: Db, userId: string): Promise<string> {
  const now = new Date().toISOString();

  try {
    const grant = await db.first<{ code: string }>(
      `SELECT bp.code
         FROM billing_entitlement_grants beg
         JOIN billing_plans bp ON bp.id = beg.plan_id
        WHERE beg.user_id = ?
          AND beg.status = 'active'
          AND beg.starts_at <= ?
          AND (beg.ends_at IS NULL OR beg.ends_at > ?)
        ORDER BY beg.created_at DESC
        LIMIT 1`,
      [userId, now, now],
    );
    if (grant?.code) return grant.code;
  } catch {
    // A missing/unavailable billing table must fail closed to the Free plan.
  }

  try {
    const subscription = await db.first<{ code: string }>(
      `SELECT bp.code
         FROM billing_subscription_periods bsp
         JOIN billing_plans bp ON bp.id = bsp.plan_id
        WHERE bsp.owner_type = 'user'
          AND bsp.owner_id = ?
          AND bsp.status = 'active'
          AND bsp.period_start <= ?
          AND bsp.period_end > ?
        ORDER BY bsp.period_end DESC
        LIMIT 1`,
      [userId, now, now],
    );
    if (subscription?.code) return subscription.code;
  } catch {
    // A missing/unavailable billing table must fail closed to the Free plan.
  }

  return 'free';
}

/**
 * Enforces the already-locked Personal Pro NFT feature boundary.
 *
 * Project profiles are deliberately left unchanged by this focused Beta repair.
 * Generic HTTPS profile images also remain a Free feature. The entitlement is
 * for Linkary's NFT-aware workflow: wallet discovery, NFT selection and NFT
 * showcase/profile blocks, not for policing the visual contents of an image.
 */
export async function requirePersonalNftEntitlement(request: Request, env: Env, profileId: string): Promise<void> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profile = await db.first<ProfileAccessRow>(
    `SELECT id, profile_type, owner_user_id
       FROM profiles
      WHERE id = ? AND visibility <> 'archived'
      LIMIT 1`,
    [profileId],
  );

  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  if (profile.profile_type !== 'creator') return;

  // Preserve the existing profile authorization boundary and avoid leaking plan
  // information for a profile the current user does not own.
  if (profile.owner_user_id !== auth.user.id) return;

  const planCode = await activePersonalPlanCode(db, auth.user.id);
  if (planCode !== PERSONAL_NFT_PLAN_CODE) {
    throw new HttpError(
      402,
      'NFT profile features are available with Personal Pro / Collector.',
      'nft_profile_upgrade_required',
    );
  }
}
