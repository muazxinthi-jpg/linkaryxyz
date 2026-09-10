# Superadmin Network Rewards V4

Status: private Superadmin accounting release

Source of truth: Linkary Technical Product & Engineering Paper, section 60.13.3 and the existing direct-referral lifetime revenue rule.

## Purpose

V4 makes Linkary referral economics auditable without creating a public payout promise.

The private accounting model is:

- Generation 1: 10.00%
- Generation 2: 0.70%
- Generation 3: 0.45%
- Generation 4: 0.30%
- Generation 5: 0.22%
- Generation 6: 0.18%
- Generation 7: 0.15%
- Generations 2-7 total: 2.00%
- Maximum aggregate share: 12.00%

Generation 1 now follows eligible settled subscription revenue for the lifetime of the qualified referred billing relationship. It is not limited to the first payment.

## Safety default

`network_rewards_enabled` defaults to `false`.

While false:

- Generation 1 actual accounting continues.
- Generation 2-7 values may be calculated privately as shadow projections.
- No Generation 2-7 ledger accrual is created.
- No Generation 2-7 reward can be approved or marked paid.
- Public Invite and Network messaging remains unchanged.

Enabling downstream accounting is an explicit Superadmin action requiring the phrase `ENABLE NETWORK REWARDS`.

Activation affects future verified payments. Historical downstream accrual is a separate high-friction action requiring the phrase `RECONCILE DOWNSTREAM HISTORY`, so enabling the feature does not silently create retroactive liabilities.

## Eligible revenue basis

The accounting basis is the positive-value `billing_payments.amount_cents` actually recorded after checkout pricing and discounts.

This means:

- 100% free access creates no billing payment and therefore no reward.
- discounted paid plans use the amount actually paid.
- refunded or reversed source payments receive append-only reversal entries.
- no reward is created merely because a user registers or joins a referral network.

Taxes or pass-through deductions are not invented where Linkary does not currently store a separate verified value for them.

## Immutable ledger

Migration `0046_network_reward_ledger.sql` creates:

- `network_reward_settings`
- `network_reward_generation_rates`
- `network_reward_ledger`
- `network_reward_settlements`

`network_reward_ledger` is append-only. Database triggers reject UPDATE and DELETE. Corrections use a `reversal` row linked to the original `accrual`.

Payment insertion triggers:

- always create an eligible Gen 1 accrual when direct lineage exists,
- create Gen 2-7 accruals only when `network_rewards_enabled = 1`.

A payment changing from `verified` to `refunded` or `reversed` creates compensating reward-ledger reversals idempotently.

## V2 and V3 continuity

V2 discretionary `internal_referral_rewards` remain unchanged.

V3 `referral_reward_decisions` remain intact for historical continuity. Existing V3 first-payment decisions are mirrored into the V4 settlement table with source `v3_legacy` so the same payment is not accidentally paid twice.

If a legacy V3 decision differs from the locked 10% calculation, V4 exposes the variance privately rather than rewriting history.

## Superadmin workspace

Route: `/admin/network-rewards`

The page shows:

- verified referred revenue,
- actual Gen 1 lifetime accrual,
- Gen 2-7 shadow projection,
- exact generation rates,
- approved payables by person,
- immutable accrual and reversal ledger,
- review, approve, paid and void settlement states,
- reversal/clawback alerts,
- V3 legacy variance,
- safe reconciliation controls,
- explicit downstream feature-gate state.

Marking a reward paid requires a settlement reference. All mutations require Superadmin authentication, CSRF protection and audit logging.

## Release gate

Before merge:

1. Run repository regression tests.
2. Run backend TypeScript.
3. Run frontend TypeScript.
4. Run Wrangler dry-run and public dry-run.
5. Review responsive behavior at 320, 375, 390, 430, tablet and desktop widths.
6. Confirm Platform Intelligence and prior Superadmin pages remain reachable.
7. Confirm no public surface displays generation payout percentages or downstream payout promises.
8. Merge only after protected checks are green.
9. Apply migration 0046 manually through the production D1 migration workflow.
10. Verify `/admin/network-rewards` live after migration.
