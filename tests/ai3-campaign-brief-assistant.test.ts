import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tasks = readFileSync(new URL('../src/ai/tasks.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/ai/campaignBriefAssist.ts', import.meta.url), 'utf8');
const campaigns = readFileSync(new URL('../src/routes/campaigns.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0041_ai3_campaign_brief_assistant.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/CampaignBriefAssistant.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');

test('Campaign Brief Assistant uses the reserved metered AI task and immutable prompt', () => {
  assert.match(tasks, /campaign_brief_assist:\s*\{\s*promptKey:\s*'campaign_brief_assist'/);
  assert.match(tasks, /campaign_brief_assist:[^\n]+usageCredits:\s*10/);
  assert.match(migration, /aip_campaign_brief_assist_v1/);
  assert.match(migration, /'campaign_brief_assist'/);
  assert.match(migration, /human_approval_required/);
  assert.match(migration, /organization_owned_usage/);
  assert.match(migration, /must_not_modify_budget/);
  assert.match(migration, /must_not_create_campaign/);
});

test('Campaign Brief Assistant is organization-owned and matches campaign write roles', () => {
  assert.match(service, /organizationMembership\(db, auth\.user\.id, organizationId\)/);
  assert.match(service, /\['owner', 'admin', 'marketing_manager'\]\.includes\(membership\.role\)/);
  assert.match(service, /project\.status !== 'active'/);
  assert.match(service, /project\.verification_status !== 'verified_x'/);
  assert.match(service, /ownerType:\s*'organization'/);
  assert.match(service, /ownerId:\s*organizationId/);
  assert.match(service, /organizationId,/);
  assert.match(service, /taskKey:\s*'campaign_brief_assist'/);
  assert.doesNotMatch(service, /\bdb\.run\s*\(/);
  assert.doesNotMatch(service, /\bdb\.batch\s*\(/);
  assert.doesNotMatch(service, /\bdb\.exec\s*\(/);
  assert.doesNotMatch(service, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(service, /\bUPDATE\s+campaigns\b/i);
  assert.doesNotMatch(service, /\bDELETE\s+FROM\b/i);
});

test('Campaign prompt forbids fabricated commercial, performance and verification claims', () => {
  for (const term of ['budget', 'compensation', 'payment terms', 'dates', 'deadlines', 'creator availability', 'partner availability', 'guaranteed performance', 'conversions', 'outcomes', 'revenue', 'customers', 'users', 'funding', 'investors', 'partnerships', 'token claims', 'tokenomics', 'TGE', 'exchange listings', 'supported chains', 'audits', 'licenses', 'regulatory status', 'verification', 'traction']) {
    assert.ok(migration.includes(term), `missing campaign guard: ${term}`);
  }
  for (const key of ['campaignName', 'objective', 'audience', 'keyMessage', 'deliverables', 'successMetrics', 'trackingPlan', 'missingInputs']) {
    assert.ok(migration.includes(key), `missing output contract key: ${key}`);
  }
});

test('Campaign create route dispatches AI assistance without changing normal campaign creation semantics', () => {
  assert.match(campaigns, /searchParams\.get\('action'\) === 'brief-assist'/);
  assert.match(campaigns, /assistCampaignBrief\(request, env\)/);
  assert.match(campaigns, /INSERT INTO campaigns/);
  assert.match(campaigns, /'draft'/);
  assert.match(campaigns, /\['owner', 'admin', 'marketing_manager'\]\.includes\(membership\.role\)/);
});

test('Campaign assistant is draft-only and applies only name plus objective to the existing form', () => {
  assert.match(ui, /data-linkary-ai-campaign-brief-assistant/);
  assert.match(ui, /\/api\/campaigns\?action=brief-assist/);
  assert.match(ui, />Apply name \+ objective</);
  assert.match(ui, /setReactValue\(fields\.name, suggestions\.campaignName\)/);
  assert.match(ui, /setReactValue\(fields\.objective, suggestions\.objective\)/);
  assert.doesNotMatch(ui, /setReactValue\(fields\.budget/);
  assert.match(ui, /Budget, source, execution mode and campaign state were not changed/);
  assert.match(ui, /HTMLInputElement\.prototype/);
  assert.match(ui, /HTMLTextAreaElement\.prototype/);
});

test('Campaign Brief Assistant is mounted only in the Growth experience', () => {
  assert.match(app, /import CampaignBriefAssistant from '\.\/CampaignBriefAssistant'/);
  assert.match(app, /experience === 'growth'/);
  assert.match(app, /<CampaignBriefAssistant status=\{status\} \/>/);
});
