import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const networkRoute = readFileSync(new URL('../src/routes/network.ts', import.meta.url), 'utf8');
const shortlistRoute = readFileSync(new URL('../src/routes/shortlists.ts', import.meta.url), 'utf8');
const appGate = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const discoveryUi = readFileSync(new URL('../frontend/src/PartnerDiscoveryExperience.tsx', import.meta.url), 'utf8');

test('Partner Discovery is project-scoped and uses real published Linkary identities', () => {
  assert.equal(networkRoute.includes("organizationMembership(db, auth.user.id, organizationId)"), true);
  assert.equal(networkRoute.includes("url.searchParams.get('discovery') === '1'"), true);
  assert.equal(networkRoute.includes("p.profile_type = 'creator'"), true);
  assert.equal(networkRoute.includes("p.visibility = 'published'"), true);
  assert.equal(networkRoute.includes("m.manager_type = 'community_manager'"), true);
  assert.equal(networkRoute.includes("m.visibility = 'public'"), true);
  assert.equal(networkRoute.includes("tpi.platform = 'telegram'"), true);
  assert.equal(networkRoute.includes("va.verification_status = 'verified'"), true);
  assert.equal(networkRoute.includes('publicProfileUrl(request, env, row.username)'), true);
});

test('Partner Discovery exposes Creator and Community Manager filters without reviving KOL Manager discovery', () => {
  assert.equal(discoveryUi.includes('>Creators</button>'), true);
  assert.equal(discoveryUi.includes('>Community Managers</button>'), true);
  assert.equal(discoveryUi.includes('Verified creators only'), true);
  assert.equal(discoveryUi.includes('At least one verified Community'), true);
  assert.equal(discoveryUi.includes('Minimum combined audience'), true);
  assert.equal(discoveryUi.includes('Minimum Communities'), true);
  assert.equal(discoveryUi.includes('KOL Managers</button>'), false);
  assert.equal(discoveryUi.includes("discovery: '1'"), true);
  assert.equal(discoveryUi.includes('/api/network-entities?'), true);
});

test('Community discovery keeps personal Telegram verification separate from Community verification', () => {
  assert.equal(discoveryUi.includes("Personal Telegram verification proves the manager's human identity/contact."), true);
  assert.equal(discoveryUi.includes("Each Community keeps its own separate verification state."), true);
  assert.equal(discoveryUi.includes('community.verification_status'), true);
  assert.equal(networkRoute.includes('ownership_verified_at IS NOT NULL'), true);
  assert.equal(networkRoute.includes("a.verification_status = 'verified'"), true);
});

test('Creator shortlist requests derive a private Project network record from the canonical Creator profile', () => {
  assert.equal(discoveryUi.includes("creatorProfileId: partner.profile_id"), true);
  assert.equal(discoveryUi.includes("partnerManagerId: partner.manager_id"), true);
  assert.equal(shortlistRoute.includes('creatorProfileId?: string'), true);
  assert.equal(shortlistRoute.includes("p.profile_type = 'creator' AND p.visibility = 'published'"), true);
  assert.equal(shortlistRoute.includes('publicProfileUrl(request, env, creator.username)'), true);
  assert.equal(shortlistRoute.includes('Linked from Linkary creator profile'), true);
  assert.equal(shortlistRoute.includes("creator.verification_status === 'verified_x' ? 'verified' : 'unverified'"), true);
  assert.equal(shortlistRoute.includes('const networkId = () => `net_'), true);
});

test('Partner Discovery is wired into the authenticated Partners route', () => {
  assert.equal(appGate.includes("import PartnerDiscoveryExperience from './PartnerDiscoveryExperience'"), true);
  assert.equal(appGate.includes("experience === 'partners'"), true);
  assert.equal(appGate.includes('<PartnerDiscoveryExperience me={me} status={status} />'), true);
});
