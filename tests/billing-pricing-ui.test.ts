import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appV3 = readFileSync('frontend/src/AppV3.tsx', 'utf8');
const workspace = readFileSync('frontend/src/ProductWorkspace.tsx', 'utf8');
const billingUi = readFileSync('frontend/src/BillingExperience.tsx', 'utf8');
const checkoutUi = readFileSync('frontend/src/BillingCheckoutPanel.tsx', 'utf8');
const billingCss = readFileSync('frontend/src/billing.css', 'utf8');
const billingCurrent = readFileSync('src/routes/billingCurrent.ts', 'utf8');
const worker = readFileSync('src/index.ts', 'utf8');
const workerOverlay = readFileSync('src/worker.ts', 'utf8');
const checkoutBackend = readFileSync('src/routes/billingCheckoutSafe.ts', 'utf8');
const checkoutMigration = readFileSync('migrations/0030_base_usdc_subscriptions.sql', 'utf8');
const checkoutSnapshotMigration = readFileSync('migrations/0031_checkout_entitlement_snapshot.sql', 'utf8');
const staticSource = readFileSync('src/static.ts', 'utf8');

test('authenticated app exposes a dedicated Plan and billing deep link', () => {
  assert.match(appV3, /location\.pathname === '\/settings\/plan'/);
  assert.match(appV3, /experience="billing"/);
  assert.match(appV3, /BillingExperience/);
  assert.match(workspace, />Plan & billing</);
  assert.match(workspace, /ops-plan-link/);
});

test('current billing status is authenticated and exact-profile scoped', () => {
  assert.match(worker, /path === '\/api\/billing\/current'/);
  assert.match(billingCurrent, /requireAuth\(request, env\)/);
  assert.match(billingCurrent, /profile\.owner_user_id !== auth\.user\.id/);
  assert.match(billingCurrent, /organization_memberships/);
  assert.match(billingCurrent, /status = 'active'/);
  assert.match(billingCurrent, /cache-control': 'private, no-store'/);
});

test('current billing honors paid periods and Superadmin entitlements without manufacturing access', () => {
  assert.match(billingCurrent, /billing_subscription_periods/);
  assert.match(billingCurrent, /billing_entitlement_grants/);
  assert.match(billingCurrent, /usage_credit_ledger/);
  assert.match(billingCurrent, /source: grant \? 'grant' : subscription \? 'subscription' : 'default'/);
  assert.match(billingCurrent, /monthly_credit_override \?\? plan\.monthly_usage_credits/);
  assert.doesNotMatch(billingCurrent, /INSERT INTO billing_entitlement_grants/);
});

test('billing UI uses the same live public plan catalog and keeps creator and Project packages separated', () => {
  assert.match(billingUi, /api\/billing\/plans/);
  assert.match(billingUi, /api\/billing\/current\?profileId=/);
  assert.match(billingUi, /plan\.code === 'free' \|\| plan\.code === 'personal_pro'/);
  assert.match(billingUi, /project_manual/);
  assert.match(billingUi, /project_automate/);
  assert.match(billingUi, /project_growth/);
});

test('paid plan selection opens verified Linkary wallet checkout instead of self-granting access', () => {
  assert.match(billingUi, /BillingCheckoutPanel/);
  assert.match(billingUi, />Pay with Linkary wallet</);
  assert.match(billingUi, /Paid access activates only after an eligible Base USDC payment or Superadmin entitlement is verified/);
  assert.match(checkoutUi, /useSendUsdc/);
  assert.match(checkoutUi, /network: 'base'/);
  assert.match(checkoutUi, /api\/billing\/checkout/);
  assert.match(checkoutUi, /api\/billing\/checkout\/verify/);
  assert.match(checkoutUi, /result\.type !== 'evm-eoa'/);
  assert.match(checkoutUi, /Every renewal requires your approval/);
  assert.doesNotMatch(checkoutUi, /INSERT INTO billing_subscription_periods/);
});

test('checkout server verifies exact Base USDC transfer before creating a paid subscription', () => {
  assert.match(workerOverlay, /api\/billing\/payment-config/);
  assert.match(workerOverlay, /api\/billing\/checkout'/);
  assert.match(workerOverlay, /api\/billing\/checkout\/verify/);
  assert.match(checkoutBackend, /BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'/);
  assert.match(checkoutBackend, /receiptContainsExactUsdcTransfer/);
  assert.match(checkoutBackend, /topicAddress\(log\.topics\?\.\[1\]\) !== payer/);
  assert.match(checkoutBackend, /topicAddress\(log\.topics\?\.\[2\]\) !== treasury/);
  assert.match(checkoutBackend, /amountFromData\(log\.data\) === expectedAtomic/);
  assert.match(checkoutBackend, /billing_payments/);
  assert.match(checkoutBackend, /billing_subscription_periods/);
  assert.match(checkoutBackend, /usage_credit_ledger/);
  assert.match(checkoutBackend, /monthly_usage_credits_snapshot/);
});

test('checkout reserves coupons before money moves and keeps payment processing idempotent', () => {
  assert.match(checkoutMigration, /billing_coupon_reservations/);
  assert.match(checkoutMigration, /coupon_reservation_limit/);
  assert.match(checkoutMigration, /coupon_account_reservation_limit/);
  assert.match(checkoutSnapshotMigration, /monthly_usage_credits_snapshot/);
  assert.match(checkoutSnapshotMigration, /idx_coupon_redemptions_payment_unique/);
  assert.match(checkoutBackend, /billing-payment:\$\{intent\.id\}:monthly-credits/);
  assert.match(checkoutBackend, /tx_hash TEXT NOT NULL UNIQUE|txHash/);
});

test('public homepage pricing is injected from the D1-backed billing catalog', () => {
  assert.match(staticSource, /id="pricing"/);
  assert.match(staticSource, /linkary-pricing-grid/);
  assert.match(staticSource, /fetch\('\/api\/billing\/plans'/);
  assert.match(staticSource, /href="#pricing">Pricing/);
  assert.match(staticSource, /Start free\./);
});

test('pricing and checkout layouts retain narrow-phone acceptance protections', () => {
  assert.match(billingCss, /@media \(max-width: 700px\)/);
  assert.match(billingCss, /billing-plan-grid,/);
  assert.match(billingCss, /billing-checkout-summary \{ grid-template-columns: 1fr; \}/);
  assert.match(billingCss, /min-height: 44px/);
  assert.match(staticSource, /public-pricing-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(staticSource, /min-height: 46px/);
});
