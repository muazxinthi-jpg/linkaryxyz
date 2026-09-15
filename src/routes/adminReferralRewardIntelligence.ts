import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

type RewardBasis = 'percentage_first_payment' | 'fixed_first_payment';
type DecisionStatus = 'review' | 'approved' | 'paid' | 'void';

type RuleRow = {
  id: string;
  name: string;
  reward_basis: RewardBasis;
  percentage_bps: number | null;
  fixed_amount_cents: number | null;
  minimum_payout_cents: number;
  first_payment_only: number;
  exclude_free_access: number;
  exclude_refunded_payments: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type SummaryRow = {
  total_referrals: number;
  paid_referrals: number;
  free_unpaid_referrals: number;
  reversed_referrals: number;
  active_paid_referrals: number;
  free_access_referrals: number;
  referral_revenue_cents: number;
  eligible_unreviewed_count: number;
  eligible_unreviewed_cents: number;
  review_cents: number;
  approved_cents: number;
  paid_cents: number;
  void_cents: number;
};

type LeaderRow = {
  inviter_user_id: string;
  display_name: string;
  username: string | null;
  direct_referrals: number;
  paid_referrals: number;
  free_unpaid_referrals: number;
  reversed_referrals: number;
  active_paid_referrals: number;
  referral_revenue_cents: number;
  eligible_unreviewed_count: number;
  eligible_unreviewed_cents: number;
  review_cents: number;
  approved_cents: number;
  paid_cents: number;
};

type LedgerRow = {
  edge_id: string;
  invited_at: string;
  inviter_user_id: string;
  inviter_name: string;
  inviter_username: string | null;
  referred_user_id: string;
  referred_name: string;
  referred_username: string | null;
  payment_id: string | null;
  payment_status: 'verified' | 'refunded' | 'reversed' | null;
  payment_amount_cents: number | null;
  payment_at: string | null;
  plan_code: string | null;
  plan_name: string | null;
  base_price_cents: number | null;
  discount_cents: number | null;
  coupon_discount_cents: number | null;
  coupon_code: string | null;
  free_access_code: string | null;
  active_paid: number;
  lifetime_revenue_cents: number;
  decision_status: DecisionStatus | null;
  decision_reward_cents: number | null;
  decision_reason: string | null;
  decision_payment_reference: string | null;
  decision_approved_at: string | null;
  decision_paid_at: string | null;
};

type PayableRow = {
  payment_id: string;
  inviter_user_id: string;
  display_name: string;
  username: string | null;
  referred_user_id: string;
  referred_name: string;
  computed_reward_cents: number;
  source_payment_amount_cents: number;
  reason: string;
  approved_at: string;
  payment_status: string;
};

type CandidateRow = {
  payment_id: string;
  payment_status: 'verified' | 'refunded' | 'reversed';
  payment_amount_cents: number;
  inviter_user_id: string;
  referred_user_id: string;
};

type DecisionRow = {
  payment_id: string;
  reward_rule_id: string;
  computed_reward_cents: number;
  status: DecisionStatus;
};

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const noStore = () => ({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' });

function asNumber(value: unknown): number {
  return Number(value || 0);
}

async function schemaReady(db: Db): Promise<boolean> {
  const row = await db.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name IN ('referral_reward_rules', 'referral_reward_decisions')`,
  );
  return Number(row?.count || 0) === 2;
}

async function activeRule(db: Db): Promise<RuleRow | null> {
  return db.first<RuleRow>(
    `SELECT id, name, reward_basis, percentage_bps, fixed_amount_cents, minimum_payout_cents,
            first_payment_only, exclude_free_access, exclude_refunded_payments, is_active,
            created_at, updated_at
       FROM referral_reward_rules
      WHERE is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1`,
  );
}

function computedRewardCents(rule: RuleRow, paymentCents: number): number {
  if (paymentCents <= 0) return 0;
  if (rule.reward_basis === 'fixed_first_payment') return Math.max(0, Math.round(Number(rule.fixed_amount_cents || 0)));
  return Math.max(0, Math.round(paymentCents * Number(rule.percentage_bps || 0) / 10_000));
}

function estimateSql(rule: RuleRow): string {
  if (rule.reward_basis === 'fixed_first_payment') return String(Math.max(0, Math.round(Number(rule.fixed_amount_cents || 0))));
  const bps = Math.max(0, Math.round(Number(rule.percentage_bps || 0)));
  return `CAST(ROUND(fp.amount_cents * ${bps} / 10000.0) AS INTEGER)`;
}

function ruleJson(rule: RuleRow) {
  return {
    id: rule.id,
    name: rule.name,
    rewardBasis: rule.reward_basis,
    percentageBps: rule.percentage_bps == null ? null : Number(rule.percentage_bps),
    fixedAmountCents: rule.fixed_amount_cents == null ? null : Number(rule.fixed_amount_cents),
    minimumPayoutCents: Number(rule.minimum_payout_cents || 0),
    firstPaymentOnly: Boolean(rule.first_payment_only),
    excludeFreeAccess: Boolean(rule.exclude_free_access),
    excludeRefundedPayments: Boolean(rule.exclude_refunded_payments),
    updatedAt: rule.updated_at,
  };
}

const PAYMENT_CTES = `
WITH ranked_payments AS (
  SELECT
    bci.requested_by_user_id AS referred_user_id,
    bp.id AS payment_id,
    bp.amount_cents,
    bp.status AS payment_status,
    bp.verified_at,
    bp.owner_type,
    bp.owner_id,
    bp.plan_id,
    bci.base_price_cents,
    bci.discount_cents,
    bci.coupon_discount_cents,
    bci.coupon_id,
    ROW_NUMBER() OVER (
      PARTITION BY bci.requested_by_user_id
      ORDER BY bp.verified_at ASC, bp.id ASC
    ) AS payment_rank
  FROM billing_payments bp
  JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
  WHERE bci.status = 'paid'
),
first_payment AS (
  SELECT * FROM ranked_payments WHERE payment_rank = 1
),
lifetime_revenue AS (
  SELECT bci.requested_by_user_id AS referred_user_id,
         COALESCE(SUM(CASE WHEN bp.status = 'verified' THEN bp.amount_cents ELSE 0 END), 0) AS amount_cents
    FROM billing_payments bp
    JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
   WHERE bci.status = 'paid'
   GROUP BY bci.requested_by_user_id
)`;

export async function adminReferralRewardIntelligence(request: Request, env: Env): Promise<Response> {
  await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) {
    return json({
      ready: false,
      requiredMigration: '0045_referral_reward_intelligence.sql',
      message: 'Referral reward intelligence is waiting for production migration 0045.',
    }, { headers: noStore() });
  }

  const rule = await activeRule(db);
  if (!rule) {
    return json({
      ready: true,
      activeRule: null,
      summary: null,
      leaders: [],
      ledger: [],
      payables: [],
      message: 'No active referral reward rule is configured.',
    }, { headers: noStore() });
  }

  const rewardExpr = estimateSql(rule);
  const timestamp = new Date().toISOString();

  const [summary, leaderRows, ledgerRows, payableRows] = await Promise.all([
    db.first<SummaryRow>(`${PAYMENT_CTES}
      SELECT
        COUNT(*) AS total_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_id IS NOT NULL AND fp.payment_status = 'verified' THEN 1 ELSE 0 END), 0) AS paid_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_id IS NULL THEN 1 ELSE 0 END), 0) AS free_unpaid_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_id IS NOT NULL AND fp.payment_status <> 'verified' THEN 1 ELSE 0 END), 0) AS reversed_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_status = 'verified' AND EXISTS (
          SELECT 1 FROM billing_subscription_periods sp
           WHERE sp.owner_type = fp.owner_type AND sp.owner_id = fp.owner_id
             AND sp.status = 'active' AND sp.period_start <= ? AND sp.period_end > ?
        ) THEN 1 ELSE 0 END), 0) AS active_paid_referrals,
        COALESCE(SUM(CASE WHEN EXISTS (
          SELECT 1 FROM coupon_redemptions cr
          JOIN discount_coupons dc ON dc.id = cr.coupon_id
          WHERE cr.user_id = e.invitee_user_id AND cr.related_payment_id IS NULL
            AND dc.discount_type = 'percent' AND dc.discount_value = 100
        ) THEN 1 ELSE 0 END), 0) AS free_access_referrals,
        COALESCE(SUM(lr.amount_cents), 0) AS referral_revenue_cents,
        COALESCE(SUM(CASE WHEN fp.payment_status = 'verified' AND d.payment_id IS NULL THEN 1 ELSE 0 END), 0) AS eligible_unreviewed_count,
        COALESCE(SUM(CASE WHEN fp.payment_status = 'verified' AND d.payment_id IS NULL THEN ${rewardExpr} ELSE 0 END), 0) AS eligible_unreviewed_cents,
        COALESCE(SUM(CASE WHEN d.status = 'review' AND fp.payment_status = 'verified' THEN d.computed_reward_cents ELSE 0 END), 0) AS review_cents,
        COALESCE(SUM(CASE WHEN d.status = 'approved' AND fp.payment_status = 'verified' THEN d.computed_reward_cents ELSE 0 END), 0) AS approved_cents,
        COALESCE(SUM(CASE WHEN d.status = 'paid' THEN d.computed_reward_cents ELSE 0 END), 0) AS paid_cents,
        COALESCE(SUM(CASE WHEN d.status = 'void' THEN d.computed_reward_cents ELSE 0 END), 0) AS void_cents
      FROM network_referral_edges e
      LEFT JOIN first_payment fp ON fp.referred_user_id = e.invitee_user_id
      LEFT JOIN lifetime_revenue lr ON lr.referred_user_id = e.invitee_user_id
      LEFT JOIN referral_reward_decisions d ON d.payment_id = fp.payment_id
      WHERE e.status = 'active'`, [timestamp, timestamp]),

    db.all<LeaderRow>(`${PAYMENT_CTES}
      SELECT
        e.inviter_user_id,
        u.display_name,
        (SELECT p.username FROM profiles p WHERE p.owner_user_id = e.inviter_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS username,
        COUNT(*) AS direct_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_id IS NOT NULL AND fp.payment_status = 'verified' THEN 1 ELSE 0 END), 0) AS paid_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_id IS NULL THEN 1 ELSE 0 END), 0) AS free_unpaid_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_id IS NOT NULL AND fp.payment_status <> 'verified' THEN 1 ELSE 0 END), 0) AS reversed_referrals,
        COALESCE(SUM(CASE WHEN fp.payment_status = 'verified' AND EXISTS (
          SELECT 1 FROM billing_subscription_periods sp
           WHERE sp.owner_type = fp.owner_type AND sp.owner_id = fp.owner_id
             AND sp.status = 'active' AND sp.period_start <= ? AND sp.period_end > ?
        ) THEN 1 ELSE 0 END), 0) AS active_paid_referrals,
        COALESCE(SUM(lr.amount_cents), 0) AS referral_revenue_cents,
        COALESCE(SUM(CASE WHEN fp.payment_status = 'verified' AND d.payment_id IS NULL THEN 1 ELSE 0 END), 0) AS eligible_unreviewed_count,
        COALESCE(SUM(CASE WHEN fp.payment_status = 'verified' AND d.payment_id IS NULL THEN ${rewardExpr} ELSE 0 END), 0) AS eligible_unreviewed_cents,
        COALESCE(SUM(CASE WHEN d.status = 'review' AND fp.payment_status = 'verified' THEN d.computed_reward_cents ELSE 0 END), 0) AS review_cents,
        COALESCE(SUM(CASE WHEN d.status = 'approved' AND fp.payment_status = 'verified' THEN d.computed_reward_cents ELSE 0 END), 0) AS approved_cents,
        COALESCE(SUM(CASE WHEN d.status = 'paid' THEN d.computed_reward_cents ELSE 0 END), 0) AS paid_cents
      FROM network_referral_edges e
      JOIN users u ON u.id = e.inviter_user_id
      LEFT JOIN first_payment fp ON fp.referred_user_id = e.invitee_user_id
      LEFT JOIN lifetime_revenue lr ON lr.referred_user_id = e.invitee_user_id
      LEFT JOIN referral_reward_decisions d ON d.payment_id = fp.payment_id
      WHERE e.status = 'active'
      GROUP BY e.inviter_user_id, u.display_name
      ORDER BY eligible_unreviewed_cents + review_cents + approved_cents + paid_cents DESC,
               paid_referrals DESC, direct_referrals DESC
      LIMIT 100`, [timestamp, timestamp]),

    db.all<LedgerRow>(`${PAYMENT_CTES}
      SELECT
        e.id AS edge_id,
        e.created_at AS invited_at,
        e.inviter_user_id,
        inviter.display_name AS inviter_name,
        (SELECT p.username FROM profiles p WHERE p.owner_user_id = e.inviter_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS inviter_username,
        e.invitee_user_id AS referred_user_id,
        invitee.display_name AS referred_name,
        (SELECT p.username FROM profiles p WHERE p.owner_user_id = e.invitee_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS referred_username,
        fp.payment_id,
        fp.payment_status,
        fp.amount_cents AS payment_amount_cents,
        fp.verified_at AS payment_at,
        plan.code AS plan_code,
        plan.name AS plan_name,
        fp.base_price_cents,
        fp.discount_cents,
        fp.coupon_discount_cents,
        coupon.code AS coupon_code,
        (SELECT dc.code
           FROM coupon_redemptions cr
           JOIN discount_coupons dc ON dc.id = cr.coupon_id
          WHERE cr.user_id = e.invitee_user_id AND cr.related_payment_id IS NULL
            AND dc.discount_type = 'percent' AND dc.discount_value = 100
          ORDER BY cr.redeemed_at DESC LIMIT 1) AS free_access_code,
        CASE WHEN fp.payment_status = 'verified' AND EXISTS (
          SELECT 1 FROM billing_subscription_periods sp
           WHERE sp.owner_type = fp.owner_type AND sp.owner_id = fp.owner_id
             AND sp.status = 'active' AND sp.period_start <= ? AND sp.period_end > ?
        ) THEN 1 ELSE 0 END AS active_paid,
        COALESCE(lr.amount_cents, 0) AS lifetime_revenue_cents,
        d.status AS decision_status,
        d.computed_reward_cents AS decision_reward_cents,
        d.reason AS decision_reason,
        d.payment_reference AS decision_payment_reference,
        d.approved_at AS decision_approved_at,
        d.paid_at AS decision_paid_at
      FROM network_referral_edges e
      JOIN users inviter ON inviter.id = e.inviter_user_id
      JOIN users invitee ON invitee.id = e.invitee_user_id
      LEFT JOIN first_payment fp ON fp.referred_user_id = e.invitee_user_id
      LEFT JOIN lifetime_revenue lr ON lr.referred_user_id = e.invitee_user_id
      LEFT JOIN billing_plans plan ON plan.id = fp.plan_id
      LEFT JOIN discount_coupons coupon ON coupon.id = fp.coupon_id
      LEFT JOIN referral_reward_decisions d ON d.payment_id = fp.payment_id
      WHERE e.status = 'active'
      ORDER BY CASE WHEN fp.payment_status = 'verified' AND d.payment_id IS NULL THEN 0
                    WHEN d.status = 'approved' THEN 1
                    WHEN d.status = 'review' THEN 2
                    ELSE 3 END,
               COALESCE(fp.verified_at, e.created_at) DESC
      LIMIT 300`, [timestamp, timestamp]),

    db.all<PayableRow>(
      `SELECT d.payment_id, d.inviter_user_id, u.display_name,
              (SELECT p.username FROM profiles p WHERE p.owner_user_id = d.inviter_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS username,
              d.referred_user_id, referred.display_name AS referred_name,
              d.computed_reward_cents, d.source_payment_amount_cents, d.reason,
              d.approved_at, bp.status AS payment_status
         FROM referral_reward_decisions d
         JOIN billing_payments bp ON bp.id = d.payment_id
         JOIN users u ON u.id = d.inviter_user_id
         JOIN users referred ON referred.id = d.referred_user_id
        WHERE d.status = 'approved' AND bp.status = 'verified'
        ORDER BY d.approved_at ASC, d.updated_at ASC
        LIMIT 100`,
    ),
  ]);

  const normalizedLedger = ledgerRows.map((row) => {
    const paymentVerified = row.payment_id !== null && row.payment_status === 'verified';
    const estimatedReward = paymentVerified
      ? row.decision_status === 'void'
        ? 0
        : row.decision_reward_cents == null
          ? computedRewardCents(rule, asNumber(row.payment_amount_cents))
          : asNumber(row.decision_reward_cents)
      : 0;
    const eligibility = !row.payment_id
      ? row.free_access_code ? 'free_access' : 'no_verified_payment'
      : row.payment_status === 'verified'
        ? 'eligible'
        : 'payment_reversed';
    return {
      edgeId: row.edge_id,
      invitedAt: row.invited_at,
      inviterUserId: row.inviter_user_id,
      inviterName: row.inviter_name,
      inviterUsername: row.inviter_username,
      referredUserId: row.referred_user_id,
      referredName: row.referred_name,
      referredUsername: row.referred_username,
      paymentId: row.payment_id,
      paymentStatus: row.payment_status,
      paymentAmountCents: row.payment_amount_cents == null ? null : asNumber(row.payment_amount_cents),
      paymentAt: row.payment_at,
      planCode: row.plan_code,
      planName: row.plan_name,
      basePriceCents: row.base_price_cents == null ? null : asNumber(row.base_price_cents),
      discountCents: row.discount_cents == null ? null : asNumber(row.discount_cents),
      couponDiscountCents: row.coupon_discount_cents == null ? null : asNumber(row.coupon_discount_cents),
      couponCode: row.coupon_code,
      freeAccessCode: row.free_access_code,
      activePaid: Boolean(row.active_paid),
      lifetimeRevenueCents: asNumber(row.lifetime_revenue_cents),
      eligibility,
      estimatedRewardCents: estimatedReward,
      decisionStatus: row.decision_status,
      decisionReason: row.decision_reason,
      paymentReference: row.decision_payment_reference,
      approvedAt: row.decision_approved_at,
      paidAt: row.decision_paid_at,
    };
  });

  const summaryValue = summary || {
    total_referrals: 0,
    paid_referrals: 0,
    free_unpaid_referrals: 0,
    reversed_referrals: 0,
    active_paid_referrals: 0,
    free_access_referrals: 0,
    referral_revenue_cents: 0,
    eligible_unreviewed_count: 0,
    eligible_unreviewed_cents: 0,
    review_cents: 0,
    approved_cents: 0,
    paid_cents: 0,
    void_cents: 0,
  };

  const eligibleEstimate = asNumber(summaryValue.eligible_unreviewed_cents);
  const reviewCents = asNumber(summaryValue.review_cents);
  const approvedCents = asNumber(summaryValue.approved_cents);
  const paidCents = asNumber(summaryValue.paid_cents);

  return json({
    ready: true,
    generatedAt: timestamp,
    activeRule: ruleJson(rule),
    summary: {
      totalReferrals: asNumber(summaryValue.total_referrals),
      paidReferrals: asNumber(summaryValue.paid_referrals),
      freeUnpaidReferrals: asNumber(summaryValue.free_unpaid_referrals),
      reversedReferrals: asNumber(summaryValue.reversed_referrals),
      activePaidReferrals: asNumber(summaryValue.active_paid_referrals),
      freeAccessReferrals: asNumber(summaryValue.free_access_referrals),
      referralRevenueCents: asNumber(summaryValue.referral_revenue_cents),
      eligibleUnreviewedCount: asNumber(summaryValue.eligible_unreviewed_count),
      eligibleUnreviewedCents: eligibleEstimate,
      reviewCents,
      approvedCents,
      paidCents,
      voidCents: asNumber(summaryValue.void_cents),
      estimatedRewardCents: eligibleEstimate + reviewCents + approvedCents + paidCents,
      outstandingCents: approvedCents,
    },
    leaders: leaderRows.map((row) => ({
      userId: row.inviter_user_id,
      displayName: row.display_name,
      username: row.username,
      directReferrals: asNumber(row.direct_referrals),
      paidReferrals: asNumber(row.paid_referrals),
      freeUnpaidReferrals: asNumber(row.free_unpaid_referrals),
      reversedReferrals: asNumber(row.reversed_referrals),
      activePaidReferrals: asNumber(row.active_paid_referrals),
      referralRevenueCents: asNumber(row.referral_revenue_cents),
      eligibleUnreviewedCount: asNumber(row.eligible_unreviewed_count),
      eligibleUnreviewedCents: asNumber(row.eligible_unreviewed_cents),
      reviewCents: asNumber(row.review_cents),
      approvedCents: asNumber(row.approved_cents),
      paidCents: asNumber(row.paid_cents),
      estimatedRewardCents: asNumber(row.eligible_unreviewed_cents) + asNumber(row.review_cents) + asNumber(row.approved_cents) + asNumber(row.paid_cents),
      outstandingCents: asNumber(row.approved_cents),
    })),
    ledger: normalizedLedger,
    payables: payableRows.map((row) => ({
      paymentId: row.payment_id,
      inviterUserId: row.inviter_user_id,
      displayName: row.display_name,
      username: row.username,
      referredUserId: row.referred_user_id,
      referredName: row.referred_name,
      amountCents: asNumber(row.computed_reward_cents),
      sourcePaymentAmountCents: asNumber(row.source_payment_amount_cents),
      reason: row.reason,
      approvedAt: row.approved_at,
      paymentStatus: row.payment_status,
    })),
    policy: {
      directReferralOnly: true,
      firstPaidTransactionOnly: true,
      freeAccessRewardCents: 0,
      fullDiscountRewardCents: 0,
      publicPromise: false,
      automaticPayout: false,
      explanation: 'Only the direct inviter can earn an internal estimate, and only after the referred user has a real verified positive-value payment. Free access and 100% coupons never create a billing payment or reward. Approval and settlement remain explicit Superadmin actions.',
    },
  }, { headers: noStore() });
}

export async function updateReferralRewardRule(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    name?: string;
    rewardBasis?: 'percentage' | 'fixed';
    percentageBps?: number | null;
    fixedAmountCents?: number | null;
    minimumPayoutCents?: number;
  }>(request);
  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) throw new HttpError(503, 'Production migration 0045 is required before referral reward rules can be changed', 'referral_reward_intelligence_migration_required');

  const basis: RewardBasis = body.rewardBasis === 'fixed' ? 'fixed_first_payment' : 'percentage_first_payment';
  const percentageBps = basis === 'percentage_first_payment' ? Math.round(Number(body.percentageBps)) : null;
  const fixedAmountCents = basis === 'fixed_first_payment' ? Math.round(Number(body.fixedAmountCents)) : null;
  const minimumPayoutCents = Math.round(Number(body.minimumPayoutCents || 0));
  if (basis === 'percentage_first_payment' && (!Number.isInteger(percentageBps) || Number(percentageBps) < 1 || Number(percentageBps) > 10000)) {
    throw new HttpError(400, 'Reward percentage must be between 0.01% and 100%', 'referral_reward_rule_invalid');
  }
  if (basis === 'fixed_first_payment' && (!Number.isInteger(fixedAmountCents) || Number(fixedAmountCents) < 1 || Number(fixedAmountCents) > 10_000_000)) {
    throw new HttpError(400, 'Fixed referral reward must be between $0.01 and $100,000', 'referral_reward_rule_invalid');
  }
  if (!Number.isInteger(minimumPayoutCents) || minimumPayoutCents < 0 || minimumPayoutCents > 10_000_000) {
    throw new HttpError(400, 'Minimum payout threshold is invalid', 'referral_reward_rule_invalid');
  }
  const defaultName = basis === 'percentage_first_payment'
    ? `${(Number(percentageBps) / 100).toFixed(2).replace(/\.00$/, '')}% first paid referral`
    : `$${(Number(fixedAmountCents) / 100).toFixed(2)} first paid referral`;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) || defaultName : defaultName;
  const timestamp = new Date().toISOString();
  const ruleId = newId('rrule');

  await db.batch([
    db.statement(`UPDATE referral_reward_rules SET is_active = 0, updated_at = ? WHERE is_active = 1`, [timestamp]),
    db.statement(
      `INSERT INTO referral_reward_rules
        (id, name, reward_basis, percentage_bps, fixed_amount_cents, minimum_payout_cents,
         first_payment_only, exclude_free_access, exclude_refunded_payments, is_active,
         created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?)`,
      [ruleId, name, basis, percentageBps, fixedAmountCents, minimumPayoutCents, auth.user.id, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'referral_reward.rule_updated', 'referral_reward_rule', ?, NULL, ?, ?)`,
      [newId('aud'), auth.user.id, ruleId, JSON.stringify({ basis, percentageBps, fixedAmountCents, minimumPayoutCents, firstPaymentOnly: true, excludeFreeAccess: true, excludeRefundedPayments: true }), timestamp],
    ),
  ]);

  return json({ ok: true, ruleId }, { headers: noStore() });
}

async function paymentCandidate(db: Db, paymentId: string): Promise<CandidateRow | null> {
  return db.first<CandidateRow>(
    `WITH ranked AS (
       SELECT bp.id AS payment_id, bp.status AS payment_status, bp.amount_cents AS payment_amount_cents,
              bci.requested_by_user_id AS referred_user_id,
              ROW_NUMBER() OVER (PARTITION BY bci.requested_by_user_id ORDER BY bp.verified_at ASC, bp.id ASC) AS payment_rank
         FROM billing_payments bp
         JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
        WHERE bci.status = 'paid'
     )
     SELECT ranked.payment_id, ranked.payment_status, ranked.payment_amount_cents,
            e.inviter_user_id, ranked.referred_user_id
       FROM ranked
       JOIN network_referral_edges e ON e.invitee_user_id = ranked.referred_user_id AND e.status = 'active'
      WHERE ranked.payment_rank = 1 AND ranked.payment_id = ?
      LIMIT 1`,
    [paymentId],
  );
}

export async function updateReferralRewardDecision(request: Request, env: Env, paymentId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: DecisionStatus; reason?: string; paymentReference?: string | null }>(request);
  const next = body.status;
  if (!next || !['review', 'approved', 'paid', 'void'].includes(next)) {
    throw new HttpError(400, 'Referral reward status is invalid', 'referral_reward_status_invalid');
  }
  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) throw new HttpError(503, 'Production migration 0045 is required before referral rewards can be reviewed', 'referral_reward_intelligence_migration_required');
  const candidate = await paymentCandidate(db, paymentId);
  if (!candidate) throw new HttpError(404, 'Eligible direct referral payment was not found', 'referral_reward_candidate_not_found');

  const current = await db.first<DecisionRow>(
    `SELECT payment_id, reward_rule_id, computed_reward_cents, status
       FROM referral_reward_decisions WHERE payment_id = ?`,
    [paymentId],
  );

  const allowed: DecisionStatus[] = !current
    ? ['review', 'approved', 'void']
    : current.status === 'review'
      ? ['approved', 'void']
      : current.status === 'approved'
        ? ['paid', 'void']
        : [];
  if (!allowed.includes(next)) {
    throw new HttpError(409, `Reward cannot move from ${current?.status || 'eligible'} to ${next}`, 'referral_reward_transition_invalid');
  }
  if (candidate.payment_status !== 'verified' && next !== 'void') {
    throw new HttpError(409, 'Refunded or reversed source payments cannot become payable rewards', 'referral_reward_payment_not_verified');
  }

  const paymentReference = typeof body.paymentReference === 'string' ? body.paymentReference.trim().slice(0, 160) || null : null;
  if (next === 'paid' && !paymentReference) {
    throw new HttpError(400, 'A payment reference is required before a referral reward is marked paid', 'referral_reward_payment_reference_required');
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : '';
  if (next === 'void' && reason.length < 3) {
    throw new HttpError(400, 'A reason is required when voiding a referral reward', 'referral_reward_void_reason_required');
  }

  const rule = current ? null : await activeRule(db);
  if (!current && !rule) throw new HttpError(409, 'No active referral reward rule is configured', 'referral_reward_rule_missing');
  const amountCents = current?.computed_reward_cents || computedRewardCents(rule as RuleRow, Number(candidate.payment_amount_cents || 0));
  if (!current && amountCents <= 0 && next !== 'void') {
    throw new HttpError(409, 'The current rule produces no reward for this payment', 'referral_reward_zero');
  }

  const timestamp = new Date().toISOString();
  const defaultReason = 'Automatic direct-referral reward review from first verified payment';
  const effectiveReason = reason || defaultReason;

  if (!current) {
    await db.run(
      `INSERT INTO referral_reward_decisions
        (payment_id, inviter_user_id, referred_user_id, reward_rule_id, source_payment_amount_cents,
         computed_reward_cents, status, reason, payment_reference, created_by_user_id,
         approved_by_user_id, paid_by_user_id, approved_at, paid_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, NULL, ?, ?)`,
      [paymentId, candidate.inviter_user_id, candidate.referred_user_id, (rule as RuleRow).id,
        candidate.payment_amount_cents, Math.max(1, amountCents), next, effectiveReason, auth.user.id,
        next === 'approved' ? auth.user.id : null,
        next === 'approved' ? timestamp : null,
        timestamp, timestamp],
    );
  } else if (next === 'approved') {
    await db.run(
      `UPDATE referral_reward_decisions
          SET status = 'approved', reason = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ?
        WHERE payment_id = ?`,
      [effectiveReason, auth.user.id, timestamp, timestamp, paymentId],
    );
  } else if (next === 'paid') {
    await db.run(
      `UPDATE referral_reward_decisions
          SET status = 'paid', payment_reference = ?, paid_by_user_id = ?, paid_at = ?, updated_at = ?
        WHERE payment_id = ?`,
      [paymentReference, auth.user.id, timestamp, timestamp, paymentId],
    );
  } else if (next === 'void') {
    await db.run(
      `UPDATE referral_reward_decisions SET status = 'void', reason = ?, updated_at = ? WHERE payment_id = ?`,
      [effectiveReason, timestamp, paymentId],
    );
  }

  await db.run(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', ?, 'referral_reward_payment', ?, NULL, ?, ?)`,
    [newId('aud'), auth.user.id, `referral_reward.${next}`, paymentId,
      JSON.stringify({
        from: current?.status || 'eligible',
        to: next,
        inviterUserId: candidate.inviter_user_id,
        referredUserId: candidate.referred_user_id,
        sourcePaymentAmountCents: candidate.payment_amount_cents,
        computedRewardCents: amountCents,
        sourcePaymentStatus: candidate.payment_status,
        paymentReference,
        reason: effectiveReason,
      }), timestamp],
  );

  return json({ ok: true, paymentId, status: next, computedRewardCents: amountCents }, { headers: noStore() });
}
