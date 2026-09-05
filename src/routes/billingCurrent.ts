import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireAuth } from '../auth/session';
import { HttpError, json } from '../http';

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
  audience: string;
  description: string;
  billing_period: 'free' | 'monthly' | 'custom';
  base_price_cents: number | null;
  currency: string;
  monthly_usage_credits: number;
  project_seat_limit: number | null;
  features_json: string;
};

type GrantRow = PlanRow & {
  grant_id: string;
  grant_starts_at: string;
  grant_ends_at: string | null;
  monthly_credit_override: number | null;
};

function safeFeatures(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

function publicPlan(plan: PlanRow) {
  return {
    code: plan.code,
    name: plan.name,
    audience: plan.audience,
    description: plan.description,
    billingPeriod: plan.billing_period,
    basePriceCents: plan.base_price_cents,
    effectivePriceCents: plan.base_price_cents,
    currency: plan.currency,
    monthlyUsageCredits: plan.monthly_usage_credits,
    projectSeatLimit: plan.project_seat_limit,
    features: safeFeatures(plan.features_json),
    promotion: null,
  };
}

export async function currentBillingStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profileId = new URL(request.url).searchParams.get('profileId')?.trim();
  if (!profileId) throw new HttpError(400, 'profileId is required', 'billing_profile_required');

  const profile = await db.first<ProfileRow>(
    `SELECT id, profile_type, owner_user_id, organization_id
       FROM profiles
      WHERE id = ? AND visibility <> 'archived'`,
    [profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'billing_profile_not_found');

  let ownerType: 'user' | 'organization';
  let ownerId: string;
  if (profile.profile_type === 'creator') {
    if (profile.owner_user_id !== auth.user.id) throw new HttpError(403, 'Profile access unavailable', 'forbidden');
    ownerType = 'user';
    ownerId = auth.user.id;
  } else {
    if (!profile.organization_id) throw new HttpError(409, 'Project profile is missing its organization', 'billing_project_invalid');
    const membership = await db.first<{ id: string }>(
      `SELECT id
         FROM organization_memberships
        WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      [profile.organization_id, auth.user.id],
    );
    if (!membership) throw new HttpError(403, 'Project access unavailable', 'forbidden');
    ownerType = 'organization';
    ownerId = profile.organization_id;
  }

  const timestamp = new Date().toISOString();
  const grant = ownerType === 'user'
    ? await db.first<GrantRow>(
      `SELECT bp.id, bp.code, bp.name, bp.audience, bp.description, bp.billing_period,
              bp.base_price_cents, bp.currency, bp.monthly_usage_credits, bp.project_seat_limit,
              bp.features_json, beg.id AS grant_id, beg.starts_at AS grant_starts_at,
              beg.ends_at AS grant_ends_at, beg.monthly_credit_override
         FROM billing_entitlement_grants beg
         JOIN billing_plans bp ON bp.id = beg.plan_id
        WHERE beg.user_id = ?
          AND beg.status = 'active'
          AND bp.is_active = 1
          AND beg.starts_at <= ?
          AND (beg.ends_at IS NULL OR beg.ends_at > ?)
        ORDER BY beg.created_at DESC
        LIMIT 1`,
      [ownerId, timestamp, timestamp],
    )
    : await db.first<GrantRow>(
      `SELECT bp.id, bp.code, bp.name, bp.audience, bp.description, bp.billing_period,
              bp.base_price_cents, bp.currency, bp.monthly_usage_credits, bp.project_seat_limit,
              bp.features_json, beg.id AS grant_id, beg.starts_at AS grant_starts_at,
              beg.ends_at AS grant_ends_at, beg.monthly_credit_override
         FROM billing_entitlement_grants beg
         JOIN billing_plans bp ON bp.id = beg.plan_id
        WHERE beg.organization_id = ?
          AND beg.status = 'active'
          AND bp.is_active = 1
          AND beg.starts_at <= ?
          AND (beg.ends_at IS NULL OR beg.ends_at > ?)
        ORDER BY beg.created_at DESC
        LIMIT 1`,
      [ownerId, timestamp, timestamp],
    );

  const plan = grant || await db.first<PlanRow>(
    `SELECT id, code, name, audience, description, billing_period, base_price_cents, currency,
            monthly_usage_credits, project_seat_limit, features_json
       FROM billing_plans
      WHERE code = 'free' AND is_active = 1
      LIMIT 1`,
  );
  if (!plan) throw new HttpError(503, 'Billing catalog is unavailable', 'billing_catalog_unavailable');

  const ledger = await db.first<{ balance: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM usage_credit_ledger
      WHERE owner_type = ? AND owner_id = ?`,
    [ownerType, ownerId],
  );

  return json({
    profileId: profile.id,
    ownerType,
    ownerId,
    plan: publicPlan(plan),
    entitlement: {
      source: grant ? 'grant' : 'default',
      grantId: grant?.grant_id || null,
      startsAt: grant?.grant_starts_at || null,
      endsAt: grant?.grant_ends_at || null,
      monthlyUsageCredits: grant?.monthly_credit_override ?? plan.monthly_usage_credits,
    },
    creditBalance: Number(ledger?.balance || 0),
  }, { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } });
}
