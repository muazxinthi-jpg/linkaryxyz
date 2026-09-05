import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/growthIntelligence.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/founder-growth-intelligence.css', import.meta.url), 'utf8');

test('Founder Growth Intelligence is Project scoped and authenticated', () => {
  assert.match(route, /requireAuth\(request, env\)/);
  assert.match(route, /organizationId is required/);
  assert.match(route, /organizationMembership\(db, auth\.user\.id, organizationId\)/);
  assert.match(route, /Growth Intelligence access denied/);
  assert.match(worker, /url\.pathname === '\/api\/growth-intelligence'/);
  assert.match(worker, /request\.method === 'GET'/);
});

test('Growth Intelligence uses bounded Project-scoped queries instead of database-wide scans', () => {
  assert.match(route, /WHERE c\.organization_id = \?/);
  assert.match(route, /WHERE c\.organization_id = \? AND d\.evidence_state != 'rejected'/);
  assert.match(route, /WHERE organization_id = \?/);
  assert.match(route, /WHERE t\.organization_id = \?/);
  assert.match(route, /LIMIT 250/);
  assert.match(route, /LIMIT 1000/);
  assert.match(route, /LIMIT 2500/);
  assert.match(route, /LIMIT 5000/);
  assert.match(route, /LIMIT 10000/);
});

test('manual social performance uses strongest available provenance and excludes rejected work', () => {
  assert.match(route, /const PROVENANCE_PRIORITY: Provenance\[] = \[/);
  assert.match(route, /'provider_verified'/);
  assert.match(route, /'telegram_verified'/);
  assert.match(route, /'linkary_first_party'/);
  assert.match(route, /'founder_manual'/);
  assert.match(route, /'partner_manual'/);
  assert.match(route, /'creator_manual'/);
  assert.match(route, /'estimated'/);
  assert.match(route, /d\.evidence_state != 'rejected'/);
  assert.match(route, /PROVENANCE_PRIORITY\.indexOf\(metric\.provenance\) < PROVENANCE_PRIORITY\.indexOf\(current\.provenance\)/);
});

test('Founder Growth Intelligence derives Project and channel ROI from actual spend and leaves missing denominators unavailable', () => {
  assert.match(route, /SUM\(cost\.usd_equivalent\).*cost\.status = 'active'/s);
  assert.match(route, /cpm: spend > 0 && views > 0 \? \(spend \/ views\) \* 1000 : null/);
  assert.match(route, /cpc: spend > 0 && clicks > 0 \? spend \/ clicks : null/);
  assert.match(route, /cpa: spend > 0 && outcomes > 0 \? spend \/ outcomes : null/);
  assert.match(route, /roas: spend > 0 \? value \/ spend : null/);
  assert.match(route, /Linkary does not fabricate CPM, CPC, CPA, CTR or ROAS/);
});

test('unique click intelligence stays privacy-conscious and explicitly estimated', () => {
  assert.match(route, /COUNT\(click\.visitor_id_hash\)/);
  assert.match(route, /COUNT\(DISTINCT click\.visitor_id_hash\)/);
  assert.match(route, /projectIdentified > 0 \? number\(projectClicks\?\.estimated_unique_clicks\) : null/);
  assert.match(route, /privacy-conscious Linkary visitor hashes/);
  assert.doesNotMatch(route.toLowerCase(), /fingerprint/);
});

test('partner comparison uses tracking-link provenance instead of mutable activity assignment metrics', () => {
  assert.match(route, /LEFT JOIN tracked_link_partner_snapshots snap ON snap\.tracked_link_id = t\.id/);
  assert.match(route, /CASE WHEN snap\.tracked_link_id IS NOT NULL THEN snap\.assignment_kind ELSE la\.assignment_kind END AS partner_kind/);
  assert.match(route, /CASE WHEN snap\.tracked_link_id IS NOT NULL THEN snap\.snapshot_source ELSE 'current_fallback' END AS attribution_source/);
  assert.match(route, /const partnerGroups = new Map<string, PartnerGroup>\(\)/);
  assert.match(route, /spend_scope: 'not_allocated'/);
  assert.match(route, /actual_spend_usd: null/);
  assert.match(route, /attribution_scope: 'tracking_link_partner_provenance'/);
  assert.doesNotMatch(route, /if \(activity\.partner_key && activity\.partner_display_name\)/);
});

test('partner snapshot coverage stays explicit during the migration window', () => {
  assert.match(route, /link_creation: 0/);
  assert.match(route, /legacy_backfill: 0/);
  assert.match(route, /current_fallback: 0/);
  assert.match(route, /partner_attribution: partnerAttributionCoverage/);
  assert.match(route, /protected D1 backfill migration is applied/);
  assert.match(route, /not presented as proven creation-time history/);
});

test('partner and channel comparisons never silently allocate unavailable costs', () => {
  assert.match(route, /spend_scope: 'not_allocated'/);
  assert.match(route, /spend_scope: 'activity_attached'/);
  assert.match(route, /Partner comparison uses tracking-link partner provenance only/);
  assert.match(route, /Activity-level spend and social metrics are not automatically reassigned to historical partners/);
  assert.match(route, /campaign-level overhead is not allocated automatically/);
});

test('Growth Intelligence UI compares campaigns, activities, partners and channels', () => {
  assert.match(panel, /FOUNDER GROWTH INTELLIGENCE/);
  assert.match(panel, /See what actually produced results/);
  assert.match(panel, /'campaigns' \| 'activities' \| 'partners' \| 'channels'/);
  assert.match(panel, /ACTUAL SPEND/);
  assert.match(panel, /REPORTED VIEWS/);
  assert.match(panel, /LINKARY CLICKS/);
  assert.match(panel, /ATTRIBUTED VALUE/);
  assert.match(panel, /COST \/ OUTCOME/);
  assert.match(panel, /STRONGEST CAMPAIGN/);
  assert.match(panel, /STRONGEST PARTNER/);
  assert.match(panel, /STRONGEST CHANNEL/);
});

test('partner UI shows only safe tracked attribution metrics and provenance coverage', () => {
  assert.match(panel, /function PartnerMetricStrip/);
  assert.match(panel, /TRACKING LINKS/);
  assert.match(panel, /VALUE \/ CLICK/);
  assert.match(panel, /Spend\/social metrics not reassigned/);
  assert.match(panel, /current-assignment fallback until the protected database migration is applied/);
  assert.match(panel, /partnerCoverageLabel/);
});

test('Growth Intelligence UI keeps evidence provenance and methodology visible', () => {
  assert.match(panel, /Evidence mix/);
  assert.match(panel, /Manual \{summary\.evidence_mix\.manual\}/);
  assert.match(panel, /Tracked \{summary\.evidence_mix\.tracked\}/);
  assert.match(panel, /Verified \{summary\.evidence_mix\.verified\}/);
  assert.match(panel, /Estimated \{summary\.evidence_mix\.estimated\}/);
  assert.match(panel, /Reported views and engagement can be manual\. Linkary clicks are first-party/);
  assert.match(panel, /How these metrics are calculated/);
  assert.match(panel, /data\.methodology\.partner_attribution/);
});

test('Growth Intelligence is attached only to the Project Growth workspace', () => {
  assert.match(workspace, /profile\.profile_type === 'project' && currentPath === '\/campaigns' && Boolean\(profile\.organization_id\)/);
  assert.match(workspace, /<FounderGrowthIntelligencePanel organizationId=\{profile\.organization_id\} \/>/);
});

test('Growth Intelligence comparison stays usable on tablet, phone and 320px widths', () => {
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
