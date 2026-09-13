import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');

test('founder social funnel shows the full measured path from reach to outcomes', () => {
  assert.match(ui, /Reported views/);
  assert.match(ui, /Social engagements/);
  assert.match(ui, /Linkary clicks/);
  assert.match(ui, /Estimated unique visitors/);
  assert.match(ui, /Outcomes/);
  assert.match(ui, /ATTRIBUTED VALUE/);
});

test('social funnel keeps unavailable unique visitor evidence explicit', () => {
  assert.match(ui, /value\.estimated_unique_clicks === null/);
  assert.match(ui, /N\/A/);
  assert.match(ui, /privacy-conscious visitor hashes/);
});

test('campaign and activity comparison exposes social and first-party stages together', () => {
  assert.match(ui, /ENGAGEMENTS/);
  assert.match(ui, /ENG\. RATE/);
  assert.match(ui, /UNIQUE VISITORS/);
  assert.match(ui, /CONVERSION/);
  assert.match(ui, /ATTRIBUTED VALUE/);
});

test('funnel labels reported social evidence separately from Linkary first-party evidence', () => {
  assert.match(ui, /Reported social metrics can be manual or provider-verified/);
  assert.match(ui, /Linkary clicks and estimated unique visitors are first-party/);
  assert.match(ui, /does not treat engagement actions as unique people/);
});
