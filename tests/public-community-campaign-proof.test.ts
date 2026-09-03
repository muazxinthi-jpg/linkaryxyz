import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../src/communityCampaignProof.ts', import.meta.url), 'utf8');
const reputation = readFileSync(new URL('../src/routes/partnerReputation.ts', import.meta.url), 'utf8');
const publicProfile = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');

test('manager workspace and public profile reuse one Community proof derivation', () => {
  assert.equal(shared.includes('export async function exactCommunityCampaignProof'), true);
  assert.equal(reputation.includes("import { exactCommunityCampaignProof } from '../communityCampaignProof'"), true);
  assert.equal(publicProfile.includes("import { exactCommunityCampaignProof, type CommunityCampaignProofSummary } from '../communityCampaignProof'"), true);
});

test('shared Community proof keeps exact assignment and verified outcome boundaries', () => {
  assert.equal(shared.includes("la.assignment_kind = 'community'"), true);
  assert.equal(shared.includes('la.partner_asset_id'), true);
  assert.equal(shared.includes("ce.source IN ('linkary_tracked','telegram_verified','provider_verified')"), true);
  assert.equal(shared.includes('collaboration_inquiries'), false);
  assert.equal(shared.includes('project_partner_shortlists'), false);
  assert.equal(shared.includes('audience_size'), false);
  assert.equal(shared.includes("ce.source = 'manual'"), false);
});

test('public Community Portfolio shows aggregate and per-Community proof only when evidence exists', () => {
  assert.equal(publicProfile.includes('Community Campaign Proof'), true);
  assert.equal(publicProfile.includes('Exact Community activity only'), true);
  assert.equal(publicProfile.includes('TRACKED CAMPAIGNS'), true);
  assert.equal(publicProfile.includes('TRACKED CLICKS'), true);
  assert.equal(publicProfile.includes('VERIFIED OUTCOMES'), true);
  assert.equal(publicProfile.includes('ATTRIBUTED VALUE'), true);
  assert.equal(publicProfile.includes('campaignProof: hasProof && proofSummary ? proofSummary : null'), true);
  assert.equal(publicProfile.includes('campaignProof: assetProof ?'), true);
});

test('public proof copy keeps Community verification and inquiry acceptance separate from performance', () => {
  assert.equal(publicProfile.includes('Community verification is separate from personal Telegram identity verification and from campaign performance.'), true);
  assert.equal(publicProfile.includes('Manual outcomes, audience estimates, shortlists and accepted inquiries do not count as campaign performance.'), true);
});

test('public Community Campaign Proof is responsive down to narrow phone widths', () => {
  assert.equal(publicProfile.includes('@media(max-width:650px)'), true);
  assert.equal(publicProfile.includes('@media(max-width:430px)'), true);
  assert.equal(publicProfile.includes('.community-portfolio-proof-grid{grid-template-columns:1fr!important}'), true);
  assert.equal(publicProfile.includes('overflow-wrap:anywhere!important'), true);
});
