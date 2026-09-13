import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backend = readFileSync(new URL('../src/routes/growthIntelligence.ts', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');

test('campaign contributor reporting keeps global and campaign unique visitor scopes separate', () => {
  assert.match(backend, /type CampaignPartnerVisitorRow = PartnerVisitorRow & \{ campaign_id: string \}/);
  assert.match(backend, /GROUP BY partner_kind, partner_key/);
  assert.match(backend, /GROUP BY campaign_id, partner_kind, partner_key/);
  assert.match(backend, /resolved_campaign_partner_clicks/);
});

test('campaign contributor performance preserves historical partner provenance and calculates campaign shares', () => {
  assert.match(backend, /t\.campaign_id/);
  assert.match(backend, /tracked_link_partner_snapshots snap/);
  assert.match(backend, /campaignPartnerGroups/);
  assert.match(backend, /click_share: total\.tracked_clicks > 0 \? group\.clicks \/ total\.tracked_clicks : null/);
  assert.match(backend, /outcome_share: total\.outcomes > 0 \? group\.outcomes \/ total\.outcomes : null/);
  assert.match(backend, /value_share: total\.attributed_value_usd > 0 \? group\.value \/ total\.attributed_value_usd : null/);
  assert.match(backend, /campaign_contributors: campaignContributors/);
});

test('Founder Growth Intelligence shows ranked contributors inside campaign rows', () => {
  assert.match(frontend, /type CampaignContributorPerformance/);
  assert.match(frontend, /TOP CONTRIBUTORS/);
  assert.match(frontend, /Ranked by attributed value, then outcomes, then clicks/);
  assert.match(frontend, /data\.campaign_contributors\?\.\[campaign\.id\]/);
  assert.match(frontend, /CampaignContributorRanking contributors=\{contributors\}/);
});