import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('../frontend/src/DashboardExperience.tsx', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('../frontend/src/dashboard-next.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../frontend/src/AnalyticsExperience.tsx', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');

test('creator Overview uses only Linkary-backed counts and selected profile identity', () => {
  assert.match(dashboard, /profileAnalytics\?\.profileViews/);
  assert.match(dashboard, /profileAnalytics\?\.linkClicks/);
  assert.match(dashboard, /balance\?\.available_credits/);
  assert.match(dashboard, /profile\.avatar_url/);
  assert.match(dashboard, /platformClicks\.slice\(0, 5\)/);
  assert.doesNotMatch(dashboard, /14,820|24,110|85% Complete/);
});

test('creator Overview preserves access to the existing invite tree without drawing a replacement map', () => {
  assert.match(dashboard, /className="overview-next-map-link" to="\/invites"/);
  assert.match(dashboard, /View your invite tree and connections/);
  assert.doesNotMatch(dashboard, /overview-next-map[^\n]*<svg[^>]*className="network-map/);
});

test('Overview fills available width and collapses its panels for tablet and mobile', () => {
  assert.match(dashboardCss, /\.overview-next-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(dashboardCss, /@media\(max-width:1100px\)\{\.overview-next-kpis\{grid-template-columns:repeat\(2/);
  assert.match(dashboardCss, /@media\(max-width:760px\)\{\.overview-next-grid,.overview-next-bottom\{grid-template-columns:1fr\}/);
  assert.match(dashboardCss, /@media\(max-width:520px\)\{\.overview-next-kpis\{gap:9px\}/);
});

test('Bids navigation uses a gavel icon and onboarding returns the selected profile avatar', () => {
  assert.match(shell, /Bids: 'M8 7 13 2l7 7-5 5-7-7z M10 9 3 16/);
  assert.match(onboarding, /display_name, avatar_url, bio/);
  assert.match(onboarding, /SELECT id, profile_type, username, display_name, avatar_url,/);
});

test('Overview and Analytics replace the marked chain/people glyphs with clearer click and engagement icons', () => {
  assert.match(dashboard, /<span>LINK CLICKS<\/span><strong>\{profileAnalytics\?\.linkClicks/);
  assert.match(dashboard, /M6 3v14l4-4 3\.5 7/);
  assert.match(analytics, /link: 'M6 3v14l4-4 3\.5 7/);
  assert.match(analytics, /users: 'M12 20s-7\.5-4\.6-9\.2-8\.6/);
});

test('Overview page width and shell match Analytics full-workspace sizing', () => {
  assert.match(shell, /currentPath === '\/' \|\| currentPath === '\/dashboard' \? ' dashboard-workspace-page'/);
  assert.match(dashboardCss, /\.ops-shell \.ops-page\.dashboard-workspace-page\{box-sizing:border-box;width:100%;max-width:none/);
  assert.match(dashboardCss, /min-height:calc\(100dvh - 64px\);margin:0;padding:30px clamp\(24px,3vw,54px\) 72px/);
  assert.match(dashboardCss, /@media\(max-width:720px\)\{\.ops-shell \.ops-page\.dashboard-workspace-page/);
  assert.match(dashboardCss, /@media\(max-width:480px\)\{\.ops-shell \.ops-page\.dashboard-workspace-page/);
});
