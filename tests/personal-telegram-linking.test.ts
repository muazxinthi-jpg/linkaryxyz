import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');
const telegram = readFileSync(new URL('../frontend/src/PersonalTelegramConnection.tsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../src/auth/cdpCurrentLink.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const community = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../src/routes/communityVerification.ts', import.meta.url), 'utf8');

function compact(value: string) { return value.replace(/\s+/g, ' '); }

test('every Personal Profile can connect Telegram without creating a Community Manager portfolio', () => {
  assert.match(profile, /PersonalTelegramConnection/);
  assert.match(profile, /defaultEmail=\{status\.user\.email \|\| ''\}/);
  assert.match(telegram, /You can do this even if you do not manage any Telegram communities/);
  assert.match(telegram, /data-personal-telegram-connection/);
  assert.equal(telegram.includes('/api/partner-managers'), false);
  assert.equal(telegram.includes("managerType: 'community_manager'"), false);
});

test('personal Telegram linking uses provider linking and the safe current-account sync', () => {
  assert.match(telegram, /useLinkOAuth/);
  assert.match(telegram, /linkOAuth\('telegram'\)/);
  assert.match(telegram, /\/api\/auth\/cdp\/current-link/);
  assert.match(telegram, /x-csrf-token/);
  assert.equal(telegram.includes('/api/auth/cdp/session'), false);
});

test('users can restore their existing secure sign-in before adding Telegram', () => {
  assert.match(telegram, /signInWithEmail/);
  assert.match(telegram, /verifyEmailOTP/);
  assert.match(telegram, /signInWithOAuth\(provider\)/);
  assert.match(telegram, /cdp_account_mismatch/);
  assert.match(telegram, /same email, Google account, or X account you originally used/);
});

test('personal Telegram status is private, exact-user scoped and does not require manager discovery', () => {
  assert.match(backend, /currentPersonalTelegramIdentity/);
  assert.match(backend, /pi\.platform = 'telegram'/);
  assert.match(backend, /pil\.user_id = \?/);
  assert.match(backend, /pil\.link_type = 'owns'/);
  const text = compact(worker);
  assert.equal(text.includes("url.pathname === '/api/auth/telegram-identity'"), true);
  assert.equal(text.indexOf("url.pathname === '/api/auth/telegram-identity'") < text.indexOf('return baseWorker.fetch'), true);
});

test('connecting personal Telegram never upgrades exact Community ownership or campaign proof', () => {
  assert.match(telegram, /Personal Telegram identity is separate from Community ownership verification/);
  assert.match(telegram, /never verifies a Community or creates campaign performance proof/);
  assert.match(community, /Personal Telegram verification and exact Community verification are independent/);
  assert.match(verification, /verification_status = 'submitted'/);
  assert.match(verification, /'approved' : 'rejected'/);
});
