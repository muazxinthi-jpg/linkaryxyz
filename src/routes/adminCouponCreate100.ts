import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

type DiscountType = 'percent' | 'fixed_cents' | 'fixed_price_cents';
type PlanRow = { code: string; name: string; base_price_cents: number };

const DISCOUNT_TYPES = new Set<DiscountType>(['percent', 'fixed_cents', 'fixed_price_cents']);
const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Coupon code is required', 'coupon_code_required');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new HttpError(400, 'Coupon code must be 3-40 characters using letters, numbers, _ or -', 'coupon_code_invalid');
  return code;
}

function cleanLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Coupon label is required', 'coupon_label_required');
  return value.trim().slice(0, 100);
}

function optionalPositiveInt(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, `${field} must be a positive whole number`, 'coupon_limit_invalid');
  return number;
}

function requiredPositiveInt(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, `${field} must be a positive whole number`, 'coupon_value_invalid');
  return number;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, `${field} is invalid`, 'coupon_date_invalid');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field} is invalid`, 'coupon_date_invalid');
  return date.toISOString();
}

async function paidPlans(db: Db): Promise<PlanRow[]> {
  return db.all<PlanRow>(
    `SELECT code, name, base_price_cents FROM billing_plans
      WHERE is_active = 1 AND billing_period = 'monthly'
        AND base_price_cents IS NOT NULL AND base_price_cents > 0
      ORDER BY display_order ASC, name ASC`,
  );
}

function validateDiscount(type: DiscountType, value: number, plans: PlanRow[]): void {
  if (type === 'percent') {
    if (value > 100) throw new HttpError(400, 'Percentage coupons must be between 1% and 100%.', 'coupon_discount_invalid');
    return;
  }
  if (type === 'fixed_price_cents') {
    if (plans.some((plan) => value >= plan.base_price_cents)) {
      throw new HttpError(400, 'Final-price coupon must stay below the normal price of every eligible plan.', 'coupon_discount_invalid');
    }
    return;
  }
  if (plans.some((plan) => value >= plan.base_price_cents)) {
    throw new HttpError(400, 'Fixed discount must leave a positive checkout price for every eligible plan. Use 100% percent-off for a tracked free coupon.', 'coupon_zero_price_not_allowed');
  }
}

export async function createAdminCoupon100(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    code?: unknown; label?: unknown; discountType?: unknown; discountValue?: unknown;
    eligiblePlanCodes?: unknown; maxRedemptions?: unknown; maxRedemptionsPerAccount?: unknown;
    startsAt?: unknown; endsAt?: unknown; stackable?: unknown;
  }>(request);
  const db = new Db(requireDb(env));
  const code = normalizeCode(body.code);
  const label = cleanLabel(body.label);
  if (typeof body.discountType !== 'string' || !DISCOUNT_TYPES.has(body.discountType as DiscountType)) {
    throw new HttpError(400, 'Choose a valid coupon discount type', 'coupon_discount_type_invalid');
  }
  const discountType = body.discountType as DiscountType;
  const discountValue = requiredPositiveInt(body.discountValue, 'Discount value');
  const allPlans = await paidPlans(db);
  const requestedCodes = Array.isArray(body.eligiblePlanCodes)
    ? Array.from(new Set(body.eligiblePlanCodes.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
    : [];
  if (!requestedCodes.length) throw new HttpError(400, 'Choose at least one eligible paid plan', 'coupon_plan_required');
  const planMap = new Map(allPlans.map((plan) => [plan.code, plan]));
  const eligiblePlans = requestedCodes.map((value) => planMap.get(value)).filter((plan): plan is PlanRow => Boolean(plan));
  if (eligiblePlans.length !== requestedCodes.length) throw new HttpError(400, 'One or more eligible plans are invalid', 'coupon_plan_invalid');
  validateDiscount(discountType, discountValue, eligiblePlans);

  const maxRedemptions = optionalPositiveInt(body.maxRedemptions, 'Maximum redemptions');
  const maxRedemptionsPerAccount = optionalPositiveInt(body.maxRedemptionsPerAccount, 'Per-account redemption limit') ?? 1;
  const startsAt = optionalDate(body.startsAt, 'Start date') || now();
  const endsAt = optionalDate(body.endsAt, 'End date');
  if (endsAt && endsAt <= startsAt) throw new HttpError(400, 'Coupon end date must be after its start date', 'coupon_date_invalid');
  const stackable = body.stackable === true;
  const couponId = newId('cpn');
  const timestamp = now();
  if (await db.first<{ id: string }>('SELECT id FROM discount_coupons WHERE code = ? LIMIT 1', [code])) {
    throw new HttpError(409, 'That coupon code already exists', 'coupon_code_exists');
  }

  await db.batch([
    db.statement(
      `INSERT INTO discount_coupons
        (id, code, label, discount_type, discount_value, eligible_plan_codes_json,
         max_redemptions, max_redemptions_per_account, starts_at, ends_at,
         is_active, stackable, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [couponId, code, label, discountType, discountValue, JSON.stringify(requestedCodes), maxRedemptions,
        maxRedemptionsPerAccount, startsAt, endsAt, stackable ? 1 : 0, auth.user.id, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'billing_coupon.created', 'discount_coupon', ?, NULL, ?, ?)`,
      [newId('aud'), auth.user.id, couponId, JSON.stringify({
        after: { code, label, discountType, discountValue, eligiblePlanCodes: requestedCodes,
          maxRedemptions, maxRedemptionsPerAccount, startsAt, endsAt, stackable, active: true,
          zeroValueRedemption: discountType === 'percent' && discountValue === 100 },
      }), timestamp],
    ),
  ]);

  return json({ ok: true, couponId, code }, { status: 201, headers: { 'cache-control': 'private, no-store' } });
}
