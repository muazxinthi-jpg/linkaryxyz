import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/partnerReputation.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../frontend/src/CommunityVerificationPanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/community-manager.css', import.meta.url), 'utf8');

test('Community Campaign Proof derives only from exact Community activity assignments', () => {
  assert.equal(route.includes("la.assignment_kind = 'community'"), true);
  assert.equal(route.includes('la.partner_asset_id'), true);
  assert.equal(route.includes("pa.asset_type = 'telegram_community'"), true);
  assert.equal(route.includes('campaign_activity_linkary_assignments'), true);
});

test('public-grade Community outcomes exclude manual conversion records', () => {
  const proofSection = route.slice(route.indexOf('async function exactCommunityCampaignProof'), route.indexOf('export async function partnerManagerReputation'));
  assert.equal(proofSection.includes("ce.source IN ('linkary_tracked','telegram_verified','provider_verified')"), true);
  assert.equal(proofSection.includes("ce.source = 'manual'"), false);
  assert.equal(proofSection.includes("'manual'"), false);
});

test('Community proof does not promote listing verification inquiry or audience estimates into performance', () => {
  const proofSection = route.slice(route.indexOf('async function exactCommunityCampaignProof'), route.indexOf('export async function partnerManagerReputation'));
  assert.equal(proofSection.includes('collaboration_inquiries'), false);
  assert.equal(proofSection.includes('project_partner_shortlists'), false);
  assert.equal(proofSection.includes('audience_size'), false);
  assert.equal(proofSection.includes('verification_status ='), false);
  assert.equal(proofSection.includes('partner_manager_collaborations'), false);
});

test('Community Campaign Proof exposes defensible metrics and activity history', () => {
  assert.equal(route.includes('tracked_campaigns'), true);
  assert.equal(route.includes('tracked_clicks'), true);
  assert.equal(route.includes('verified_outcomes'), true);
  assert.equal(route.includes('attributed_value_usd'), true);
  assert.equal(route.includes('activity_title'), true);
  assert.equal(route.includes('campaign_name'), true);
  assert.equal(route.includes('project_name'), true);
  assert.equal(route.includes('Community Campaign Proof is derived only from exact Linkary Community activity assignments.'), true);
});

test('Community manager UI shows proof only when exact evidence exists', () => {
  assert.equal(panel.includes('/api/partner-manager-reputation?assetId='), true);
  assert.equal(panel.includes('Community Campaign Proof'), true);
  assert.equal(panel.includes('Tracked evidence only'), true);
  assert.equal(panel.includes('VERIFIED OUTCOMES'), true);
  assert.equal(panel.includes('ATTRIBUTED VALUE'), true);
  assert.equal(panel.includes('hasEvidence'), true);
});

test('Community Campaign Proof remains responsive across required phone widths', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.match(css, /community-proof-toggle\{[^}]*min-height:44px/s);
});
