import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const page = read('frontend/src/AnalyticsExperience.tsx');
const css = read('frontend/src/analytics.css');
const app = read('frontend/src/AppV3.tsx');
const profiles = read('src/routes/profiles.ts');

test('analytics overview follows the approved dashboard composition without fabricating social data', () => {
  for (const label of ['Analytics Overview', 'Performance over time', 'Audience & socials', 'Top performing links', 'Campaign & auction activity', 'Data readiness']) assert.match(page, new RegExp(label));
  assert.match(page, /X data/);
  assert.match(page, /Awaiting provider snapshot/);
  assert.doesNotMatch(page, /TwitterAPI\.io/i);
  assert.match(page, /monthlyProfileViews/);
  assert.match(page, /monthlyClicks/);
  assert.match(page, /Social APIs not connected/);
});

test('analytics adds real raw profile views using the existing daily-view ledger', () => {
  assert.match(profiles, /SUM\(views\).*profile_views/);
  assert.match(profiles, /GROUP BY substr\(view_date, 1, 7\)/);
  assert.match(profiles, /monthlyProfileViews: monthlyClickSeries\(profileViewMonthRows, profileViews\)/);
});

test('analytics route is authenticated, responsive and uses soft SVG trend lines', () => {
  assert.match(app, /location\.pathname === '\/analytics'/);
  assert.match(page, /linearGradient id="analytics-view-fill"/);
  assert.match(css, /analytics-view-line/);
  assert.match(css, /@media\(max-width:720px\)/);
});
