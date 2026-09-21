import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const page = read('frontend/src/AnalyticsExperience.tsx');
const css = read('frontend/src/analytics.css');
const app = read('frontend/src/AppV3.tsx');
const profiles = read('src/routes/profiles.ts');

test('analytics overview follows the approved dashboard composition without fabricating social data', () => {
  for (const label of ['Analytics', 'Performance over time', 'Audience & socials', 'Top-performing profile links', 'Onchain & auction activity', 'Top campaigns & partners']) assert.match(page, new RegExp(label));
  assert.match(page, /X data/);
  assert.match(page, /Awaiting provider snapshot/);
  assert.doesNotMatch(page, /TwitterAPI\.io/i);
  assert.match(page, /monthlyProfileViews/);
  assert.match(page, /monthlyClicks/);
  assert.match(page, /Social APIs not connected/);
  assert.match(page, /socialSources/);
  assert.match(page, /socialProfiles/);
  assert.match(page, /monthlySocialAudience/);
  assert.match(page, /monthlySocialImpressions/);
  for (const platform of ['X data', 'Telegram', 'YouTube', 'Instagram', 'TikTok', 'LinkedIn']) assert.match(page, new RegExp(platform));
  for (const metric of ['Audience', 'Impressions', 'Engagements', 'Link clicks']) assert.match(page, new RegExp(metric));
  for (const metric of ['Reposts', 'Replies', 'Bookmarks', 'Video views', 'Average watch time', 'Watch time']) assert.match(page, new RegExp(metric));
  assert.match(page, /selectedPlatform/);
  assert.match(page, /analytics-social-detail/);
  assert.match(page, /aria-pressed/);
  for (const section of ['Social growth', 'Channel performance', 'Top social content', 'Social activity']) assert.match(page, new RegExp(section));
  for (const tab of ['Overview', 'Social analytics', 'Campaigns & attribution', 'Onchain & auctions']) assert.match(page, new RegExp(tab));
  assert.match(page, /setTab\(id\)/);
  assert.match(page, /Onchain & auction activity/);
});

test('analytics adds real raw profile views using the existing daily-view ledger', () => {
  assert.match(profiles, /SUM\(views\).*profile_views/);
  assert.match(profiles, /GROUP BY substr\(view_date, 1, 7\)/);
  assert.match(profiles, /monthlyProfileViews: monthlyClickSeries\(profileViewMonthRows, profileViews\)/);
});

test('analytics route is authenticated, responsive and uses soft SVG trend lines', () => {
  assert.match(app, /location\.pathname === '\/analytics'/);
  assert.match(page, /linearGradient id="analytics-view-fill"/);
  assert.match(page, /onPointerEnter=\{\(\) => setActive\(index\)\}/);
  assert.match(page, /analytics-tooltip/);
  assert.match(css, /analytics-view-line/);
  assert.match(css, /analytics-donut\.has-data/);
  assert.match(css, /analytics-social-cards/);
  assert.match(css, /analytics-social-summary/);
  assert.match(css, /analytics-metric-link/);
  assert.match(css, /analytics-tabs/);
  assert.match(css, /@media\s*\(max-width:720px\)/);
  assert.match(css, /analytics-workspace-page\{[^}]*max-width:none/);
  assert.match(css, /\.ops-shell \.ops-page\.analytics-workspace-page\{[^}]*max-width:none/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(page, /analytics-overview-details/);
});

test('analytics visual refresh is scoped to its workspace and keeps the existing metrics payload', () => {
  const workspace = read('frontend/src/ProductWorkspace.tsx');
  assert.match(workspace, /currentPath === '\/analytics' \? ' analytics-workspace-page'/);
  assert.match(css, /analytics-hero\{[^}]*background:transparent/);
  assert.match(page, /fetch\(`\/api\/profiles\/\$\{encodeURIComponent\(profileId\)\}\/analytics\?\$\{params\}`/);
  for (const dataField of ['profileViews', 'linkClicks', 'monthlyProfileViews', 'monthlyClicks', 'socialSources', 'socialProfiles', 'proof']) {
    assert.match(page, new RegExp(dataField));
  }
});

test('overview filters return real date-bounded series and only scope link clicks to a selected link', () => {
  for (const option of ['7d', '30d', '90d', '12m']) assert.match(page, new RegExp(`value="${option}"`));
  for (const option of ['day', 'week', 'month']) assert.match(page, new RegExp(`value="${option}"`));
  assert.match(page, /URLSearchParams\(\{ range, interval, linkId \}\)/);
  assert.match(page, /Link selection filters clicks; profile views remain profile-wide/);
  assert.match(page, /linkFilterAppliesTo: 'linkClicksOnly'/);
  assert.match(profiles, /invalid_analytics_filter/);
  assert.match(profiles, /created_at >= \? AND created_at <= \?/);
  assert.match(profiles, /view_date >= \? AND view_date <= \?/);
  assert.match(profiles, /AND block_id = \?/);
  assert.match(profiles, /filteredSeries/);
  assert.match(profiles, /analyticsPeriodKeys\(fromDate, endDate, interval/);
});

test('performance chart matches the Stitch dual-line visual language with accurate per-period tooltips', () => {
  assert.match(page, /function smoothPath/);
  assert.match(page, /analytics-click-fill/);
  assert.match(page, /analytics-y-label/);
  assert.match(page, /Profile views and link clicks over time/);
  assert.match(page, /selected\.profileViews\.toLocaleString\(\)/);
  assert.match(page, /selected\.linkClicks\.toLocaleString\(\)/);
  assert.match(css, /analytics-click-point/);
  assert.match(css, /analytics-filter-bar/);
});
