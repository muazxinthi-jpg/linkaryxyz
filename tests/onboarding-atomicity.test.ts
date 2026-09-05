import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const onboarding = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');
const complete = onboarding.slice(onboarding.indexOf('export async function completeOnboarding'));
const legacy = onboarding.slice(onboarding.indexOf('async function recoverLegacyProject'), onboarding.indexOf('export async function completeOnboarding'));

test('normal Creator and Project onboarding commits through one atomic D1 batch', () => {
  assert.equal(complete.includes('const writes: D1PreparedStatement[] = [];'), true);
  assert.equal((complete.match(/await db\.batch\(/g) || []).length, 1);
  assert.equal(complete.includes('await db.batch(writes);'), true);
  assert.equal(complete.includes('await db.run('), false);
});

test('all normal onboarding state is prepared before the single commit', () => {
  const commitIndex = complete.indexOf('await db.batch(writes);');
  assert.ok(commitIndex > 0);

  const requiredBeforeCommit = [
    "INSERT INTO profiles",
    "INSERT INTO organizations",
    "INSERT INTO organization_memberships",
    "INSERT INTO profile_username_history",
    "INSERT INTO invite_balances",
    "INSERT INTO invite_ledger",
    "platform_identity_links",
    "UPDATE access_post_submissions",
    "UPDATE invite_redemptions",
    "'onboarding.completed'",
  ];

  for (const marker of requiredBeforeCommit) {
    const markerIndex = complete.indexOf(marker);
    assert.ok(markerIndex >= 0, `missing onboarding write marker: ${marker}`);
    assert.ok(markerIndex < commitIndex, `onboarding write occurs after commit marker: ${marker}`);
  }
});

test('Creator identity reads happen before mutation so the write batch stays self-contained', () => {
  const ownerRead = complete.indexOf('creatorOwnerLink = await db.first');
  const writesStart = complete.indexOf('const writes: D1PreparedStatement[] = [];');
  const commitIndex = complete.indexOf('await db.batch(writes);');
  assert.ok(ownerRead > 0);
  assert.ok(ownerRead < writesStart);
  assert.ok(writesStart < commitIndex);
  assert.equal(complete.includes('if (creatorOwnerLink)'), true);
  assert.equal(complete.includes('UPDATE platform_identity_links SET profile_id = ? WHERE id = ?'), true);
});

test('atomic onboarding preserves locked Creator and Project account semantics', () => {
  assert.equal(complete.includes("const initialInviteCredits = body.accountType === 'creator' ? 10 : 50;"), true);
  assert.equal(complete.includes("body.accountType === 'project' && !identity"), true);
  assert.equal(complete.includes("username !== verifiedHandle"), true);
  assert.equal(complete.includes("Creator profile already exists"), true);
  assert.equal(complete.includes("verificationStatus = identity ? 'verified_x' : 'pending'"), true);
});

test('legacy Project recovery remains a separate already-batched recovery path', () => {
  assert.equal((legacy.match(/await db\.batch\(/g) || []).length, 1);
  assert.equal(legacy.includes("'project.legacy_recovered_by_verified_x'"), true);
  assert.equal(legacy.includes("link_type = 'represents'"), false);
  assert.equal(legacy.includes("'represents'"), true);
});
