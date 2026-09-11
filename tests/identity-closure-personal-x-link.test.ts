import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const currentLink = readFileSync(new URL('../src/auth/cdpCurrentLink.ts', import.meta.url), 'utf8');
const cdp = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../src/db/identity.ts', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');

function compact(value: string) {
  return value.replace(/\s+/g, ' ');
}

test('users.id remains canonical while X recovery uses stable provider uid rather than X email', () => {
  const auth = compact(cdp);
  assert.match(auth, /pi\.platform = 'x'/);
  assert.match(auth, /pi\.provider_uid = \?/);
  assert.match(auth, /if \(!candidateUserId && verifiedEmail && canUseEmailForAccountIdentity\(lastAuthMethod\)\)/);
  assert.match(auth, /lastAuthMethod === 'email' \|\| lastAuthMethod === 'google'/);
  assert.match(identity, /Stable \$\{input\.platform\} identity is already linked to another Linkary user/);
});

test('safe current-account refresh promotes an existing pending Personal Profile after verified X is connected', () => {
  const text = compact(currentLink);
  assert.match(text, /WHERE owner_user_id = \? AND profile_type = 'creator'/);
  assert.match(text, /SET primary_platform_identity_id = \?, verification_status = 'verified_x', updated_at = \?/);
  assert.match(text, /SET profile_id = \? WHERE platform_identity_id = \? AND user_id = \? AND link_type = 'owns' AND ended_at IS NULL/);
  assert.match(text, /personalProfilePromoted: personalProfile\.promoted/);
  assert.match(text, /personalProfileVerified: personalProfile\.verified/);
});

test('Identity Closure refuses silent X reassignment and directs provider conflicts to recovery', () => {
  const text = compact(currentLink);
  assert.match(text, /profile\.primary_platform_identity_id && profile\.primary_platform_identity_id !== xIdentity\.id/);
  assert.match(text, /personal_x_identity_mismatch/);
  assert.match(text, /Stable x identity is already linked to another Linkary user/);
  assert.match(text, /x_identity_conflict/);
  assert.match(text, /Use account recovery to resolve the identity before trying again/);
});

test('Personal Public Profile publication remains gated behind verified X ownership', () => {
  assert.match(profiles, /verificationStatus !== 'verified_x'/);
  assert.match(profiles, /verification_required/);
});

test('current-account identity refresh remains session scoped and cannot create or switch users', () => {
  assert.match(currentLink, /requireAuth\(request, env\)/);
  assert.match(currentLink, /verifyCsrf\(request, env, auth\)/);
  assert.match(currentLink, /link\.user_id !== auth\.user\.id/);
  assert.match(currentLink, /cdp_account_mismatch/);
  assert.equal(currentLink.includes('INSERT INTO users'), false);
  assert.equal(currentLink.includes('INSERT INTO cdp_user_links'), false);
  assert.equal(currentLink.includes('createSession('), false);
});

test('worker keeps the protected current-account identity endpoint live', () => {
  const text = compact(worker);
  assert.match(text, /url\.pathname === '\/api\/auth\/cdp\/current-link'/);
  assert.equal(text.indexOf("url.pathname === '/api/auth/cdp/current-link'") < text.indexOf('return baseWorker.fetch'), true);
});