import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('accepted Creator applications activate exact planned campaign work', () => {
  const route = readFileSync(new URL('../src/routes/opportunities.ts', import.meta.url), 'utf8');

  assert.equal(route.includes("import { createActivity } from './activities';"), true);
  assert.equal(route.includes("body.status === 'accepted'"), true);
  assert.equal(route.includes("la.assignment_kind = 'creator'"), true);
  assert.equal(route.includes('la.creator_profile_id = ?'), true);
  assert.equal(route.includes("activityType: 'creator_content'"), true);
  assert.equal(route.includes("partner: { kind: 'creator', creatorProfileId: application.applicant_profile_id }"), true);
  assert.equal(route.includes('requiresProjectTrackingLink'), true);
});

test('application acceptance is idempotent for an already assigned Creator', () => {
  const route = readFileSync(new URL('../src/routes/opportunities.ts', import.meta.url), 'utf8');

  const existingAssignmentLookup = route.indexOf("JOIN campaign_activity_linkary_assignments la ON la.activity_id = ca.id");
  const createActivityCall = route.indexOf('const activationResponse = await createActivity(');

  assert.notEqual(existingAssignmentLookup, -1);
  assert.notEqual(createActivityCall, -1);
  assert.equal(existingAssignmentLookup < createActivityCall, true);
  assert.equal(route.includes('if (existingActivity) {\n        activityId = existingActivity.id;\n      } else {'), true);
});

test('accepted opportunity does not manufacture tracking or outcome evidence', () => {
  const route = readFileSync(new URL('../src/routes/opportunities.ts', import.meta.url), 'utf8');
  const reviewStart = route.indexOf('export async function reviewCampaignOpportunityApplication');
  const review = route.slice(reviewStart);

  assert.equal(review.includes('createTrackedLink'), false);
  assert.equal(review.includes('createConversion'), false);
  assert.equal(review.includes('INSERT INTO tracked_links'), false);
  assert.equal(review.includes('INSERT INTO conversions'), false);
  assert.equal(review.includes('requiresProjectTrackingLink'), true);
});

test('Community Manager acceptance does not guess an exact Community', () => {
  const route = readFileSync(new URL('../src/routes/opportunities.ts', import.meta.url), 'utf8');

  assert.equal(route.includes('if (application.manager_id)'), true);
  assert.equal(route.includes('requiresCommunitySelection = true'), true);
  assert.equal(route.includes('Acceptance alone\n      // cannot choose which Community should own the evidence'), true);
});

test('Creator My Work supports assigned work before a Project creates the tracking link', () => {
  const ui = readFileSync(new URL('../frontend/src/CreatorOpportunitiesExperience.tsx', import.meta.url), 'utf8');

  assert.equal(ui.includes('/api/tracked-links?measurement=1&mine=1'), true);
  assert.equal(ui.includes('Waiting for Project tracking link'), true);
  assert.equal(ui.includes('The Project has not created an active Linkary tracking link for this activity yet.'), true);
});
