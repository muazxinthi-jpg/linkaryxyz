import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

type CouponRow = {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed_cents' | 'fixed_price_cents';
  discount_value: number;
  access_until: string | null;
  access_duration_months: number | null;
};

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

function durationMonths(value: unknown): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 60) {
    throw new HttpError(400, 'Access duration must be between 1 and 60 whole months', 'coupon_access_duration_invalid');
  }
  return number;
}

async function supportsCouponAccessDuration(db: Db): Promise<boolean> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(discount_coupons)');
  return columns.some((column) => column.name === 'access_duration_months');
}

export async function updateAdminCouponAccessDuration(
  request: Request,
  env: Env,
  couponId: string,
): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ durationMonths?: unknown }>(request);
  if (!Object.prototype.hasOwnProperty.call(body, 'durationMonths')) {
    throw new HttpError(400, 'Access duration is required', 'coupon_access_duration_required');
  }
  const nextDuration = durationMonths(body.durationMonths);
  const db = new Db(requireDb(env));

  if (!(await supportsCouponAccessDuration(db))) {
    throw new ServiceConfigurationError('Coupon access-duration database migration is not applied');
  }

  const current = await db.first<CouponRow>(
    `SELECT id, code, discount_type, discount_value, access_until, access_duration_months
       FROM discount_coupons
      WHERE id = ?
      LIMIT 1`,
    [couponId],
  );
  if (!current) throw new HttpError(404, 'Coupon not found', 'coupon_not_found');
  if (current.discount_type !== 'percent' || current.discount_value !== 100) {
    throw new HttpError(400, 'Access duration is available only for 100% free-access coupons', 'coupon_access_duration_not_supported');
  }
  if (nextDuration !== null && current.access_until) {
    throw new HttpError(409, 'This coupon already uses a fixed Access until date. Remove that policy before setting a relative duration.', 'coupon_access_policy_conflict');
  }
  if (current.access_duration_months === nextDuration) {
    return json({ ok: true, couponId: current.id, code: current.code, accessDurationMonths: nextDuration }, {
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const timestamp = now();
  await db.batch([
    db.statement(
      'UPDATE discount_coupons SET access_duration_months = ?, updated_at = ? WHERE id = ?',
      [nextDuration, timestamp, couponId],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'billing_coupon.access_duration_updated', 'discount_coupon', ?, NULL, ?, ?)`,
      [newId('aud'), auth.user.id, couponId, JSON.stringify({
        code: current.code,
        before: { accessDurationMonths: current.access_duration_months },
        after: { accessDurationMonths: nextDuration },
      }), timestamp],
    ),
  ]);

  return json({ ok: true, couponId: current.id, code: current.code, accessDurationMonths: nextDuration }, {
    headers: { 'cache-control': 'private, no-store' },
  });
}
