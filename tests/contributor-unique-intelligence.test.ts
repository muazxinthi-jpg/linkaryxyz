import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backend = readFileSync(new URL('../src/routes/growthIntelligence.ts', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');

test('partner unique visitors deduplicate privacy-conscious visitor hashes across all resolved partner links', () => {
  assert.match(backend, /type PartnerVisitorRow/);
  assert.match(backend, /COUNT\(DISTINCT visitor_id_hash\) AS estimated_unique_clicks/);
  assert.match(backend, /tracked_link_partner_snapshots snap/);
  assert.match(backend, /resolved_partner_clicks/);
  assert.match(backend, /GROUP BY partner_kind, partner_key/);
  assert.match(backend, /estimated_unique_clicks: group\.uniqueClicks/);
});

test('partner visitor attribution preserves immutable snapshot identity before current assignment fallback', () => {
  assert.match(backend, /CASE WHEN snap\.tracked_link_id IS NOT NULL THEN snap\.assignment_kind ELSE la\.assignment_kind END AS partner_kind/);
  assert.match(backend, /WHEN snap\.tracked_link_id IS NOT NULL THEN CASE WHEN snap\.assignment_kind = 'creator' THEN snap\.creator_profile_id ELSE snap\.partner_asset_id END/);
  assert.match(backend, /click\.visitor_id_hash IS NOT NULL/);
});

test('Founder Growth Intelligence surfaces contributor unique visitors without inventing unavailable values', () => {
  assert.match(frontend, /UNIQUE VISITORS/);
  assert.match(frontend, /value\.estimated_unique_clicks === null \? 'N\/A' : compact\(value\.estimated_unique_clicks\)/);
  assert.match(frontend, /strongestPartner\.estimated_unique_clicks === null/);
});
