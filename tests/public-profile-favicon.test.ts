import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public profile HTML keeps a cache-busted Linkary favicon for personal and project profiles', () => {
  const source = readFileSync(new URL('../src/routes/publicProfileIdentity.ts', import.meta.url), 'utf8');

  assert.equal(source.includes("PUBLIC_PROFILE_ICON_VERSION = '2026-09-09-v2'"), true);
  assert.equal(source.includes('rel="icon" type="image/png" href="${PUBLIC_PROFILE_ICON_HREF}"'), true);
  assert.equal(source.includes('rel="shortcut icon" type="image/png" href="${PUBLIC_PROFILE_ICON_HREF}"'), true);
  assert.equal(source.includes('rel="apple-touch-icon" href="${PUBLIC_PROFILE_ICON_HREF}"'), true);
  assert.equal(source.includes('linkary-icon-black.png?v=${PUBLIC_PROFILE_ICON_VERSION}'), true);
  assert.equal(source.includes('withoutLegacyIcons'), true, 'stale/broken icon declarations must be replaced rather than short-circuiting favicon repair');
  assert.equal(source.includes('ensurePublicProfileIcons(await base.text())'), true);
  assert.equal(source.includes("published.profile.profile_type === 'project'"), true);
  assert.equal(source.includes('return htmlResponse(base, source);'), true, 'project profile responses must keep injected favicon metadata');
});

test('recovery build still contains the accepted Personal Private Network views', () => {
  const invites = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');

  assert.equal(invites.includes('>Invitations</button>'), true);
  assert.equal(invites.includes('>My network</button>'), true);
  assert.equal(invites.includes('>Network map</button>'), true);
  assert.equal(invites.includes('<PersonalNetworkPanel profileId={networkProfileId} view="network" />'), true);
  assert.equal(invites.includes('<PrivateNetworkMapV2Panel profileId={networkProfileId} />'), true);
});
