# Superadmin Platform Intelligence V2

Status: Controlled Beta delivery specification

This extends the private Superadmin Platform Intelligence workspace introduced in PR #241. It does not change public Linkary referral positioning, user entitlements, billing semantics, authentication, profiles, campaigns, wallets or the Network Map.

## Product goal

Turn the existing analytics workspace into a tighter Founder/CEO operating dashboard using only recorded Linkary facts.

V2 adds four operating views:

1. Executive Pulse
2. 30-day Growth Velocity
3. Payables Command Center
4. Six-month Operating History and Target Attainment

No new production migration is required. Existing migration 0044 remains the source of truth for private referral rewards and growth targets.

## Executive Pulse methodology

All ratios remain unavailable when their denominator is zero.

### Profile activation

Distinct active non-Superadmin user accounts with at least one non-archived profile divided by active registered non-Superadmin users.

This deliberately counts user accounts, not total profile rows, so Project and multi-profile behavior cannot inflate activation above the account population.

### Paid conversion

Current active paid accounts divided by active registered non-Superadmin users.

This is an account conversion indicator, not cohort retention or LTV.

### Referral contribution

Canonical active referral edges created during the latest rolling 30 days divided by new non-Superadmin users created during the same rolling 30-day window.

It is an acquisition contribution indicator, not a public referral-reward formula.

### Stickiness

DAU/MAU and WAU/MAU continue to use authenticated session activity and the existing six-hour session activity refresh bound.

## Growth Velocity

Growth Velocity compares two adjacent rolling windows:

- current: now minus 30 days through now
- previous: now minus 60 days through now minus 30 days

V2 compares:

- new users
- canonical referral signups
- verified billing revenue

Change is `(current - previous) / previous`. When the prior value is zero, percentage change is shown as unavailable rather than infinity or a fabricated growth rate.

MRR growth is intentionally not inferred from historical subscription state in this version. Current MRR remains available from active subscription periods.

## Six-month operating history

The dashboard always returns six calendar-month buckets, current month plus five prior months, for:

- new users
- canonical referral signups
- verified billing revenue

Each series uses its own visual scale so unlike units are not presented as directly comparable magnitudes.

Historical MAU and historical MRR are not fabricated from current-state tables.

## Payables Command Center

The command center is a focused projection of the existing private reward ledger.

Only `approved` reward records enter the payable queue.

It shows:

- amount to pay
- unique people waiting
- number of approved records
- oldest approval age
- beneficiary identity
- amount
- approval date
- days waiting
- captured direct and seven-generation network evidence
- internal reason
- Mark paid action

Marking a reward paid continues to require a settlement, transaction or payment reference and uses the existing audited reward-state transition.

No automatic payout calculation is added.

## Target Attainment

The Growth Plan keeps the same explicit Superadmin target store from migration 0044.

V2 adds one consolidated actual-vs-target chart for:

- registered users
- MAU
- paid accounts
- MRR
- referral signups

Missing targets remain visibly unset and do not imply zero targets.

## Data not yet claimed

The dashboard still does not calculate metrics that Linkary does not yet record well enough to support, including:

- CAC
- burn
- runway
- gross margin
- LTV
- LTV:CAC
- cohort retention
- historical MAU
- historical MRR growth

These should be introduced only after the required cost, acquisition-spend and historical activity data models exist.

## Release acceptance

V2 must preserve:

- Superadmin-only boundary
- noindex and no-store behavior
- CSRF protection for mutations
- private discretionary referral-reward semantics
- mandatory payment reference before Paid
- existing growth target audit trail
- 30/90/180-day interactive daily charts
- responsive desktop/tablet/mobile presentation
- all existing identity, invite, billing, coupon, wallet, campaign and Network Map regressions
