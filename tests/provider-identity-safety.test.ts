import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cdp = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../src/db/identity.ts', import.meta.url), 'utf8');

function compact(value: string) {
  return value.replace(/\s+/g, ' ');
}

test('CDP provider types normalize Google and X OAuth identities before account recovery', () => {
  assert.match(cdp, /raw === 'oauth:google' \|\| raw === 'google'/);
  assert.match(cdp, /raw === 'oauth:x' \|\| raw === 'x' \|\| raw === 'twitter'/);
  assert.match(cdp, /normalizeAuthMethodType\(first\.type\)/);
});

test('only email and Google sign-ins may use provider email as Linkary account identity', () => {
  assert.match(cdp, /function canUseEmailForAccountIdentity\(lastAuthMethod: string \| null\): boolean/);
  assert.match(cdp, /lastAuthMethod === 'email' \|\| lastAuthMethod === 'google'/);
  assert.match(cdp, /const accountEmail = canUseEmailForAccountIdentity\(lastAuthMethod\) \? providerEmail : null/);
});

test('trusted email extraction ignores X, Telegram and future social-provider email metadata', () => {
  const text = compact(cdp);
  assert.match(text, /function extractVerifiedEmail\(methods: UnknownRecord\[\]\): string \| null/);
  assert.match(text, /const type = normalizeAuthMethodType\(method\.type\)/);
  assert.match(text, /if \(type !== 'email' && type !== 'google'\) continue/);
  assert.match(text, /const email = stringValue\(method\.email\)/);
});

test('returning X users recover by stable X provider id, never by an incidental X email', () => {
  const text = compact(cdp);
  assert.match(text, /normalizeAuthMethodType\(method\.type\) !== 'x'/);
  assert.match(text, /pi\.platform = 'x'/);
  assert.match(text, /pi\.provider_uid = \?/);
  assert.match(text, /source = 'x_identity'/);
  assert.match(text, /if \(!candidateUserId && verifiedEmail && canUseEmailForAccountIdentity\(lastAuthMethod\)\)/);
});

test('new X-only accounts do not promote the X-associated email into users.email', () => {
  assert.match(cdp, /const storedEmail = existingEmail \? null : accountEmail/);
  assert.match(cdp, /const displayName = accountEmail \? accountEmail\.split\('@'\)\[0\] : extractProviderDisplayName\(methods\) \|\| 'Linkary user'/);
});

test('email-bound team invites use the trusted account email rather than arbitrary provider metadata', () => {
  assert.match(cdp, /resolveTeamInviteForExistingAccess\(db, body\.inviteCode\.trim\(\), accountEmail\)/);
  assert.match(cdp, /resolveAccessContext\(db, body\.inviteCode, body\.earnedGrant, accountEmail\)/);
});

test('platform identity storage is ready for future verified social providers and keeps one-owner conflict protection', () => {
  for (const platform of ['x', 'telegram', 'youtube', 'tiktok', 'instagram', 'linkedin', 'facebook', 'reddit', 'discord', 'github', 'farcaster', 'whatsapp']) {
    assert.equal(identity.includes(`| '${platform}'`) || identity.includes(`  | '${platform}'`), true, `missing ${platform}`);
  }
  assert.match(identity, /Stable \$\{input\.platform\} identity is already linked to another Linkary user/);
  assert.match(identity, /link_type = 'owns'/);
});
