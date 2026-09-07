import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { superadminPlatformPlan } from '../src/superadminPlatformAccess';

const policy = readFileSync(new URL('../src/superadminPlatformAccess.ts', import.meta.url), 'utf8');
const billing = readFileSync(new URL('../src/routes/billingCurrent.ts', import.meta.url), 'utf8');
const nft = readFileSync(new URL('../src/nftProfileEntitlement.ts', import.meta.url), 'utf8');
const contacts = readFileSync(new URL('../src/routes/contactReveals.ts', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/ai/runtime.ts', import.meta.url), 'utf8');
const billingUi = readFileSync(new URL('../frontend/src/BillingExperience.tsx', import.meta.url), 'utf8');

test('Superadmin platform policy maps to the highest relevant public feature set', () => {
  assert.equal(superadminPlatformPlan(true, 'creator'), 'personal_pro');
  assert.equal(superadminPlatformPlan(true, 'project'), 'project_growth');
  assert.equal(superadminPlatformPlan(false, 'creator'), null);
  assert.equal(superadminPlatformPlan(false, 'project'), null);
});

test('canonical Superadmin detection fails closed and requires active user, configured email and grant', () => {
  assert.match(policy, /if \(!configuredEmail\) return false/);
  assert.match(policy, /u\.status = 'active'/);
  assert.match(policy, /ag\.role = 'superadmin'/);
  assert.match(policy, /ag\.status = 'active'/);
  assert.match(policy, /row\.email\?\.trim\(\)\.toLowerCase\(\) === configuredEmail/);
});

test('full feature access does not bypass Personal ownership or Project membership', () => {
  const creatorGuard = billing.indexOf('profile.owner_user_id !== auth.user.id');
  const projectGuard = billing.indexOf('organization_memberships');
  const platformPlan = billing.indexOf('superadminPlatformPlan(auth.isSuperadmin, profile.profile_type)');
  assert.equal(creatorGuard >= 0 && projectGuard >= 0 && platformPlan > creatorGuard && platformPlan > projectGuard, true);
  assert.match(contacts, /organization_memberships/);
  assert.match(contacts, /if \(!membership\) throw new HttpError\(403, 'Project access unavailable'/);
  assert.match(contacts, /superadminPlatformPlan\(owner\.isSuperadmin, owner\.profileType\)/);
});

test('Superadmin Personal NFT access bypasses only the plan gate after ownership is confirmed', () => {
  const ownership = nft.indexOf('profile.owner_user_id !== auth.user.id');
  const platformAccess = nft.indexOf('if (auth.isSuperadmin) return;');
  const paidPlanLookup = nft.indexOf('const planCode = await activePersonalPlanCode');
  assert.equal(ownership >= 0 && platformAccess > ownership && paidPlanLookup > platformAccess, true);
});

test('Superadmin AI bypasses workspace credit balance but not AI budgets, providers or telemetry', () => {
  assert.match(ai, /isCanonicalSuperadminUser\(db, env, input\.actorUserId\)/);
  assert.match(ai, /const budget = await activeBudget/);
  assert.match(ai, /budget\.max_calls/);
  assert.match(ai, /budget\.max_usage_credits/);
  assert.match(ai, /usageCreditBalanceExempt \? 1 : 0/);
  assert.match(ai, /if \(!usageCreditBalanceExempt\)/);
  assert.match(ai, /ai_usage_events/);
  assert.match(ai, /ai\.invoked/);
  assert.match(ai, /usageCreditBalanceExempt,/);
  assert.doesNotMatch(ai, /if \(usageCreditBalanceExempt\) return await ai\.generate/);
});

test('normal app communicates Superadmin access and suppresses checkout', () => {
  assert.match(billingUi, /Superadmin platform access is active/);
  assert.match(billingUi, /No subscription is required for the canonical Superadmin/);
  assert.match(billingUi, /selectedPlan && !isSuperadminAccess/);
  assert.match(billingUi, /Available with Superadmin/);
  assert.match(billingUi, /Project membership boundaries still apply/);
});
