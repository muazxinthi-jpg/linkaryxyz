import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

const DISCOUNT_TYPES = new Set(['percent', 'fixed_cents', 'fixed_price_cents']);

type DiscountType = 'percent' | 'fixed_cents' | 'fixed_price_cents';

type CouponRow = {
  id: string;
  code: string;
  label: string;
  discount_type: DiscountType;
  discount_value: number;
  eligible_plan_codes_json: string;
  max_redemptions: number | null;
  max_redemptions_per_account: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
  stackable: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  redeemed_count: number;
  reserved_count: number;
};

type PlanRow = {
  code: string;
  name: string;
  base_price_cents: number;
};

function now(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Coupon code is required', 'coupon_code_required');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new HttpError(400, 'Coupon code must be 3-40 characters using letters, numbers, _ or -', 'coupon_code_invalid');
  }
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

function parsePlanCodes(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function paidPlans(db: Db): Promise<PlanRow[]> {
  return db.all<PlanRow>(
    `SELECT code, name, base_price_cents
       FROM billing_plans
      WHERE is_active = 1
        AND billing_period = 'monthly'
        AND base_price_cents IS NOT NULL
        AND base_price_cents > 0
      ORDER BY display_order ASC, name ASC`,
  );
}

function validateDiscount(discountType: DiscountType, discountValue: number, plans: PlanRow[]): void {
  if (discountType === 'percent') {
    if (discountValue > 99) throw new HttpError(400, 'Percentage coupons must be between 1% and 99%. Use a Superadmin comped plan grant for free access.', 'coupon_zero_price_not_allowed');
    return;
  }
  if (discountType === 'fixed_price_cents') {
    if (plans.some((plan) => discountValue >= plan.base_price_cents)) {
      throw new HttpError(400, 'Final-price coupon must stay below the normal price of every eligible plan.', 'coupon_discount_invalid');
    }
    return;
  }
  if (plans.some((plan) => discountValue >= plan.base_price_cents)) {
    throw new HttpError(400, 'Fixed discount must leave a positive checkout price for every eligible plan. Use a Superadmin comped plan grant for free access.', 'coupon_zero_price_not_allowed');
  }
}

async function auditCoupon(db: Db, actorUserId: string, action: string, couponId: string, metadata: unknown): Promise<void> {
  await db.run(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', ?, 'discount_coupon', ?, NULL, ?, ?)`,
    [newId('aud'), actorUserId, action, couponId, JSON.stringify(metadata), now()],
  );
}

export async function listAdminCoupons(request: Request, env: Env): Promise<Response> {
  await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const timestamp = now();
  const [plans, rows] = await Promise.all([
    paidPlans(db),
    db.all<CouponRow>(
      `SELECT dc.*,
              (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = dc.id) AS redeemed_count,
              (SELECT COUNT(*) FROM billing_coupon_reservations br
                WHERE br.coupon_id = dc.id
                  AND br.status = 'reserved'
                  AND br.expires_at > ?) AS reserved_count
         FROM discount_coupons dc
        ORDER BY dc.created_at DESC
        LIMIT 250`,
      [timestamp],
    ),
  ]);

  return json({
    plans,
    coupons: rows.map((row) => ({
      id: row.id,
      code: row.code,
      label: row.label,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      eligiblePlanCodes: parsePlanCodes(row.eligible_plan_codes_json),
      maxRedemptions: row.max_redemptions,
      maxRedemptionsPerAccount: row.max_redemptions_per_account,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      active: Boolean(row.is_active),
      stackable: Boolean(row.stackable),
      redeemedCount: Number(row.redeemed_count || 0),
      reservedCount: Number(row.reserved_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }, { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

export async function createAdminCoupon(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    code?: unknown;
    label?: unknown;
    discountType?: unknown;
    discountValue?: unknown;
    eligiblePlanCodes?: unknown;
    maxRedemptions?: unknown;
    maxRedemptionsPerAccount?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    stackable?: unknown;
  }>(request);

  const db = new Db(requireDb(env));
  const code = normalizeCode(body.code);
  const label = cleanLabel(body.label);
  if (typeof body.discountType !== 'string' || !DISCOUNT_TYPES.has(body.discountType)) {
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
  const eligiblePlans = requestedCodes.map((codeValue) => planMap.get(codeValue)).filter((plan): plan is PlanRow => Boolean(plan));
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

  const existing = await db.first<{ id: string }>('SELECT id FROM discount_coupons WHERE code = ? LIMIT 1', [code]);
  if (existing) throw new HttpError(409, 'That coupon code already exists', 'coupon_code_exists');

  await db.run(
    `INSERT INTO discount_coupons
      (id, code, label, discount_type, discount_value, eligible_plan_codes_json,
       max_redemptions, max_redemptions_per_account, starts_at, ends_at,
       is_active, stackable, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [couponId, code, label, discountType, discountValue, JSON.stringify(requestedCodes), maxRedemptions,
      maxRedemptionsPerAccount, startsAt, endsAt, stackable ? 1 : 0, auth.user.id, timestamp, timestamp],
  );
  await auditCoupon(db, auth.user.id, 'billing_coupon.created', couponId, {
    after: { code, label, discountType, discountValue, eligiblePlanCodes: requestedCodes, maxRedemptions, maxRedemptionsPerAccount, startsAt, endsAt, stackable, active: true },
  });

  return json({ ok: true, couponId, code }, { status: 201, headers: { 'cache-control': 'private, no-store' } });
}

export async function updateAdminCouponStatus(request: Request, env: Env, couponId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ active?: unknown }>(request);
  if (typeof body.active !== 'boolean') throw new HttpError(400, 'Coupon active status is required', 'coupon_status_invalid');
  const db = new Db(requireDb(env));
  const current = await db.first<CouponRow>('SELECT dc.*, 0 AS redeemed_count, 0 AS reserved_count FROM discount_coupons dc WHERE dc.id = ? LIMIT 1', [couponId]);
  if (!current) throw new HttpError(404, 'Coupon not found', 'coupon_not_found');
  const next = body.active ? 1 : 0;
  if (current.is_active === next) return json({ ok: true, active: body.active });
  const timestamp = now();
  await db.run('UPDATE discount_coupons SET is_active = ?, updated_at = ? WHERE id = ?', [next, timestamp, couponId]);
  await auditCoupon(db, auth.user.id, body.active ? 'billing_coupon.activated' : 'billing_coupon.deactivated', couponId, {
    before: { active: Boolean(current.is_active), code: current.code },
    after: { active: body.active, code: current.code },
  });
  return json({ ok: true, active: body.active }, { headers: { 'cache-control': 'private, no-store' } });
}
