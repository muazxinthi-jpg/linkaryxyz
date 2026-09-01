import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hmacSha256 } from '../src/security/crypto';
import { isValidXPostUrl } from '../src/routes/access';

test('creator claim tokens can be re-derived deterministically without storing plaintext secrets', async () => {
  const first = await hmacSha256('test-secret', 'creator-access:cac_123');
  const second = await hmacSha256('test-secret', 'creator-access:cac_123');
  const other = await hmacSha256('test-secret', 'creator-access:cac_456');
  assert.equal(first, second);
  assert.notEqual(first, other);
});

test('creator evidence accepts only X status URLs', () => {
  assert.equal(isValidXPostUrl('https://x.com/muazxinthi/status/123456789'), true);
  assert.equal(isValidXPostUrl('https://twitter.com/user/status/987654321?s=20'), true);
  assert.equal(isValidXPostUrl('https://x.com/muazxinthi'), false);
  assert.equal(isValidXPostUrl('https://example.com/user/status/123'), false);
});

test('creator access migration is approval-gated and manual by default', () => {
  const migration = readFileSync('migrations/0003_creator_access_review.sql', 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS creator_access_claims/);
  assert.match(migration, /'submitted'/);
  assert.match(migration, /'approved'/);
  assert.match(migration, /'rejected'/);
  assert.match(migration, /"mode":"manual"/);
  assert.match(migration, /approved_invite_id/);
});

test('authenticated app public copy does not expose internal provider terminology', () => {
  const app = readFileSync('frontend/src/AppV2.tsx', 'utf8');
  for (const phrase of ['Coinbase CDP', 'TwitterAPI.io', 'CDP access token', 'server API key']) {
    assert.equal(app.includes(phrase), false, `public app copy contains forbidden phrase: ${phrase}`);
  }
  assert.match(app, /Post on X ↗/);
  assert.match(app, /Creator Earn Access/);
});
