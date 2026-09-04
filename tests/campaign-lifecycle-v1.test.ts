import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lifecycle = readFileSync(new URL('../src/routes/campaignLifecycle.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const growth = readFileSync(new URL('../frontend/src/GrowthExperience.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../frontend/src/CampaignLifecycleActions.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/campaign-lifecycle.css', import.meta.url), 'utf8');
const campaignSchema = readFileSync(new URL('../migrations/0006_campaign_foundation.sql', import.meta.url), 'utf8');

test('campaign lifecycle uses the locked V1 transition matrix', () => {
  assert.equal(lifecycle.includes("draft: ['active', 'archived']"), true);
  assert.equal(lifecycle.includes("active: ['paused', 'completed', 'archived']"), true);
  assert.equal(lifecycle.includes("paused: ['active', 'completed', 'archived']"), true);
  assert.equal(lifecycle.includes("completed: ['archived']"), true);
  assert.equal(lifecycle.includes('archived: []'), true);
  assert.equal(lifecycle.includes('canTransitionCampaignStatus'), true);
  assert.equal(lifecycle.includes("['active', 'paused', 'completed', 'archived'].includes(body.status)"), true);
});

test('campaign schema already supports the lifecycle without another migration', () => {
  assert.equal(campaignSchema.includes("DEFAULT 'draft'"), true);
  assert.equal(campaignSchema.includes("CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'))"), true);
});

test('campaign lifecycle update is authenticated, CSRF protected and Project permissioned', () => {
  assert.equal(lifecycle.includes('requireAuth(request, env)'), true);
  assert.equal(lifecycle.includes('verifyCsrf(request, env, auth)'), true);
  assert.equal(lifecycle.includes('requireOperationalProjectAccess(db, auth.user.id, campaign.organization_id, true)'), true);
  assert.equal(lifecycle.includes("SELECT id, status, organization_id FROM campaigns WHERE id = ?"), true);
});

test('campaign lifecycle route is an exact PATCH endpoint', () => {
  assert.equal(index.includes("const campaignStatus = path.match(/^\\/api\\/campaigns\\/([^/]+)\\/status$/)"), true);
  assert.equal(index.includes("if (campaignStatus) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return updateCampaignLifecycleStatus"), true);
});

test('campaign lifecycle changes only campaign status and preserves evidence boundaries', () => {
  assert.equal(lifecycle.includes("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?"), true);
  const forbiddenWrites = [
    'UPDATE campaign_activities SET status',
    'DELETE FROM campaign_activities',
    'DELETE FROM tracked_links',
    'DELETE FROM tracked_link_clicks',
    'DELETE FROM conversion_events',
    'INSERT INTO conversion_events',
    'DELETE FROM campaign_activity_linkary_assignments',
    'DELETE FROM collaboration_inquiries',
  ];
  for (const sql of forbiddenWrites) assert.equal(lifecycle.includes(sql), false, `${sql} must not be part of campaign lifecycle mutation`);
  assert.equal(lifecycle.includes('activityStatusesChanged: false'), true);
  assert.equal(lifecycle.includes('performanceEvidenceCreated: false'), true);
  assert.equal(lifecycle.includes('attributionConfidenceChanged: false'), true);
});

test('completed campaigns can only archive, archived campaigns are terminal, and same-status updates are idempotent', () => {
  assert.equal(lifecycle.includes('Completed campaigns can only be archived in this Beta workflow.'), true);
  assert.equal(lifecycle.includes('Archived campaigns are final in this Beta workflow.'), true);
  assert.equal(lifecycle.includes('if (campaign.status === next)'), true);
  assert.equal(lifecycle.includes('existing: true'), true);
});

test('Growth campaign cards expose lifecycle actions and retain existing detail and opportunity controls', () => {
  assert.equal(growth.includes("import CampaignLifecycleActions, { type CampaignLifecycleStatus } from './CampaignLifecycleActions'"), true);
  assert.equal(growth.includes('<CampaignLifecycleActions campaignId={c.id} initialStatus={c.status} writable={writable(project)}'), true);
  assert.equal(growth.includes('Open details'), true);
  assert.equal(growth.includes('Open as opportunity'), true);
  assert.equal(growth.includes('campaignStatusChanged'), true);
});

test('campaign lifecycle UI uses the requested operational labels and evidence-preserving confirmations', () => {
  assert.equal(actions.includes('Start campaign'), true);
  assert.equal(actions.includes('Pause'), true);
  assert.equal(actions.includes('Resume'), true);
  assert.equal(actions.includes('Complete'), true);
  assert.equal(actions.includes('Archive'), true);
  assert.equal(actions.includes('Completing the campaign does not create performance proof.'), true);
  assert.equal(actions.includes('Attribution confidence is not changed.'), true);
  assert.equal(actions.includes('activities, tracking links, clicks, outcomes, reports and relationship history remain stored'), true);
  assert.equal(actions.includes("completed: ['archived']"), true);
  assert.equal(actions.includes('archived: []'), true);
});

test('campaign lifecycle actions call the exact endpoint with CSRF protection', () => {
  assert.equal(actions.includes('`/api/campaigns/${encodeURIComponent(campaignId)}/status`'), true);
  assert.equal(actions.includes("method: 'PATCH'"), true);
  assert.equal(actions.includes("'x-csrf-token': token"), true);
  assert.equal(actions.includes('body: JSON.stringify({ status: next })'), true);
});

test('campaign lifecycle controls meet responsive acceptance protections', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.equal(css.includes('min-height:44px'), true);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(css.includes('grid-template-columns:1fr'), true);
});
