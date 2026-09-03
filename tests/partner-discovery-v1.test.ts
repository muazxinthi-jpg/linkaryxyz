import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const discoveryRoute = readFileSync(new URL('../src/routes/partnerDiscovery.ts', import.meta.url), 'utf8');
const shortlistRoute = readFileSync(new URL('../src/routes/shortlists.ts', import.meta.url), 'utf8');
const appRouter = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const appGate = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const discoveryUi = readFileSync(new URL('../frontend/src/PartnerDiscoveryExperience.tsx', import.meta.url), 'utf8');

test('Partner Discovery is project-scoped and uses real Linkary identities', () => {
  assert.equal(discoveryRoute.includes("organizationMembership(db, auth.user.id, organizationId)"), true);
  assert.equal(discoveryRoute.includes("p.profile_type = 'creator'"), true);
  assert.equal(discoveryRoute.includes("p.visibility = 'published'"), true);
  assert.equal(discoveryRoute.includes("m.manager_type = 'community_manager'"), true);
  assert.equal(discoveryRoute.includes("m.visibility = 'public'"), true);
  assert.equal(discoveryRoute.includes("tpi.platform = 'telegram'"), true);
  assert.equal(discoveryRoute.includes("va.verification_status = 'verified'"), true);
  assert.equal(discoveryRoute.includes('publicProfileUrl(request, env, row.username)'), true);
});

test('Partner Discovery exposes Creator and Community Manager filters without reviving KOL Manager discovery', () => {
  assert.equal(discoveryUi.includes('>Creators</button>'), true);
  assert.equal(discoveryUi.includes('>Community Managers</button>'), true);
  assert.equal(discoveryUi.includes('Verified creators only'), true);
  assert.equal(discoveryUi.includes('At least one verified Community'), true);
  assert.equal(discoveryUi.includes('Minimum combined audience'), true);
  assert.equal(discoveryUi.includes('Minimum Communities'), true);
  assert.equal(discoveryUi.includes('KOL Managers</button>'), false);
});

test('Community discovery keeps personal Telegram verification separate from Community verification', () => {
  assert.equal(discoveryUi.includes("Personal Telegram verification proves the manager's human identity/contact."), true);
  assert.equal(discoveryUi.includes("Each Community keeps its own separate verification state."), true);
  assert.equal(discoveryUi.includes('community.verification_status'), true);
});

test('Creator shortlist requests use the Creator profile while Community Managers use their manager listing', () => {
  assert.equal(discoveryUi.includes("creatorProfileId: partner.profile_id"), true);
  assert.equal(discoveryUi.includes("partnerManagerId: partner.manager_id"), true);
  assert.equal(shortlistRoute.includes('creatorProfileId'), true);
  assert.equal(shortlistRoute.includes("Linked from Linkary creator profile"), true);
  assert.equal(shortlistRoute.includes("creator.verification_status === 'verified_x' ? 'verified' : 'unverified'"), true);
});

test('Partner Discovery is wired into the authenticated app and API router', () => {
  assert.equal(appRouter.includes("'/api/partner-discovery'"), true);
  assert.equal(appRouter.includes('listPartnerDiscovery'), true);
  assert.equal(appGate.includes("PartnerDiscoveryExperience"), true);
  assert.equal(appGate.includes("experience === 'partners'"), true);
});
