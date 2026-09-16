import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const page = read('frontend/src/AnalyticsExperience.tsx');
const css = read('frontend/src/analytics.css');
const app = read('frontend/src/AppV3.tsx');
const profiles = read('src/routes/profiles.ts');

test('analytics overview follows the approved dashboard composition without fabricating social data', () => {
  for (const label of ['Analytics Overview', 'Performance over time', 'Audience & socials', 'Top performing content', 'Onchain & auction activity', 'Top campaigns & partners']) assert.match(page, new RegExp(label));
  assert.match(page, /X data/);
  assert.match(page, /Awaiting provider snapshot/);
  assert.doesNotMatch(page, /TwitterAPI\.io/i);
  assert.match(page, /monthlyProfileViews/);
  assert.match(page, /monthlyClicks/);
  assert.match(page, /Social APIs not connected/);
  assert.match(page, /socialSources/);
  assert.match(page, /socialProfiles/);
  for (const platform of ['X data', 'Telegram', 'YouTube', 'Instagram', 'TikTok', 'LinkedIn']) assert.match(page, new RegExp(platform));
  for (const metric of ['Audience', 'Impressions', 'Engagements', 'Link clicks']) assert.match(page, new RegExp(metric));
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
  assert.match(css, /analytics-metric-link/);
  assert.match(css, /@media\s*\(max-width:720px\)/);
});
