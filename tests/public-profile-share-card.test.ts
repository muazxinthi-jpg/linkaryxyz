import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');
const urls = readFileSync(new URL('../src/urls.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');

test('public profile sharing uses individualized metadata and a first-party card URL', () => {
  assert.match(profiles, /publicProfileShareCopy/);
  assert.match(profiles, /replace\(\/\[—–\]\/g, ','\)/);
  assert.match(profiles, /og:image:type.*image\/svg\+xml/);
  assert.match(profiles, /publicProfileCardUrl\(request, env, profile\.username\)/);
  assert.match(urls, /\/_social\/profile\/\$\{encodeURIComponent\(username\)\}\.svg/);
  assert.match(worker, /renderPublicProfileCard/);
});

