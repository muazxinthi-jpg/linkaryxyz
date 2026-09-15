import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

type SettlementStatus = 'review' | 'approved' | 'paid' | 'void';

type SettingRow = {
  network_rewards_enabled: number;
  updated_at: string;
};

type RateRow = {
  generation: number;
  rate_bps: number;
  label: string;
};

type SummaryRow = {
  direct_referred_revenue_cents: number;
  direct_net_accrual_cents: number;
  downstream_net_accrual_cents: number;
  reversal_cents: number;
  unreviewed_cents: number;
  review_cents: number;
  approved_cents: number;
  paid_cents: number;
  clawback_cents: number;
  legacy_variance_cents: number;
  approved_people: number;
};

type ProjectionRow = {
  generation: number;
  payment_events: number;
  beneficiaries: number;
  projected_cents: number;
};

type LedgerRow = {
  id: string;
  source_payment_id: string;
  source_user_id: string;
  source_name: string;
  source_username: string | null;
  beneficiary_user_id: string;
  beneficiary_name: string;
  beneficiary_username: string | null;
  generation: number;
  entry_kind: 'accrual' | 'reversal';
  basis_amount_cents: number;
  rate_bps: number;
  amount_cents: number;
  related_entry_id: string | null;
  payment_status: 'verified' | 'refunded' | 'reversed';
  plan_name: string | null;
  settlement_status: SettlementStatus | null;
  settlement_amount_cents: number | null;
  settlement_source: 'v4' | 'v3_legacy' | null;
  settlement_reason: string | null;
  payment_reference: string | null;
  approved_at: string | null;
  paid_at: string | null;
  effective_at: string;
};

type PayableRow = {
  beneficiary_user_id: string;
  display_name: string;
  username: string | null;
  amount_cents: number;
  entry_count: number;
  oldest_approved_at: string;
};

type SettlementRow = {
  ledger_entry_id: string;
  status: SettlementStatus;
  decision_amount_cents: number;
  source: 'v4' | 'v3_legacy';
  reason: string;
};

type AccrualRow = {
  id: string;
  source_payment_id: string;
  beneficiary_user_id: string;
  generation: number;
  amount_cents: number;
  payment_status: 'verified' | 'refunded' | 'reversed';
  reversed: number;
};

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const noStore = () => ({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' });
const now = () => new Date().toISOString();

function cleanReason(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new HttpError(400, 'Reward reason is invalid', 'network_reward_reason_invalid');
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 240) throw new HttpError(400, 'Reward reason must be 3 to 240 characters', 'network_reward_reason_invalid');
  return reason;
}

function cleanReference(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Settlement reference is invalid', 'network_reward_reference_invalid');
  const reference = value.trim();
  if (!reference || reference.length > 160) throw new HttpError(400, 'Settlement reference is invalid', 'network_reward_reference_invalid');
  return reference;
}

async function schemaReady(db: Db): Promise<boolean> {
  const row = await db.first<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'network_reward_settings',
          'network_reward_generation_rates',
          'network_reward_ledger',
          'network_reward_settlements'
        )`,
  );
  return Number(row?.count || 0) === 4;
}

async function setting(db: Db): Promise<SettingRow> {
  const row = await db.first<SettingRow>(
    `SELECT network_rewards_enabled, updated_at
       FROM network_reward_settings
      WHERE id = 'global'`,
  );
  if (!row) throw new HttpError(503, 'Network reward settings are unavailable', 'network_reward_settings_missing');
  return row;
}

async function syncGen1(db: Db, timestamp: string): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO network_reward_ledger (
       id, source_payment_id, source_user_id, beneficiary_user_id, generation,
       entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
       source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
     )
     SELECT
       'nrew_' || bp.id || '_' || p.ancestor_user_id || '_g1_a',
       bp.id,
       bci.requested_by_user_id,
       p.ancestor_user_id,
       1,
       'accrual',
       bp.amount_cents,
       rate.rate_bps,
       CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER),
       NULL,
       p.source_edge_id,
       (SELECT network_rewards_enabled FROM network_reward_settings WHERE id = 'global'),
       bp.verified_at,
       ?
     FROM billing_payments bp
     JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
     JOIN network_referral_paths p
       ON p.descendant_user_id = bci.requested_by_user_id AND p.depth = 1
     JOIN network_referral_edges edge
       ON edge.id = p.source_edge_id AND edge.status = 'active'
     JOIN network_reward_generation_rates rate ON rate.generation = 1
     WHERE CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER) > 0`,
    [timestamp],
  );
}

async function syncDownstreamHistory(db: Db, timestamp: string): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO network_reward_ledger (
       id, source_payment_id, source_user_id, beneficiary_user_id, generation,
       entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
       source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
     )
     SELECT
       'nrew_' || bp.id || '_' || p.ancestor_user_id || '_g' || p.depth || '_a',
       bp.id,
       bci.requested_by_user_id,
       p.ancestor_user_id,
       p.depth,
       'accrual',
       bp.amount_cents,
       rate.rate_bps,
       CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER),
       NULL,
       p.source_edge_id,
       1,
       bp.verified_at,
       ?
     FROM billing_payments bp
     JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
     JOIN network_referral_paths p
       ON p.descendant_user_id = bci.requested_by_user_id AND p.depth BETWEEN 2 AND 7
     JOIN network_referral_edges edge
       ON edge.id = p.source_edge_id AND edge.status = 'active'
     JOIN network_reward_generation_rates rate ON rate.generation = p.depth
     WHERE CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER) > 0`,
    [timestamp],
  );
}

async function syncReversals(db: Db, timestamp: string): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO network_reward_ledger (
       id, source_payment_id, source_user_id, beneficiary_user_id, generation,
       entry_kind, basis_amount_cents, rate_bps, amount_cents, related_entry_id,
       source_path_edge_id, downstream_enabled_snapshot, effective_at, created_at
     )
     SELECT
       accrual.id || '_r',
       accrual.source_payment_id,
       accrual.source_user_id,
       accrual.beneficiary_user_id,
       accrual.generation,
       'reversal',
       accrual.basis_amount_cents,
       accrual.rate_bps,
       accrual.amount_cents,
       accrual.id,
       accrual.source_path_edge_id,
       accrual.downstream_enabled_snapshot,
       ?,
       ?
     FROM network_reward_ledger accrual
     JOIN billing_payments bp ON bp.id = accrual.source_payment_id
     WHERE accrual.entry_kind = 'accrual'
       AND bp.status IN ('refunded', 'reversed')`,
    [timestamp, timestamp],
  );
}

async function syncLegacyV3(db: Db): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO network_reward_settlements (
       ledger_entry_id, status, decision_amount_cents, source, reason, payment_reference,
       created_by_user_id, approved_by_user_id, paid_by_user_id, approved_at, paid_at,
       created_at, updated_at
     )
     SELECT
       accrual.id,
       decision.status,
       decision.computed_reward_cents,
       'v3_legacy',
       decision.reason,
       decision.payment_reference,
       decision.created_by_user_id,
       decision.approved_by_user_id,
       decision.paid_by_user_id,
       decision.approved_at,
       decision.paid_at,
       decision.created_at,
       decision.updated_at
     FROM referral_reward_decisions decision
     JOIN network_reward_ledger accrual
       ON accrual.source_payment_id = decision.payment_id
      AND accrual.generation = 1
      AND accrual.entry_kind = 'accrual'`,
  );
}

async function reconcile(db: Db, includeDownstreamHistory: boolean): Promise<void> {
  const timestamp = now();
  await syncGen1(db, timestamp);
  if (includeDownstreamHistory) await syncDownstreamHistory(db, timestamp);
  await syncReversals(db, timestamp);
  await syncLegacyV3(db);
}

export async function adminNetworkRewardLedger(request: Request, env: Env): Promise<Response> {
  await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) {
    return json({
      ready: false,
      requiredMigration: '0046_network_reward_ledger.sql',
      message: 'Network reward accounting is waiting for production migration 0046.',
    }, { headers: noStore() });
  }

  const currentSetting = await setting(db);
  const downstreamEnabled = Boolean(currentSetting.network_rewards_enabled);

  const [rates, summary, projections, ledger, payables] = await Promise.all([
    db.all<RateRow>(
      `SELECT generation, rate_bps, label
         FROM network_reward_generation_rates
        ORDER BY generation`,
    ),
    db.first<SummaryRow>(
      `WITH direct_revenue AS (
         SELECT COALESCE(SUM(bp.amount_cents), 0) AS amount_cents
           FROM billing_payments bp
           JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
           JOIN network_referral_paths p
             ON p.descendant_user_id = bci.requested_by_user_id AND p.depth = 1
           JOIN network_referral_edges edge
             ON edge.id = p.source_edge_id AND edge.status = 'active'
          WHERE bp.status = 'verified'
       ),
       accruals AS (
         SELECT a.*,
                CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS reversed,
                s.status AS settlement_status,
                s.decision_amount_cents,
                s.source AS settlement_source
           FROM network_reward_ledger a
           LEFT JOIN network_reward_ledger r
             ON r.related_entry_id = a.id AND r.entry_kind = 'reversal'
           LEFT JOIN network_reward_settlements s ON s.ledger_entry_id = a.id
          WHERE a.entry_kind = 'accrual'
       )
       SELECT
         (SELECT amount_cents FROM direct_revenue) AS direct_referred_revenue_cents,
         COALESCE(SUM(CASE WHEN generation = 1 THEN amount_cents * CASE WHEN reversed = 1 THEN 0 ELSE 1 END ELSE 0 END), 0) AS direct_net_accrual_cents,
         COALESCE(SUM(CASE WHEN generation BETWEEN 2 AND 7 THEN amount_cents * CASE WHEN reversed = 1 THEN 0 ELSE 1 END ELSE 0 END), 0) AS downstream_net_accrual_cents,
         COALESCE((SELECT SUM(amount_cents) FROM network_reward_ledger WHERE entry_kind = 'reversal'), 0) AS reversal_cents,
         COALESCE(SUM(CASE WHEN reversed = 0 AND settlement_status IS NULL THEN amount_cents ELSE 0 END), 0) AS unreviewed_cents,
         COALESCE(SUM(CASE WHEN reversed = 0 AND settlement_status = 'review' THEN decision_amount_cents ELSE 0 END), 0) AS review_cents,
         COALESCE(SUM(CASE WHEN reversed = 0 AND settlement_status = 'approved' AND (generation = 1 OR ? = 1) THEN decision_amount_cents ELSE 0 END), 0) AS approved_cents,
         COALESCE(SUM(CASE WHEN settlement_status = 'paid' THEN decision_amount_cents ELSE 0 END), 0) AS paid_cents,
         COALESCE(SUM(CASE WHEN reversed = 1 AND settlement_status = 'paid' THEN decision_amount_cents ELSE 0 END), 0) AS clawback_cents,
         COALESCE(SUM(CASE WHEN settlement_source = 'v3_legacy' THEN ABS(amount_cents - decision_amount_cents) ELSE 0 END), 0) AS legacy_variance_cents,
         COUNT(DISTINCT CASE WHEN reversed = 0 AND settlement_status = 'approved' AND (generation = 1 OR ? = 1) THEN beneficiary_user_id END) AS approved_people
       FROM accruals`,
      [downstreamEnabled ? 1 : 0, downstreamEnabled ? 1 : 0],
    ),
    db.all<ProjectionRow>(
      `SELECT
         p.depth AS generation,
         COUNT(*) AS payment_events,
         COUNT(DISTINCT p.ancestor_user_id) AS beneficiaries,
         COALESCE(SUM(CAST(ROUND(bp.amount_cents * rate.rate_bps / 10000.0) AS INTEGER)), 0) AS projected_cents
       FROM billing_payments bp
       JOIN billing_checkout_intents bci ON bci.id = bp.checkout_intent_id
       JOIN network_referral_paths p
         ON p.descendant_user_id = bci.requested_by_user_id AND p.depth BETWEEN 2 AND 7
       JOIN network_referral_edges edge
         ON edge.id = p.source_edge_id AND edge.status = 'active'
       JOIN network_reward_generation_rates rate ON rate.generation = p.depth
       WHERE bp.status = 'verified'
       GROUP BY p.depth
       ORDER BY p.depth`,
    ),
    db.all<LedgerRow>(
      `SELECT
         ledger.id,
         ledger.source_payment_id,
         ledger.source_user_id,
         source_user.display_name AS source_name,
         (SELECT p.username FROM profiles p WHERE p.owner_user_id = ledger.source_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS source_username,
         ledger.beneficiary_user_id,
         beneficiary.display_name AS beneficiary_name,
         (SELECT p.username FROM profiles p WHERE p.owner_user_id = ledger.beneficiary_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS beneficiary_username,
         ledger.generation,
         ledger.entry_kind,
         ledger.basis_amount_cents,
         ledger.rate_bps,
         ledger.amount_cents,
         ledger.related_entry_id,
         payment.status AS payment_status,
         plan.name AS plan_name,
         settlement.status AS settlement_status,
         settlement.decision_amount_cents AS settlement_amount_cents,
         settlement.source AS settlement_source,
         settlement.reason AS settlement_reason,
         settlement.payment_reference,
         settlement.approved_at,
         settlement.paid_at,
         ledger.effective_at
       FROM network_reward_ledger ledger
       JOIN users source_user ON source_user.id = ledger.source_user_id
       JOIN users beneficiary ON beneficiary.id = ledger.beneficiary_user_id
       JOIN billing_payments payment ON payment.id = ledger.source_payment_id
       LEFT JOIN billing_plans plan ON plan.id = payment.plan_id
       LEFT JOIN network_reward_settlements settlement ON settlement.ledger_entry_id = ledger.id
       ORDER BY ledger.effective_at DESC, ledger.generation ASC, ledger.entry_kind ASC
       LIMIT 500`,
    ),
    db.all<PayableRow>(
      `SELECT
         accrual.beneficiary_user_id,
         user.display_name,
         (SELECT p.username FROM profiles p WHERE p.owner_user_id = accrual.beneficiary_user_id AND p.visibility <> 'archived' ORDER BY p.created_at ASC LIMIT 1) AS username,
         SUM(settlement.decision_amount_cents) AS amount_cents,
         COUNT(*) AS entry_count,
         MIN(settlement.approved_at) AS oldest_approved_at
       FROM network_reward_settlements settlement
       JOIN network_reward_ledger accrual
         ON accrual.id = settlement.ledger_entry_id AND accrual.entry_kind = 'accrual'
       JOIN users user ON user.id = accrual.beneficiary_user_id
       LEFT JOIN network_reward_ledger reversal
         ON reversal.related_entry_id = accrual.id AND reversal.entry_kind = 'reversal'
       WHERE settlement.status = 'approved'
         AND reversal.id IS NULL
         AND (accrual.generation = 1 OR ? = 1)
       GROUP BY accrual.beneficiary_user_id, user.display_name
       ORDER BY amount_cents DESC, oldest_approved_at ASC`,
      [downstreamEnabled ? 1 : 0],
    ),
  ]);

  const normalizedSummary = summary || {
    direct_referred_revenue_cents: 0,
    direct_net_accrual_cents: 0,
    downstream_net_accrual_cents: 0,
    reversal_cents: 0,
    unreviewed_cents: 0,
    review_cents: 0,
    approved_cents: 0,
    paid_cents: 0,
    clawback_cents: 0,
    legacy_variance_cents: 0,
    approved_people: 0,
  };

  const projectionMap = new Map(projections.map((row) => [Number(row.generation), row]));
  const normalizedProjections = rates.filter((row) => row.generation > 1).map((rate) => {
    const row = projectionMap.get(Number(rate.generation));
    return {
      generation: Number(rate.generation),
      rateBps: Number(rate.rate_bps),
      paymentEvents: Number(row?.payment_events || 0),
      beneficiaries: Number(row?.beneficiaries || 0),
      projectedCents: Number(row?.projected_cents || 0),
    };
  });

  return json({
    ready: true,
    generatedAt: now(),
    settings: {
      networkRewardsEnabled: downstreamEnabled,
      updatedAt: currentSetting.updated_at,
      downstreamMode: downstreamEnabled ? 'enabled' : 'shadow_only',
    },
    rates: rates.map((row) => ({
      generation: Number(row.generation),
      rateBps: Number(row.rate_bps),
      percent: Number(row.rate_bps) / 100,
      label: row.label,
    })),
    summary: {
      directReferredRevenueCents: Number(normalizedSummary.direct_referred_revenue_cents || 0),
      directNetAccrualCents: Number(normalizedSummary.direct_net_accrual_cents || 0),
      downstreamNetAccrualCents: Number(normalizedSummary.downstream_net_accrual_cents || 0),
      reversalCents: Number(normalizedSummary.reversal_cents || 0),
      unreviewedCents: Number(normalizedSummary.unreviewed_cents || 0),
      reviewCents: Number(normalizedSummary.review_cents || 0),
      approvedCents: Number(normalizedSummary.approved_cents || 0),
      paidCents: Number(normalizedSummary.paid_cents || 0),
      clawbackCents: Number(normalizedSummary.clawback_cents || 0),
      legacyVarianceCents: Number(normalizedSummary.legacy_variance_cents || 0),
      approvedPeople: Number(normalizedSummary.approved_people || 0),
      downstreamShadowCents: normalizedProjections.reduce((sum, row) => sum + row.projectedCents, 0),
    },
    downstreamProjection: normalizedProjections,
    ledger: ledger.map((row) => ({
      id: row.id,
      sourcePaymentId: row.source_payment_id,
      sourceUserId: row.source_user_id,
      sourceName: row.source_name,
      sourceUsername: row.source_username,
      beneficiaryUserId: row.beneficiary_user_id,
      beneficiaryName: row.beneficiary_name,
      beneficiaryUsername: row.beneficiary_username,
      generation: Number(row.generation),
      entryKind: row.entry_kind,
      basisAmountCents: Number(row.basis_amount_cents),
      rateBps: Number(row.rate_bps),
      amountCents: Number(row.amount_cents),
      relatedEntryId: row.related_entry_id,
      paymentStatus: row.payment_status,
      planName: row.plan_name,
      settlementStatus: row.settlement_status,
      settlementAmountCents: row.settlement_amount_cents == null ? null : Number(row.settlement_amount_cents),
      settlementSource: row.settlement_source,
      settlementReason: row.settlement_reason,
      paymentReference: row.payment_reference,
      approvedAt: row.approved_at,
      paidAt: row.paid_at,
      effectiveAt: row.effective_at,
    })),
    payables: payables.map((row) => ({
      beneficiaryUserId: row.beneficiary_user_id,
      displayName: row.display_name,
      username: row.username,
      amountCents: Number(row.amount_cents || 0),
      entryCount: Number(row.entry_count || 0),
      oldestApprovedAt: row.oldest_approved_at,
    })),
    policy: {
      publicPromise: false,
      automaticTransfer: false,
      gen1LifetimeRevenue: true,
      downstreamRequiresFlag: true,
      downstreamCurrentlyPayable: downstreamEnabled,
      maximumAggregateBps: 1200,
      downstreamAggregateBps: 200,
      explanation: downstreamEnabled
        ? 'Gen 1 lifetime referral accruals and enabled Gen 2-7 ledger entries are private internal accounting. Approval and settlement remain explicit Superadmin actions.'
        : 'Gen 1 lifetime referral accruals are actual private ledger facts. Gen 2-7 values are shadow projections only while network_rewards_enabled is false, so they are not accrued and not payable.',
    },
  }, { headers: noStore() });
}

export async function syncNetworkRewardLedger(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) throw new HttpError(503, 'Production migration 0046 is required', 'network_reward_migration_required');

  const body = await readJson<{ includeDownstreamHistory?: boolean; confirmation?: string }>(request);
  const currentSetting = await setting(db);
  const includeDownstreamHistory = body.includeDownstreamHistory === true;
  if (includeDownstreamHistory) {
    if (!currentSetting.network_rewards_enabled) {
      throw new HttpError(409, 'Downstream rewards are disabled. Historical downstream accrual cannot be created.', 'network_rewards_disabled');
    }
    if (body.confirmation !== 'RECONCILE DOWNSTREAM HISTORY') {
      throw new HttpError(400, 'Explicit historical downstream confirmation is required', 'network_reward_reconcile_confirmation_required');
    }
  }

  await reconcile(db, includeDownstreamHistory);
  const timestamp = now();
  await db.run(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', 'network_reward.reconciled', 'network_reward_ledger', 'global', NULL, ?, ?)`,
    [newId('aud'), auth.user.id, JSON.stringify({ includeDownstreamHistory }), timestamp],
  );

  return json({ ok: true, includeDownstreamHistory, reconciledAt: timestamp }, { headers: noStore() });
}

export async function updateNetworkRewardSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ enabled?: boolean; confirmation?: string }>(request);
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'Network reward status is required', 'network_reward_setting_invalid');
  if (body.enabled && body.confirmation !== 'ENABLE NETWORK REWARDS') {
    throw new HttpError(400, 'Type ENABLE NETWORK REWARDS to activate downstream accounting', 'network_reward_enable_confirmation_required');
  }

  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) throw new HttpError(503, 'Production migration 0046 is required', 'network_reward_migration_required');
  const before = await setting(db);
  const timestamp = now();

  await db.batch([
    db.statement(
      `UPDATE network_reward_settings
          SET network_rewards_enabled = ?, updated_by_user_id = ?, updated_at = ?
        WHERE id = 'global'`,
      [body.enabled ? 1 : 0, auth.user.id, timestamp],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'network_reward.setting_updated', 'network_reward_settings', 'global', NULL, ?, ?)`,
      [newId('aud'), auth.user.id, JSON.stringify({ from: Boolean(before.network_rewards_enabled), to: body.enabled, historicalBackfillAutomatic: false }), timestamp],
    ),
  ]);

  return json({
    ok: true,
    networkRewardsEnabled: body.enabled,
    historicalBackfillAutomatic: false,
    message: body.enabled
      ? 'Downstream accounting is enabled for future verified payments. Historical downstream rewards remain untouched until explicitly reconciled.'
      : 'Downstream accounting is disabled. Existing immutable history is preserved, and downstream approval/payment actions are blocked.',
  }, { headers: noStore() });
}

export async function updateNetworkRewardSettlement(request: Request, env: Env, ledgerEntryId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: SettlementStatus; reason?: string; paymentReference?: string | null }>(request);
  const next = body.status;
  if (!next || !['review', 'approved', 'paid', 'void'].includes(next)) {
    throw new HttpError(400, 'Network reward status is invalid', 'network_reward_status_invalid');
  }

  const db = new Db(requireDb(env));
  if (!(await schemaReady(db))) throw new HttpError(503, 'Production migration 0046 is required', 'network_reward_migration_required');
  const currentSetting = await setting(db);
  const accrual = await db.first<AccrualRow>(
    `SELECT
       ledger.id,
       ledger.source_payment_id,
       ledger.beneficiary_user_id,
       ledger.generation,
       ledger.amount_cents,
       payment.status AS payment_status,
       CASE WHEN reversal.id IS NULL THEN 0 ELSE 1 END AS reversed
     FROM network_reward_ledger ledger
     JOIN billing_payments payment ON payment.id = ledger.source_payment_id
     LEFT JOIN network_reward_ledger reversal
       ON reversal.related_entry_id = ledger.id AND reversal.entry_kind = 'reversal'
     WHERE ledger.id = ? AND ledger.entry_kind = 'accrual'`,
    [ledgerEntryId],
  );
  if (!accrual) throw new HttpError(404, 'Network reward accrual not found', 'network_reward_not_found');
  if (accrual.generation > 1 && !currentSetting.network_rewards_enabled && ['approved', 'paid'].includes(next)) {
    throw new HttpError(409, 'Downstream rewards are disabled and cannot become payable', 'network_rewards_disabled');
  }
  if (['approved', 'paid'].includes(next) && (accrual.payment_status !== 'verified' || accrual.reversed)) {
    throw new HttpError(409, 'A refunded or reversed reward accrual cannot become payable', 'network_reward_reversed');
  }

  const current = await db.first<SettlementRow>(
    `SELECT ledger_entry_id, status, decision_amount_cents, source, reason
       FROM network_reward_settlements
      WHERE ledger_entry_id = ?`,
    [ledgerEntryId],
  );
  const allowed: SettlementStatus[] = current
    ? current.status === 'review' ? ['approved', 'void']
      : current.status === 'approved' ? ['paid', 'void']
        : []
    : ['review', 'approved', 'void'];
  if (!allowed.includes(next)) {
    throw new HttpError(409, `Reward cannot move from ${current?.status || 'unreviewed'} to ${next}`, 'network_reward_transition_invalid');
  }

  const reference = cleanReference(body.paymentReference);
  if (next === 'paid' && !reference) {
    throw new HttpError(400, 'A settlement reference is required before a reward is marked paid', 'network_reward_reference_required');
  }
  const reason = cleanReason(body.reason, next === 'void' ? 'Voided by Superadmin' : current?.reason || 'Source-of-truth network reward review');
  const timestamp = now();
  const decisionAmount = Number(current?.decision_amount_cents || accrual.amount_cents);
  const source = current?.source || 'v4';

  if (!current) {
    await db.run(
      `INSERT INTO network_reward_settlements (
         ledger_entry_id, status, decision_amount_cents, source, reason, payment_reference,
         created_by_user_id, approved_by_user_id, paid_by_user_id, approved_at, paid_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, 'v4', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ledgerEntryId,
        next,
        decisionAmount,
        reason,
        next === 'paid' ? reference : null,
        auth.user.id,
        next === 'approved' ? auth.user.id : null,
        next === 'paid' ? auth.user.id : null,
        next === 'approved' ? timestamp : null,
        next === 'paid' ? timestamp : null,
        timestamp,
        timestamp,
      ],
    );
  } else {
    await db.run(
      `UPDATE network_reward_settlements
          SET status = ?,
              reason = ?,
              payment_reference = CASE WHEN ? = 'paid' THEN ? ELSE payment_reference END,
              approved_by_user_id = CASE WHEN ? = 'approved' THEN ? ELSE approved_by_user_id END,
              approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
              paid_by_user_id = CASE WHEN ? = 'paid' THEN ? ELSE paid_by_user_id END,
              paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END,
              updated_at = ?
        WHERE ledger_entry_id = ?`,
      [
        next,
        reason,
        next,
        reference,
        next,
        auth.user.id,
        next,
        timestamp,
        next,
        auth.user.id,
        next,
        timestamp,
        timestamp,
        ledgerEntryId,
      ],
    );
  }

  // V3 first-payment decisions remain historical source records. If this accrual
  // came from V3, mirror the transition so the two private admin views cannot drift.
  if (source === 'v3_legacy') {
    if (next === 'approved') {
      await db.run(
        `UPDATE referral_reward_decisions
            SET status = 'approved', reason = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ?
          WHERE payment_id = ?`,
        [reason, auth.user.id, timestamp, timestamp, accrual.source_payment_id],
      );
    } else if (next === 'paid') {
      await db.run(
        `UPDATE referral_reward_decisions
            SET status = 'paid', reason = ?, payment_reference = ?, paid_by_user_id = ?, paid_at = ?, updated_at = ?
          WHERE payment_id = ?`,
        [reason, reference, auth.user.id, timestamp, timestamp, accrual.source_payment_id],
      );
    } else if (next === 'void') {
      await db.run(
        `UPDATE referral_reward_decisions
            SET status = 'void', reason = ?, updated_at = ?
          WHERE payment_id = ?`,
        [reason, timestamp, accrual.source_payment_id],
      );
    }
  }

  await db.run(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', ?, 'network_reward_settlement', ?, NULL, ?, ?)`,
    [
      newId('aud'),
      auth.user.id,
      `network_reward.${next}`,
      ledgerEntryId,
      JSON.stringify({
        from: current?.status || null,
        to: next,
        generation: Number(accrual.generation),
        beneficiaryUserId: accrual.beneficiary_user_id,
        amountCents: decisionAmount,
        source,
        paymentReference: reference,
      }),
      timestamp,
    ],
  );

  return json({ ok: true, ledgerEntryId, status: next, amountCents: decisionAmount }, { headers: noStore() });
}
