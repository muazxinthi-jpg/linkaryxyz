import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/growthIntelligence.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/founder-growth-intelligence.css', import.meta.url), 'utf8');

test('Growth charts aggregate Project-scoped time series without changing evidence provenance', () => {
  assert.match(route, /rangeDays = \[7, 30, 90\]/);
  assert.match(route, /tracked_link_clicks click JOIN tracked_links/);
  assert.match(route, /conversion_events WHERE organization_id/);
  assert.match(route, /trend: Array\.from\(trend\.values\(\)\)/);
});

test('Growth UI renders selectable, evidence-aware visual comparisons responsively', () => {
  for (const token of ['TRACTION TIMELINE', 'GROWTH FUNNEL', 'CHANNEL COMPARISON', 'EVIDENCE COMPOSITION', 'Not a verification ladder', 'Signal provenance, not quality ranking']) assert.match(panel, new RegExp(token));
  assert.match(panel, /role="img" aria-label="Daily Linkary clicks and outcomes trend"/);
  assert.match(panel, /aria-label=\{`Evidence composition:/);
  assert.match(panel, /\[7, 30, 90\]/);
  assert.match(css, /\.fgi-chart-grid/);
  assert.match(css, /\.fgi-donut/);
});

test('Growth dashboard adds richer traction context without inventing a Project popularity baseline', () => {
  for (const token of ['TRACTION TIMELINE', 'DAILY MOMENTUM', 'TRACTION BASELINE', 'Project popularity baseline is not recorded yet', 'campaign.starts_at']) assert.match(panel, new RegExp(token));
  assert.match(route, /SELECT c\.id, c\.name, c\.starts_at/);
  assert.match(css, /\.fgi-momentum-bars/);
  assert.match(css, /\.fgi-baseline-note/);
});
