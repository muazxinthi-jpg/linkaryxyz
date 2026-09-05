import type { Env } from '../env';
import { Db } from '../db/client';
import { requireDb } from '../env';
import { HttpError, json, readJson } from '../http';
import { requireSuperadmin, verifyCsrf } from '../auth/session';

type BillingPlanRow = {
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
  is_active: number;
  is_public: number;
  display_order: number;
  created_at: string;
  updated_at: string;
};

type PromotionRow = {
  id: string;
  plan_id: string;
  label: string;
  discount_type: 'percent' | 'fixed_cents' | 'fixed_price_cents';
  discount_value: number;
  starts_at: string;
  ends_at: string | null;
};

type PublicPlan = {
  code: string;
  name: string;
  audience: string;
  description: string;
  billingPeriod: 'free' | 'monthly' | 'custom';
  basePriceCents: number | null;
  effectivePriceCents: number | null;
  currency: string;
  monthlyUsageCredits: number;
  projectSeatLimit: number | null;
  features: string[];
  promotion: { id: string; label: string; discountType: string; discountValue: number } | null;
};

const DEFAULT_PLAN_CATALOG: PublicPlan[] = [
  {
    code: 'free',
    name: 'Free',
    audience: 'Everyone',
    description: 'Create a Linkary identity, track manually and evaluate the network before upgrading.',
    billingPeriod: 'free',
    basePriceCents: 0,
    effectivePriceCents: 0,
    currency: 'USD',
    monthlyUsageCredits: 25,
    projectSeatLimit: 0,
    features: ['Public profile', 'Manual tracking', 'Basic dashboard', '30-day campaign history'],
    promotion: null,
  },
  {
    code: 'personal_pro',
    name: 'Personal Pro / Collector',
    audience: 'Creators and collectors',
    description: 'Enhanced personal profile tools with wallet-based NFT discovery and collection presentation.',
    billingPeriod: 'monthly',
    basePriceCents: 499,
    effectivePriceCents: 499,
    currency: 'USD',
    monthlyUsageCredits: 250,
    projectSeatLimit: 0,
    features: ['NFT wallet discovery', 'NFT showcase', 'NFT avatar', 'NFT collections', 'Profile intelligence'],
    promotion: null,
  },
  {
    code: 'project_manual',
    name: 'Project Manual',
    audience: 'Founders and small Projects',
    description: 'Manual campaign tracking and relationship memory for one Project.',
    billingPeriod: 'monthly',
    basePriceCents: 999,
    effectivePriceCents: 999,
    currency: 'USD',
    monthlyUsageCredits: 500,
    projectSeatLimit: 1,
    features: ['1 Project seat', 'Unlimited manual campaigns', '12-month campaign history', 'CSV export', 'Partner shortlists'],
    promotion: null,
  },
  {
    code: 'project_automate',
    name: 'Project Automate',
    audience: 'Growing Project teams',
    description: 'Higher usage capacity for Projects adding provider-assisted refreshes and automation.',
    billingPeriod: 'monthly',
    basePriceCents: 3399,
    effectivePriceCents: 3399,
    currency: 'USD',
    monthlyUsageCredits: 2500,
    projectSeatLimit: 3,
    features: ['Up to 3 Project seats', 'Team access', 'Higher tracking allowance', 'Provider-assisted refreshes', 'Richer reporting'],
    promotion: null,
  },
  {
    code: 'project_growth',
    name: 'Project Growth',
    audience: 'Established growth teams',
    description: 'Advanced growth operations, higher usage limits and intelligence for larger Project teams.',
    billingPeriod: 'monthly',
    basePriceCents: 9999,
    effectivePriceCents: 9999,
    currency: 'USD',
    monthlyUsageCredits: 10000,
    projectSeatLimit: 10,
    features: ['Up to 10 Project seats', 'Advanced reporting', 'High first-party tracking allowance', 'Provider automation credits', 'Priority growth intelligence'],
    promotion: null,
  },
  {
    code: 'scale',
    name: 'Scale / Agency / Enterprise',
    audience: 'Agencies and large organizations',
    description: 'Custom seats, credits, controls and commercial terms.',
    billingPeriod: 'custom',
    basePriceCents: null,
    effectivePriceCents: null,
    currency: 'USD',
    monthlyUsageCredits: 25000,
    projectSeatLimit: null,
    features: ['Custom Project seats', '25,000+ usage credits', 'Custom reporting', 'API and export options', 'Commercial support'],
    promotion: null,
  },
];

function safeFeatures(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

function effectivePrice(basePriceCents: number | null, promotion: PromotionRow | undefined): number | null {
  if (basePriceCents === null || !promotion) return basePriceCents;
  if (promotion.discount_type === 'percent') {
    const percent = Math.min(100, Math.max(0, promotion.discount_value));
    return Math.max(0, Math.round(basePriceCents * (100 - percent) / 100));
  }
  if (promotion.discount_type === 'fixed_cents') return Math.max(0, basePriceCents - promotion.discount_value);
  return Math.max(0, promotion.discount_value);
}

function serializePublicPlan(plan: BillingPlanRow, promotion?: PromotionRow): PublicPlan {
  return {
    code: plan.code,
    name: plan.name,
    audience: plan.audience,
    description: plan.description,
    billingPeriod: plan.billing_period,
    basePriceCents: plan.base_price_cents,
    effectivePriceCents: effectivePrice(plan.base_price_cents, promotion),
    currency: plan.currency,
    monthlyUsageCredits: plan.monthly_usage_credits,
    projectSeatLimit: plan.project_seat_limit,
    features: safeFeatures(plan.features_json),
    promotion: promotion ? {
      id: promotion.id,
      label: promotion.label,
      discountType: promotion.discount_type,
      discountValue: promotion.discount_value,
    } : null,
  };
}

export async function listPublicBillingPlans(_request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ plans: DEFAULT_PLAN_CATALOG, source: 'fallback' });
  const db = new Db(env.DB);
  try {
    const plans = await db.all<BillingPlanRow>(
      `SELECT id, code, name, audience, description, billing_period, base_price_cents, currency,
              monthly_usage_credits, project_seat_limit, features_json, is_active, is_public,
              display_order, created_at, updated_at
         FROM billing_plans
        WHERE is_active = 1 AND is_public = 1
        ORDER BY display_order ASC, name ASC`,
    );
    const timestamp = new Date().toISOString();
    const promotions = await db.all<PromotionRow>(
      `SELECT id, plan_id, label, discount_type, discount_value, starts_at, ends_at
         FROM billing_plan_promotions
        WHERE is_active = 1
          AND is_public = 1
          AND starts_at <= ?
          AND (ends_at IS NULL OR ends_at > ?)
        ORDER BY starts_at DESC`,
      [timestamp, timestamp],
    );
    const firstPromotionByPlan = new Map<string, PromotionRow>();
    for (const promotion of promotions) {
      if (!firstPromotionByPlan.has(promotion.plan_id)) firstPromotionByPlan.set(promotion.plan_id, promotion);
    }
    return json({
      plans: plans.map((plan) => serializePublicPlan(plan, firstPromotionByPlan.get(plan.id))),
      source: 'database',
    }, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } });
  } catch {
    return json({ plans: DEFAULT_PLAN_CATALOG, source: 'fallback' }, { headers: { 'cache-control': 'public, max-age=60' } });
  }
}

export async function listAdminBillingPlans(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const plans = await db.all<BillingPlanRow>(
    `SELECT id, code, name, audience, description, billing_period, base_price_cents, currency,
            monthly_usage_credits, project_seat_limit, features_json, is_active, is_public,
            display_order, created_at, updated_at
       FROM billing_plans
      ORDER BY display_order ASC, name ASC`,
  );
  return json({
    plans: plans.map((plan) => ({
      ...serializePublicPlan(plan),
      id: plan.id,
      active: Boolean(plan.is_active),
      public: Boolean(plan.is_public),
      displayOrder: plan.display_order,
      updatedAt: plan.updated_at,
    })),
    actorUserId: auth.user.id,
  }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
}

type PlanPatch = {
  name?: string;
  audience?: string;
  description?: string;
  basePriceCents?: number | null;
  monthlyUsageCredits?: number;
  projectSeatLimit?: number | null;
  features?: string[];
  active?: boolean;
  public?: boolean;
  displayOrder?: number;
  appliesToRenewals?: boolean;
};

export async function updateAdminBillingPlan(request: Request, env: Env, planCode: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<PlanPatch>(request);
  const db = new Db(requireDb(env));
  const current = await db.first<BillingPlanRow>(
    `SELECT id, code, name, audience, description, billing_period, base_price_cents, currency,
            monthly_usage_credits, project_seat_limit, features_json, is_active, is_public,
            display_order, created_at, updated_at
       FROM billing_plans WHERE code = ?`,
    [planCode],
  );
  if (!current) throw new HttpError(404, 'Billing plan not found', 'billing_plan_not_found');

  const updates: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => { updates.push(`${column} = ?`); values.push(value); };

  if (body.name !== undefined) {
    const value = body.name.trim();
    if (!value || value.length > 80) throw new HttpError(400, 'Plan name must be 1 to 80 characters', 'invalid_plan_name');
    add('name', value);
  }
  if (body.audience !== undefined) {
    const value = body.audience.trim();
    if (!value || value.length > 120) throw new HttpError(400, 'Plan audience must be 1 to 120 characters', 'invalid_plan_audience');
    add('audience', value);
  }
  if (body.description !== undefined) {
    const value = body.description.trim();
    if (value.length > 500) throw new HttpError(400, 'Plan description is too long', 'invalid_plan_description');
    add('description', value);
  }
  if (body.basePriceCents !== undefined) {
    if (body.basePriceCents !== null && (!Number.isInteger(body.basePriceCents) || body.basePriceCents < 0 || body.basePriceCents > 10_000_000)) {
      throw new HttpError(400, 'Base price must be a non-negative integer in cents', 'invalid_plan_price');
    }
    if (current.billing_period === 'free' && body.basePriceCents !== 0) throw new HttpError(400, 'The Free plan price must remain zero', 'invalid_plan_price');
    if (current.billing_period === 'monthly' && body.basePriceCents === null) throw new HttpError(400, 'Monthly plans require a price', 'invalid_plan_price');
    add('base_price_cents', body.basePriceCents);
  }
  if (body.monthlyUsageCredits !== undefined) {
    if (!Number.isInteger(body.monthlyUsageCredits) || body.monthlyUsageCredits < 0 || body.monthlyUsageCredits > 100_000_000) {
      throw new HttpError(400, 'Monthly usage credits are invalid', 'invalid_plan_credits');
    }
    add('monthly_usage_credits', body.monthlyUsageCredits);
  }
  if (body.projectSeatLimit !== undefined) {
    if (body.projectSeatLimit !== null && (!Number.isInteger(body.projectSeatLimit) || body.projectSeatLimit < 0 || body.projectSeatLimit > 100_000)) {
      throw new HttpError(400, 'Project seat limit is invalid', 'invalid_project_seats');
    }
    add('project_seat_limit', body.projectSeatLimit);
  }
  if (body.features !== undefined) {
    const features = body.features.map((item) => item.trim()).filter(Boolean);
    if (features.length > 24 || features.some((item) => item.length > 120)) throw new HttpError(400, 'Plan features are invalid', 'invalid_plan_features');
    add('features_json', JSON.stringify(features));
  }
  if (body.active !== undefined) add('is_active', body.active ? 1 : 0);
  if (body.public !== undefined) add('is_public', body.public ? 1 : 0);
  if (body.displayOrder !== undefined) {
    if (!Number.isInteger(body.displayOrder) || body.displayOrder < 0 || body.displayOrder > 10000) throw new HttpError(400, 'Display order is invalid', 'invalid_display_order');
    add('display_order', body.displayOrder);
  }
  if (!updates.length) throw new HttpError(400, 'No supported plan changes were provided', 'empty_plan_update');

  const timestamp = new Date().toISOString();
  updates.push('updated_at = ?');
  values.push(timestamp, current.id);
  const statements = [
    db.statement(`UPDATE billing_plans SET ${updates.join(', ')} WHERE id = ?`, values),
  ];

  const priceChanged = body.basePriceCents !== undefined && body.basePriceCents !== current.base_price_cents;
  if (priceChanged) {
    statements.push(
      db.statement('UPDATE billing_plan_price_versions SET effective_until = ? WHERE plan_id = ? AND effective_until IS NULL', [timestamp, current.id]),
      db.statement(
        `INSERT INTO billing_plan_price_versions
          (id, plan_id, price_cents, currency, effective_from, effective_until, applies_to_renewals, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          `price_${crypto.randomUUID().replace(/-/g, '')}`,
          current.id,
          body.basePriceCents,
          current.currency,
          timestamp,
          body.appliesToRenewals ? 1 : 0,
          auth.user.id,
          timestamp,
        ],
      ),
    );
  }
  statements.push(
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'billing_plan.updated', 'billing_plan', ?, NULL, ?, ?)`,
      [
        `aud_${crypto.randomUUID().replace(/-/g, '')}`,
        auth.user.id,
        current.id,
        JSON.stringify({ planCode, changedFields: Object.keys(body), appliesToRenewals: body.appliesToRenewals ?? false }),
        timestamp,
      ],
    ),
  );
  await db.batch(statements);
  return json({ ok: true, planCode, updatedAt: timestamp });
}

type CreditAdjustment = {
  ownerType?: 'user' | 'organization';
  ownerId?: string;
  amount?: number;
  reason?: string;
};

export async function adjustUsageCredits(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<CreditAdjustment>(request);
  if (!body.ownerType || !body.ownerId || !Number.isInteger(body.amount) || body.amount === 0 || Math.abs(body.amount) > 100_000_000 || !body.reason?.trim()) {
    throw new HttpError(400, 'Owner, non-zero credit amount and reason are required', 'invalid_usage_credit_adjustment');
  }
  const db = new Db(requireDb(env));
  const ownerExists = body.ownerType === 'user'
    ? await db.first<{ id: string }>('SELECT id FROM users WHERE id = ?', [body.ownerId])
    : await db.first<{ id: string }>('SELECT id FROM organizations WHERE id = ?', [body.ownerId]);
  if (!ownerExists) throw new HttpError(404, 'Credit owner not found', 'usage_credit_owner_not_found');

  const balance = await db.first<{ balance: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM usage_credit_ledger
      WHERE owner_type = ? AND owner_id = ?`,
    [body.ownerType, body.ownerId],
  );
  const currentBalance = Number(balance?.balance || 0);
  const nextBalance = currentBalance + (body.amount as number);
  if (nextBalance < 0) throw new HttpError(409, 'Adjustment would make usage credits negative', 'negative_usage_credit_balance');

  const timestamp = new Date().toISOString();
  const reason = body.reason.trim().slice(0, 240);
  await db.batch([
    db.statement(
      `INSERT INTO usage_credit_ledger
        (id, owner_type, owner_id, transaction_type, amount, reason, feature_key, provider, related_id, idempotency_key, created_by_user_id, created_at)
       VALUES (?, ?, ?, 'admin_adjustment', ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      [`ucred_${crypto.randomUUID().replace(/-/g, '')}`, body.ownerType, body.ownerId, body.amount, reason, auth.user.id, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'usage_credits.adjusted', 'usage_credit_balance', ?, ?, ?, ?)`,
      [
        `aud_${crypto.randomUUID().replace(/-/g, '')}`,
        auth.user.id,
        `${body.ownerType}:${body.ownerId}`,
        body.ownerType === 'organization' ? body.ownerId : null,
        JSON.stringify({ amount: body.amount, reason, previousBalance: currentBalance, nextBalance }),
        timestamp,
      ],
    ),
  ]);
  return json({ ok: true, ownerType: body.ownerType, ownerId: body.ownerId, balance: nextBalance });
}
