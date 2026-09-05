import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const continuity = readFileSync(new URL('../frontend/src/AuthSessionContinuity.tsx', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/auth/session.ts', import.meta.url), 'utf8');
const cdp = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

function compact(value: string) {
  return value.replace(/\s+/g, ' ');
}

test('Beta sign-in providers stay limited to email, Google and X', () => {
  const text = compact(main);
  assert.match(text, /authMethods:\s*\['email', 'oauth:google', 'oauth:x'\]/);
  assert.equal(text.includes('oauth:telegram'), false);
});

test('invite and earned-access context survives OAuth redirects but expires locally after 24 hours', () => {
  assert.match(continuity, /const ACCESS_STORAGE = 'linkary\.access\.v1'/);
  assert.match(continuity, /const DURABLE_ACCESS_STORAGE = 'linkary\.pending-access\.v2'/);
  assert.match(continuity, /const ACCESS_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(continuity, /sessionStorage\.setItem\(ACCESS_STORAGE/);
  assert.match(continuity, /localStorage\.setItem\(DURABLE_ACCESS_STORAGE/);
  assert.match(continuity, /Date\.now\(\) - durable\.savedAt <= ACCESS_TTL_MS/);
  assert.match(continuity, /localStorage\.removeItem\(DURABLE_ACCESS_STORAGE\)/);
});

test('signed-in users recover the Linkary session before being routed into the product', () => {
  assert.match(continuity, /\/api\/auth\/me/);
  assert.match(continuity, /getAccessToken\(\)/);
  assert.match(continuity, /\/api\/auth\/cdp\/session/);
  assert.match(continuity, /inviteCode: context\.inviteCode/);
  assert.match(continuity, /earnedGrant: context\.earnedGrant/);
  assert.match(continuity, /window\.location\.replace\(status\.data\.profiles\?\.length \? '\/dashboard' : '\/onboarding'\)/);
});

test('Linkary session cookies are host-only, secure, CSRF protected and revocable', () => {
  assert.match(session, /export const SESSION_COOKIE = '__Host-linkary_session'/);
  assert.match(session, /export const CSRF_COOKIE = '__Host-linkary_csrf'/);
  assert.match(session, /const SESSION_TTL_SECONDS = 60 \* 60 \* 24 \* 30/);
  assert.match(session, /httpOnly: true, secure: true, sameSite: 'Lax'/);
  assert.match(session, /httpOnly: false, secure: true, sameSite: 'Lax'/);
  assert.match(session, /revoked_at IS NULL AND expires_at > \?/);
  assert.match(session, /UPDATE sessions SET revoked_at = \?/);
  assert.match(session, /maxAge: 0/);
});

test('logout is POST-only, authenticated, CSRF protected and clears the current server session', () => {
  const text = compact(index);
  assert.match(text, /path === '\/api\/auth\/logout'/);
  assert.match(text, /request\.method !== 'POST'/);
  assert.match(text, /const auth = await requireAuth\(request, env\)/);
  assert.match(text, /await verifyCsrf\(request, env, auth\)/);
  assert.match(text, /const cookies = await revokeCurrentSession\(request, env\)/);
});

test('expired, exhausted and revoked invitations fail closed during CDP session creation', () => {
  assert.match(cdp, /row\.status !== 'active'/);
  assert.match(cdp, /row\.uses >= row\.max_uses/);
  assert.match(cdp, /row\.expires_at && row\.expires_at <= now\(\)/);
  assert.match(cdp, /throw new HttpError\(403, 'This Linkary invitation is invalid or no longer available', 'invalid_invite'\)/);
});

test('failed access attachment cannot leave a partially created Linkary account behind', () => {
  assert.match(cdp, /if \(isNewUser\)/);
  assert.match(cdp, /DELETE FROM auth_identities WHERE user_id = \? AND provider = 'coinbase_cdp'/);
  assert.match(cdp, /DELETE FROM cdp_user_links WHERE id = \?/);
  assert.match(cdp, /DELETE FROM users WHERE id = \?/);
});
