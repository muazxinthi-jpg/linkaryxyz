import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const identityRoute = readFileSync(new URL('../src/routes/profileIdentity.ts', import.meta.url), 'utf8');
const profileAi = readFileSync(new URL('../src/ai/profileImprove.ts', import.meta.url), 'utf8');
const profileUi = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0039_ai1_profile_improvement.sql', import.meta.url), 'utf8');

test('AI-1 profile improvement is explicit, CSRF-protected and does not run on profile load', () => {
  assert.match(identityRoute, /body\.action === 'ai_improve'/);
  assert.match(identityRoute, /verifyCsrf\(request, env, auth\)/);
  assert.match(profileUi, /Improve with LinkaryAI/);
  assert.match(profileUi, /onClick=\{\(\) => void improveWithAi\(\)\}/);
  const improveDefinition = profileUi.indexOf('async function improveWithAi');
  assert.ok(improveDefinition > 0, 'AI action handler should exist');
  const setupAndEffects = profileUi.slice(0, improveDefinition);
  assert.doesNotMatch(setupAndEffects, /\bimproveWithAi\(\)/);
});

test('AI-1 uses bounded Linkary evidence and never writes profile state', () => {
  assert.match(profileAi, /LIMIT 30/);
  assert.match(profileAi, /taskKey: 'profile_improve'/);
  assert.match(profileAi, /ownerType: 'user'/);
  assert.match(profileAi, /profile_blocks:\$\{blocks\.length\}/);
  assert.doesNotMatch(profileAi, /UPDATE\s+profiles/i);
  assert.doesNotMatch(profileAi, /wallet/i);
  assert.doesNotMatch(profileAi, /billing/i);
});

test('AI-1 structured output is length-bounded and human reviewed', () => {
  assert.match(profileAi, /professionalHeadline: cleanText\(row\.professionalHeadline, 140\)/);
  assert.match(profileAi, /bio: cleanText\(row\.bio, 500\)/);
  assert.match(profileAi, /seoTitle: cleanText\(row\.seoTitle, 70\)/);
  assert.match(profileAi, /seoDescription: cleanText\(row\.seoDescription, 180\)/);
  assert.match(profileUi, /Nothing is saved or published automatically/);
  assert.match(profileUi, /Use headline/);
  assert.match(profileUi, /Copy bio/);
});

test('AI-1 prompt v2 forbids invented claims and requires JSON', () => {
  assert.match(migration, /aip_profile_improve_v2/);
  assert.match(migration, /Return ONLY one valid JSON object/);
  assert.match(migration, /Never invent followers, metrics, customers, campaigns, roles, partnerships, credentials, achievements, verification, wallet ownership or outcomes/);
  assert.match(migration, /human_approval_required/);
});
