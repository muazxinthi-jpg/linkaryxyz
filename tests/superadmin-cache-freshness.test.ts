import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
const coupons = readFileSync(new URL('../frontend/src/AdminCouponsExperience.tsx', import.meta.url), 'utf8');

test('Superadmin HTML shell is non-cacheable so old admin bundles cannot stay pinned', () => {
  assert.match(entry, /cache-control', 'no-store, no-cache, must-revalidate, max-age=0'/);
  assert.match(entry, /headers\.set\('pragma', 'no-cache'\)/);
  assert.match(entry, /headers\.set\('expires', '0'\)/);
  assert.match(entry, /headers\.set\('vary', 'Cookie'\)/);
});

test('production deployment proves the live Superadmin JS contains the 100 percent coupon UI', () => {
  assert.match(workflow, /100% coupon created\./);
  assert.match(workflow, /A 100% percent-off coupon grants one paid monthly period/);
  assert.match(workflow, /Coupons cannot reduce a paid checkout to \$0/);
  assert.equal(workflow.includes('cache-control: .*no-store'), true);
});

test('current coupon form itself permits exactly 100 percent', () => {
  assert.match(coupons, /raw > 100/);
  assert.match(coupons, /max=\{draft\.discountType === 'percent' \? '100' : undefined\}/);
  assert.match(coupons, /step=\{draft\.discountType === 'percent' \? '1' : '0\.01'\}/);
  assert.match(coupons, /100% coupon created\./);
});
