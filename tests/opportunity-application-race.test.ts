import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/opportunityIntegrity.ts', import.meta.url), 'utf8');

function section(start: string, end?: string) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section: ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('first-time Opportunity applications deduplicate NULL managers authoritatively', () => {
  const apply = section('export async function applyToCampaignOpportunityIntegrity', 'export async function reviewCampaignOpportunityApplicationIntegrity');
  assert.match(apply, /INSERT INTO campaign_opportunity_applications[\s\S]*SELECT \?, o\.id/);
  assert.match(apply, /NOT EXISTS \([\s\S]*campaign_opportunity_applications existing_app[\s\S]*COALESCE\(existing_app\.manager_id,''\) = COALESCE\(\?,''\)/);
  assert.match(apply, /WHERE opportunity_id = \? AND applicant_profile_id = \? AND COALESCE\(manager_id,''\) = COALESCE\(\?,''\)/);
  assert.equal(apply.includes('duplicate: !createdByThisRequest'), true);
  assert.equal(apply.includes('createdByThisRequest ? 201 : 200'), true);
});

test('new application creation rechecks Opportunity open and deadline state in the write', () => {
  const apply = section('export async function applyToCampaignOpportunityIntegrity', 'export async function reviewCampaignOpportunityApplicationIntegrity');
  assert.match(apply, /o\.status = 'open'/);
  assert.match(apply, /o\.application_deadline IS NULL OR date\(o\.application_deadline\) >= date\(\?\)/);
  assert.equal(apply.includes('requireOpportunityOpen(await loadOpportunity(db, body.opportunityId))'), true);
});

test('pending application note edits cannot commit after a concurrent Opportunity close', () => {
  const apply = section('export async function applyToCampaignOpportunityIntegrity', 'export async function reviewCampaignOpportunityApplicationIntegrity');
  assert.match(apply, /UPDATE campaign_opportunity_applications[\s\S]*SET note = \?, updated_at = \?[\s\S]*status = 'pending'[\s\S]*EXISTS \([\s\S]*campaign_opportunities o[\s\S]*o\.status = 'open'/);
  assert.equal(apply.includes('current.updated_at !== timestamp'), true);
});

test('withdrawal only reports success for the exact winning transition', () => {
  const apply = section('export async function applyToCampaignOpportunityIntegrity', 'export async function reviewCampaignOpportunityApplicationIntegrity');
  assert.match(apply, /SET status = 'withdrawn', updated_at = \?[\s\S]*WHERE id = \? AND status = 'pending'/);
  assert.equal(apply.includes("current?.status !== 'withdrawn' || current.updated_at !== timestamp"), true);
});

test('application review rechecks active Project authority at execution time', () => {
  const review = section('export async function reviewCampaignOpportunityApplicationIntegrity');
  assert.match(review, /JOIN organization_memberships m ON m\.organization_id = o\.organization_id/);
  assert.match(review, /m\.user_id = \?/);
  assert.match(review, /m\.status = 'active'/);
  assert.match(review, /m\.role IN \('owner', 'admin', 'marketing_manager'\)/);
  assert.equal(review.includes('current.updated_at !== timestamp'), true);
  assert.equal(review.includes("throw new HttpError(403, 'Application review access denied', 'forbidden')"), true);
});

test('commercial migration 0029 does not change Opportunity application race schema', () => {
  const migration = readFileSync(new URL('../migrations/0029_commercial_plan_catalog_and_usage_credits.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /campaign_opportunities|campaign_opportunity_applications/);
});