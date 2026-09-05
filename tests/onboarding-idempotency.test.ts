import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const onboarding = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');
const complete = onboarding.slice(onboarding.indexOf('export async function completeOnboarding'));
const retryHelper = onboarding.slice(onboarding.indexOf('async function completedOnboardingRetry'), onboarding.indexOf('export async function completeOnboarding'));

test('exact same completed Creator onboarding can return idempotent success only to its owner', () => {
  assert.equal(retryHelper.includes("if (profile.owner_user_id !== auth.user.id) return null;"), true);
  assert.equal(retryHelper.includes("ownerType = 'profile';"), true);
  assert.equal(retryHelper.includes('ownerId = profile.id;'), true);
  assert.equal(retryHelper.includes('idempotent: true'), true);
});

test('verified Project retry requires the same Owner and exact Project X identity', () => {
  assert.equal(retryHelper.includes("profile.verification_status !== 'verified_x'"), true);
  assert.equal(retryHelper.includes('profile.primary_platform_identity_id !== identity.id'), true);
  assert.equal(retryHelper.includes("role = 'owner' AND status = 'active'"), true);
  assert.equal(retryHelper.includes("link_type = 'represents' AND ended_at IS NULL"), true);
});

test('idempotent completion requires evidence that normal onboarding fully committed', () => {
  assert.equal(retryHelper.includes('FROM profile_username_history'), true);
  assert.equal(retryHelper.includes('FROM invite_balances'), true);
  assert.equal(retryHelper.includes("action = 'onboarding.completed'"), true);
  assert.equal(retryHelper.includes('INSERT INTO invite_ledger'), false);
  assert.equal(retryHelper.includes('INSERT INTO invite_balances'), false);
  assert.equal(retryHelper.includes('db.batch('), false);
  assert.equal(retryHelper.includes('db.run('), false);
});

test('retry check happens before legacy recovery and before the normal atomic write-set', () => {
  const retryCall = complete.indexOf('completedOnboardingRetry');
  const legacyRecovery = complete.indexOf('recoverLegacyProject');
  const writesStart = complete.indexOf('const writes: D1PreparedStatement[] = [];');
  assert.ok(retryCall > 0);
  assert.ok(legacyRecovery > retryCall);
  assert.ok(writesStart > legacyRecovery);
});

test('different username for an existing Creator still fails instead of silently reusing it', () => {
  const claimedLookup = complete.indexOf('FROM profiles WHERE username = ?');
  const existingCreatorGuard = complete.indexOf("SELECT id FROM profiles WHERE owner_user_id = ? AND profile_type = 'creator'");
  assert.ok(claimedLookup > 0);
  assert.ok(existingCreatorGuard > claimedLookup);
  assert.equal(complete.includes("throw new HttpError(409, 'Creator profile already exists', 'creator_profile_exists')"), true);
});

test('normal onboarding remains atomic and initial allocations stay single-grant values', () => {
  assert.equal((complete.match(/await db\.batch\(/g) || []).length, 1);
  assert.equal(complete.includes('await db.batch(writes);'), true);
  assert.equal(complete.includes("const initialInviteCredits = body.accountType === 'creator' ? 10 : 50;"), true);
  assert.equal(complete.includes("'initial_onboarding_allocation'"), true);
});
