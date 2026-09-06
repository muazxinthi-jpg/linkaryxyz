import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/adminCoupons.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminCouponsExperience.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const latestMigration = readFileSync(new URL('../migrations/0035_canonical_superadmin_owner.sql', import.meta.url), 'utf8');

test('Superadmin coupon API reuses the existing commercial coupon schema', () => {
  assert.equal(route.includes('discount_coupons'), true);
  assert.equal(route.includes('coupon_redemptions'), true);
  assert.equal(route.includes('billing_coupon_reservations'), true);
  assert.equal(route.includes('requireSuperadmin'), true);
  assert.equal(route.includes('verifyCsrf'), true);
});

test('coupon creation fails safe for zero-value paid checkout and requires explicit eligible plans', () => {
  assert.equal(route.includes('Percentage coupons must be between 1% and 99%'), true);
  assert.equal(route.includes('Use a Superadmin comped plan grant for free access'), true);
  assert.equal(route.includes('Choose at least one eligible paid plan'), true);
  assert.equal(route.includes("'coupon_zero_price_not_allowed'"), true);
});

test('coupon writes are audit logged and status can be activated or deactivated', () => {
  assert.equal(route.includes("'billing_coupon.created'"), true);
  assert.equal(route.includes("'billing_coupon.activated'"), true);
  assert.equal(route.includes("'billing_coupon.deactivated'"), true);
  assert.equal(route.includes("'discount_coupon'"), true);
});

test('tracking entry exposes only authenticated Superadmin coupon routes', () => {
  assert.equal(entry.includes("url.pathname === '/api/admin/commercial/coupons'"), true);
  assert.equal(entry.includes('createAdminCoupon'), true);
  assert.equal(entry.includes('listAdminCoupons'), true);
  assert.equal(entry.includes('updateAdminCouponStatus'), true);
});

test('Superadmin coupon UI supports plan scoping, limits, stacking and safe free-access guidance', () => {
  assert.equal(ui.includes('Create discount code'), true);
  assert.equal(ui.includes('Eligible paid plans'), true);
  assert.equal(ui.includes('Total redemption limit'), true);
  assert.equal(ui.includes('Per-account limit'), true);
  assert.equal(ui.includes('Allow stacking'), true);
  assert.equal(ui.includes('Coupons cannot reduce a paid checkout to $0'), true);
  assert.equal(ui.includes('/admin/commercial'), true);
});

test('coupon page is Superadmin gated in AppV3', () => {
  assert.equal(app.includes("'admin-coupons'"), true);
  assert.equal(app.includes("location.pathname === '/admin/coupons'"), true);
  assert.equal(app.includes('if (!me.user?.superadmin) return <ForbiddenScreen />'), true);
});

test('later Superadmin owner migration does not change the authoritative coupon schema', () => {
  assert.equal(latestMigration.includes('discount_coupons'), false);
  assert.equal(latestMigration.includes('coupon_redemptions'), false);
  assert.equal(latestMigration.includes('billing_coupon_reservations'), false);
  assert.equal(latestMigration.includes('superadmin.owner.canonicalized'), true);
});
