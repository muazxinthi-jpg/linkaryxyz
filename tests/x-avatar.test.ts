import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizedXProfileImage } from '../src/auth/x';

test('normalizes verified X profile images to a larger display size', () => {
  assert.equal(
    normalizedXProfileImage('https://pbs.twimg.com/profile_images/123/avatar_normal.jpg'),
    'https://pbs.twimg.com/profile_images/123/avatar_400x400.jpg',
  );
  assert.equal(
    normalizedXProfileImage('https://pbs.twimg.com/profile_images/123/avatar_400x400.jpg'),
    'https://pbs.twimg.com/profile_images/123/avatar_400x400.jpg',
  );
});

test('rejects X page URLs and non-X image hosts as profile-image sources', () => {
  assert.equal(normalizedXProfileImage('https://x.com/example/photo'), null);
  assert.equal(normalizedXProfileImage('https://example.com/avatar.jpg'), null);
  assert.equal(normalizedXProfileImage('http://pbs.twimg.com/profile_images/123/avatar_normal.jpg'), null);
});

test('avatar migration backfills verified X images without overwriting custom images', () => {
  const migration = readFileSync(
    new URL('../migrations/0018_verified_x_profile_avatars.sql', import.meta.url),
    'utf8',
  );
  assert.equal(migration.includes("json_extract(pi.metadata_json, '$.profile_image_url')"), true);
  assert.equal(migration.includes("'_normal.'"), true);
  assert.equal(migration.includes("'_400x400.'"), true);
  assert.equal(migration.includes('trg_profiles_verified_x_avatar_after_insert'), true);
  assert.equal(migration.includes("lower(avatar_url) LIKE 'https://x.com/%'"), true);
});
