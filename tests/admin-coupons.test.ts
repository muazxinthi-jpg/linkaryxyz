import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/adminCoupons.ts', import.meta.url), 'utf8');
const createRoute = readFileSync(new URL('../src/routes/adminCouponCreate100.ts', import.meta.url), 'utf8');
const freeRoute = readFileSync(new URL('../src/routes/freeCouponRedemption.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminCouponsExperience.tsx', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../frontend/src/BillingCheckoutPanel.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0036_free_coupon_redemption_guards.sql', import.meta.url), 'utf8');

test('Superadmin coupon API reuses the existing commercial coupon schema', () => {
  assert.equal(route.includes('discount_coupons'), true);
  assert.equal(route.includes('coupon_redemptions'), true);
  assert.equal(route.includes('billing_coupon_reservations'), true);
  assert.equal(createRoute.includes('requireSuperadmin'), true);
  assert.equal(createRoute.includes('verifyCsrf'), true);
});

test('Superadmin can create a 100 percent coupon while fixed discounts still cannot fake zero-value checkout', () => {
  assert.equal(createRoute.includes('between 1% and 100%'), true);
  assert.equal(createRoute.includes('discountValue === 100'), true);
  assert.equal(createRoute.includes('Fixed discount must leave a positive checkout price'), true);
  assert.equal(createRoute.includes('Choose at least one eligible paid plan'), true);
});

test('100 percent coupon redemption is a tracked entitlement, not a zero-value payment', () => {
  assert.equal(freeRoute.includes("coupon.discount_type !== 'percent' || coupon.discount_value !== 100"), true);
  assert.equal(freeRoute.includes('INSERT INTO coupon_redemptions'), true);
  assert.equal(freeRoute.includes('related_payment_id, redeemed_at'), true);
  assert.equal(freeRoute.includes('VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'), true);
  assert.equal(freeRoute.includes('INSERT INTO billing_entitlement_grants'), true);
  assert.equal(freeRoute.includes('coupon_redemption:'), true);
  assert.equal(freeRoute.includes('addOneMonth'), true);
  assert.equal(freeRoute.includes('monthly_grant'), true);
  assert.equal(freeRoute.includes('billing_payments'), false);
  assert.equal(freeRoute.includes('billing_checkout_intents'), false);
});

test('free coupon redemption preserves total and per-account limits including paid reservations', () => {
  assert.equal(migration.includes('trg_free_coupon_total_limit'), true);
  assert.equal(migration.includes('trg_free_coupon_user_limit'), true);
  assert.equal(migration.includes('trg_free_coupon_org_limit'), true);
  assert.equal(migration.includes('billing_coupon_reservations'), true);
  assert.equal(migration.includes('coupon_redemption_limit'), true);
  assert.equal(migration.includes('coupon_account_redemption_limit'), true);
});

test('coupon writes remain audit logged', () => {
  assert.equal(createRoute.includes("'billing_coupon.created'"), true);
  assert.equal(route.includes("'billing_coupon.activated'"), true);
  assert.equal(route.includes("'billing_coupon.deactivated'"), true);
  assert.equal(freeRoute.includes("'billing_coupon.free_redeemed'"), true);
});

test('tracking entry exposes Superadmin coupon creation plus authenticated free redemption', () => {
  assert.equal(entry.includes("url.pathname === '/api/admin/commercial/coupons'"), true);
  assert.equal(entry.includes('createAdminCoupon100'), true);
  assert.equal(entry.includes('listAdminCoupons'), true);
  assert.equal(entry.includes('updateAdminCouponStatus'), true);
  assert.equal(entry.includes("url.pathname === '/api/billing/coupon/redeem-free'"), true);
  assert.equal(entry.includes('redeemFreeCoupon'), true);
});

test('Superadmin coupon UI accepts exactly 100 percent and explains coupon versus comped access', () => {
  assert.equal(ui.includes("max={draft.discountType === 'percent' ? '100' : undefined}"), true);
  assert.equal(ui.includes('100% coupon'), true);
  assert.equal(ui.includes('Direct comped accounts remain a separate entitlement grant'), true);
  assert.equal(ui.includes('Total redemption limit'), true);
  assert.equal(ui.includes('Per-account limit'), true);
});

test('checkout tries a 100 percent coupon before requiring a wallet transfer', () => {
  assert.equal(checkout.includes('/api/billing/coupon/redeem-free'), true);
  assert.equal(checkout.includes("error.code === 'coupon_not_free'"), true);
  assert.equal(checkout.includes('No fake $0 payments.'), true);
  assert.equal(checkout.includes('onPaid();'), true);
});

test('coupon page remains Superadmin gated in AppV3', () => {
  assert.equal(app.includes("'admin-coupons'"), true);
  assert.equal(app.includes("location.pathname === '/admin/coupons'"), true);
  assert.equal(app.includes('if (!me.user?.superadmin) return <ForbiddenScreen />'), true);
});
