import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appV3 = readFileSync('frontend/src/AppV3.tsx', 'utf8');
const workspace = readFileSync('frontend/src/ProductWorkspace.tsx', 'utf8');
const billingUi = readFileSync('frontend/src/BillingExperience.tsx', 'utf8');
const billingCss = readFileSync('frontend/src/billing.css', 'utf8');
const billingCurrent = readFileSync('src/routes/billingCurrent.ts', 'utf8');
const worker = readFileSync('src/index.ts', 'utf8');
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

test('current billing honors Superadmin entitlements and usage ledger without manufacturing access', () => {
  assert.match(billingCurrent, /billing_entitlement_grants/);
  assert.match(billingCurrent, /usage_credit_ledger/);
  assert.match(billingCurrent, /source: grant \? 'grant' : 'default'/);
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

test('selecting a paid plan leads to the Linkary wallet but never claims payment or access succeeded', () => {
  assert.match(billingUi, /\/wallets\?upgrade=/);
  assert.match(billingUi, /Paid access activates only after an eligible payment or Superadmin entitlement is verified/);
  assert.match(billingUi, /Selecting a plan never grants paid access by itself/);
  assert.doesNotMatch(billingUi, /payment successful/i);
  assert.doesNotMatch(billingUi, /subscription activated/i);
});

test('public homepage pricing is injected from the D1-backed billing catalog', () => {
  assert.match(staticSource, /id="pricing"/);
  assert.match(staticSource, /linkary-pricing-grid/);
  assert.match(staticSource, /fetch\('\/api\/billing\/plans'/);
  assert.match(staticSource, /href="#pricing">Pricing/);
  assert.match(staticSource, /Start free\./);
});

test('pricing and billing layouts retain narrow-phone acceptance protections', () => {
  assert.match(billingCss, /@media \(max-width: 700px\)/);
  assert.match(billingCss, /billing-plan-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(billingCss, /min-height: 44px/);
  assert.match(staticSource, /public-pricing-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(staticSource, /min-height: 46px/);
});
