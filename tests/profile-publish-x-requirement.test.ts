import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const connections = readFileSync(new URL('../frontend/src/ProfileSocialConnections.tsx', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');

test('social connections makes the X publishing gate explicit', () => {
  assert.match(connections, /X is required to publish/i);
  assert.match(connections, /Only a verified X identity can unlock public profile publishing/i);
  assert.match(connections, /Other social connections are optional/i);
  assert.match(connections, /do not unlock publishing/i);
});

test('backend enforces verified X before publishing', () => {
  assert.match(profiles, /profile\.verification_status !== 'verified_x'/);
  assert.match(profiles, /Verified X ownership is required before publishing/);
});
