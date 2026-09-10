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
  starts_at: string | null;
  ends_at: string | null;
  access_until: string | null;
};

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

function requiredDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'Access until date is required', 'coupon_access_until_required');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Access until date is invalid', 'coupon_date_invalid');
  return date.toISOString();
}

async function supportsCouponAccessUntil(db: Db): Promise<boolean> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(discount_coupons)');
  return columns.some((column) => column.name === 'access_until');
}

export async function updateAdminCouponAccessUntil(
  request: Request,
  env: Env,
  couponId: string,
): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ accessUntil?: unknown }>(request);
  const accessUntil = requiredDate(body.accessUntil);
  const db = new Db(requireDb(env));

  if (!(await supportsCouponAccessUntil(db))) {
    throw new ServiceConfigurationError('Coupon access-until database migration is not applied');
  }

  const current = await db.first<CouponRow>(
    `SELECT id, code, discount_type, discount_value, starts_at, ends_at, access_until
       FROM discount_coupons
      WHERE id = ?
      LIMIT 1`,
    [couponId],
  );
  if (!current) throw new HttpError(404, 'Coupon not found', 'coupon_not_found');
  if (current.discount_type !== 'percent' || current.discount_value !== 100) {
    throw new HttpError(400, 'Access until is available only for 100% coupons', 'coupon_access_until_not_supported');
  }
  if (current.starts_at && accessUntil <= current.starts_at) {
    throw new HttpError(400, 'Access until must be after the coupon start date', 'coupon_access_until_invalid');
  }
  if (current.ends_at && accessUntil <= current.ends_at) {
    throw new HttpError(400, 'Access until must be after the coupon claim end date', 'coupon_access_until_invalid');
  }
  if (current.access_until === accessUntil) {
    return json({ ok: true, couponId: current.id, code: current.code, accessUntil }, {
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const timestamp = now();
  await db.batch([
    db.statement(
      'UPDATE discount_coupons SET access_until = ?, updated_at = ? WHERE id = ?',
      [accessUntil, timestamp, couponId],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'billing_coupon.access_until_updated', 'discount_coupon', ?, NULL, ?, ?)`,
      [newId('aud'), auth.user.id, couponId, JSON.stringify({
        code: current.code,
        before: { accessUntil: current.access_until },
        after: { accessUntil },
      }), timestamp],
    ),
  ]);

  return json({ ok: true, couponId: current.id, code: current.code, accessUntil }, {
    headers: { 'cache-control': 'private, no-store' },
  });
}
