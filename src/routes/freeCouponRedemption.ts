import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { requireAuth, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type OwnerType = 'user' | 'organization';
type ProfileRow = {
  id: string;
  profile_type: 'creator' | 'project';
  owner_user_id: string | null;
  organization_id: string | null;
};
type PlanRow = {
  id: string;
  code: string;
  name: string;
  billing_period: 'free' | 'monthly' | 'custom';
  base_price_cents: number | null;
  monthly_usage_credits: number;
};
type CouponRow = {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed_cents' | 'fixed_price_cents';
  discount_value: number;
  eligible_plan_codes_json: string;
  created_by_user_id: string | null;
};

function addOneMonth(iso: string): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function eligiblePlanCodes(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function requireFreeCouponGuards(db: Db): Promise<void> {
  const row = await db.first<{ present: number }>(
    `SELECT COUNT(*) AS present
       FROM sqlite_master
      WHERE type = 'trigger'
        AND name IN ('trg_free_coupon_total_limit','trg_free_coupon_user_limit','trg_free_coupon_org_limit')`,
  );
  if (Number(row?.present || 0) !== 3) {
    throw new ServiceConfigurationError('Free coupon redemption database migration is not applied');
  }
}

async function resolveOwner(db: Db, userId: string, profileId: string): Promise<{ profile: ProfileRow; ownerType: OwnerType; ownerId: string }> {
  const profile = await db.first<ProfileRow>(
    `SELECT id, profile_type, owner_user_id, organization_id
       FROM profiles
      WHERE id = ? AND visibility <> 'archived'`,
    [profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'billing_profile_not_found');

  if (profile.profile_type === 'creator') {
    if (profile.owner_user_id !== userId) throw new HttpError(403, 'Profile billing access unavailable', 'forbidden');
    return { profile, ownerType: 'user', ownerId: userId };
  }

  if (!profile.organization_id) throw new HttpError(409, 'Project billing identity is incomplete', 'billing_project_invalid');
  const membership = await db.first<{ role: string; billing_manager: number }>(
    `SELECT role, billing_manager
       FROM organization_memberships
      WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [profile.organization_id, userId],
  );
  if (!membership || (!['owner', 'admin'].includes(membership.role) && !membership.billing_manager)) {
    throw new HttpError(403, 'Project billing access requires Owner, Admin or Billing Manager access', 'forbidden');
  }
  return { profile, ownerType: 'organization', ownerId: profile.organization_id };
}

function planAllowed(profile: ProfileRow, planCode: string): boolean {
  if (profile.profile_type === 'creator') return planCode === 'personal_pro';
  return ['project_manual', 'project_automate', 'project_growth'].includes(planCode);
}

async function activePaidAccess(db: Db, ownerType: OwnerType, ownerId: string, timestamp: string): Promise<boolean> {
  const grantColumn = ownerType === 'user' ? 'user_id' : 'organization_id';
  const grant = await db.first<{ id: string }>(
    `SELECT id FROM billing_entitlement_grants
      WHERE ${grantColumn} = ? AND status = 'active' AND starts_at <= ?
        AND (ends_at IS NULL OR ends_at > ?)
      LIMIT 1`,
    [ownerId, timestamp, timestamp],
  );
  if (grant) return true;

  const subscription = await db.first<{ id: string }>(
    `SELECT id FROM billing_subscription_periods
      WHERE owner_type = ? AND owner_id = ? AND status = 'active'
        AND period_start <= ? AND period_end > ?
      LIMIT 1`,
    [ownerType, ownerId, timestamp, timestamp],
  );
  return Boolean(subscription);
}

export async function redeemFreeCoupon(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ profileId?: string; planCode?: string; couponCode?: string }>(request);
  const profileId = body.profileId?.trim();
  const planCode = body.planCode?.trim();
  const couponCode = body.couponCode?.trim().toUpperCase();
  if (!profileId || !planCode || !couponCode) {
    throw new HttpError(400, 'Profile, plan and coupon code are required', 'coupon_redemption_invalid');
  }

  const db = new Db(requireDb(env));
  const owner = await resolveOwner(db, auth.user.id, profileId);
  if (!planAllowed(owner.profile, planCode)) throw new HttpError(400, 'This plan is not available for the selected profile', 'billing_plan_ineligible');

  const plan = await db.first<PlanRow>(
    `SELECT id, code, name, billing_period, base_price_cents, monthly_usage_credits
       FROM billing_plans WHERE code = ? AND is_active = 1 LIMIT 1`,
    [planCode],
  );
  if (!plan || plan.billing_period !== 'monthly' || !plan.base_price_cents || plan.base_price_cents <= 0) {
    throw new HttpError(400, 'This plan cannot be redeemed with a coupon', 'billing_plan_unavailable');
  }

  const timestamp = now();
  const coupon = await db.first<CouponRow>(
    `SELECT id, code, discount_type, discount_value, eligible_plan_codes_json, created_by_user_id
       FROM discount_coupons
      WHERE upper(code) = ? AND is_active = 1
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at > ?)
      LIMIT 1`,
    [couponCode, timestamp, timestamp],
  );
  if (!coupon) throw new HttpError(400, 'Coupon is invalid or expired', 'coupon_invalid');
  const eligible = eligiblePlanCodes(coupon.eligible_plan_codes_json);
  if (eligible.length && !eligible.includes(plan.code)) throw new HttpError(400, 'Coupon does not apply to this plan', 'coupon_plan_ineligible');

  if (coupon.discount_type !== 'percent' || coupon.discount_value !== 100) {
    throw new HttpError(409, 'This coupon requires the normal paid checkout flow', 'coupon_not_free');
  }
  if (!coupon.created_by_user_id) {
    throw new ServiceConfigurationError('The 100% coupon is missing its Superadmin creator');
  }

  await requireFreeCouponGuards(db);
  if (await activePaidAccess(db, owner.ownerType, owner.ownerId, timestamp)) {
    throw new HttpError(409, 'This account already has active paid access. Redeem the coupon after the current access period ends.', 'coupon_active_entitlement');
  }

  const redemptionId = id('crd');
  const grantId = id('grant');
  const endsAt = addOneMonth(timestamp);
  const reason = `coupon_redemption:${redemptionId}:${coupon.code}`;
  const statements = [
    db.statement(
      `INSERT INTO coupon_redemptions
        (id, coupon_id, user_id, organization_id, plan_id, discount_cents, related_payment_id, redeemed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [redemptionId, coupon.id,
        owner.ownerType === 'user' ? owner.ownerId : null,
        owner.ownerType === 'organization' ? owner.ownerId : null,
        plan.id, plan.base_price_cents, timestamp],
    ),
    db.statement(
      `INSERT INTO billing_entitlement_grants
        (id, user_id, organization_id, plan_id, status, starts_at, ends_at, monthly_credit_override,
         reason, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, ?, ?, ?)`,
      [grantId,
        owner.ownerType === 'user' ? owner.ownerId : null,
        owner.ownerType === 'organization' ? owner.ownerId : null,
        plan.id, timestamp, endsAt, reason, coupon.created_by_user_id, timestamp, timestamp],
    ),
  ];

  if (plan.monthly_usage_credits > 0) {
    statements.push(db.statement(
      `INSERT OR IGNORE INTO usage_credit_ledger
        (id, owner_type, owner_id, transaction_type, amount, reason, feature_key, provider,
         related_id, idempotency_key, created_by_user_id, created_at)
       VALUES (?, ?, ?, 'monthly_grant', ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      [id('ucred'), owner.ownerType, owner.ownerId, plan.monthly_usage_credits,
        `${plan.code} 100% coupon entitlement credits`, redemptionId,
        `coupon-redemption:${redemptionId}:initial-credits`, coupon.created_by_user_id, timestamp],
    ));
  }

  statements.push(db.statement(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'user', 'billing_coupon.free_redeemed', 'coupon_redemption', ?, ?, ?, ?)`,
    [id('aud'), auth.user.id, redemptionId,
      owner.ownerType === 'organization' ? owner.ownerId : null,
      JSON.stringify({ couponId: coupon.id, couponCode: coupon.code, grantId, planCode: plan.code, periodStart: timestamp, periodEnd: endsAt }),
      timestamp],
  ));

  try {
    await db.batch(statements);
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    if (text.includes('coupon_redemption_limit')) throw new HttpError(409, 'Coupon redemption limit has been reached', 'coupon_exhausted');
    if (text.includes('coupon_account_redemption_limit')) throw new HttpError(409, 'Coupon is no longer available for this account', 'coupon_account_exhausted');
    throw error;
  }

  return json({
    ok: true,
    status: 'redeemed',
    couponCode: coupon.code,
    finalPriceCents: 0,
    plan: { code: plan.code, name: plan.name },
    periodStart: timestamp,
    periodEnd: endsAt,
    monthlyUsageCredits: plan.monthly_usage_credits,
  }, { status: 201, headers: { 'cache-control': 'private, no-store' } });
}
