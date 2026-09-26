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
});

test('Social analytics keeps the matching interactive chart while empty provider history stays explicit', () => {
  assert.match(page, /SocialGrowthChart snapshots=\{audienceSnapshots\}/);
  assert.match(page, /No follower history in this 7-day window/);
  assert.match(page, /onPointerEnter=\{\(\) => setActive\(index\)\}/);
  assert.doesNotMatch(page, /loadAnalytics\(profile\.id, range, interval, linkId, tab === 'social'\)/);
  assert.doesNotMatch(page, /twitterapi\.io/i);
});

test('filtered analytics series uses only existing Linkary click and profile-view ledgers', () => {
  assert.match(profiles, /analyticsPeriodKeys/);
  assert.match(profiles, /FROM profile_engagement_events/);
  assert.match(profiles, /FROM public_profile_daily_views/);
  assert.match(profiles, /Unsupported analytics date range/);
  assert.match(profiles, /Unsupported analytics interval/);
  assert.doesNotMatch(profiles, /x_profile_metric_snapshots|social_post_metric_snapshots|social_metrics_refresh_state/);
});
