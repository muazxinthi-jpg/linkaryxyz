import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

type OwnerType = 'user' | 'organization';
type DiscountType = 'percent' | 'fixed_cents' | 'fixed_price_cents';

type PlanRow = {
  id: string;
  code: string;
  name: string;
  base_price_cents: number | null;
  monthly_usage_credits: number;
  billing_period: 'free' | 'monthly' | 'custom';
  is_active: number;
};

type AccountRow = {
  profile_id: string;
  profile_type: 'creator' | 'project';
  username: string;
  display_name: string;
  owner_user_id: string | null;
  organization_id: string | null;
  owner_email: string | null;
  owner_display_name: string | null;
  organization_name: string | null;
  updated_at: string;
};

type GrantRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: 'active' | 'revoked' | 'expired';
  starts_at: string;
  ends_at: string | null;
  monthly_credit_override: number | null;
  reason: string;
  created_at: string;
  updated_at: string;
};

type PriceOverrideRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  discount_type: DiscountType;
  discount_value: number;
  status: 'active' | 'revoked' | 'expired';
  starts_at: string;
  ends_at: string | null;
  reason: string;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  organization_id: string | null;
  metadata_json: string;
  created_at: string;
};

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

function validOwnerType(value: unknown): value is OwnerType {
  return value === 'user' || value === 'organization';
}

function cleanReason(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'A reason is required', 'commercial_reason_required');
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 240) throw new HttpError(400, 'Reason must be 3 to 240 characters', 'commercial_reason_invalid');
  return reason;
}

function cleanEndsAt(value: unknown, timestamp: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'End date is invalid', 'commercial_end_invalid');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'End date is invalid', 'commercial_end_invalid');
  const normalized = parsed.toISOString();
  if (normalized <= timestamp) throw new HttpError(400, 'End date must be in the future', 'commercial_end_invalid');
  return normalized;
}

async function ownerExists(db: Db, ownerType: OwnerType, ownerId: string): Promise<boolean> {
  const row = ownerType === 'user'
    ? await db.first<{ id: string }>('SELECT id FROM users WHERE id = ? AND status = ?', [ownerId, 'active'])
    : await db.first<{ id: string }>('SELECT id FROM organizations WHERE id = ? AND status <> ?', [ownerId, 'archived']);
  return Boolean(row);
}

async function planByCode(db: Db, planCode: string): Promise<PlanRow> {
  const plan = await db.first<PlanRow>(
    `SELECT id, code, name, base_price_cents, monthly_usage_credits, billing_period, is_active
       FROM billing_plans WHERE code = ?`,
    [planCode],
  );
  if (!plan || !plan.is_active) throw new HttpError(404, 'Billing plan is unavailable', 'commercial_plan_unavailable');
  return plan;
}

function assertPlanFitsOwner(ownerType: OwnerType, planCode: string) {
  if (ownerType === 'user' && !['free', 'personal_pro'].includes(planCode)) {
    throw new HttpError(400, 'Personal accounts can only receive personal plans', 'commercial_plan_owner_mismatch');
  }
  if (ownerType === 'organization' && !['free', 'project_manual', 'project_automate', 'project_growth', 'scale'].includes(planCode)) {
    throw new HttpError(400, 'Projects can only receive Project plans', 'commercial_plan_owner_mismatch');
  }
}

function parseMetadata(value: string): unknown {
  try { return JSON.parse(value); }
  catch { return null; }
}

export async function listAdminCommercialAccounts(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const timestamp = now();

  const [accounts, grants, overrides, balances] = await Promise.all([
    db.all<AccountRow>(
      `SELECT p.id AS profile_id, p.profile_type, p.username, p.display_name, p.owner_user_id,
              p.organization_id, u.email AS owner_email, u.display_name AS owner_display_name,
              o.name AS organization_name, p.updated_at
         FROM profiles p
         LEFT JOIN users u ON u.id = p.owner_user_id
         LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.visibility <> 'archived'
        ORDER BY p.updated_at DESC
        LIMIT 300`,
    ),
    db.all<GrantRow>(
      `SELECT beg.id, beg.user_id, beg.organization_id, beg.plan_id, bp.code AS plan_code,
              bp.name AS plan_name, beg.status, beg.starts_at, beg.ends_at,
              beg.monthly_credit_override, beg.reason, beg.created_at, beg.updated_at
         FROM billing_entitlement_grants beg
         JOIN billing_plans bp ON bp.id = beg.plan_id
        WHERE beg.status = 'active' AND beg.starts_at <= ? AND (beg.ends_at IS NULL OR beg.ends_at > ?)
        ORDER BY beg.created_at DESC
        LIMIT 500`,
      [timestamp, timestamp],
    ),
    db.all<PriceOverrideRow>(
      `SELECT apo.id, apo.user_id, apo.organization_id, apo.plan_id, bp.code AS plan_code,
              bp.name AS plan_name, apo.discount_type, apo.discount_value, apo.status,
              apo.starts_at, apo.ends_at, apo.reason, apo.created_at, apo.updated_at
         FROM billing_account_price_overrides apo
         JOIN billing_plans bp ON bp.id = apo.plan_id
        WHERE apo.status = 'active' AND apo.starts_at <= ? AND (apo.ends_at IS NULL OR apo.ends_at > ?)
        ORDER BY apo.created_at DESC
        LIMIT 500`,
      [timestamp, timestamp],
    ),
    db.all<{ owner_type: OwnerType; owner_id: string; balance: number }>(
      `SELECT owner_type, owner_id, COALESCE(SUM(amount), 0) AS balance
         FROM usage_credit_ledger
        GROUP BY owner_type, owner_id`,
    ),
  ]);

  const grantByOwner = new Map<string, GrantRow>();
  for (const grant of grants) {
    const ownerType: OwnerType = grant.user_id ? 'user' : 'organization';
    const ownerId = grant.user_id || grant.organization_id;
    if (ownerId && !grantByOwner.has(`${ownerType}:${ownerId}`)) grantByOwner.set(`${ownerType}:${ownerId}`, grant);
  }
  const overridesByOwner = new Map<string, PriceOverrideRow[]>();
  for (const override of overrides) {
    const ownerType: OwnerType = override.user_id ? 'user' : 'organization';
    const ownerId = override.user_id || override.organization_id;
    if (!ownerId) continue;
    const key = `${ownerType}:${ownerId}`;
    const list = overridesByOwner.get(key) || [];
    list.push(override);
    overridesByOwner.set(key, list);
  }
  const balanceByOwner = new Map(balances.map((item) => [`${item.owner_type}:${item.owner_id}`, Number(item.balance || 0)]));

  const serialized = accounts.flatMap((account) => {
    const ownerType: OwnerType = account.profile_type === 'creator' ? 'user' : 'organization';
    const ownerId = ownerType === 'user' ? account.owner_user_id : account.organization_id;
    if (!ownerId) return [];
    const key = `${ownerType}:${ownerId}`;
    return [{
      profileId: account.profile_id,
      profileType: account.profile_type,
      username: account.username,
      displayName: account.display_name,
      ownerType,
      ownerId,
      ownerLabel: ownerType === 'user'
        ? (account.owner_display_name || account.display_name)
        : (account.organization_name || account.display_name),
      email: account.owner_email,
      creditBalance: balanceByOwner.get(key) || 0,
      activeGrant: grantByOwner.get(key) || null,
      priceOverrides: overridesByOwner.get(key) || [],
      updatedAt: account.updated_at,
    }];
  });

  return json({ accounts: serialized, actorUserId: auth.user.id }, {
    headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
}

type GrantBody = {
  ownerType?: OwnerType;
  ownerId?: string;
  planCode?: string;
  endsAt?: string | null;
  monthlyCreditOverride?: number | null;
  grantCreditsNow?: boolean;
  reason?: string;
};

export async function createAdminEntitlementGrant(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<GrantBody>(request);
  if (!validOwnerType(body.ownerType) || !body.ownerId?.trim() || !body.planCode?.trim()) {
    throw new HttpError(400, 'Owner and plan are required', 'commercial_grant_invalid');
  }
  const ownerType = body.ownerType;
  const ownerId = body.ownerId.trim();
  const planCode = body.planCode.trim();
  assertPlanFitsOwner(ownerType, planCode);
  const reason = cleanReason(body.reason);
  const timestamp = now();
  const endsAt = cleanEndsAt(body.endsAt, timestamp);
  const db = new Db(requireDb(env));
  if (!(await ownerExists(db, ownerType, ownerId))) throw new HttpError(404, 'Commercial account owner not found', 'commercial_owner_not_found');
  const plan = await planByCode(db, planCode);

  let creditOverride: number | null = null;
  if (body.monthlyCreditOverride !== null && body.monthlyCreditOverride !== undefined) {
    if (!Number.isInteger(body.monthlyCreditOverride) || body.monthlyCreditOverride < 0 || body.monthlyCreditOverride > 100_000_000) {
      throw new HttpError(400, 'Monthly credit override is invalid', 'commercial_credit_override_invalid');
    }
    creditOverride = body.monthlyCreditOverride;
  }

  const prior = ownerType === 'user'
    ? await db.all<GrantRow>(
      `SELECT beg.id, beg.user_id, beg.organization_id, beg.plan_id, bp.code AS plan_code, bp.name AS plan_name,
              beg.status, beg.starts_at, beg.ends_at, beg.monthly_credit_override, beg.reason, beg.created_at, beg.updated_at
         FROM billing_entitlement_grants beg JOIN billing_plans bp ON bp.id = beg.plan_id
        WHERE beg.user_id = ? AND beg.status = 'active'`, [ownerId],
    )
    : await db.all<GrantRow>(
      `SELECT beg.id, beg.user_id, beg.organization_id, beg.plan_id, bp.code AS plan_code, bp.name AS plan_name,
              beg.status, beg.starts_at, beg.ends_at, beg.monthly_credit_override, beg.reason, beg.created_at, beg.updated_at
         FROM billing_entitlement_grants beg JOIN billing_plans bp ON bp.id = beg.plan_id
        WHERE beg.organization_id = ? AND beg.status = 'active'`, [ownerId],
    );

  const grantId = newId('grant');
  const creditAmount = creditOverride ?? plan.monthly_usage_credits;
  const statements = [
    ownerType === 'user'
      ? db.statement(`UPDATE billing_entitlement_grants SET status = 'revoked', updated_at = ? WHERE user_id = ? AND status = 'active'`, [timestamp, ownerId])
      : db.statement(`UPDATE billing_entitlement_grants SET status = 'revoked', updated_at = ? WHERE organization_id = ? AND status = 'active'`, [timestamp, ownerId]),
    db.statement(
      `INSERT INTO billing_entitlement_grants
        (id, user_id, organization_id, plan_id, status, starts_at, ends_at, monthly_credit_override, reason, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      [grantId, ownerType === 'user' ? ownerId : null, ownerType === 'organization' ? ownerId : null,
        plan.id, timestamp, endsAt, creditOverride, reason, auth.user.id, timestamp, timestamp],
    ),
  ];

  if (body.grantCreditsNow !== false && creditAmount > 0) {
    statements.push(db.statement(
      `INSERT OR IGNORE INTO usage_credit_ledger
        (id, owner_type, owner_id, transaction_type, amount, reason, feature_key, provider, related_id, idempotency_key, created_by_user_id, created_at)
       VALUES (?, ?, ?, 'monthly_grant', ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      [newId('ucred'), ownerType, ownerId, creditAmount, `${plan.code} comped Beta entitlement credits`, grantId,
        `entitlement-grant:${grantId}:initial-credits`, auth.user.id, timestamp],
    ));
  }

  const after = {
    id: grantId,
    ownerType,
    ownerId,
    planCode: plan.code,
    planName: plan.name,
    startsAt: timestamp,
    endsAt,
    monthlyCreditOverride: creditOverride,
    creditsGrantedNow: body.grantCreditsNow === false ? 0 : creditAmount,
    reason,
  };
  statements.push(db.statement(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', 'billing_entitlement.granted', 'billing_entitlement_grant', ?, ?, ?, ?)`,
    [newId('aud'), auth.user.id, grantId, ownerType === 'organization' ? ownerId : null,
      JSON.stringify({ before: prior, after }), timestamp],
  ));
  await db.batch(statements);
  return json({ ok: true, grant: after });
}

export async function revokeAdminEntitlementGrant(request: Request, env: Env, grantId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ reason?: string }>(request);
  const reason = cleanReason(body.reason);
  const db = new Db(requireDb(env));
  const current = await db.first<GrantRow>(
    `SELECT beg.id, beg.user_id, beg.organization_id, beg.plan_id, bp.code AS plan_code, bp.name AS plan_name,
            beg.status, beg.starts_at, beg.ends_at, beg.monthly_credit_override, beg.reason, beg.created_at, beg.updated_at
       FROM billing_entitlement_grants beg JOIN billing_plans bp ON bp.id = beg.plan_id WHERE beg.id = ?`,
    [grantId],
  );
  if (!current) throw new HttpError(404, 'Entitlement grant not found', 'commercial_grant_not_found');
  if (current.status !== 'active') throw new HttpError(409, 'Entitlement grant is already inactive', 'commercial_grant_inactive');
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE billing_entitlement_grants SET status = 'revoked', updated_at = ? WHERE id = ? AND status = 'active'`, [timestamp, grantId]),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'billing_entitlement.revoked', 'billing_entitlement_grant', ?, ?, ?, ?)`,
      [newId('aud'), auth.user.id, grantId, current.organization_id,
        JSON.stringify({ before: current, after: { status: 'revoked', reason } }), timestamp],
    ),
  ]);
  return json({ ok: true, grantId, status: 'revoked' });
}

type PriceOverrideBody = {
  ownerType?: OwnerType;
  ownerId?: string;
  planCode?: string;
  discountType?: DiscountType;
  discountValue?: number;
  endsAt?: string | null;
  reason?: string;
};

function validateDiscount(plan: PlanRow, type: DiscountType, value: number) {
  if (!Number.isInteger(value) || value < 0) throw new HttpError(400, 'Discount value is invalid', 'commercial_discount_invalid');
  if (plan.billing_period !== 'monthly' || !plan.base_price_cents || plan.base_price_cents <= 0) {
    throw new HttpError(400, 'Private discounts require a paid monthly plan', 'commercial_discount_plan_invalid');
  }
  if (type === 'percent' && (value < 1 || value > 99)) {
    throw new HttpError(400, 'Percentage discounts must be between 1 and 99. Use a comped grant for free access.', 'commercial_discount_invalid');
  }
  if (type === 'fixed_cents' && (value < 1 || value >= plan.base_price_cents)) {
    throw new HttpError(400, 'Fixed discount must leave at least $0.01 payable. Use a comped grant for free access.', 'commercial_discount_invalid');
  }
  if (type === 'fixed_price_cents' && (value < 1 || value > plan.base_price_cents)) {
    throw new HttpError(400, 'Private price must be between $0.01 and the base price', 'commercial_discount_invalid');
  }
}

export async function createAdminPriceOverride(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<PriceOverrideBody>(request);
  if (!validOwnerType(body.ownerType) || !body.ownerId?.trim() || !body.planCode?.trim() ||
      !['percent', 'fixed_cents', 'fixed_price_cents'].includes(body.discountType || '') || typeof body.discountValue !== 'number') {
    throw new HttpError(400, 'Owner, plan and discount are required', 'commercial_discount_invalid');
  }
  const ownerType = body.ownerType;
  const ownerId = body.ownerId.trim();
  const planCode = body.planCode.trim();
  const discountType = body.discountType as DiscountType;
  assertPlanFitsOwner(ownerType, planCode);
  const reason = cleanReason(body.reason);
  const timestamp = now();
  const endsAt = cleanEndsAt(body.endsAt, timestamp);
  const db = new Db(requireDb(env));
  if (!(await ownerExists(db, ownerType, ownerId))) throw new HttpError(404, 'Commercial account owner not found', 'commercial_owner_not_found');
  const plan = await planByCode(db, planCode);
  validateDiscount(plan, discountType, body.discountValue);

  const prior = ownerType === 'user'
    ? await db.all<PriceOverrideRow>(
      `SELECT apo.id, apo.user_id, apo.organization_id, apo.plan_id, bp.code AS plan_code, bp.name AS plan_name,
              apo.discount_type, apo.discount_value, apo.status, apo.starts_at, apo.ends_at, apo.reason, apo.created_at, apo.updated_at
         FROM billing_account_price_overrides apo JOIN billing_plans bp ON bp.id = apo.plan_id
        WHERE apo.user_id = ? AND apo.plan_id = ? AND apo.status = 'active'`, [ownerId, plan.id],
    )
    : await db.all<PriceOverrideRow>(
      `SELECT apo.id, apo.user_id, apo.organization_id, apo.plan_id, bp.code AS plan_code, bp.name AS plan_name,
              apo.discount_type, apo.discount_value, apo.status, apo.starts_at, apo.ends_at, apo.reason, apo.created_at, apo.updated_at
         FROM billing_account_price_overrides apo JOIN billing_plans bp ON bp.id = apo.plan_id
        WHERE apo.organization_id = ? AND apo.plan_id = ? AND apo.status = 'active'`, [ownerId, plan.id],
    );

  const overrideId = newId('pover');
  const statements = [
    ownerType === 'user'
      ? db.statement(`UPDATE billing_account_price_overrides SET status = 'revoked', updated_at = ? WHERE user_id = ? AND plan_id = ? AND status = 'active'`, [timestamp, ownerId, plan.id])
      : db.statement(`UPDATE billing_account_price_overrides SET status = 'revoked', updated_at = ? WHERE organization_id = ? AND plan_id = ? AND status = 'active'`, [timestamp, ownerId, plan.id]),
    db.statement(
      `INSERT INTO billing_account_price_overrides
        (id, user_id, organization_id, plan_id, discount_type, discount_value, status, starts_at, ends_at, reason, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      [overrideId, ownerType === 'user' ? ownerId : null, ownerType === 'organization' ? ownerId : null,
        plan.id, discountType, body.discountValue, timestamp, endsAt, reason, auth.user.id, timestamp, timestamp],
    ),
  ];
  const after = { id: overrideId, ownerType, ownerId, planCode: plan.code, planName: plan.name, discountType, discountValue: body.discountValue, startsAt: timestamp, endsAt, reason };
  statements.push(db.statement(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', 'billing_price_override.created', 'billing_account_price_override', ?, ?, ?, ?)`,
    [newId('aud'), auth.user.id, overrideId, ownerType === 'organization' ? ownerId : null,
      JSON.stringify({ before: prior, after }), timestamp],
  ));
  await db.batch(statements);
  return json({ ok: true, priceOverride: after });
}

export async function revokeAdminPriceOverride(request: Request, env: Env, overrideId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ reason?: string }>(request);
  const reason = cleanReason(body.reason);
  const db = new Db(requireDb(env));
  const current = await db.first<PriceOverrideRow>(
    `SELECT apo.id, apo.user_id, apo.organization_id, apo.plan_id, bp.code AS plan_code, bp.name AS plan_name,
            apo.discount_type, apo.discount_value, apo.status, apo.starts_at, apo.ends_at, apo.reason, apo.created_at, apo.updated_at
       FROM billing_account_price_overrides apo JOIN billing_plans bp ON bp.id = apo.plan_id WHERE apo.id = ?`,
    [overrideId],
  );
  if (!current) throw new HttpError(404, 'Price override not found', 'commercial_discount_not_found');
  if (current.status !== 'active') throw new HttpError(409, 'Price override is already inactive', 'commercial_discount_inactive');
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE billing_account_price_overrides SET status = 'revoked', updated_at = ? WHERE id = ? AND status = 'active'`, [timestamp, overrideId]),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'billing_price_override.revoked', 'billing_account_price_override', ?, ?, ?, ?)`,
      [newId('aud'), auth.user.id, overrideId, current.organization_id,
        JSON.stringify({ before: current, after: { status: 'revoked', reason } }), timestamp],
    ),
  ]);
  return json({ ok: true, overrideId, status: 'revoked' });
}

export async function listAdminCommercialAudit(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const rows = await db.all<AuditRow>(
    `SELECT id, actor_user_id, action, resource_type, resource_id, organization_id, metadata_json, created_at
       FROM audit_logs
      WHERE action IN (
        'billing_entitlement.granted',
        'billing_entitlement.revoked',
        'billing_price_override.created',
        'billing_price_override.revoked',
        'usage_credits.adjusted',
        'billing_plan.updated'
      )
      ORDER BY created_at DESC
      LIMIT 100`,
  );
  return json({
    audit: rows.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json), metadata_json: undefined })),
    actorUserId: auth.user.id,
  }, { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } });
}
