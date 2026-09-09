import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public profile HTML keeps Linkary favicon metadata for personal and project profiles', () => {
  const source = readFileSync(new URL('../src/routes/publicProfileIdentity.ts', import.meta.url), 'utf8');

  assert.equal(source.includes('rel="icon" type="image/png" href="/assets/brand/linkary-icon-black.png"'), true);
  assert.equal(source.includes('rel="apple-touch-icon" href="/assets/brand/linkary-icon-black.png"'), true);
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
