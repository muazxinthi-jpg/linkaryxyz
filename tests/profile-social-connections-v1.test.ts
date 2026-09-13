import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const connections = readFileSync(new URL('../frontend/src/ProfileSocialConnections.tsx', import.meta.url), 'utf8');
const telegram = readFileSync(new URL('../frontend/src/PersonalTelegramConnection.tsx', import.meta.url), 'utf8');
const projectCopilot = readFileSync(new URL('../frontend/src/ProjectProfileCopilot.tsx', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');
const publicProfile = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');

const requiredPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'github', 'reddit', 'farcaster'];

test('Personal and editable Project profiles expose first-class social connection controls', () => {
  assert.match(telegram, /ProfileSocialConnections/);
  assert.match(telegram, /<ProfileSocialConnections profileId=\{profileId\}/);
  assert.match(projectCopilot, /ProfileSocialConnections/);
  assert.match(projectCopilot, /<ProfileSocialConnections profileId=\{profile\.id\}/);
  assert.match(connections, /Social connections/);
  assert.match(connections, /Connected profile/);
  assert.match(connections, /not provider verification/i);
  for (const platform of requiredPlatforms) {
    assert.match(connections, new RegExp(`key: '${platform}'`), `missing ${platform}`);
    assert.match(connections, new RegExp(`/assets/social/${platform}\\.svg`), `missing ${platform} brand icon`);
  }
});

test('social connection URLs are HTTPS and constrained to the selected provider domain', () => {
  assert.match(connections, /url\.protocol !== 'https:'/);
  assert.match(connections, /platform\.hosts\.some/);
  assert.match(connections, /Use an official \$\{platform\.label\} profile URL/);
  assert.match(connections, /instagram\.com/);
  assert.match(connections, /tiktok\.com/);
  assert.match(connections, /youtube\.com/);
  assert.match(connections, /facebook\.com/);
});

test('connections reuse profile blocks and preserve click history on disconnect', () => {
  assert.match(connections, /type: 'social_link'/);
  assert.match(connections, /socialPlatform: platform\.key/);
  assert.match(connections, /method: existing \? 'PATCH' : 'POST'/);
  assert.match(connections, /method: 'DELETE'/);
  assert.match(profiles, /Archive instead of hard deleting/);
  assert.match(profiles, /archivedAt: timestamp/);
});

test('public profile continues to render social blocks through measured Linkary redirects', () => {
  assert.match(publicProfile, /Social links/);
  assert.match(publicProfile, /socialPlatform/);
  assert.match(profiles, /profile_engagement_events/);
  assert.match(profiles, /event_type = 'link_click'/);
  assert.match(profiles, /Response\.redirect\(block\.url, 302\)/);
});

test('external connected-profile links opened inside the editor are isolated from the app window', () => {
  assert.match(connections, /target="_blank" rel="noopener noreferrer"/);
});
