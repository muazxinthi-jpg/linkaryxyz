import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/adminCouponAccessUntil.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminCouponsExperience.tsx', import.meta.url), 'utf8');

test('existing coupon access-until update remains Superadmin and CSRF protected', () => {
  assert.equal(route.includes('requireSuperadmin'), true);
  assert.equal(route.includes('verifyCsrf'), true);
  assert.equal(route.includes('PRAGMA table_info(discount_coupons)'), true);
  assert.equal(route.includes('Coupon access-until database migration is not applied'), true);
});

test('existing coupon access-until update is restricted to tracked 100 percent coupons', () => {
  assert.equal(route.includes("current.discount_type !== 'percent' || current.discount_value !== 100"), true);
  assert.equal(route.includes('Access until is available only for 100% coupons'), true);
  assert.equal(route.includes('Access until must be after the coupon start date'), true);
  assert.equal(route.includes('Access until must be after the coupon claim end date'), true);
});

test('existing coupon access-until mutation changes no coupon business field besides fixed expiry', () => {
  const update = 'UPDATE discount_coupons SET access_until = ?, updated_at = ? WHERE id = ?';
  assert.equal(route.includes(update), true);
  const updateSection = route.slice(route.indexOf(update), route.indexOf(update) + update.length);
  assert.equal(updateSection.includes('ends_at'), false);
  assert.equal(updateSection.includes('max_redemptions'), false);
  assert.equal(updateSection.includes('eligible_plan_codes_json'), false);
  assert.equal(updateSection.includes('is_active'), false);
  assert.equal(updateSection.includes('stackable'), false);
  assert.equal(route.includes("'billing_coupon.access_until_updated'"), true);
  assert.equal(route.includes('before: { accessUntil: current.access_until }'), true);
  assert.equal(route.includes('after: { accessUntil }'), true);
});

test('tracking entry exposes only a dedicated PATCH path for fixed access expiry', () => {
  assert.equal(entry.includes("/access-until$/"), true);
  assert.equal(entry.includes('updateAdminCouponAccessUntil'), true);
  assert.equal(entry.includes("methodNotAllowed(['PATCH'])"), true);
  assert.equal(entry.includes('updateAdminCouponStatus'), true);
});

test('Superadmin UI clearly distinguishes fixed expiry and requires timezone plus confirmation', () => {
  assert.equal(ui.includes('Set fixed expiry'), true);
  assert.equal(ui.includes('Fixed Access until for ${coupon.code}'), true);
  assert.equal(ui.includes('ISO 8601 timestamp including timezone'), true);
  assert.equal(ui.includes("/(Z|[+-]\\d{2}:\\d{2})$/i"), true);
  assert.equal(ui.includes('Only future redemptions use this value.'), true);
  assert.equal(ui.includes('/access-until'), true);
  assert.equal(ui.includes('window.confirm'), true);
});
