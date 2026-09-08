import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const identityUi = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');
const optimizationUi = readFileSync(new URL('../frontend/src/PersonalProfileOptimizationPanel.tsx', import.meta.url), 'utf8');
const optimizationCss = readFileSync(new URL('../frontend/src/profile-optimization-v1.css', import.meta.url), 'utf8');

test('Personal Profile keeps deterministic optimization beside the existing Profile Copilot', () => {
  assert.match(identityUi, /PersonalProfileOptimizationPanel/);
  assert.match(identityUi, /<PersonalProfileOptimizationPanel profileId=\{profile\.id\} publicRole=\{publicRole\} professionalHeadline=\{headline\} \/>/);
  assert.match(identityUi, /data-linkary-ai-profile-improvement/);
  assert.match(identityUi, /Improve with LinkaryAI/);
  assert.match(identityUi, /Apply all profile text/);
});

test('Profile optimization is evidence-based, free of AI scoring and totals 100 points', () => {
  assert.match(optimizationUi, /data-profile-optimization/);
  assert.match(optimizationUi, /deterministic, not AI-generated/);
  assert.match(optimizationUi, /\/api\/profiles\/\$\{encodeURIComponent\(profileId\)\}/);
  assert.match(optimizationUi, /\/api\/profiles\/\$\{encodeURIComponent\(profileId\)\}\/blocks/);
  assert.doesNotMatch(optimizationUi, /ai_improve|profile-improve:|Usage Credits|LinkaryAI\.run|\/ai\//);

  const pointMatches = [...optimizationUi.matchAll(/points:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pointMatches.reduce((sum, points) => sum + points, 0), 100);
});

test('Profile optimization covers the accepted Personal Profile quality signals', () => {
  for (const signal of [
    'Public identity',
    'Professional headline',
    'Profile bio',
    'Profile image',
    'SEO title',
    'SEO description',
    'Connected social',
    'X presence',
    'Featured work',
    'Project or community proof',
    'Profile depth',
  ]) assert.equal(optimizationUi.includes(signal), true, `missing optimization signal: ${signal}`);

  assert.match(optimizationUi, /Next best improvements/);
  assert.match(optimizationUi, /presentation completeness only/);
  assert.match(optimizationUi, /never changes verification, reputation, permissions, campaign evidence or referral status/);
});

test('Profile optimization remains responsive and visible', () => {
  assert.match(optimizationCss, /\.profile-optimization-v1\{/);
  assert.match(optimizationCss, /@media\(max-width:700px\)/);
  assert.match(optimizationCss, /@media\(prefers-reduced-motion:reduce\)/);
});
