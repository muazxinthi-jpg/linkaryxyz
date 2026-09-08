import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inviteView = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');
const tabsCss = readFileSync(new URL('../frontend/src/private-network-tabs.css', import.meta.url), 'utf8');
const mapPanel = readFileSync(new URL('../frontend/src/PrivateNetworkMapV2Panel.tsx', import.meta.url), 'utf8');

test('Private Network keeps all three accepted Invite views', () => {
  assert.match(inviteView, /type PrivateNetworkView = 'invites' \| 'network' \| 'map'/);
  assert.match(inviteView, />Invitations<\/button>/);
  assert.match(inviteView, />My network<\/button>/);
  assert.match(inviteView, />Network map<\/button>/);
  assert.match(inviteView, /aria-label="Private Network views"/);
});

test('Private Network keeps the approved seven-generation panels wired to the Personal profile', () => {
  assert.match(inviteView, /const networkProfileId = personalProfile\?\.id \|\| ''/);
  assert.match(inviteView, /<PersonalNetworkPanel profileId=\{networkProfileId\} view="network" \/>/);
  assert.match(inviteView, /<PrivateNetworkMapV2Panel profileId=\{networkProfileId\} \/>/);
  assert.match(mapPanel, /InteractiveNetworkMapV2/);
  assert.match(mapPanel, /networkGraphLimit=160/);
});

test('Private Network tabs cannot collapse accepted views out of the visible control strip', () => {
  const css = tabsCss.replace(/\s+/g, '');
  assert.equal(css.includes('.private-network-tabs{display:flex;'), true);
  assert.equal(css.includes('max-width:100%'), true);
  assert.equal(css.includes('.private-network-tabsbutton{flex:00auto;'), true);
  assert.equal(css.includes('overflow-x:auto'), true);
  assert.equal(css.includes('white-space:nowrap'), true);
});
