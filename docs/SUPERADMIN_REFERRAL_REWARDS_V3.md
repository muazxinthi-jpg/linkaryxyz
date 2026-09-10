# Superadmin Referral Rewards Intelligence V3

## Purpose

V3 adds private, automatic referral reward intelligence to `sadmin.linkary.xyz` without creating a public promise to pay and without sending funds automatically.

The dashboard answers four separate questions:

1. How many users did each direct inviter bring?
2. How many of those referred users became real paying users?
3. How much verified revenue did those referred users generate?
4. Based on the current internal rule, what reward is estimated, approved, paid, or still outstanding?

## Canonical attribution

Reward attribution is direct-referral only and starts from `network_referral_edges`.

The seven-generation closure remains useful for network analytics, but descendants beyond the direct invitee do not create automatic reward entitlement.

The payment source of truth is `billing_payments` joined through `billing_checkout_intents.requested_by_user_id` to the referred Linkary user.

## Free access policy

A 100% coupon or duration-based free-access pass is granted through `coupon_redemptions` and `billing_entitlement_grants`. It does not create a fake zero-value `billing_payments` row.

Therefore:

- free access = $0 reward
- 100% coupon = $0 reward
- signup without a verified paid transaction = $0 reward
- a user who begins free can become reward-eligible only when they later make their first real positive-value payment

## Paid reward policy

V3 calculates an estimate from the first real paid transaction by a directly referred user.

The active Superadmin rule can be either:

- percentage of first verified payment, or
- fixed amount per first paid referral

The initial private default is 10% of the first verified payment. This is a configurable internal estimate only. It can be changed before rewards are approved.

A reviewed amount is snapshotted so changing the active rule later does not silently rewrite an already-reviewed reward.

## Refunds and reversals

A source payment must still be `verified` to remain payable. A refunded or reversed source payment cannot be approved or marked paid through the automatic payables queue.

If an approved item is later reversed before settlement, it disappears from the payable query and can be voided with an internal reason.

## Decision lifecycle

Automatic estimate -> Under review -> Approved -> Paid

An estimate may also be approved directly. Review or approved items may be voided. Paid and void are terminal states.

`Paid` requires a settlement reference, transaction hash, invoice reference, or internal settlement ID.

Every rule change and decision transition is audit logged.

## Minimum payout threshold

The active rule stores a minimum payout threshold for settlement policy visibility. It does not create an automatic transfer. Superadmin remains responsible for deciding when approved balances are actually settled.

## Legacy V2 rewards

`internal_referral_rewards` is retained for historical discretionary reward records created before V3. Those records remain visible as legacy records and keep their existing audited settlement behavior.

## Chart UX

The Platform Acquisition chart now renders real circular data points for both series. Hover selects the nearest date, the selected point gets a larger dot and halo, a vertical guide appears, and click/tap pins or releases that point. Keyboard Enter/Space also pins the focused day.

## Production release

1. Merge the protected PR only after regression, TypeScript, Wrangler and Cloudflare Workers checks pass.
2. Let the normal `main` deployment complete and verify existing production health.
3. Apply `0045_referral_reward_intelligence.sql` using the protected production D1 migration workflow.
4. Refresh Superadmin and verify the automatic reward panel reports `ready: true`.
5. Review the initial 10% internal rule before approving any reward.
