# Superadmin Platform Intelligence

Status: Controlled Beta delivery specification

This implementation follows the Linkary delivery-team model in `docs/DELIVERY_TEAM.md` and the UI release gate in `docs/UI_RELEASE_GATE.md`.

## Product Lead

The Superadmin console gains one private `Platform intelligence` workspace. It combines platform-level operating metrics without changing public Linkary positioning or the existing Project-level Founder Growth Intelligence product.

The workspace covers:

- authenticated DAU, WAU and MAU
- verified billing revenue and commercial ratios
- referral acquisition and seven-generation network monitoring
- a private discretionary reward review ledger
- explicit monthly growth targets with actual-versus-target progress
- interactive acquisition and verified-revenue charts

## Backend and Analytics Engineering

DAU, WAU and MAU are rolling 24-hour, 7-day and 30-day distinct authenticated user counts. Superadmin users are excluded. Existing `sessions.last_seen_at` is refreshed at most once every six hours per active session. The telemetry write is non-critical and may never make an otherwise valid authentication request fail.

Platform trend reads are bounded to 30, 90 or 180 days. Referral network reads reuse the existing indexed `network_referral_edges` and bounded seven-generation `network_referral_paths` closure table rather than recursive history scans.

Migration `0044_superadmin_platform_intelligence.sql` adds date indexes for the private referral funnel, plus two Superadmin-only operating tables:

- `internal_referral_rewards`
- `platform_growth_targets`

The release is backward compatible before migration 0044. Read-only platform intelligence remains available, while reward and growth-target writes report that the migration is required.

## Financial methodology

Financial metrics use recorded Linkary billing facts only.

- Verified revenue comes from verified `billing_payments`.
- MRR comes from current active paid `billing_subscription_periods`.
- ARPA is MRR divided by active paid accounts.
- Paid account share is active paid accounts divided by active profiles.
- The 30-day discount ratio uses completed paid checkout base price versus final price.
- Payment reversal ratio uses payment value currently marked refunded or reversed.
- 100% free-pass redemptions are counted separately and never create fake zero-value revenue.

Metrics that require data Linkary does not currently record, including burn and gross margin, remain unavailable rather than estimated.

## Referral reward privacy and controls

The public Invite and Network products remain unchanged. No payout percentage, reward formula, or economic promise is exposed to users.

The private ledger is intentionally discretionary:

1. A Superadmin opens a reward review for a referring user and captures the network-size evidence snapshot.
2. `review` means the record is being considered and is not payable.
3. `approved` means the amount enters the internal `to pay` total.
4. `paid` requires a payment or settlement reference.
5. `void` removes a review or approved record from the workflow without deleting the audit trail.

This does not activate the disabled automatic downstream reward design documented in migration 0037.

## Frontend and UI/UX Engineering

The workspace lives at `/admin/platform-intelligence` on `sadmin.linkary.xyz` and remains Superadmin-only, private, noindexed and non-cacheable.

Responsive views include:

- KPI strip for DAU, WAU, MAU, MRR, 30-day revenue and approved rewards to pay
- Overview & Financials
- Referral Operations
- Growth Plan
- keyboard, pointer and touch-accessible chart exploration
- horizontally scrollable operational tables on narrow displays
- explicit migration/readiness and empty-data states

## QA and Release Engineering

Release acceptance requires:

- existing identity, invite, billing, coupon, Network Map V3 and public-profile regressions remain green
- no automatic referral payment logic is introduced
- Superadmin GET and mutation routes require the existing Superadmin security boundary, and mutations require CSRF
- migration 0044 remains manually applied through the protected production D1 workflow
- production deployment succeeds before migration is applied
- after migration, private reward and growth-target writes are smoke-tested
- no user-facing public copy mentions internal referral rewards
