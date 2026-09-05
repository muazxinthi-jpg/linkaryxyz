import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0025_actual_spend_ledger.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/db/attributionSchema.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/campaignCosts.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const conversions = readFileSync(new URL('../src/routes/conversions.ts', import.meta.url), 'utf8');
const growth = readFileSync(new URL('../frontend/src/GrowthExperience.tsx', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../frontend/src/ActivityLifecycleActions.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../frontend/src/ActivityCostPanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/activity-cost.css', import.meta.url), 'utf8');

test('actual spend is stored separately from campaign budget and planned activity cost', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS campaign_cost_entries/);
  assert.match(migration, /amount_original REAL NOT NULL/);
  assert.match(migration, /currency TEXT NOT NULL/);
  assert.match(migration, /usd_equivalent REAL NOT NULL/);
  assert.match(migration, /provenance IN \('founder_manual', 'provider_verified'\)/);
  assert.match(migration, /status IN \('active', 'voided'\)/);
  assert.doesNotMatch(migration, /ALTER TABLE campaigns.*budget_usd/is);
  assert.doesNotMatch(migration, /ALTER TABLE campaign_activities.*planned_cost_usd/is);
});

test('runtime attribution guard mirrors the formal actual spend ledger migration', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS campaign_cost_entries/);
  assert.match(schema, /idx_campaign_cost_entries_campaign/);
  assert.match(schema, /idx_campaign_cost_entries_activity/);
  assert.match(schema, /idx_campaign_cost_entries_organization/);
});

test('actual spend API stays Project/campaign/activity scoped and permissioned', () => {
  assert.match(route, /campaignId or activityId is required/);
  assert.match(route, /organizationMembership\(db, userId, campaign\.organization_id\)/);
  assert.match(route, /requireOperationalProjectAccess\(db, userId, campaign\.organization_id, true\)/);
  assert.match(route, /SELECT id FROM campaign_activities WHERE id = \? AND campaign_id = \?/);
  assert.match(route, /LIMIT 500/);
  assert.match(worker, /url\.pathname === '\/api\/campaign-costs'/);
  assert.match(worker, /\/api\\\/campaign-costs\\\/\(\[\^\/\]\+\)\\\/void/);
});

test('non-USD and token payments require an explicit founder-entered USD equivalent', () => {
  assert.match(route, /currency === 'USD' && body\.usdEquivalent === undefined/);
  assert.match(route, /nonNegative\(body\.usdEquivalent, 'USD equivalent'\)/);
  assert.match(panel, /Currency \/ token/);
  assert.match(panel, /USD equivalent/);
  assert.match(panel, /Founder-entered/);
  assert.match(panel, /Linkary will not present it as provider-verified spend/);
});

test('cost corrections preserve audit history by voiding instead of deleting', () => {
  assert.match(route, /status = 'voided'/);
  assert.match(route, /void_reason = \?/);
  assert.match(route, /voided_by_user_id = \?/);
  assert.doesNotMatch(route, /DELETE FROM campaign_cost_entries/);
  assert.match(panel, /Cost entry voided\. Historical audit detail was preserved/);
});

test('campaign outcome summary exposes actual spend and derives ROI from it', () => {
  assert.match(conversions, /SUM\(usd_equivalent\) FROM campaign_cost_entries WHERE campaign_id = \? AND status = 'active'/);
  assert.match(conversions, /actual_spend_usd/);
  assert.match(conversions, /safe\.value_usd \/ safe\.actual_spend_usd/);
  assert.match(conversions, /safe\.actual_spend_usd \/ safe\.conversions/);
});

test('Founder Growth report never uses campaign budget as actual spend', () => {
  assert.match(growth, /actual_spend_usd/);
  assert.match(growth, /ACTUAL SPEND/);
  assert.match(growth, /Recorded incurred costs/);
  assert.match(growth, /ROI and cost-efficiency use recorded actual spend, never campaign budget or planned cost/);
  assert.match(growth, /Budget USD','Actual Spend USD/);
  assert.doesNotMatch(growth, /acc\.spend\+=Number\(row\.budget_usd/);
  assert.doesNotMatch(growth, /const roi=row\.budget_usd/);
});

test('actual spend is available only to Project operators alongside activity evidence', () => {
  assert.match(lifecycle, /import ActivityCostPanel from '\.\/ActivityCostPanel'/);
  assert.match(lifecycle, /<ActivityCostPanel activityId=\{activityId\} writable=\{writable\} \/>/);
  assert.match(panel, /if \(!writable\) return null/);
  assert.match(panel, /\/api\/campaign-costs\?activityId=/);
});

test('actual spend modal meets phone and tablet interaction baseline', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.match(css, /max-height:calc\(100dvh - 20px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /overflow-y:auto/);
});
