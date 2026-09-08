import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileUi = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');

test('Profile Copilot requires explicit approval before applying AI profile text', () => {
  assert.match(profileUi, /Profile Copilot/);
  assert.match(profileUi, /Apply all profile text/);
  assert.match(profileUi, /window\.confirm\(/);
  assert.match(profileUi, /approved changes can become visible immediately/);
});

test('Profile Copilot applies only normal editable profile text and identity fields', () => {
  assert.match(profileUi, /professionalHeadline: aiSuggestions\.professionalHeadline \|\| headline/);
  assert.match(profileUi, /bio: aiSuggestions\.bio \?\? existing\.bio/);
  assert.match(profileUi, /seoTitle: aiSuggestions\.seoTitle \?\? existing\.seoTitle/);
  assert.match(profileUi, /seoDescription: aiSuggestions\.seoDescription \?\? existing\.seoDescription/);
  assert.match(profileUi, /displayName: existing\.displayName/);
  assert.match(profileUi, /avatarUrl: existing\.avatarUrl \|\| ''/);
  assert.doesNotMatch(profileUi, /verificationStatus\s*:/);
  assert.doesNotMatch(profileUi, /wallet/i);
  assert.doesNotMatch(profileUi, /billing/i);
});

test('Profile Copilot remains user-triggered and never applies from an effect', () => {
  const applyStart = profileUi.indexOf('async function applyAllAiText');
  assert.ok(applyStart > -1);
  const effectsOnly = profileUi.slice(0, applyStart);
  assert.doesNotMatch(effectsOnly, /applyAllAiText\(/);
  assert.match(profileUi, /onClick=\{\(\) => void applyAllAiText\(\)\}/);
});
