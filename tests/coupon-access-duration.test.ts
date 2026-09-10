import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCalendarMonths } from '../src/couponEntitlementCredits';

const migration = readFileSync(new URL('../migrations/0043_coupon_access_duration_months.sql', import.meta.url), 'utf8');
const createRoute = readFileSync(new URL('../src/routes/adminCouponCreate100.ts', import.meta.url), 'utf8');
const durationRoute = readFileSync(new URL('../src/routes/adminCouponAccessDuration.ts', import.meta.url), 'utf8');
const fixedRoute = readFileSync(new URL('../src/routes/adminCouponAccessUntil.ts', import.meta.url), 'utf8');
const freeRoute = readFileSync(new URL('../src/routes/freeCouponRedemption.ts', import.meta.url), 'utf8');
const credits = readFileSync(new URL('../src/couponEntitlementCredits.ts', import.meta.url), 'utf8');
const billingCurrent = readFileSync(new URL('../src/routes/billingCurrent.ts', import.meta.url), 'utf8');
const aiRuntime = readFileSync(new URL('../src/ai/runtime.ts', import.meta.url), 'utf8');
const adminCoupons = readFileSync(new URL('../src/routes/adminCoupons.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/AdminCouponsExperience.tsx', import.meta.url), 'utf8');

test('migration 0043 adds bounded relative duration without changing claim deadline or fixed expiry', () => {
  assert.equal(migration.includes('ADD COLUMN access_duration_months INTEGER'), true);
  assert.equal(migration.includes('access_duration_months >= 1 AND access_duration_months <= 60'), true);
  assert.equal(migration.includes('trg_coupon_access_policy_insert'), true);
  assert.equal(migration.includes('trg_coupon_access_policy_update'), true);
  assert.equal(migration.includes('coupon_access_policy_conflict'), true);
  assert.equal(migration.includes('coupon_access_duration_requires_free_coupon'), true);
  assert.equal(migration.includes('ALTER COLUMN ends_at'), false);
  assert.equal(migration.includes('DROP COLUMN access_until'), false);
});

test('calendar-month duration preserves claim time and clamps month-end correctly', () => {
  assert.equal(addCalendarMonths('2026-09-10T18:30:45.000Z', 12), '2027-09-10T18:30:45.000Z');
  assert.equal(addCalendarMonths('2026-01-31T12:00:00.000Z', 1), '2026-02-28T12:00:00.000Z');
  assert.equal(addCalendarMonths('2028-01-31T12:00:00.000Z', 1), '2028-02-29T12:00:00.000Z');
});

test('100 percent coupon creation supports one mutually exclusive relative or fixed access policy', () => {
  assert.equal(createRoute.includes('accessDurationMonths?: unknown'), true);
  assert.equal(createRoute.includes("columns.has('access_duration_months')"), true);
  assert.equal(createRoute.includes('Choose either a duration from claim or a fixed Access until date, not both'), true);
  assert.equal(createRoute.includes('Coupon access-duration database migration is not applied'), true);
  assert.equal(createRoute.includes('access_duration_months'), true);
});

test('relative-duration editor is audited, migration-gated and restricted to 100 percent free access', () => {
  assert.equal(durationRoute.includes('requireSuperadmin'), true);
  assert.equal(durationRoute.includes('verifyCsrf'), true);
  assert.equal(durationRoute.includes('PRAGMA table_info(discount_coupons)'), true);
  assert.equal(durationRoute.includes("current.discount_type !== 'percent' || current.discount_value !== 100"), true);
  assert.equal(durationRoute.includes('UPDATE discount_coupons SET access_duration_months = ?, updated_at = ? WHERE id = ?'), true);
  assert.equal(durationRoute.includes("'billing_coupon.access_duration_updated'"), true);
  assert.equal(durationRoute.includes('max_redemptions'), false);
  assert.equal(durationRoute.includes('ends_at ='), false);
});

test('fixed and relative policies cannot be layered accidentally', () => {
  assert.equal(durationRoute.includes('current.access_until'), true);
  assert.equal(durationRoute.includes("'coupon_access_policy_conflict'"), true);
  assert.equal(fixedRoute.includes('current.access_duration_months'), true);
  assert.equal(fixedRoute.includes("'coupon_access_policy_conflict'"), true);
});

test('free redemption grants duration from the individual claim timestamp with legacy fallback preserved', () => {
  assert.equal(freeRoute.includes('access_duration_months?: number | null'), true);
  assert.equal(freeRoute.includes('addCalendarMonths(timestamp, accessDurationMonths)'), true);
  assert.equal(freeRoute.includes(': coupon.access_until || addOneMonth(timestamp)'), true);
  assert.equal(freeRoute.includes('Coupon access policy is ambiguous'), true);
  assert.equal(freeRoute.includes('INSERT INTO billing_entitlement_grants'), true);
  assert.equal(freeRoute.includes('billing_payments'), false);
  assert.equal(freeRoute.includes('billing_checkout_intents'), false);
});

test('long coupon entitlements refresh monthly usage credits idempotently after the initial grant', () => {
  assert.equal(credits.includes("beg.reason LIKE 'coupon_redemption:%'"), true);
  assert.equal(credits.includes('for (let index = 1;'), true);
  assert.equal(credits.includes('INSERT OR IGNORE INTO usage_credit_ledger'), true);
  assert.equal(credits.includes("'monthly_grant'"), true);
  assert.equal(credits.includes('coupon-grant:${grant.id}:month:${index}:credits'), true);
  assert.equal(credits.includes('Math.min(periodIndex, 60)'), true);
  assert.equal(billingCurrent.includes('ensureCouponEntitlementMonthlyCredits'), true);
  assert.equal(aiRuntime.includes('ensureCouponEntitlementMonthlyCredits'), true);
});

test('admin capability and UI expose duration from claim without removing fixed or legacy policies', () => {
  assert.equal(adminCoupons.includes('supportsAccessDuration'), true);
  assert.equal(adminCoupons.includes('accessDurationMonths:'), true);
  assert.equal(entry.includes('/access-duration$/'), true);
  assert.equal(entry.includes('updateAdminCouponAccessDuration'), true);
  assert.equal(ui.includes('Free access duration'), true);
  assert.equal(ui.includes("months from each user's claim time"), true);
  assert.equal(ui.includes('Set duration from claim'), true);
  assert.equal(ui.includes('Fixed Access until'), true);
  assert.equal(ui.includes('one billing period from redemption'), true);
  assert.equal(ui.includes('Plan usage credits refresh each entitlement month.'), true);
});

test('Superadmin can select or clear all eligible plans without hardcoding plan codes', () => {
  assert.equal(ui.includes('Select all plans'), true);
  assert.equal(ui.includes('Clear all'), true);
  assert.equal(ui.includes('aria-label="Eligible plan selection"'), true);
  assert.equal(ui.includes('eligiblePlanCodes: plans.map((plan) => plan.code)'), true);
  assert.equal(ui.includes('eligiblePlanCodes: []'), true);
});