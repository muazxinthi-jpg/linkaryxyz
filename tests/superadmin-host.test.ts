import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../frontend/src/SuperadminHostGate.tsx', import.meta.url), 'utf8');
const superadminApp = readFileSync(new URL('../frontend/src/SuperadminApp.tsx', import.meta.url), 'utf8');
const superadminWorkspace = readFileSync(new URL('../frontend/src/SuperadminWorkspace.tsx', import.meta.url), 'utf8');
const creatorReview = readFileSync(new URL('../frontend/src/AdminCreatorAccessExperience.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/auth/session.ts', import.meta.url), 'utf8');
const cdp = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const ownerMigration = readFileSync(new URL('../migrations/0035_canonical_superadmin_owner.sql', import.meta.url), 'utf8');

function compact(value: string) {
  return value.replace(/\s+/g, ' ');
}

test('Superadmin host gate is mounted only on sadmin.linkary.xyz', () => {
  assert.match(main, /SuperadminHostGate/);
  assert.match(main, /window\.location\.hostname\.toLowerCase\(\) === 'sadmin\.linkary\.xyz'/);
});

test('Superadmin host bypasses normal invite recovery and onboarding wrappers', () => {
  const text = compact(main);
  const superadminBranch = text.slice(text.indexOf('if (isSuperadminHost)'), text.indexOf('return ( <AuthSessionContinuity>'));
  assert.match(superadminBranch, /SuperadminHostGate/);
  assert.match(superadminBranch, /SuperadminApp/);
  assert.doesNotMatch(superadminBranch, /AuthSessionContinuity/);
  assert.doesNotMatch(superadminBranch, /OnboardingCompletionBoundary/);
  assert.match(text, /return \( <AuthSessionContinuity>.*<OnboardingCompletionBoundary \/>.*<App \/>.*<\/AuthSessionContinuity> \);/);
});

test('Superadmin routes cannot fall through to normal onboarding', () => {
  assert.doesNotMatch(superadminApp, /AppV2/);
  assert.doesNotMatch(superadminApp, /\/api\/onboarding\/status/);
  assert.match(superadminApp, /<Navigate to="\/admin\/readiness" replace \/>/);
  assert.match(superadminApp, /\/admin\/creator-access/);
  assert.match(superadminApp, /\/admin\/community-verifications/);
  assert.match(superadminApp, /\/admin\/commercial/);
  assert.match(superadminApp, /\/admin\/coupons/);
  assert.match(superadminApp, /\/admin\/readiness/);
});

test('Superadmin verification does not depend on onboarding status or an existing database profile', () => {
  assert.doesNotMatch(gate, /\/api\/onboarding\/status/);
  assert.doesNotMatch(gate, /ProductStatus/);
  assert.doesNotMatch(gate, /profiles\?\.length/);
  assert.match(gate, /current\.data\.user\?\.superadmin/);
  assert.match(gate, /setState\('ready'\)/);
});

test('Superadmin verification exposes only non-sensitive diagnostic references', () => {
  assert.match(gate, /Reference: \{failureCode\}/);
  assert.match(gate, /session-bridge-\$\{bridge\.status\}/);
  assert.doesNotMatch(gate, /bridge\.data\.message/);
});

test('Superadmin navigation exposes access, readiness and commercial controls', () => {
  for (const label of ['Creator access', 'Community reviews', 'Beta readiness', 'Commercial accounts', 'Coupons']) {
    assert.equal(superadminWorkspace.includes(label), true, `missing ${label}`);
  }
  assert.match(creatorReview, /\/api\/admin\/creator-access\?status=submitted/);
  assert.match(creatorReview, /decision: 'approve' \| 'reject'/);
  assert.match(creatorReview, /decide\(claim, 'approve'\)/);
  assert.match(creatorReview, /decide\(claim, 'reject'\)/);
});

test('normal app admin URLs still redirect away from the normal product host', () => {
  assert.match(app, /location\.pathname\.startsWith\('\/admin'\) && !isSuperadminHost/);
  assert.match(app, /<Navigate to="\/dashboard" replace \/>/);
});

test('Superadmin host is no-indexed and reuses host-only session cookies', () => {
  assert.match(entry, /x-robots-tag/);
  assert.match(entry, /SUPERADMIN_BASE_URL/);
  assert.match(entry, /__Host cookies/);
});

test('canonical Superadmin email is xinthi@gmail.com', () => {
  assert.match(wrangler, /SUPERADMIN_EMAIL.*xinthi@gmail\.com/);
  assert.match(gate, /xinthi@gmail\.com/);
  assert.doesNotMatch(wrangler, /SUPERADMIN_EMAIL.*mmxinthi@gmail\.com/);
});

test('canonical Superadmin has a normal Linkary user id and active grant', () => {
  assert.match(ownerMigration, /INSERT INTO users/);
  assert.match(ownerMigration, /'usr_' \|\| lower\(hex\(randomblob\(16\)\)\)/);
  assert.match(ownerMigration, /xinthi@gmail\.com/);
  assert.match(ownerMigration, /INSERT INTO admin_grants/);
  assert.match(ownerMigration, /'superadmin'/);
  assert.match(ownerMigration, /UPDATE admin_grants[\s\S]*status = 'revoked'/);
  assert.match(ownerMigration, /superadmin\.owner\.canonicalized/);
});

test('Superadmin access is restricted to the configured owner email server-side', () => {
  assert.match(session, /configuredSuperadminEmail/);
  assert.match(session, /emailMatchesSuperadmin/);
  assert.match(session, /Boolean\(grant\) && emailMatchesSuperadmin/);
});

test('Superadmin CDP bootstrap is host, verified-email and active-grant restricted', () => {
  assert.match(cdp, /function isSuperadminHostRequest/);
  assert.match(cdp, /env\.SUPERADMIN_BASE_URL/);
  assert.match(cdp, /env\.SUPERADMIN_EMAIL/);
  assert.match(cdp, /verifiedEmail\.trim\(\)\.toLowerCase\(\) !== configuredEmail/);
  assert.match(cdp, /JOIN admin_grants g ON g\.user_id = u\.id/);
  assert.match(cdp, /g\.role = 'superadmin'/);
  assert.match(cdp, /g\.status = 'active'/);
  assert.match(cdp, /u\.status = 'active'/);
});

test('Superadmin bootstrap binds the existing canonical owner without creating or consuming an invite', () => {
  const text = compact(cdp);
  const bootstrapStart = text.indexOf('if (superadminBootstrapUser)');
  const normalUserStart = text.indexOf('} else { accessContext = await resolveAccessContext', bootstrapStart);
  const bootstrapBlock = text.slice(bootstrapStart, normalUserStart);
  assert.match(bootstrapBlock, /INSERT INTO cdp_user_links/);
  assert.match(bootstrapBlock, /superadminBootstrapUser\.id/);
  assert.doesNotMatch(bootstrapBlock, /INSERT INTO users/);
  assert.doesNotMatch(bootstrapBlock, /invite_redemptions/);
  assert.doesNotMatch(bootstrapBlock, /resolveAccessContext/);
  assert.match(cdp, /if \(!superadminBootstrapUser && !\(await hasLinkaryAccess\(db, link\.user_id\)\)\)/);
});

test('Superadmin bootstrap refuses conflicting CDP identities', () => {
  assert.match(cdp, /link && superadminBootstrapUser && link\.user_id !== superadminBootstrapUser\.id/);
  assert.match(cdp, /superadmin_identity_conflict/);
  assert.match(cdp, /SELECT id FROM cdp_user_links WHERE user_id = \? AND cdp_project_id = \? LIMIT 1/);
  assert.match(cdp, /existingAuthIdentity && existingAuthIdentity\.user_id !== superadminBootstrapUser\.id/);
});

test('normal users still require invite or earned access during CDP session creation', () => {
  assert.match(cdp, /accessContext = await resolveAccessContext\(db, body\.inviteCode, body\.earnedGrant, email\)/);
  assert.match(cdp, /A valid Linkary invitation or approved access path is required/);
  assert.match(cdp, /access_required/);
});

test('sadmin is configured as a custom domain, not a duplicate Worker route', () => {
  assert.match(wrangler, /SUPERADMIN_BASE_URL/);
  assert.doesNotMatch(wrangler, /sadmin\.linkary\.xyz\/\*/);
});
