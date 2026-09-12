import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseGrowthSummary } from '../src/ai/growthSummary';
import { AI_TASKS } from '../src/ai/tasks';

const service = readFileSync(new URL('../src/ai/growthSummary.ts', import.meta.url), 'utf8');
const growthRoute = readFileSync(new URL('../src/routes/growthIntelligence.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0049_linkaryai_v1_completion.sql', import.meta.url), 'utf8');

test('Growth Summary uses the governed 15-credit task and new prompt version', () => {
  assert.equal(AI_TASKS.growth_summary.usageCredits, 15);
  assert.match(service, /taskKey:\s*'growth_summary'/);
  assert.match(service, /executeLinkaryAI\(env/);
  assert.match(migration, /aip_growth_summary_v2/);
  assert.match(migration, /metrics_are_authoritative/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE/);
});

test('Growth Summary requires CSRF and only write-capable Project roles can spend credits', () => {
  assert.match(service, /verifyCsrf\(request, env, auth\)/);
  assert.match(service, /organizationMembership\(db, auth\.user\.id, organizationId\)/);
  for (const role of ['owner', 'admin', 'marketing_manager']) assert.match(service, new RegExp(`'${role}'`));
  assert.match(growthRoute, /can_generate_ai:\s*\['owner', 'admin', 'marketing_manager'\]\.includes\(membership\.role\)/);
});

test('7, 30, and 90 day summaries reuse the same authoritative Growth Intelligence engine', () => {
  assert.match(service, /!\[7, 30, 90\]\.includes\(range\)/);
  assert.match(growthRoute, /export async function loadGrowthIntelligenceData/);
  assert.match(service, /loadGrowthIntelligenceData\(db, organizationId, range\)/);
  assert.match(growthRoute, /founderGrowthIntelligence[\s\S]+loadGrowthIntelligenceData\(db, organizationId, requestedDays\)/);
  assert.doesNotMatch(service, /body\.(summary|campaigns|activities|partners|metrics|trackedClicks|outcomes)/);
});

test('Growth AI evidence preserves nulls, confidence mix, baselines, and partner provenance', () => {
  for (const token of ['summary: intelligence.summary', 'partnerAttributionProvenance', 'growthBaselines', 'nullMeansUnavailable', 'manualIsNotVerified', 'estimatedMustRemainEstimated']) assert.match(service, new RegExp(token));
  for (const token of ['link_creation', 'legacy_backfill', 'current_fallback', 'Null means unavailable']) assert.match(migration, new RegExp(token));
  assert.match(service, /ai_evidence_insufficient/);
});

test('strict Growth Summary JSON parser rejects malformed, extra, and overlong output', () => {
  const valid = JSON.stringify({ executiveSummary: 'Recorded growth was mixed.', whatWorked: [], needsAttention: [], evidenceQuality: ['Tracked clicks are first-party.'], nextActions: [], dataGaps: [] });
  assert.equal(parseGrowthSummary(valid).evidenceQuality.length, 1);
  assert.throws(() => parseGrowthSummary('{}'), /invalid growth summary/);
  assert.throws(() => parseGrowthSummary(JSON.stringify({ ...JSON.parse(valid), score: 1 })), /invalid growth summary/);
  assert.throws(() => parseGrowthSummary(JSON.stringify({ ...JSON.parse(valid), executiveSummary: 'x'.repeat(501) })), /invalid growth summary/);
});

test('Growth Summary is explicit-only and its UI states the selected-trend versus current-aggregate scope', () => {
  assert.match(ui, /'Generate AI summary'/);
  assert.match(ui, /\/api\/ai\/growth-summary/);
  assert.match(ui, /onClick=\{\(\) => void generateAiSummary\(\)\}/);
  assert.equal((ui.match(/\/api\/ai\/growth-summary/g) || []).length, 1);
  assert.doesNotMatch(ui, /setInterval|setTimeout/);
  assert.match(ui, /data\.permissions\.can_generate_ai/);
  assert.match(ui, /idempotencyKey: `growth-summary:/);
  assert.match(ui, /body: JSON\.stringify\(\{ organizationId, range,/);
  assert.match(ui, /LINKARYAI · AI SUMMARY · 15 USAGE CREDITS/);
  assert.doesNotMatch(ui, /\{range\}-DAY EVIDENCE/);
  assert.match(ui, /Uses the selected \{range\}-day trend together with current Growth Intelligence aggregates and comparison evidence/);
  assert.match(service, /idempotencyKey: clean\(body\.idempotencyKey\)/);
});

test('customer response and UI do not expose AI vendor details', () => {
  assert.match(service, /ai: \{ eventId: result\.eventId, promptVersion: result\.promptVersion, usageCredits: result\.usageCredits \}/);
  assert.doesNotMatch(service, /provider: result\.provider|model: result\.model/);
  assert.doesNotMatch(ui, /\.provider|\.model/);
});
