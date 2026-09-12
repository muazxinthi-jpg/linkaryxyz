import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMatchExplanation } from '../src/ai/matchExplanation';
import { AI_TASKS } from '../src/ai/tasks';

const service = readFileSync(new URL('../src/ai/matchExplanation.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/PartnerDiscoveryExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/linkaryai-contextual.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0049_linkaryai_v1_completion.sql', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/ai/runtime.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');

test('Partner Match Explanation uses the governed 10-credit task and a versioned evidence-bound prompt', () => {
  assert.equal(AI_TASKS.match_explanation.usageCredits, 10);
  assert.match(service, /taskKey:\s*'match_explanation'/);
  assert.match(service, /executeLinkaryAI\(env/);
  assert.match(migration, /aip_match_explanation_v2/);
  assert.match(migration, /no_ranking/);
  assert.match(migration, /Never rank the partner/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE/);
});

test('Partner Match Explanation requires CSRF, organization membership, and write-capable Project roles', () => {
  assert.match(service, /verifyCsrf\(request, env, auth\)/);
  assert.match(service, /organizationMembership\(db, auth\.user\.id, organizationId\)/);
  for (const role of ['owner', 'admin', 'marketing_manager']) assert.match(service, new RegExp(`'${role}'`));
  assert.doesNotMatch(service, /\['owner', 'admin', 'marketing_manager', 'analyst'/);
  assert.doesNotMatch(service, /\['owner', 'admin', 'marketing_manager', 'viewer'/);
});

test('Partner identity and relationship evidence are assembled server-side for both supported partner kinds', () => {
  for (const token of [
    "partnerKind?: RelationshipKind", "'creator'", "'community_manager'", 'profiles p', 'partner_managers m',
    'partner_manager_assets', 'loadProjectPartnerRelationship', 'relationship.activities', 'relationship.inquiries',
    'open_to_collaborations', 'telegram_verified', 'accepted_campaigns', 'representedTelegramCommunities',
    'No recorded previous Project relationship',
  ]) assert.match(service, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(service, /body\.(tracked|outcomes|revenue|audience|campaigns|verification)/);
});

test('manual and verified relationship evidence remain explicitly distinct', () => {
  assert.match(service, /outcomeEvidenceBySource/);
  assert.match(service, /Only provider_verified and telegram_verified may be called verified/);
  assert.match(service, /linkary_tracked must be called Linkary-tracked/);
  assert.match(service, /manualEvidence: 'Manual; never describe as verified'/);
  assert.match(migration, /manual remains manual/);
  assert.match(migration, /Do not infer causality/);
});

test('strict match JSON parser accepts the exact contract and rejects invalid or expanded output', () => {
  const valid = JSON.stringify({ headline: 'Relevant history', whyRelevant: ['Prior work'], evidence: [], cautions: [], nextQuestions: ['Confirm availability'] });
  assert.equal(parseMatchExplanation(valid).headline, 'Relevant history');
  assert.throws(() => parseMatchExplanation('```json\n{}\n```'), /invalid match explanation/);
  assert.throws(() => parseMatchExplanation(JSON.stringify({ headline: 'x', whyRelevant: [], evidence: [], cautions: [], nextQuestions: [], score: 99 })), /invalid match explanation/);
  assert.throws(() => parseMatchExplanation(JSON.stringify({ headline: 'x', whyRelevant: ['x'.repeat(241)], evidence: [], cautions: [], nextQuestions: [] })), /invalid match explanation/);
});

test('Partner Discovery exposes contextual LinkaryAI UX only to roles that can spend Project credits', () => {
  assert.match(ui, />Why this match\?</);
  assert.match(ui, /canManage\(project\) && <button className="linkaryai-trigger"/);
  assert.match(ui, /\/api\/ai\/partner-match-explanation/);
  assert.match(ui, /LinkaryAI is reviewing the available evidence/);
  assert.match(ui, /usage_credits_insufficient/);
  assert.match(ui, /ai_output_invalid/);
  assert.match(ui, /idempotencyKey: `match-explanation:/);
  assert.match(service, /idempotencyKey: clean\(body\.idempotencyKey\)/);
  assert.match(worker, /url\.pathname === '\/api\/ai\/partner-match-explanation'/);
  assert.doesNotMatch(ui, /result\.provider|result\.model/);
});

test('AI telemetry stays metadata-only and responsive contracts cover required device widths', () => {
  assert.doesNotMatch(runtime, /metadata_json[^\n]+(?:prompt|response|result\.text)/i);
  for (const width of [760, 430, 390, 375, 320]) assert.match(css, new RegExp(`max-width:${width}px`));
  assert.match(css, /min-height:44px/);
});
