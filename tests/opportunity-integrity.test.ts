import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/opportunityIntegrity.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');

test('My applications keeps historical opportunities after close or expiry', () => {
  const mineList = source.slice(source.indexOf('listCampaignOpportunitiesIntegrity'), source.indexOf('applyToCampaignOpportunityIntegrity'));
  assert.equal(mineList.includes("url.searchParams.get('mine') !== '1'"), true);
  assert.equal(mineList.includes("o.status = 'open'"), false);
  assert.equal(mineList.includes('application_deadline'), true);
  assert.match(mineList, /WHERE EXISTS \([\s\S]*campaign_opportunity_applications mine_app[\s\S]*mine_profile\.owner_user_id = \?/);
  assert.equal(mineList.includes('AS my_application_status'), true);
});

test('Creator application transitions cannot reset terminal states to pending', () => {
  const apply = source.slice(source.indexOf('applyToCampaignOpportunityIntegrity'), source.indexOf('reviewCampaignOpportunityApplicationIntegrity'));
  assert.match(apply, /existing\.status !== 'pending'[\s\S]*application_state_conflict/);
  assert.equal(apply.includes('Accepted, rejected, or withdrawn applications cannot be reset to pending'), true);
  assert.match(apply, /SET status = 'withdrawn', updated_at = \?[\s\S]*WHERE id = \? AND status = 'pending'/);
  assert.match(apply, /SET note = \?, updated_at = \?[\s\S]*WHERE id = \? AND status = 'pending'[\s\S]*campaign_opportunities o[\s\S]*o\.status = 'open'/);
});

test('Project review only accepts or rejects pending applications with current authority', () => {
  const review = source.slice(source.indexOf('reviewCampaignOpportunityApplicationIntegrity'));
  assert.match(review, /application\.status !== 'pending'[\s\S]*application_state_conflict/);
  assert.match(review, /UPDATE campaign_opportunity_applications[\s\S]*SET status = \?, updated_at = \?[\s\S]*WHERE id = \? AND status = 'pending'/);
  assert.match(review, /JOIN organization_memberships m ON m\.organization_id = o\.organization_id/);
  assert.match(review, /m\.status = 'active'/);
  assert.match(review, /m\.role IN \('owner', 'admin', 'marketing_manager'\)/);
  assert.equal(review.includes('already decided by another request'), true);
});

test('production Worker routes opportunity list and writes through integrity guards', () => {
  assert.equal(worker.includes('listCampaignOpportunitiesIntegrity'), true);
  assert.equal(worker.includes('applyToCampaignOpportunityIntegrity'), true);
  assert.equal(worker.includes('reviewCampaignOpportunityApplicationIntegrity'), true);
});
