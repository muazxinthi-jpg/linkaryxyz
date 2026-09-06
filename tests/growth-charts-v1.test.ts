import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/growthIntelligence.ts', import.meta.url), 'utf8');
const baselineRoute = readFileSync(new URL('../src/routes/growthBaseline.ts', import.meta.url), 'utf8');
const baselineMigration = readFileSync(new URL('../migrations/0034_project_growth_baselines.sql', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../frontend/src/FounderGrowthIntelligencePanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/founder-growth-intelligence.css', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../frontend/src/DashboardExperience.tsx', import.meta.url), 'utf8');

test('Growth charts aggregate Project-scoped time series without changing evidence provenance', () => {
  assert.match(route, /rangeDays = \[7, 30, 90\]/);
  assert.match(route, /tracked_link_clicks click JOIN tracked_links/);
  assert.match(route, /conversion_events WHERE organization_id/);
  assert.match(route, /trend: Array\.from\(trend\.values\(\)\)/);
});

test('Growth UI renders selectable, evidence-aware visual comparisons responsively', () => {
  for (const token of ['TRACTION TIMELINE', 'GROWTH FUNNEL', 'CHANNEL COMPARISON', 'DATA CONFIDENCE', 'Evidence composition', 'Not a verification ladder', 'Trust guardrail · not a growth KPI']) assert.match(panel, new RegExp(token));
  assert.match(panel, /role="img" aria-label="Interactive daily Linkary clicks and outcomes trend"/);
  assert.match(panel, /aria-label=\{`Evidence composition:/);
  assert.match(panel, /\[7, 30, 90\]/);
  assert.match(css, /\.fgi-chart-grid/);
  assert.match(css, /\.fgi-donut/);
});

test('Growth charts expose exact values through pointer, touch and keyboard interaction', () => {
  for (const token of ['onPointerEnter', 'onPointerDown', 'onFocus', 'fgi-chart-tooltip', 'Hover, focus or tap a day', 'Trust guardrail · not a growth KPI']) assert.match(panel, new RegExp(token));
  assert.match(panel, /className="trend-hit"/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /role="group" aria-label="Interactive daily click volume/);
  assert.match(css, /touch-action:pan-y/);
  assert.match(css, /\.fgi-momentum-bars button\.active/);
  assert.match(css, /\.fgi-channel-row:hover small/);
});

test('Growth dashboard adds richer traction context without inventing a Project popularity baseline', () => {
  for (const token of ['TRACTION TIMELINE', 'DAILY MOMENTUM', 'TRACTION BASELINE', 'Project popularity baseline is not recorded yet', 'campaign.starts_at']) assert.match(panel, new RegExp(token));
  assert.match(route, /SELECT c\.id, c\.name, c\.starts_at/);
  assert.match(css, /\.fgi-momentum-bars/);
  assert.match(css, /\.fgi-baseline-note/);
});

test('Project Overview shows an executive growth snapshot while Growth keeps diagnostic depth', () => {
  assert.match(dashboard, /FounderGrowthIntelligencePanel organizationId=\{profile\.organization_id\} variant="overview"/);
  assert.doesNotMatch(dashboard, /campaign-outcomes\?campaignId/);
  for (const token of ['PROJECT HEALTH', 'Growth snapshot', 'Open Growth →', 'TOP DRIVERS', 'BASELINE → CURRENT']) assert.match(panel, new RegExp(token));
  assert.match(panel, /if \(variant === 'overview'\)/);
  assert.match(css, /\.fgi-overview-grid/);
  assert.match(css, /\.fgi-overview-summary/);
});

test('Project traction baselines are dated, provenance-labelled and Project-scoped', () => {
  for (const token of ['project_growth_baselines', 'metric_key', 'metric_value', 'observed_at', 'provenance', 'UNIQUE (organization_id, metric_key, observed_at)']) assert.match(baselineMigration, new RegExp(token.replace(/[()]/g, '\\$&')));
  for (const token of ['organizationMembership', 'verifyCsrf', 'owner', 'admin', 'marketing_manager', 'metricValue', 'ON CONFLICT(organization_id, metric_key, observed_at)']) assert.match(baselineRoute, new RegExp(token.replace(/[()]/g, '\\$&')));
  for (const token of ['growth-baselines', 'Save observation', 'Latest dated Project traction observations', 'founder_manual']) assert.match(panel, new RegExp(token.replace(/[()]/g, '\\$&')));
});
