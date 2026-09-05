import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0024_activity_measurement_evidence.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/db/attributionSchema.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/activityMeasurement.ts', import.meta.url), 'utf8');
const tracking = readFileSync(new URL('../src/routes/tracking.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/ActivityMeasurementPanel.tsx', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../frontend/src/ActivityLifecycleActions.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/activity-measurement.css', import.meta.url), 'utf8');

test('measurement V1 stores exact published deliverables on the existing activity chain', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS campaign_activity_deliverables/);
  assert.match(migration, /organization_id TEXT NOT NULL REFERENCES organizations\(id\)/);
  assert.match(migration, /campaign_id TEXT NOT NULL REFERENCES campaigns\(id\)/);
  assert.match(migration, /activity_id TEXT NOT NULL REFERENCES campaign_activities\(id\)/);
  assert.match(migration, /content_url TEXT NOT NULL/);
  assert.match(migration, /evidence_state IN \('submitted', 'accepted', 'rejected'\)/);
  assert.match(migration, /UNIQUE|idx_activity_deliverables_exact_url/);
});

test('performance metrics keep provenance instead of turning manual data into verified data', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS campaign_activity_metrics/);
  assert.match(migration, /'creator_manual'/);
  assert.match(migration, /'partner_manual'/);
  assert.match(migration, /'founder_manual'/);
  assert.match(migration, /'linkary_first_party'/);
  assert.match(migration, /'telegram_verified'/);
  assert.match(migration, /'provider_verified'/);
  assert.match(migration, /'estimated'/);
  assert.match(route, /function manualProvenance/);
  assert.match(route, /return access\.assignmentKind === 'community' \? 'partner_manual' : 'creator_manual'/);
  assert.doesNotMatch(route, /body\.provenance/);
});

test('manual measurement writes are permissioned to Project operators or the exact assigned partner', () => {
  assert.match(route, /organizationMembership\(db, userId, row\.organization_id\)/);
  assert.match(route, /\['owner', 'admin', 'marketing_manager'\]\.includes\(membership\.role\)/);
  assert.match(route, /row\.creator_owner_user_id === userId/);
  assert.match(route, /row\.manager_owner_user_id === userId/);
  assert.match(route, /Only the Project team can review submitted deliverables/);
});

test('assigned partner work is exact-user scoped and reuses the measurement route', () => {
  assert.match(route, /export async function listMyAssignedActivities/);
  assert.match(route, /la\.assignment_kind = 'creator' AND cp\.owner_user_id = \?/);
  assert.match(route, /la\.assignment_kind = 'community' AND mp\.owner_user_id = \?/);
  assert.match(route, /LIMIT 100/);
  assert.match(tracking, /url\.searchParams\.get\('measurement'\) === '1' && url\.searchParams\.get\('mine'\) === '1'/);
  assert.match(tracking, /return listMyAssignedActivities\(request, env\)/);
});

test('measurement reads stay activity/campaign scoped and indexed', () => {
  assert.match(route, /WHERE \$\{whereColumn\} = \?/);
  assert.match(route, /campaignId or activityId is required/);
  assert.match(route, /WHERE t\.activity_id = \?/);
  assert.match(route, /WHERE activity_id = \?/);
  assert.match(migration, /idx_activity_deliverables_activity/);
  assert.match(migration, /idx_activity_deliverables_campaign/);
  assert.match(migration, /idx_activity_metrics_activity/);
  assert.match(migration, /idx_activity_metrics_campaign/);
});

test('metric updates are bounded, non-negative and idempotent per provenance', () => {
  assert.match(route, /entries\.length > 30/);
  assert.match(route, /metricValue < 0/);
  assert.match(route, /ON CONFLICT\(deliverable_id, metric_key, provenance\) DO UPDATE SET/);
  assert.match(migration, /UNIQUE\(deliverable_id, metric_key, provenance\)/);
});

test('runtime safety guard mirrors the formal measurement migration', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS campaign_activity_deliverables/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS campaign_activity_metrics/);
  assert.match(schema, /partner_manual/);
});

test('existing tracked-links API exposes measurement operations without a parallel attribution silo', () => {
  assert.match(tracking, /operation === 'deliverable'/);
  assert.match(tracking, /operation === 'metrics'/);
  assert.match(tracking, /operation === 'review-deliverable'/);
  assert.match(tracking, /searchParams\.get\('measurement'\) === '1'/);
  assert.match(tracking, /createActivityDeliverable/);
  assert.match(tracking, /listActivityMeasurements/);
});

test('activity UI keeps reported social metrics separate from Linkary first-party performance', () => {
  assert.match(ui, /Performance evidence/);
  assert.match(ui, /Compare reported social performance with Linkary first-party traffic and outcomes/);
  assert.match(ui, /REPORTED VIEWS/);
  assert.match(ui, /LINKARY CLICKS/);
  assert.match(ui, /OUTCOMES/);
  assert.match(ui, /VALUE/);
  assert.match(ui, /CTR/);
  assert.match(ui, /Engagement rate/);
  assert.match(ui, /manual evidence/);
  assert.match(ui, /Linkary-tracked clicks and outcomes remain separate first-party signals/);
});

test('activity UI supports platform-aware V1 performance entry', () => {
  assert.match(ui, /Views \/ impressions/);
  assert.match(ui, /Bookmarks/);
  assert.match(ui, /Reported joins/);
  assert.match(ui, /Forwards/);
  assert.match(ui, /Pageviews/);
  assert.match(ui, /Publisher-reported clicks/);
  assert.match(ui, /operation=deliverable/);
  assert.match(ui, /operation=metrics/);
  assert.match(ui, /operation=review-deliverable/);
  assert.match(ui, /Accept deliverable/);
  assert.match(ui, /Reject/);
});

test('measurement UI separates contributor submission from Project review authority', () => {
  assert.match(ui, /canSubmit: boolean/);
  assert.match(ui, /canReview\?: boolean/);
  assert.match(ui, /if \(!token \|\| !contentUrl\.trim\(\) \|\| !canSubmit\) return/);
  assert.match(ui, /if \(!token \|\| !canReview\) return/);
});

test('every campaign activity exposes the measurement panel without replacing lifecycle controls', () => {
  assert.match(lifecycle, /import ActivityMeasurementPanel from '\.\/ActivityMeasurementPanel'/);
  assert.match(lifecycle, /<ActivityMeasurementPanel activityId=\{activityId\} canSubmit=\{writable\} canReview=\{writable\} \/>/);
  assert.match(lifecycle, /Activity lifecycle actions/);
});

test('measurement modal satisfies the Beta mobile acceptance baseline', () => {
  assert.match(css, /@media\s*\(max-width:\s*430px\)/);
  assert.match(css, /@media\s*\(max-width:\s*320px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /max-height:\s*calc\(100dvh - 16px\)/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
