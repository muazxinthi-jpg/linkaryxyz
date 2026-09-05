import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../frontend/src/AppV2.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../frontend/src/styles.css', import.meta.url), 'utf8');

const onboarding = frontend.slice(frontend.indexOf('function OnboardingScreen'), frontend.indexOf('function Dashboard'));
const complete = backend.slice(backend.indexOf('export async function completeOnboarding'));

test('Creator onboarding requires a normal Linkary username instead of generating member identities', () => {
  assert.equal(complete.includes('member_${'), false);
  assert.equal(complete.includes('member_'), false);
  assert.match(complete, /const username = normalizeProfileUsername\(body\.username \|\| ''\);/);
  assert.match(backend, /\^\[a-z0-9_\]\{3,30\}\$/);
});

test('Email or Google Creators can choose a required public username without connecting X', () => {
  assert.match(onboarding, /readOnly=\{accountType === 'project'\}/);
  assert.match(onboarding, /placeholder="username" minLength=\{3\} maxLength=\{30\} required/);
  assert.equal(onboarding.includes('Connect X to claim a username'), false);
  assert.equal(onboarding.includes('Choose your Linkary public username. This does not connect or verify an X identity.'), true);
});

test('connected X may prefill a Creator username without locking or implying verification', () => {
  assert.equal(onboarding.includes("else if (accountType === 'creator') setUsername(status.suggestedUsername || '')"), true);
  assert.equal(onboarding.includes('Prefilled from your connected X identity. You can choose your Linkary public username.'), true);
  assert.equal(onboarding.includes("readOnly={accountType === 'project'}"), true);
});

test('Project onboarding remains locked to the verified official X handle', () => {
  assert.match(onboarding, /accountType === 'project'[\s\S]*status\.xIdentity\?\.current_handle[\s\S]*setUsername\(status\.xIdentity\.current_handle\.toLowerCase\(\)\)/);
  assert.equal(onboarding.includes('Locked to the verified Project X handle.'), true);
  assert.match(complete, /body\.accountType === 'project' && !identity/);
  assert.match(complete, /username !== verifiedHandle/);
});

test('existing Creator profiles are rejected rather than silently renamed', () => {
  assert.match(complete, /SELECT id FROM profiles WHERE owner_user_id = \? AND profile_type = 'creator'/);
  assert.equal(complete.includes("throw new HttpError(409, 'Creator profile already exists', 'creator_profile_exists')"), true);
  assert.equal(complete.includes('UPDATE profiles SET username'), false);
});

test('Creator username onboarding retains the narrow-phone acceptance baseline', () => {
  assert.equal(styles.includes('.username-field'), true);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(max-width: 380px\)/);
  assert.match(styles, /\.onboarding-card[\s\S]*width: min\(760px, 100%\)/);
});
