import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { requireAuth, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type OwnerType = 'user' | 'organization';
type DiscountType = 'percent' | 'fixed_cents' | 'fixed_price_cents';

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
  currency: string;
  monthly_usage_credits: number;
};

type DiscountRow = {
  id: string;
  discount_type: DiscountType;
  discount_value: number;
};

type CouponRow = DiscountRow & {
  code: string;
  eligible_plan_codes_json: string;
  stackable: number;
};

type CheckoutIntentRow = {
  id: string;
  requested_by_user_id: string;
  owner_type: OwnerType;
  owner_id: string;
  profile_id: string;
  plan_id: string;
  payer_wallet_address: string;
  treasury_address: string;
  coupon_id: string | null;
  coupon_discount_cents: number;
  final_price_cents: number;
  usdc_amount_atomic: number;
  monthly_usage_credits_snapshot: number;
  status: 'pending' | 'submitted' | 'paid' | 'expired' | 'cancelled';
  tx_hash: string | null;
  expires_at: string;
};

type PaymentRow = { id: string; tx_hash: string; verified_at: string };
type ReceiptLog = { address?: string; topics?: string[]; data?: string };
type Receipt = { status?: string; blockNumber?: string; logs?: ReceiptLog[] };

function normalizeAddress(value: string | null | undefined): string | null {
  const candidate = value?.trim().toLowerCase() || '';
  return /^0x[a-f0-9]{40}$/.test(candidate) ? candidate : null;
}

function normalizeTxHash(value: string | null | undefined): string | null {
  const candidate = value?.trim().toLowerCase() || '';
  return /^0x[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

function requireTreasury(env: Env): string {
  const address = normalizeAddress(env.BILLING_TREASURY_EVM_ADDRESS);
  if (!address) throw new ServiceConfigurationError('Linkary billing treasury is not configured');
  return address;
}

function addOneMonth(iso: string): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const nextMonthLastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, nextMonthLastDay));
  return date.toISOString();
}

function priceAfterDiscount(priceCents: number, discountType: DiscountType, discountValue: number): number {
  if (discountType === 'fixed_price_cents') return Math.max(0, Math.min(priceCents, Math.floor(discountValue)));
  if (discountType === 'fixed_cents') return Math.max(0, priceCents - Math.floor(discountValue));
  const percent = Math.max(0, Math.min(100, discountValue));
  return Math.max(0, Math.round(priceCents * (100 - percent) / 100));
}

function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[a-fA-F0-9]{64}$/.test(topic)) return null;
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function amountFromData(data: string | undefined): bigint | null {
  if (!data || !/^0x[a-fA-F0-9]{1,64}$/.test(data)) return null;
  try { return BigInt(data); }
  catch { return null; }
}

function eligiblePlanCodes(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

async function schemaReady(db: Db): Promise<boolean> {
  const tables = await db.first<{ present: number }>(
    `SELECT COUNT(*) AS present FROM sqlite_master
      WHERE type = 'table' AND name IN ('billing_checkout_intents','billing_coupon_reservations','billing_payments','billing_subscription_periods')`,
  );
  if (Number(tables?.present || 0) !== 4) return false;
  const column = await db.first<{ present: number }>(
    `SELECT COUNT(*) AS present FROM pragma_table_info('billing_checkout_intents') WHERE name = 'monthly_usage_credits_snapshot'`,
  );
  return Number(column?.present || 0) === 1;
}

async function requireSchema(db: Db): Promise<void> {
  if (!(await schemaReady(db))) throw new ServiceConfigurationError('Billing checkout database migrations are not applied');
}

async function resolveBillingOwner(db: Db, userId: string, profileId: string): Promise<{ profile: ProfileRow; ownerType: OwnerType; ownerId: string }> {
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

function planAllowedForProfile(profile: ProfileRow, planCode: string): boolean {
  if (profile.profile_type === 'creator') return planCode === 'personal_pro';
  return ['project_manual', 'project_automate', 'project_growth'].includes(planCode);
}

async function verifyPayerWallet(db: Db, userId: string, address: string): Promise<void> {
  const wallet = await db.first<{ id: string }>(
    `SELECT id FROM wallet_accounts
      WHERE user_id = ? AND provider = 'coinbase_cdp' AND chain_family = 'evm'
        AND lower(address) = ? AND status = 'active'
      LIMIT 1`,
    [userId, address],
  );
  if (!wallet) throw new HttpError(400, 'Use your connected Linkary wallet for subscription payment', 'billing_wallet_mismatch');
}

async function currentPromotion(db: Db, planId: string, timestamp: string): Promise<DiscountRow | null> {
  return db.first<DiscountRow>(
    `SELECT id, discount_type, discount_value
       FROM billing_plan_promotions
      WHERE plan_id = ? AND is_active = 1 AND starts_at <= ?
        AND (ends_at IS NULL OR ends_at > ?)
      ORDER BY is_public DESC, starts_at DESC
      LIMIT 1`,
    [planId, timestamp, timestamp],
  );
}

async function currentPriceOverride(db: Db, ownerType: OwnerType, ownerId: string, planId: string, timestamp: string): Promise<DiscountRow | null> {
  const column = ownerType === 'user' ? 'user_id' : 'organization_id';
  return db.first<DiscountRow>(
    `SELECT id, discount_type, discount_value
       FROM billing_account_price_overrides
      WHERE ${column} = ? AND plan_id = ? AND status = 'active' AND starts_at <= ?
        AND (ends_at IS NULL OR ends_at > ?)
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId, planId, timestamp, timestamp],
  );
}

async function couponForCheckout(db: Db, code: string | undefined, planCode: string, timestamp: string): Promise<CouponRow | null> {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return null;
  const coupon = await db.first<CouponRow>(
    `SELECT id, code, discount_type, discount_value, eligible_plan_codes_json, stackable
       FROM discount_coupons
      WHERE upper(code) = ? AND is_active = 1
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at > ?)
      LIMIT 1`,
    [normalized, timestamp, timestamp],
  );
  if (!coupon) throw new HttpError(400, 'Coupon is invalid or expired', 'coupon_invalid');
  const eligible = eligiblePlanCodes(coupon.eligible_plan_codes_json);
  if (eligible.length && !eligible.includes(planCode)) throw new HttpError(400, 'Coupon does not apply to this plan', 'coupon_plan_ineligible');
  return coupon;
}

export async function createBillingCheckoutSafe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ profileId?: string; planCode?: string; payerWalletAddress?: string; couponCode?: string }>(request);
  const profileId = body.profileId?.trim();
  const planCode = body.planCode?.trim();
  const payer = normalizeAddress(body.payerWalletAddress);
  if (!profileId || !planCode || !payer) throw new HttpError(400, 'Profile, plan and Linkary wallet are required', 'billing_checkout_invalid');

  const db = new Db(requireDb(env));
  await requireSchema(db);
  const treasury = requireTreasury(env);
  const owner = await resolveBillingOwner(db, auth.user.id, profileId);
  await verifyPayerWallet(db, auth.user.id, payer);
  if (!planAllowedForProfile(owner.profile, planCode)) throw new HttpError(400, 'This plan is not available for the selected profile', 'billing_plan_ineligible');

  const plan = await db.first<PlanRow>(
    `SELECT id, code, name, billing_period, base_price_cents, currency, monthly_usage_credits
       FROM billing_plans WHERE code = ? AND is_active = 1 LIMIT 1`,
    [planCode],
  );
  if (!plan || plan.billing_period !== 'monthly' || !plan.base_price_cents || plan.base_price_cents <= 0 || plan.currency !== 'USD') {
    throw new HttpError(400, 'This plan cannot be purchased through wallet checkout', 'billing_plan_unavailable');
  }

  const timestamp = now();
  const promotion = await currentPromotion(db, plan.id, timestamp);
  const accountOverride = await currentPriceOverride(db, owner.ownerType, owner.ownerId, plan.id, timestamp);
  const coupon = await couponForCheckout(db, body.couponCode, plan.code, timestamp);

  let bestPrice = plan.base_price_cents;
  let selectedPromotionId: string | null = null;
  let selectedOverrideId: string | null = null;
  if (promotion) {
    const price = priceAfterDiscount(plan.base_price_cents, promotion.discount_type, promotion.discount_value);
    if (price < bestPrice) {
      bestPrice = price;
      selectedPromotionId = promotion.id;
    }
  }
  if (accountOverride) {
    const price = priceAfterDiscount(plan.base_price_cents, accountOverride.discount_type, accountOverride.discount_value);
    if (price < bestPrice) {
      bestPrice = price;
      selectedOverrideId = accountOverride.id;
      selectedPromotionId = null;
    }
  }

  let selectedCouponId: string | null = null;
  let couponDiscountCents = 0;
  if (coupon) {
    const couponBase = coupon.stackable ? bestPrice : plan.base_price_cents;
    const couponPrice = priceAfterDiscount(couponBase, coupon.discount_type, coupon.discount_value);
    if (coupon.stackable || couponPrice < bestPrice) {
      couponDiscountCents = Math.max(0, couponBase - couponPrice);
      bestPrice = couponPrice;
      selectedCouponId = coupon.id;
      if (!coupon.stackable) {
        selectedPromotionId = null;
        selectedOverrideId = null;
      }
    }
  }
  if (coupon && !selectedCouponId) throw new HttpError(409, 'This coupon does not improve the current price for this account', 'coupon_not_applicable');
  if (bestPrice <= 0) throw new HttpError(409, 'Zero-value paid access must be granted through Superadmin instead of an onchain checkout', 'billing_zero_value_checkout');

  const intentId = id('bci');
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS).toISOString();
  const discountCents = plan.base_price_cents - bestPrice;
  const usdcAtomic = bestPrice * 10000;
  const intentStatement = db.statement(
    `INSERT INTO billing_checkout_intents
      (id, requested_by_user_id, owner_type, owner_id, profile_id, plan_id, payer_wallet_address,
       treasury_address, network, asset, base_price_cents, promotion_id, coupon_id,
       account_price_override_id, discount_cents, coupon_discount_cents, final_price_cents, currency,
       usdc_amount_atomic, monthly_usage_credits_snapshot, status, tx_hash, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'base', 'USDC', ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, 'pending', NULL, ?, ?, ?)`,
    [intentId, auth.user.id, owner.ownerType, owner.ownerId, profileId, plan.id, payer, treasury,
      plan.base_price_cents, selectedPromotionId, selectedCouponId, selectedOverrideId,
      discountCents, couponDiscountCents, bestPrice, usdcAtomic, plan.monthly_usage_credits,
      expiresAt, timestamp, timestamp],
  );

  try {
    if (selectedCouponId) {
      await db.batch([
        intentStatement,
        db.statement(
          `INSERT INTO billing_coupon_reservations
            (id, coupon_id, checkout_intent_id, user_id, organization_id, status, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
          [id('bcr'), selectedCouponId, intentId,
            owner.ownerType === 'user' ? owner.ownerId : null,
            owner.ownerType === 'organization' ? owner.ownerId : null,
            expiresAt, timestamp, timestamp],
        ),
      ]);
    } else {
      await db.batch([intentStatement]);
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    if (text.includes('coupon_reservation_limit')) throw new HttpError(409, 'Coupon redemption limit has been reached', 'coupon_exhausted');
    if (text.includes('coupon_account_reservation_limit')) throw new HttpError(409, 'Coupon is already reserved or used for this account', 'coupon_account_exhausted');
    throw error;
  }

  return json({
    intentId,
    plan: { code: plan.code, name: plan.name, monthlyUsageCredits: plan.monthly_usage_credits },
    basePriceCents: plan.base_price_cents,
    discountCents,
    finalPriceCents: bestPrice,
    currency: 'USD',
    payment: {
      network: 'base',
      asset: 'USDC',
      amount: (bestPrice / 100).toFixed(2),
      amountAtomic: usdcAtomic,
      payerWalletAddress: payer,
      treasuryAddress: treasury,
    },
    couponApplied: Boolean(selectedCouponId),
    expiresAt,
  }, { status: 201 });
}

async function alchemyRpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  if (!env.ALCHEMY_API_KEY) throw new ServiceConfigurationError('Alchemy API key is not configured');
  const response = await fetch(`https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(env.ALCHEMY_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new HttpError(502, 'Base payment verification is temporarily unavailable', 'billing_chain_verification_unavailable');
  const payload = await response.json() as { result?: T; error?: unknown };
  if (payload.error || payload.result === undefined) throw new HttpError(502, 'Base payment verification is temporarily unavailable', 'billing_chain_verification_unavailable');
  return payload.result;
}

function receiptContainsExactUsdcTransfer(receipt: Receipt, payer: string, treasury: string, expectedAtomic: bigint): boolean {
  return (receipt.logs || []).some((log) => {
    if (normalizeAddress(log.address) !== BASE_USDC) return false;
    if (log.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false;
    if (topicAddress(log.topics?.[1]) !== payer) return false;
    if (topicAddress(log.topics?.[2]) !== treasury) return false;
    return amountFromData(log.data) === expectedAtomic;
  });
}

export async function verifyBillingCheckoutSafe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ intentId?: string; txHash?: string }>(request);
  const intentId = body.intentId?.trim();
  const txHash = normalizeTxHash(body.txHash);
  if (!intentId || !txHash) throw new HttpError(400, 'Checkout intent and transaction hash are required', 'billing_payment_invalid');

  const db = new Db(requireDb(env));
  await requireSchema(db);
  const intent = await db.first<CheckoutIntentRow>(
    `SELECT id, requested_by_user_id, owner_type, owner_id, profile_id, plan_id, payer_wallet_address,
            treasury_address, coupon_id, coupon_discount_cents, final_price_cents, usdc_amount_atomic,
            monthly_usage_credits_snapshot, status, tx_hash, expires_at
       FROM billing_checkout_intents WHERE id = ?`,
    [intentId],
  );
  if (!intent || intent.requested_by_user_id !== auth.user.id) throw new HttpError(404, 'Checkout intent not found', 'billing_checkout_not_found');

  const existingPayment = await db.first<PaymentRow>(
    `SELECT id, tx_hash, verified_at FROM billing_payments WHERE checkout_intent_id = ?`,
    [intent.id],
  );
  if (existingPayment) {
    return json({ ok: true, status: 'paid', paymentId: existingPayment.id, txHash: existingPayment.tx_hash, verifiedAt: existingPayment.verified_at, duplicate: true });
  }
  if (!['pending', 'submitted'].includes(intent.status)) throw new HttpError(409, 'Checkout is no longer payable', 'billing_checkout_closed');
  if (intent.tx_hash && intent.tx_hash !== txHash) throw new HttpError(409, 'Checkout already has a different submitted transaction', 'billing_tx_conflict');

  const timestamp = now();
  if (intent.status === 'pending') {
    if (intent.expires_at <= timestamp) {
      await db.batch([
        db.statement(`UPDATE billing_checkout_intents SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'`, [timestamp, intent.id]),
        db.statement(`UPDATE billing_coupon_reservations SET status = 'released', updated_at = ? WHERE checkout_intent_id = ? AND status = 'reserved'`, [timestamp, intent.id]),
      ]);
      throw new HttpError(409, 'Checkout quote has expired. Create a new quote.', 'billing_checkout_expired');
    }
    await db.run(
      `UPDATE billing_checkout_intents SET status = 'submitted', tx_hash = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
      [txHash, timestamp, intent.id],
    );
  }

  const receipt = await alchemyRpc<Receipt | null>(env, 'eth_getTransactionReceipt', [txHash]);
  if (!receipt) return json({ ok: false, status: 'pending', message: 'Payment is still waiting for Base confirmation.' }, { status: 202 });
  if (receipt.status?.toLowerCase() !== '0x1') throw new HttpError(409, 'The Base transaction did not complete successfully', 'billing_tx_failed');
  if (!receiptContainsExactUsdcTransfer(receipt, intent.payer_wallet_address, intent.treasury_address, BigInt(intent.usdc_amount_atomic))) {
    throw new HttpError(409, 'Transaction does not match this Linkary checkout', 'billing_transfer_mismatch');
  }

  const duplicateHash = await db.first<{ id: string; checkout_intent_id: string }>(
    `SELECT id, checkout_intent_id FROM billing_payments WHERE tx_hash = ?`,
    [txHash],
  );
  if (duplicateHash && duplicateHash.checkout_intent_id !== intent.id) throw new HttpError(409, 'This transaction has already been used for another checkout', 'billing_tx_reused');

  const plan = await db.first<{ code: string }>(`SELECT code FROM billing_plans WHERE id = ?`, [intent.plan_id]);
  if (!plan) throw new HttpError(409, 'Purchased plan record is unavailable', 'billing_plan_unavailable');

  const paymentId = id('pay');
  const periodId = id('subp');
  const currentPeriod = await db.first<{ period_end: string; plan_id: string }>(
    `SELECT period_end, plan_id
       FROM billing_subscription_periods
      WHERE owner_type = ? AND owner_id = ? AND status = 'active' AND period_end > ?
      ORDER BY period_end DESC LIMIT 1`,
    [intent.owner_type, intent.owner_id, timestamp],
  );
  const continuingSamePlan = currentPeriod?.plan_id === intent.plan_id;
  const periodStart = continuingSamePlan && currentPeriod ? currentPeriod.period_end : timestamp;
  const periodEnd = addOneMonth(periodStart);
  const blockNumber = receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null;
  const statements = [
    db.statement(
      `INSERT OR IGNORE INTO billing_payments
        (id, checkout_intent_id, owner_type, owner_id, plan_id, payer_wallet_address, treasury_address,
         network, asset, amount_atomic, amount_cents, tx_hash, block_number, status, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'base', 'USDC', ?, ?, ?, ?, 'verified', ?, ?)`,
      [paymentId, intent.id, intent.owner_type, intent.owner_id, intent.plan_id, intent.payer_wallet_address,
        intent.treasury_address, intent.usdc_amount_atomic, intent.final_price_cents, txHash, blockNumber, timestamp, timestamp],
    ),
    db.statement(`UPDATE billing_checkout_intents SET status = 'paid', updated_at = ? WHERE id = ? AND tx_hash = ?`, [timestamp, intent.id, txHash]),
    db.statement(
      `UPDATE billing_subscription_periods SET status = 'replaced', updated_at = ?
        WHERE owner_type = ? AND owner_id = ? AND status = 'active' AND plan_id <> ? AND period_end > ?`,
      [timestamp, intent.owner_type, intent.owner_id, intent.plan_id, timestamp],
    ),
    db.statement(
      `INSERT OR IGNORE INTO billing_subscription_periods
        (id, owner_type, owner_id, plan_id, payment_id, status, period_start, period_end, price_cents, currency, created_at, updated_at)
       SELECT ?, ?, ?, ?, p.id, 'active', ?, ?, ?, 'USD', ?, ?
         FROM billing_payments p WHERE p.checkout_intent_id = ? AND p.tx_hash = ?`,
      [periodId, intent.owner_type, intent.owner_id, intent.plan_id, periodStart, periodEnd, intent.final_price_cents,
        timestamp, timestamp, intent.id, txHash],
    ),
    db.statement(
      `INSERT OR IGNORE INTO usage_credit_ledger
        (id, owner_type, owner_id, transaction_type, amount, reason, feature_key, provider, related_id, idempotency_key, created_by_user_id, created_at)
       SELECT ?, ?, ?, 'monthly_grant', ?, ?, NULL, NULL, p.id, ?, NULL, ?
         FROM billing_payments p WHERE p.checkout_intent_id = ? AND p.tx_hash = ?`,
      [id('ucl'), intent.owner_type, intent.owner_id, intent.monthly_usage_credits_snapshot,
        `${plan.code} monthly subscription credits`, `billing-payment:${intent.id}:monthly-credits`, timestamp, intent.id, txHash],
    ),
  ];

  if (intent.coupon_id) {
    statements.push(
      db.statement(
        `INSERT OR IGNORE INTO coupon_redemptions
          (id, coupon_id, user_id, organization_id, plan_id, discount_cents, related_payment_id, redeemed_at)
         SELECT ?, ?, ?, ?, ?, ?, p.id, ?
           FROM billing_payments p WHERE p.checkout_intent_id = ? AND p.tx_hash = ?`,
        [id('cpr'), intent.coupon_id,
          intent.owner_type === 'user' ? intent.owner_id : null,
          intent.owner_type === 'organization' ? intent.owner_id : null,
          intent.plan_id, intent.coupon_discount_cents, timestamp, intent.id, txHash],
      ),
      db.statement(
        `UPDATE billing_coupon_reservations SET status = 'consumed', updated_at = ?
          WHERE checkout_intent_id = ? AND coupon_id = ? AND status = 'reserved'`,
        [timestamp, intent.id, intent.coupon_id],
      ),
    );
  }

  await db.batch(statements);
  const verified = await db.first<PaymentRow>(`SELECT id, tx_hash, verified_at FROM billing_payments WHERE checkout_intent_id = ?`, [intent.id]);
  if (!verified) throw new HttpError(409, 'Payment confirmation could not be finalized', 'billing_payment_conflict');

  return json({
    ok: true,
    status: 'paid',
    paymentId: verified.id,
    txHash: verified.tx_hash,
    verifiedAt: verified.verified_at,
    periodStart,
    periodEnd,
    monthlyUsageCredits: intent.monthly_usage_credits_snapshot,
    duplicate: false,
  });
}

async function usdcBalanceAtomic(env: Env, wallet: string): Promise<bigint> {
  const data = `0x70a08231${wallet.slice(2).padStart(64, '0')}`;
  const result = await alchemyRpc<string>(env, 'eth_call', [{ to: BASE_USDC, data }, 'latest']);
  try { return BigInt(result); }
  catch { throw new HttpError(502, 'USDC balance could not be read', 'billing_balance_unavailable'); }
}

export async function billingPaymentConfigurationSafe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const ready = await schemaReady(db);
  const treasury = normalizeAddress(env.BILLING_TREASURY_EVM_ADDRESS);
  const wallet = await db.first<{ address: string }>(
    `SELECT address FROM wallet_accounts
      WHERE user_id = ? AND provider = 'coinbase_cdp' AND chain_family = 'evm' AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    [auth.user.id],
  );
  const payer = normalizeAddress(wallet?.address);
  let balanceAtomic: bigint | null = null;
  if (ready && payer && env.ALCHEMY_API_KEY) {
    try { balanceAtomic = await usdcBalanceAtomic(env, payer); }
    catch { balanceAtomic = null; }
  }
  return json({
    configured: Boolean(ready && treasury && env.ALCHEMY_API_KEY),
    treasuryAddress: treasury,
    payerWalletAddress: payer,
    network: 'base',
    asset: 'USDC',
    balanceAtomic: balanceAtomic === null ? null : balanceAtomic.toString(),
    balance: balanceAtomic === null ? null : (Number(balanceAtomic) / 1_000_000).toFixed(2),
    actorUserId: auth.user.id,
  }, { headers: { 'cache-control': 'private, no-store' } });
}
