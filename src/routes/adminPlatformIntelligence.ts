import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

const RANGE_DAYS = [30, 90, 180] as const;
const TARGET_METRICS = ['registered_users', 'mau', 'paid_accounts', 'mrr_cents', 'referral_redemptions'] as const;
type TargetMetric = typeof TARGET_METRICS[number];
type RewardStatus = 'review' | 'approved' | 'paid' | 'void';

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const iso = (value: Date) => value.toISOString();
const moneyRatio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : null;

function daysAgo(days: number, from = new Date()): string {
  return iso(new Date(from.getTime() - days * 86_400_000));
}

function monthKey(value = new Date()): string {
  return value.toISOString().slice(0, 7);
}

function validPeriodKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function cleanReason(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'A private reward reason is required', 'referral_reward_reason_required');
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 240) throw new HttpError(400, 'Reason must be 3 to 240 characters', 'referral_reward_reason_invalid');
  return reason;
}

function cleanReference(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Payment reference is invalid', 'referral_reward_payment_reference_invalid');
  const reference = value.trim();
  if (!reference || reference.length > 160) throw new HttpError(400, 'Payment reference is invalid', 'referral_reward_payment_reference_invalid');
  return reference;
}

async function privateSchemaReady(db: Db): Promise<boolean> {
  const row = await db.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name IN ('internal_referral_rewards', 'platform_growth_targets')`,
  );
  return Number(row?.count || 0) === 2;
}

function noStore() {
  return { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' };
}

type ActivityRow = { dau: number; wau: number; mau: number };
type RevenueRow = { all_time_cents: number; revenue_30d_cents: number; reversed_cents: number; payment_cents: number };
type PaidRow = { paid_accounts: number; mrr_cents: number };
type CheckoutDiscountRow = { base_cents: number; final_cents: number };
type CountRow = { count: number };
type DayCount = { day: string; count: number };
type DayRevenue = { day: string; amount_cents: number };
type LeaderRow = {
  user_id: string;
  display_name: string;
  username: string | null;
  direct_referrals: number;
  referrals_30d: number;
  last_referral_at: string | null;
};
type RewardRow = {
  id: string;
  beneficiary_user_id: string;
  display_name: string;
  username: string | null;
  period_key: string;
  amount_cents: number;
  currency: string;
  status: RewardStatus;
  reason: string;
  evidence_json: string;
  payment_reference: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};
type TargetRow = {
  id: string;
  period_key: string;
  metric_key: TargetMetric;
  target_value: number;
  notes: string | null;
  updated_at: string;
};

function parseJson(value: string): unknown {
  try { return JSON.parse(value); }
  catch { return {}; }
}

export async function adminPlatformIntelligence(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const url = new URL(request.url);
  const requestedRange = Number(url.searchParams.get('range') || 90);
  const rangeDays = RANGE_DAYS.includes(requestedRange as (typeof RANGE_DAYS)[number]) ? requestedRange : 90;
  const nowDate = new Date();
  const timestamp = iso(nowDate);
  const startAt = daysAgo(rangeDays - 1, nowDate).slice(0, 10) + 'T00:00:00.000Z';
  const dayAt = daysAgo(1, nowDate);
  const weekAt = daysAgo(7, nowDate);
  const monthAt = daysAgo(30, nowDate);
  const currentMonth = monthKey(nowDate);

  const schemaReady = await privateSchemaReady(db);

  const [activity, totalUsers, activeProfiles, revenue, paid, discounts, freePass30, referredThisMonth, baseUsers, dailyUsers, dailyReferrals, dailyRevenue, leaders] = await Promise.all([
    db.first<ActivityRow>(
      `SELECT
         COUNT(DISTINCT CASE WHEN s.last_seen_at >= ? THEN s.user_id END) AS dau,
         COUNT(DISTINCT CASE WHEN s.last_seen_at >= ? THEN s.user_id END) AS wau,
         COUNT(DISTINCT CASE WHEN s.last_seen_at >= ? THEN s.user_id END) AS mau
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.status = 'active'
       WHERE NOT EXISTS (
         SELECT 1 FROM admin_grants ag
          WHERE ag.user_id = s.user_id AND ag.role = 'superadmin' AND ag.status = 'active'
       )`,
      [dayAt, weekAt, monthAt],
    ),
    db.first<CountRow>(
      `SELECT COUNT(*) AS count FROM users u
        WHERE u.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM admin_grants ag WHERE ag.user_id = u.id AND ag.role = 'superadmin' AND ag.status = 'active')`,
    ),
    db.first<CountRow>(`SELECT COUNT(*) AS count FROM profiles WHERE visibility <> 'archived'`),
    db.first<RevenueRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'verified' THEN amount_cents ELSE 0 END), 0) AS all_time_cents,
         COALESCE(SUM(CASE WHEN status = 'verified' AND verified_at >= ? THEN amount_cents ELSE 0 END), 0) AS revenue_30d_cents,
         COALESCE(SUM(CASE WHEN status IN ('refunded', 'reversed') THEN amount_cents ELSE 0 END), 0) AS reversed_cents,
         COALESCE(SUM(amount_cents), 0) AS payment_cents
       FROM billing_payments`,
      [monthAt],
    ),
    db.first<PaidRow>(
      `SELECT COUNT(*) AS paid_accounts, COALESCE(SUM(price_cents), 0) AS mrr_cents
         FROM (
           SELECT owner_type, owner_id, MAX(price_cents) AS price_cents
             FROM billing_subscription_periods
            WHERE status = 'active' AND period_start <= ? AND period_end > ?
            GROUP BY owner_type, owner_id
         ) current_paid`,
      [timestamp, timestamp],
    ),
    db.first<CheckoutDiscountRow>(
      `SELECT COALESCE(SUM(base_price_cents), 0) AS base_cents,
              COALESCE(SUM(final_price_cents), 0) AS final_cents
         FROM billing_checkout_intents
        WHERE status = 'paid' AND created_at >= ?`,
      [monthAt],
    ),
    db.first<CountRow>(
      `SELECT COUNT(*) AS count
         FROM coupon_redemptions cr
         JOIN discount_coupons dc ON dc.id = cr.coupon_id
        WHERE dc.discount_type = 'percent' AND dc.discount_value = 100 AND cr.redeemed_at >= ?`,
      [monthAt],
    ),
    db.first<CountRow>(
      `SELECT COUNT(*) AS count
         FROM network_referral_edges
        WHERE status = 'active' AND created_at >= ?`,
      [`${currentMonth}-01T00:00:00.000Z`],
    ),
    db.first<CountRow>(
      `SELECT COUNT(*) AS count FROM users u
        WHERE u.status <> 'deleted' AND u.created_at < ?
          AND NOT EXISTS (SELECT 1 FROM admin_grants ag WHERE ag.user_id = u.id AND ag.role = 'superadmin' AND ag.status = 'active')`,
      [startAt],
    ),
    db.all<DayCount>(
      `SELECT substr(u.created_at, 1, 10) AS day, COUNT(*) AS count
         FROM users u
        WHERE u.status <> 'deleted' AND u.created_at >= ?
          AND NOT EXISTS (SELECT 1 FROM admin_grants ag WHERE ag.user_id = u.id AND ag.role = 'superadmin' AND ag.status = 'active')
        GROUP BY substr(u.created_at, 1, 10)
        ORDER BY day`,
      [startAt],
    ),
    db.all<DayCount>(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
         FROM network_referral_edges
        WHERE status = 'active' AND created_at >= ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day`,
      [startAt],
    ),
    db.all<DayRevenue>(
      `SELECT substr(verified_at, 1, 10) AS day,
              COALESCE(SUM(CASE WHEN status = 'verified' THEN amount_cents ELSE 0 END), 0) AS amount_cents
         FROM billing_payments
        WHERE verified_at >= ?
        GROUP BY substr(verified_at, 1, 10)
        ORDER BY day`,
      [startAt],
    ),
    db.all<LeaderRow>(
      `SELECT e.inviter_user_id AS user_id,
              u.display_name,
              (SELECT p.username FROM profiles p WHERE p.owner_user_id = e.inviter_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS username,
              COUNT(*) AS direct_referrals,
              SUM(CASE WHEN e.created_at >= ? THEN 1 ELSE 0 END) AS referrals_30d,
              MAX(e.created_at) AS last_referral_at
         FROM network_referral_edges e
         JOIN users u ON u.id = e.inviter_user_id
        WHERE e.status = 'active'
        GROUP BY e.inviter_user_id, u.display_name
        ORDER BY direct_referrals DESC, referrals_30d DESC, last_referral_at DESC
        LIMIT 75`,
      [monthAt],
    ),
  ]);

  const leaderIds = leaders.map((leader) => leader.user_id);
  const networkSizes = new Map<string, number>();
  if (leaderIds.length) {
    const placeholders = leaderIds.map(() => '?').join(',');
    const pathCounts = await db.all<{ ancestor_user_id: string; count: number }>(
      `SELECT ancestor_user_id, COUNT(*) AS count
         FROM network_referral_paths
        WHERE ancestor_user_id IN (${placeholders})
        GROUP BY ancestor_user_id`,
      leaderIds,
    );
    for (const row of pathCounts) networkSizes.set(row.ancestor_user_id, Number(row.count || 0));
  }

  let funnel: { inviteClicks: number; uniqueVisitors: number; redemptions: number; acceptedReferrals: number; clickToRedemption: number | null } | null = null;
  let rewards: Array<Record<string, unknown>> = [];
  let rewardSummary = { reviewCents: 0, approvedCents: 0, paidCents: 0 };
  let targets: TargetRow[] = [];

  if (schemaReady) {
    const [clicks, redemptions, accepted, rewardRows, rewardSums, targetRows] = await Promise.all([
      db.first<{ clicks: number; unique_visitors: number }>(
        `SELECT COUNT(*) AS clicks, COUNT(DISTINCT visitor_id_hash) AS unique_visitors
           FROM invite_click_events WHERE occurred_at >= ?`,
        [monthAt],
      ),
      db.first<CountRow>(`SELECT COUNT(*) AS count FROM invite_redemptions WHERE redeemed_at >= ?`, [monthAt]),
      db.first<CountRow>(`SELECT COUNT(*) AS count FROM network_referral_edges WHERE status = 'active' AND created_at >= ?`, [monthAt]),
      db.all<RewardRow>(
        `SELECT irr.id, irr.beneficiary_user_id, u.display_name,
                (SELECT p.username FROM profiles p WHERE p.owner_user_id = irr.beneficiary_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS username,
                irr.period_key, irr.amount_cents, irr.currency, irr.status, irr.reason,
                irr.evidence_json, irr.payment_reference, irr.approved_at, irr.paid_at,
                irr.created_at, irr.updated_at
           FROM internal_referral_rewards irr
           JOIN users u ON u.id = irr.beneficiary_user_id
          ORDER BY irr.period_key DESC, irr.updated_at DESC
          LIMIT 100`,
      ),
      db.all<{ status: RewardStatus; amount_cents: number }>(
        `SELECT status, COALESCE(SUM(amount_cents), 0) AS amount_cents
           FROM internal_referral_rewards
          WHERE status IN ('review', 'approved', 'paid')
          GROUP BY status`,
      ),
      db.all<TargetRow>(
        `SELECT id, period_key, metric_key, target_value, notes, updated_at
           FROM platform_growth_targets
          ORDER BY period_key DESC, metric_key ASC
          LIMIT 60`,
      ),
    ]);
    const clickCount = Number(clicks?.clicks || 0);
    const redemptionCount = Number(redemptions?.count || 0);
    funnel = {
      inviteClicks: clickCount,
      uniqueVisitors: Number(clicks?.unique_visitors || 0),
      redemptions: redemptionCount,
      acceptedReferrals: Number(accepted?.count || 0),
      clickToRedemption: moneyRatio(redemptionCount, clickCount),
    };
    rewards = rewardRows.map((row) => ({
      id: row.id,
      beneficiaryUserId: row.beneficiary_user_id,
      displayName: row.display_name,
      username: row.username,
      periodKey: row.period_key,
      amountCents: Number(row.amount_cents || 0),
      currency: row.currency,
      status: row.status,
      reason: row.reason,
      evidence: parseJson(row.evidence_json),
      paymentReference: row.payment_reference,
      approvedAt: row.approved_at,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    for (const row of rewardSums) {
      const amount = Number(row.amount_cents || 0);
      if (row.status === 'review') rewardSummary.reviewCents = amount;
      if (row.status === 'approved') rewardSummary.approvedCents = amount;
      if (row.status === 'paid') rewardSummary.paidCents = amount;
    }
    targets = targetRows;
  }

  const userByDay = new Map(dailyUsers.map((row) => [row.day, Number(row.count || 0)]));
  const referralByDay = new Map(dailyReferrals.map((row) => [row.day, Number(row.count || 0)]));
  const revenueByDay = new Map(dailyRevenue.map((row) => [row.day, Number(row.amount_cents || 0)]));
  const trend: Array<{ day: string; registeredUsers: number; newUsers: number; referrals: number; revenueCents: number }> = [];
  let cumulativeUsers = Number(baseUsers?.count || 0);
  for (let index = 0; index < rangeDays; index += 1) {
    const day = new Date(`${startAt.slice(0, 10)}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    const newUsers = userByDay.get(key) || 0;
    cumulativeUsers += newUsers;
    trend.push({
      day: key,
      registeredUsers: cumulativeUsers,
      newUsers,
      referrals: referralByDay.get(key) || 0,
      revenueCents: revenueByDay.get(key) || 0,
    });
  }

  const paidAccounts = Number(paid?.paid_accounts || 0);
  const mrrCents = Number(paid?.mrr_cents || 0);
  const activeProfileCount = Number(activeProfiles?.count || 0);
  const baseCents = Number(discounts?.base_cents || 0);
  const finalCents = Number(discounts?.final_cents || 0);
  const totalPaymentCents = Number(revenue?.payment_cents || 0);
  const reversedCents = Number(revenue?.reversed_cents || 0);
  const dau = Number(activity?.dau || 0);
  const wau = Number(activity?.wau || 0);
  const mau = Number(activity?.mau || 0);

  return json({
    actorUserId: auth.user.id,
    generatedAt: timestamp,
    rangeDays,
    privateOpsReady: schemaReady,
    activity: {
      dau,
      wau,
      mau,
      dauMau: moneyRatio(dau, mau),
      wauMau: moneyRatio(wau, mau),
      methodology: 'Distinct authenticated non-Superadmin users by rolling 24-hour, 7-day and 30-day last-seen windows. Session activity is refreshed at most every six hours.',
    },
    financials: {
      allTimeRevenueCents: Number(revenue?.all_time_cents || 0),
      revenue30dCents: Number(revenue?.revenue_30d_cents || 0),
      mrrCents,
      activePaidAccounts: paidAccounts,
      arpaCents: paidAccounts > 0 ? Math.round(mrrCents / paidAccounts) : null,
      paidAccountShare: moneyRatio(paidAccounts, activeProfileCount),
      discountRate30d: baseCents > 0 ? Math.max(0, (baseCents - finalCents) / baseCents) : null,
      reversalRate: moneyRatio(reversedCents, totalPaymentCents),
      freePassRedemptions30d: Number(freePass30?.count || 0),
      methodology: 'Revenue uses verified Base USDC billing payments only. Free passes never create fake zero-value payments. MRR uses current active paid subscription periods. Ratios remain unavailable when their denominator is zero.',
    },
    growth: {
      totalUsers: Number(totalUsers?.count || 0),
      activeProfiles: activeProfileCount,
      referralRedemptionsThisMonth: Number(referredThisMonth?.count || 0),
      currentMonth,
      trend,
      targets,
    },
    referrals: {
      funnel,
      leaders: leaders.map((leader) => ({
        userId: leader.user_id,
        displayName: leader.display_name,
        username: leader.username,
        directReferrals: Number(leader.direct_referrals || 0),
        networkSize: networkSizes.get(leader.user_id) || 0,
        referrals30d: Number(leader.referrals_30d || 0),
        lastReferralAt: leader.last_referral_at,
      })),
      rewards,
      rewardSummary,
      privacy: 'Internal discretionary reward operations only. No public referral payout promise or automatic downstream reward is created by this dashboard.',
    },
  }, { headers: noStore() });
}

export async function createInternalReferralReward(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ beneficiaryUserId?: string; periodKey?: string; amountCents?: number; reason?: string }>(request);
  const beneficiaryUserId = body.beneficiaryUserId?.trim();
  if (!beneficiaryUserId || !validPeriodKey(body.periodKey)) throw new HttpError(400, 'User and reward period are required', 'referral_reward_invalid');
  if (!Number.isInteger(body.amountCents) || Number(body.amountCents) <= 0 || Number(body.amountCents) > 10_000_000) {
    throw new HttpError(400, 'Reward amount must be between $0.01 and $100,000', 'referral_reward_amount_invalid');
  }
  const reason = cleanReason(body.reason);
  const db = new Db(requireDb(env));
  if (!(await privateSchemaReady(db))) throw new HttpError(503, 'Production migration 0044 is required before private reward operations can be used', 'platform_intelligence_migration_required');
  const beneficiary = await db.first<{ id: string }>(`SELECT id FROM users WHERE id = ? AND status = 'active'`, [beneficiaryUserId]);
  if (!beneficiary) throw new HttpError(404, 'Referral user not found', 'referral_reward_user_not_found');
  const existing = await db.first<{ id: string }>(
    `SELECT id FROM internal_referral_rewards WHERE beneficiary_user_id = ? AND period_key = ?`,
    [beneficiaryUserId, body.periodKey],
  );
  if (existing) throw new HttpError(409, 'This user already has a private reward review for that month', 'referral_reward_period_exists');
  const [direct, network] = await Promise.all([
    db.first<CountRow>(`SELECT COUNT(*) AS count FROM network_referral_edges WHERE inviter_user_id = ? AND status = 'active'`, [beneficiaryUserId]),
    db.first<CountRow>(`SELECT COUNT(*) AS count FROM network_referral_paths WHERE ancestor_user_id = ?`, [beneficiaryUserId]),
  ]);
  if (Number(network?.count || 0) <= 0) throw new HttpError(409, 'This user has no recorded Linkary referral network to review', 'referral_reward_network_empty');

  const timestamp = new Date().toISOString();
  const rewardId = newId('rwd');
  const evidence = {
    directReferrals: Number(direct?.count || 0),
    networkSize: Number(network?.count || 0),
    capturedAt: timestamp,
    basis: 'superadmin_discretionary_review',
  };
  await db.batch([
    db.statement(
      `INSERT INTO internal_referral_rewards
        (id, beneficiary_user_id, period_key, amount_cents, currency, status, reason, evidence_json,
         payment_reference, created_by_user_id, approved_by_user_id, paid_by_user_id, approved_at, paid_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'USD', 'review', ?, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      [rewardId, beneficiaryUserId, body.periodKey, body.amountCents, reason, JSON.stringify(evidence), auth.user.id, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'referral_reward.review_created', 'internal_referral_reward', ?, NULL, ?, ?)`,
      [newId('aud'), auth.user.id, rewardId, JSON.stringify({ beneficiaryUserId, periodKey: body.periodKey, amountCents: body.amountCents, reason, evidence }), timestamp],
    ),
  ]);
  return json({ ok: true, rewardId, status: 'review' }, { headers: noStore() });
}

export async function updateInternalReferralRewardStatus(request: Request, env: Env, rewardId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: RewardStatus; paymentReference?: string | null }>(request);
  const next = body.status;
  if (!next || !['approved', 'paid', 'void'].includes(next)) throw new HttpError(400, 'Reward status is invalid', 'referral_reward_status_invalid');
  const db = new Db(requireDb(env));
  if (!(await privateSchemaReady(db))) throw new HttpError(503, 'Production migration 0044 is required before private reward operations can be used', 'platform_intelligence_migration_required');
  const current = await db.first<{ id: string; status: RewardStatus; beneficiary_user_id: string; amount_cents: number; period_key: string }>(
    `SELECT id, status, beneficiary_user_id, amount_cents, period_key FROM internal_referral_rewards WHERE id = ?`,
    [rewardId],
  );
  if (!current) throw new HttpError(404, 'Private reward record not found', 'referral_reward_not_found');
  const allowed = current.status === 'review' ? ['approved', 'void'] : current.status === 'approved' ? ['paid', 'void'] : [];
  if (!allowed.includes(next)) throw new HttpError(409, `Reward cannot move from ${current.status} to ${next}`, 'referral_reward_transition_invalid');
  const paymentReference = cleanReference(body.paymentReference);
  if (next === 'paid' && !paymentReference) throw new HttpError(400, 'A payment reference is required before a reward is marked paid', 'referral_reward_payment_reference_required');
  const timestamp = new Date().toISOString();

  if (next === 'approved') {
    await db.run(
      `UPDATE internal_referral_rewards
          SET status = 'approved', approved_by_user_id = ?, approved_at = ?, updated_at = ?
        WHERE id = ?`,
      [auth.user.id, timestamp, timestamp, rewardId],
    );
  } else if (next === 'paid') {
    await db.run(
      `UPDATE internal_referral_rewards
          SET status = 'paid', paid_by_user_id = ?, paid_at = ?, payment_reference = ?, updated_at = ?
        WHERE id = ?`,
      [auth.user.id, timestamp, paymentReference, timestamp, rewardId],
    );
  } else {
    await db.run(`UPDATE internal_referral_rewards SET status = 'void', updated_at = ? WHERE id = ?`, [timestamp, rewardId]);
  }
  await db.run(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', ?, 'internal_referral_reward', ?, NULL, ?, ?)`,
    [newId('aud'), auth.user.id, `referral_reward.${next}`, rewardId, JSON.stringify({ from: current.status, to: next, beneficiaryUserId: current.beneficiary_user_id, amountCents: current.amount_cents, periodKey: current.period_key, paymentReference }), timestamp],
  );
  return json({ ok: true, rewardId, status: next }, { headers: noStore() });
}

export async function upsertPlatformGrowthTarget(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ periodKey?: string; metricKey?: TargetMetric; targetValue?: number; notes?: string | null }>(request);
  if (!validPeriodKey(body.periodKey) || !TARGET_METRICS.includes(body.metricKey as TargetMetric)) {
    throw new HttpError(400, 'Growth target period and metric are invalid', 'platform_growth_target_invalid');
  }
  if (!Number.isFinite(body.targetValue) || Number(body.targetValue) < 0 || Number(body.targetValue) > 1_000_000_000) {
    throw new HttpError(400, 'Growth target value is invalid', 'platform_growth_target_value_invalid');
  }
  const metricKey = body.metricKey as TargetMetric;
  const countMetric = metricKey !== 'mrr_cents';
  if (countMetric && !Number.isInteger(body.targetValue)) throw new HttpError(400, 'Count targets must be whole numbers', 'platform_growth_target_value_invalid');
  if (metricKey === 'mrr_cents' && !Number.isInteger(body.targetValue)) throw new HttpError(400, 'MRR targets must be stored in cents', 'platform_growth_target_value_invalid');
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 240) || null : null;
  const db = new Db(requireDb(env));
  if (!(await privateSchemaReady(db))) throw new HttpError(503, 'Production migration 0044 is required before growth targets can be saved', 'platform_intelligence_migration_required');
  const timestamp = new Date().toISOString();
  const targetId = newId('gtgt');
  await db.batch([
    db.statement(
      `INSERT INTO platform_growth_targets
        (id, period_key, metric_key, target_value, notes, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(period_key, metric_key) DO UPDATE SET
         target_value = excluded.target_value,
         notes = excluded.notes,
         created_by_user_id = excluded.created_by_user_id,
         updated_at = excluded.updated_at`,
      [targetId, body.periodKey, metricKey, body.targetValue, notes, auth.user.id, timestamp, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'platform_growth_target.upserted', 'platform_growth_target', ?, NULL, ?, ?)`,
      [newId('aud'), auth.user.id, `${body.periodKey}:${metricKey}`, JSON.stringify({ periodKey: body.periodKey, metricKey, targetValue: body.targetValue, notes }), timestamp],
    ),
  ]);
  return json({ ok: true, periodKey: body.periodKey, metricKey, targetValue: body.targetValue }, { headers: noStore() });
}
