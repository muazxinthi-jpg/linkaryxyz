import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0045_referral_reward_intelligence.sql', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../src/routes/adminReferralRewardIntelligence.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminReferralRewardsPanel.tsx', import.meta.url), 'utf8');
const platformUi = readFileSync(new URL('../frontend/src/AdminPlatformIntelligenceExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/admin-referral-rewards.css', import.meta.url), 'utf8');
const freeCoupon = readFileSync(new URL('../src/routes/freeCouponRedemption.ts', import.meta.url), 'utf8');
const billing = readFileSync(new URL('../src/routes/billingCheckoutSafe.ts', import.meta.url), 'utf8');

test('V3 reward intelligence is Superadmin-only and private', () => {
  assert.match(backend, /requireSuperadmin/);
  assert.match(backend, /verifyCsrf/);
  assert.match(backend, /noindex, nofollow, noarchive/);
  assert.match(entry, /\/api\/admin\/platform-intelligence\/referral-reward-intelligence/);
  assert.match(entry, /\/api\/admin\/platform-intelligence\/referral-reward-rule/);
  assert.match(entry, /referral-reward-payments/);
  assert.match(ui, /not a public entitlement or automatic payout/i);
});

test('automatic rewards use canonical direct referrals and first real billing payment', () => {
  assert.match(backend, /network_referral_edges/);
  assert.match(backend, /bci\.requested_by_user_id AS referred_user_id/);
  assert.match(backend, /ROW_NUMBER\(\) OVER/);
  assert.match(backend, /payment_rank = 1/);
  assert.match(backend, /bp\.amount_cents/);
  assert.match(migration, /first_payment_only INTEGER NOT NULL DEFAULT 1 CHECK \(first_payment_only = 1\)/);
  assert.match(migration, /direct-referral only/i);
});

test('free access and 100 percent coupons can never create automatic reward candidates', () => {
  assert.match(freeCoupon, /related_payment_id, redeemed_at\)\s*VALUES \(\?, \?, \?, \?, \?, \?, NULL, \?\)/);
  assert.match(freeCoupon, /finalPriceCents: 0/);
  assert.match(billing, /Zero-value paid access must be granted through Superadmin/);
  assert.match(billing, /final_price_cents/);
  assert.match(backend, /freeAccessRewardCents: 0/);
  assert.match(backend, /fullDiscountRewardCents: 0/);
  assert.match(ui, /100% coupon \/ free access = \$0/);
});

test('refunds and reversals are excluded from payable rewards', () => {
  assert.match(backend, /payment_status = 'verified'/);
  assert.match(backend, /payment_status <> 'verified'/);
  assert.match(backend, /Refunded or reversed source payments cannot become payable rewards/);
  assert.match(migration, /exclude_refunded_payments INTEGER NOT NULL DEFAULT 1 CHECK \(exclude_refunded_payments = 1\)/);
  assert.match(ui, /Refunded or reversed = not payable/);
});

test('reward rule supports percentage or fixed first-payment calculations', () => {
  assert.match(migration, /percentage_first_payment/);
  assert.match(migration, /fixed_first_payment/);
  assert.match(migration, /rrule_default_10pct_first_payment/);
  assert.match(backend, /computedRewardCents/);
  assert.match(backend, /percentageBps/);
  assert.match(backend, /fixedAmountCents/);
  assert.match(ui, /% of first verified payment/);
  assert.match(ui, /Fixed amount per first paid referral/);
});

test('approval and payment remain explicit audited Superadmin actions', () => {
  assert.match(migration, /status TEXT NOT NULL CHECK \(status IN \('review', 'approved', 'paid', 'void'\)\)/);
  assert.match(backend, /payment reference is required before a referral reward is marked paid/i);
  assert.match(backend, /referral_reward\.rule_updated/);
  assert.match(backend, /`referral_reward\.\$\{next\}`/);
  assert.match(ui, /Manual approval still required/);
  assert.match(ui, /Mark paid/);
});

test('Superadmin shows automatic earnings by inviter and a per-referral ledger', () => {
  for (const token of [
    'TOP REFERRAL EARNERS',
    'Users brought',
    'Paid',
    'Free / unpaid',
    'Referral revenue',
    'Estimated reward',
    'REFERRAL REWARD LEDGER',
    'Every direct referral, including $0 free users',
  ]) assert.equal(ui.includes(token), true, token);
  assert.match(platformUi, /AdminReferralRewardsPanel/);
  assert.match(platformUi, /7-GENERATION NETWORK ANALYTICS/);
  assert.match(platformUi, /not downstream reward entitlement/i);
});

test('platform acquisition chart exposes visible dots and click-to-pin interaction', () => {
  assert.match(platformUi, /pai-point-dot user/);
  assert.match(platformUi, /pai-point-dot referral/);
  assert.match(platformUi, /pai-active-dot/);
  assert.match(platformUi, /setPinnedIndex/);
  assert.match(platformUi, /click to pin/i);
  assert.match(platformUi, /PINNED/);
  assert.match(css, /\.pai-point-dot/);
  assert.match(css, /\.pai-hit-zone/);
  assert.match(css, /\.pai-active-dot/);
});
