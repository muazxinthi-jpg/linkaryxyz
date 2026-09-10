import { Db } from './db/client';

type OwnerType = 'user' | 'organization';

type CouponGrantRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  monthly_credit_override: number | null;
  created_by_user_id: string;
  plan_code: string;
  monthly_usage_credits: number;
};

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

export function addCalendarMonths(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function entitlementMonthIndex(startsAt: string, timestamp: string): number {
  const start = new Date(startsAt);
  const current = new Date(timestamp);
  let months = (current.getUTCFullYear() - start.getUTCFullYear()) * 12
    + current.getUTCMonth() - start.getUTCMonth();
  if (months < 0) return -1;
  if (addCalendarMonths(startsAt, months) > timestamp) months -= 1;
  return months;
}

export async function ensureCouponEntitlementMonthlyCredits(
  db: Db,
  ownerType: OwnerType,
  ownerId: string,
  timestamp: string,
): Promise<void> {
  const ownerColumn = ownerType === 'user' ? 'user_id' : 'organization_id';
  const grant = await db.first<CouponGrantRow>(
    `SELECT beg.id, beg.starts_at, beg.ends_at, beg.monthly_credit_override,
            beg.created_by_user_id, bp.code AS plan_code, bp.monthly_usage_credits
       FROM billing_entitlement_grants beg
       JOIN billing_plans bp ON bp.id = beg.plan_id
      WHERE beg.${ownerColumn} = ?
        AND beg.status = 'active'
        AND beg.starts_at <= ?
        AND (beg.ends_at IS NULL OR beg.ends_at > ?)
        AND beg.reason LIKE 'coupon_redemption:%'
      ORDER BY beg.created_at DESC
      LIMIT 1`,
    [ownerId, timestamp, timestamp],
  );
  if (!grant) return;

  const periodIndex = entitlementMonthIndex(grant.starts_at, timestamp);
  if (periodIndex < 1) return;
  const monthlyCredits = grant.monthly_credit_override ?? grant.monthly_usage_credits;
  if (monthlyCredits <= 0) return;

  // Redemption already grants period 0. Fill any later elapsed entitlement
  // months exactly once so long-duration free access mirrors paid monthly credit grants.
  const statements = [];
  for (let index = 1; index <= Math.min(periodIndex, 60); index += 1) {
    const periodStart = addCalendarMonths(grant.starts_at, index);
    if (grant.ends_at && periodStart >= grant.ends_at) break;
    statements.push(db.statement(
      `INSERT OR IGNORE INTO usage_credit_ledger
        (id, owner_type, owner_id, transaction_type, amount, reason, feature_key, provider,
         related_id, idempotency_key, created_by_user_id, created_at)
       VALUES (?, ?, ?, 'monthly_grant', ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      [newId('ucred'), ownerType, ownerId, monthlyCredits,
        `${grant.plan_code} coupon entitlement month ${index + 1} credits`, grant.id,
        `coupon-grant:${grant.id}:month:${index}:credits`, grant.created_by_user_id, periodStart],
    ));
  }
  if (statements.length) await db.batch(statements);
}
