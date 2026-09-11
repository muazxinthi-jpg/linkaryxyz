import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0046_network_reward_ledger.sql', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../src/routes/adminNetworkRewardLedger.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminNetworkRewardsExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/admin-network-rewards.css', import.meta.url), 'utf8');
const superadminApp = readFileSync(new URL('../frontend/src/SuperadminApp.tsx', import.meta.url), 'utf8');
const superadminWorkspace = readFileSync(new URL('../frontend/src/SuperadminWorkspace.tsx', import.meta.url), 'utf8');
const billing = readFileSync(new URL('../src/routes/billingCheckoutSafe.ts', import.meta.url), 'utf8');

test('V4 locks the exact seven-generation source-of-truth rates', () => {
  const expected: Array<[number, number]> = [
    [1, 1000], [2, 70], [3, 45], [4, 30], [5, 22], [6, 18], [7, 15],
  ];
  for (const [generation, bps] of expected) {
    assert.match(migration, new RegExp(`\\(${generation},\\s*${bps},`));
  }
  assert.equal(expected.reduce((sum, [, bps]) => sum + bps, 0), 1200);
  assert.equal(expected.slice(1).reduce((sum, [, bps]) => sum + bps, 0), 200);
  assert.match(backend, /maximumAggregateBps: 1200/);
  assert.match(backend, /downstreamAggregateBps: 200/);
});

test('Gen 1 is lifetime eligible paid revenue rather than first-payment-only accounting', () => {
  assert.match(migration, /trg_network_reward_gen1_after_payment/);
  assert.match(migration, /AFTER INSERT ON billing_payments/);
  assert.match(migration, /p\.depth = 1/);
  assert.match(backend, /gen1LifetimeRevenue: true/);
  assert.match(ui, /10% lifetime eligible revenue/i);
  assert.doesNotMatch(backend, /payment_rank = 1/);
});

test('downstream accounting is disabled by default and gated from payable state', () => {
  assert.match(migration, /network_rewards_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /network_rewards_enabled = 1/);
  assert.match(backend, /network_rewards_disabled/);
  assert.match(backend, /ENABLE NETWORK REWARDS/);
  assert.match(backend, /RECONCILE DOWNSTREAM HISTORY/);
  assert.match(ui, /SHADOW ONLY/);
  assert.match(ui, /Projected, not accrued or payable/);
  assert.match(ui, /FUTURE verified payments only/);
});

test('reward accounting uses real positive billing payments and free access cannot create a ledger event', () => {
  assert.match(migration, /billing_payments/);
  assert.match(migration, /bp\.amount_cents/);
  assert.match(migration, /CAST\(ROUND\(bp\.amount_cents \* rate\.rate_bps \/ 10000\.0\)/);
  assert.match(billing, /Zero-value paid access must be granted through Superadmin/);
  assert.match(backend, /directReferredRevenueCents/);
  assert.match(ui, /Verified revenue with direct lineage/);
});

test('ledger corrections are append-only reversals', () => {
  assert.match(migration, /entry_kind TEXT NOT NULL CHECK \(entry_kind IN \('accrual', 'reversal'\)\)/);
  assert.match(migration, /related_entry_id TEXT REFERENCES network_reward_ledger\(id\)/);
  assert.match(migration, /trg_network_reward_reversal_after_payment_status/);
  assert.match(migration, /OLD\.status = 'verified' AND NEW\.status IN \('refunded', 'reversed'\)/);
  assert.match(migration, /trg_network_reward_ledger_no_update/);
  assert.match(migration, /trg_network_reward_ledger_no_delete/);
  assert.match(migration, /network_reward_ledger_append_only/);
  assert.match(ui, /Append-only corrections/);
});

test('V3 decisions are preserved and mirrored to prevent duplicate first-payment settlement', () => {
  assert.match(migration, /FROM referral_reward_decisions decision/);
  assert.match(migration, /'v3_legacy'/);
  assert.match(migration, /trg_network_reward_v3_decision_after_insert/);
  assert.match(migration, /trg_network_reward_v3_decision_after_update/);
  assert.match(backend, /source === 'v3_legacy'/);
  assert.match(backend, /legacyVarianceCents/);
  assert.match(ui, /V3 legacy decision/);
});

test('payable settlement remains an explicit audited Superadmin workflow', () => {
  assert.match(backend, /requireSuperadmin/);
  assert.match(backend, /verifyCsrf/);
  assert.match(backend, /A settlement reference is required before a reward is marked paid/);
  assert.match(backend, /network_reward\.setting_updated/);
  assert.match(backend, /network_reward\.reconciled/);
  assert.match(backend, /`network_reward\.\$\{next\}`/);
  assert.match(ui, /PAYABLES COMMAND CENTER/);
  assert.match(ui, /Mark sent/);
  assert.match(ui, /Settlement reference/);
});

test('Superadmin has a clear approve or reject decision queue', () => {
  assert.match(ui, /APPROVAL QUEUE/);
  assert.match(ui, /Rewards waiting for a Superadmin decision/);
  assert.match(ui, />Approve</);
  assert.match(ui, />Reject</);
  assert.match(ui, /Why should this reward be rejected\?/);
  assert.match(ui, /status, reason, paymentReference/);
});

test('approved unsent payables can be downloaded and copied for manual settlement', () => {
  assert.match(ui, /Download approved CSV/);
  assert.match(ui, /Copy payout list/);
  assert.match(ui, /text\/csv;charset=utf-8/);
  assert.match(ui, /approved_awaiting_settlement/);
  assert.match(ui, /linkary-approved-network-rewards-/);
  assert.match(ui, /data\.payables\.map\(payableCopyLine\)/);
});

test('mark sent preserves the paid accounting state and requires one settlement reference', () => {
  assert.match(ui, /markPayableSent/);
  assert.match(ui, /updateLedgerStatus\(row, 'paid'/);
  assert.match(ui, /transaction hash, invoice, bank reference, or internal payment ID/);
  assert.match(ui, /settlementStatus === 'paid'/);
  assert.match(ui, /'Sent'/);
  assert.match(backend, /approved: \['paid', 'void'\]/);
});

test('private routes and Superadmin navigation expose the V4 workspace without removing Platform Intelligence', () => {
  assert.match(entry, /\/api\/admin\/platform-intelligence\/network-reward-ledger/);
  assert.match(entry, /network-reward-ledger\/sync/);
  assert.match(entry, /network-reward-settings/);
  assert.match(superadminApp, /\/admin\/network-rewards/);
  assert.match(superadminApp, /\/admin\/platform-intelligence/);
  assert.match(superadminWorkspace, /Network rewards/);
  assert.match(superadminWorkspace, /Platform intelligence/);
  assert.match(ui, /Private Superadmin accounting/);
  assert.match(backend, /noindex, nofollow, noarchive/);
});

test('V4 UI distinguishes projections from actual verified accounting and passes responsive source gate', () => {
  assert.match(ui, /GEN 2-7 SHADOW MODEL/);
  assert.match(ui, /NOT ACCRUED · NOT PAYABLE/);
  assert.match(ui, /IMMUTABLE REWARD LEDGER/);
  assert.match(ui, /Reversal adjustments/);
  assert.match(css, /@media\(max-width:1180px\)/);
  assert.match(css, /@media\(max-width:860px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /overflow:auto/);
  assert.match(css, /focus-visible/);
});
