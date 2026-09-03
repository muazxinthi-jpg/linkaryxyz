import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lifecycle = readFileSync(new URL('../src/routes/activityLifecycle.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const tracking = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../frontend/src/ActivityLifecycleActions.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/activity-lifecycle.css', import.meta.url), 'utf8');

test('activity lifecycle has a strict V1 transition matrix with completed and cancelled terminal', () => {
  assert.equal(lifecycle.includes("planned: ['live', 'completed', 'cancelled']"), true);
  assert.equal(lifecycle.includes("live: ['completed', 'cancelled']"), true);
  assert.equal(lifecycle.includes('completed: []'), true);
  assert.equal(lifecycle.includes('cancelled: []'), true);
  assert.equal(lifecycle.includes('canTransitionActivityStatus'), true);
  assert.equal(lifecycle.includes("['live', 'completed', 'cancelled'].includes(body.status)"), true);
});

test('activity lifecycle update is authenticated, CSRF protected, Project permissioned and exact-activity scoped', () => {
  assert.equal(lifecycle.includes('requireAuth(request, env)'), true);
  assert.equal(lifecycle.includes('verifyCsrf(request, env, auth)'), true);
  assert.equal(lifecycle.includes('requireOperationalProjectAccess(db, auth.user.id, activity.organization_id, true)'), true);
  assert.equal(lifecycle.includes('JOIN campaigns c ON c.id = a.campaign_id'), true);
  assert.equal(lifecycle.includes('WHERE a.id = ?'), true);
});

test('activity lifecycle route is a focused PATCH endpoint', () => {
  assert.equal(index.includes("const activityStatus = path.match(/^\\/api\\/campaign-activities\\/([^/]+)\\/status$/)"), true);
  assert.equal(index.includes("if (activityStatus) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return updateActivityLifecycleStatus"), true);
});

test('activity lifecycle mutation changes status and updated_at without manufacturing or deleting evidence', () => {
  assert.equal(lifecycle.includes("UPDATE campaign_activities SET status = ?, updated_at = ? WHERE id = ?"), true);
  const forbiddenWrites = [
    'INSERT INTO tracked_links',
    'DELETE FROM tracked_links',
    'INSERT INTO tracked_link_clicks',
    'DELETE FROM tracked_link_clicks',
    'INSERT INTO conversion_events',
    'DELETE FROM conversion_events',
    'INSERT INTO campaign_activity_linkary_assignments',
    'DELETE FROM campaign_activity_linkary_assignments',
  ];
  for (const sql of forbiddenWrites) assert.equal(lifecycle.includes(sql), false, `${sql} must not be part of lifecycle mutation`);
  assert.equal(lifecycle.includes('performanceEvidenceCreated: false'), true);
});

test('terminal activities cannot silently reopen in V1 and same-status requests are idempotent', () => {
  assert.equal(lifecycle.includes("activity.status === 'completed' || activity.status === 'cancelled'"), true);
  assert.equal(lifecycle.includes('Completed and cancelled activities are final in this Beta workflow.'), true);
  assert.equal(lifecycle.includes('if (activity.status === next)'), true);
  assert.equal(lifecycle.includes('existing: true'), true);
});

test('Evidence activity cards expose lifecycle actions without replacing exact partner and tracking controls', () => {
  assert.equal(tracking.includes("import ActivityLifecycleActions from './ActivityLifecycleActions'"), true);
  assert.equal(tracking.includes('<ActivityLifecycleActions activityId={activity.id} initialStatus={activity.status} writable={writable(project)} />'), true);
  assert.equal(tracking.includes('Change partner'), true);
  assert.equal(tracking.includes('Remove partner'), true);
  assert.equal(tracking.includes('Create tracking link'), true);
});

test('lifecycle UI clearly separates completion history from performance proof', () => {
  assert.equal(actions.includes('Mark live'), true);
  assert.equal(actions.includes('Complete'), true);
  assert.equal(actions.includes('Cancel'), true);
  assert.equal(actions.includes('It does not create performance proof by itself.'), true);
  assert.equal(actions.includes('Performance proof still depends on tracked or verified evidence.'), true);
  assert.equal(actions.includes('Existing tracking links, clicks, outcomes and partner history will remain stored.'), true);
  assert.equal(actions.includes("completed: []"), true);
  assert.equal(actions.includes("cancelled: []"), true);
});

test('lifecycle actions call the exact PATCH endpoint with CSRF protection', () => {
  assert.equal(actions.includes('`/api/campaign-activities/${encodeURIComponent(activityId)}/status`'), true);
  assert.equal(actions.includes("method: 'PATCH'"), true);
  assert.equal(actions.includes("'x-csrf-token': token"), true);
  assert.equal(actions.includes('body: JSON.stringify({ status: next })'), true);
});

test('activity lifecycle controls meet narrow-phone acceptance protections', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.equal(css.includes('min-height:44px'), true);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(css.includes('grid-template-columns:1fr'), true);
});
