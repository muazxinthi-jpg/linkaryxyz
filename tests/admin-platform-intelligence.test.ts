import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/adminPlatformIntelligence.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/auth/session.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/SuperadminApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../frontend/src/SuperadminWorkspace.tsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminPlatformIntelligenceExperience.tsx', import.meta.url), 'utf8');
const rewardUi = readFileSync(new URL('../frontend/src/AdminReferralRewardsPanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/admin-platform-intelligence.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0044_superadmin_platform_intelligence.sql', import.meta.url), 'utf8');
const networkMigration = readFileSync(new URL('../migrations/0037_seven_generation_network.sql', import.meta.url), 'utf8');

test('platform intelligence is Superadmin-only and noindexed', () => {
  assert.match(route, /requireSuperadmin/);
  assert.match(route, /verifyCsrf/);
  assert.match(route, /noindex, nofollow, noarchive/);
  assert.match(entry, /\/api\/admin\/platform-intelligence/);
  assert.match(app, /\/admin\/platform-intelligence/);
  assert.match(workspace, /Platform intelligence/);
});

test('DAU WAU and MAU use bounded authenticated session activity without changing identity recovery', () => {
  assert.match(route, /COUNT\(DISTINCT CASE WHEN s\.last_seen_at >= \? THEN s\.user_id END\) AS dau/);
  assert.match(route, /AS wau/);
  assert.match(route, /AS mau/);
  assert.match(route, /rolling 24-hour, 7-day and 30-day last-seen windows/);
  assert.match(session, /SESSION_ACTIVITY_REFRESH_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(session, /UPDATE sessions SET last_seen_at/);
  assert.match(session, /telemetry write failure must not interrupt an otherwise valid session/i);
});

test('financial ratios use recorded billing only and do not fabricate free-pass revenue', () => {
  for (const token of [
    "status = 'verified'",
    'billing_subscription_periods',
    'billing_checkout_intents',
    'activePaidAccounts',
    'arpaCents',
    'paidAccountShare',
    'discountRate30d',
    'reversalRate',
    'Free passes never create fake zero-value payments',
  ]) assert.equal(route.includes(token), true, token);
  assert.equal(route.includes('grossMargin'), false);
  assert.match(ui, /Cost-based metrics such as gross margin, burn, CAC and LTV are intentionally not invented/);
});

test('legacy discretionary rewards remain private and settlement controlled', () => {
  for (const token of [
    'internal_referral_rewards',
    "status IN ('review', 'approved', 'paid')",
    "'referral_reward.review_created'",
    '`referral_reward.${next}`',
    'payment reference is required',
    'superadmin_discretionary_review',
  ]) assert.equal(route.toLowerCase().includes(token.toLowerCase()), true, token);
  assert.match(migration, /do not create an automatic referral liability or a public\s+-- promise to pay/);
  assert.match(networkMigration, /Economic downstream rewards are deliberately NOT implemented/);
  assert.match(ui, /Referral reward intelligence stays inside Superadmin/);
  assert.match(ui, /no amount becomes payable without Superadmin approval/);
  assert.match(ui, /LEGACY DISCRETIONARY REWARDS/);
});

test('referral analytics reuse the canonical seven-generation graph and add bounded funnel indexes', () => {
  assert.match(route, /network_referral_edges/);
  assert.match(route, /network_referral_paths/);
  assert.match(route, /ancestor_user_id IN/);
  assert.match(route, /LIMIT 75/);
  assert.match(migration, /idx_invite_click_events_occurred/);
  assert.match(migration, /idx_invite_redemptions_redeemed/);
  assert.match(migration, /idx_invites_inviter_type_created/);
  assert.match(ui, /7-gen network/);
});

test('growth plan stores only explicit Superadmin targets and leaves missing targets unset', () => {
  assert.match(migration, /platform_growth_targets/);
  for (const token of ['registered_users', 'mau', 'paid_accounts', 'mrr_cents', 'referral_redemptions']) {
    assert.equal(migration.includes(token), true, token);
  }
  assert.match(route, /platform_growth_target\.upserted/);
  assert.match(ui, /No target/);
  assert.match(ui, /Set a target to measure progress/);
  assert.match(ui, /Missing targets stay visibly unset/);
});

test('platform intelligence UI includes interactive responsive growth charts', () => {
  for (const token of ['PLATFORM ACQUISITION', 'VERIFIED REVENUE', 'onPointerEnter', 'onPointerDown', 'onFocus', 'role="status"', 'role="img"']) {
    assert.equal(ui.includes(token), true, token);
  }
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /touch-action: pan-y/);
  assert.match(css, /\.pai-table-wrap/);
});

test('executive pulse ratios use real bounded platform facts', () => {
  assert.match(route, /COUNT\(DISTINCT p\.owner_user_id\) AS count/);
  assert.match(route, /profileActivationRate: moneyRatio\(activatedUserCount, totalUserCount\)/);
  assert.match(route, /paidConversionRate: moneyRatio\(paidAccounts, totalUserCount\)/);
  assert.match(route, /referralContribution30d: moneyRatio\(referralsCurrent30, newUsersCurrent30\)/);
  assert.match(ui, /EXECUTIVE PULSE/);
  assert.match(ui, /Profile activation/);
  assert.match(ui, /Paid conversion/);
  assert.match(ui, /Referral contribution/);
});

test('growth velocity compares the latest 30 days with the preceding 30 days', () => {
  assert.match(route, /const sixtyDaysAt = daysAgo\(60, nowDate\)/);
  assert.match(route, /growthChange\(newUsersCurrent30, newUsersPrevious30\)/);
  assert.match(route, /growthChange\(referralsCurrent30, referralsPrevious30\)/);
  assert.match(route, /growthChange\(revenueCurrent30, revenuePrevious30\)/);
  assert.match(route, /change is unavailable when the prior period is zero/);
  assert.match(ui, /GROWTH VELOCITY/);
  assert.match(ui, /Latest 30 days vs preceding 30 days/);
});

test('six month operating history is calendar bounded and visualized without invented MRR history', () => {
  assert.match(route, /monthStartMonthsAgo\(5, nowDate\)/);
  assert.match(route, /monthlyHistory/);
  assert.match(route, /substr\(u\.created_at, 1, 7\) AS month/);
  assert.match(route, /substr\(verified_at, 1, 7\) AS month/);
  assert.match(ui, /6-MONTH OPERATING HISTORY/);
  assert.match(ui, /Acquisition, referrals and verified revenue/);
  assert.match(css, /\.pai-history-grid/);
});

test('payables command center remains explicit under automatic V3 rewards and legacy records', () => {
  assert.match(rewardUi, /AUTOMATIC PAYABLES/);
  assert.match(rewardUi, /Approved rewards waiting for settlement/);
  assert.match(rewardUi, /Mark paid/);
  assert.match(rewardUi, /Manual approval still required/);
  assert.match(ui, /\.filter\(\(reward\) => reward\.status === 'approved'\)/);
  assert.match(ui, /People waiting/);
  assert.match(ui, /Oldest waiting/);
  assert.match(ui, /waitingDays/);
  assert.match(route, /A payment reference is required before a reward is marked paid/);
});

test('target attainment chart remains driven by explicit internal targets', () => {
  assert.match(ui, /TARGET ATTAINMENT/);
  assert.match(ui, /Actual vs internal target/);
  assert.match(ui, /target unset/);
  assert.match(css, /\.pai-attainment-row/);
});
