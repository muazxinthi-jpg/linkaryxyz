import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync(new URL('../src/auth/cdpCurrentLink.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../frontend/src/CommunityManagerSessionGate.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const community = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');

function compact(value: string) { return value.replace(/\s+/g, ' '); }

test('current CDP reconnect is authenticated, CSRF protected and exact-user scoped', () => {
  assert.match(backend, /requireAuth\(request, env\)/);
  assert.match(backend, /verifyCsrf\(request, env, auth\)/);
  assert.match(backend, /SELECT id, user_id FROM cdp_user_links/);
  assert.match(backend, /link\.user_id !== auth\.user\.id/);
  assert.match(backend, /cdp_account_mismatch/);
});

test('current CDP reconnect cannot create or switch a Linkary user session', () => {
  assert.equal(backend.includes('INSERT INTO users'), false);
  assert.equal(backend.includes('INSERT INTO cdp_user_links'), false);
  assert.equal(backend.includes('createSession('), false);
  assert.match(backend, /currentLinkaryUserId: auth\.user\.id/);
});

test('worker exposes the safe current-account reconnect endpoint before the base app router', () => {
  const text = compact(worker);
  assert.equal(text.includes("url.pathname === '/api/auth/cdp/current-link'"), true);
  assert.equal(text.indexOf("url.pathname === '/api/auth/cdp/current-link'") < text.indexOf('return baseWorker.fetch'), true);
});

test('Communities restores the existing secure session without asking the user to log out or sign in with Telegram', () => {
  assert.match(app, /CommunityManagerSessionGate/);
  assert.match(gate, /You do not need to log out or create another Linkary profile/);
  assert.match(gate, /signInWithOAuth\(provider\)/);
  assert.equal(gate.includes("social('telegram')"), false);
  assert.equal(gate.includes("signInWithOAuth('telegram')"), false);
  assert.match(gate, /same email, Google account, or X account you originally used for Linkary/);
});

test('Communities routes Telegram linking to the Personal Profile', () => {
  assert.match(community, /window\.location\.assign\('\/profile'\)/);
  assert.equal(community.includes('linkOAuth'), false);
  assert.match(gate, /if \(gateState === 'ready'\) return <CommunityManagerExperience/);
});
