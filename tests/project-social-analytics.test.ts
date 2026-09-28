import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../frontend/src/AnalyticsExperience.tsx');
const profiles = read('../src/routes/profiles.ts');
const styles = read('../frontend/src/analytics.css');

test('Creator and Project use the same approved social panel and chart presentation', () => {
  assert.match(page, /const ProjectSocialAnalytics = SocialAnalytics/);
  assert.match(page, /ProjectSocialAnalytics profiles=\{analytics\?\.socialProfiles\} sources=\{analytics\?\.socialSources\} snapshots=\{analytics\?\.socialAudienceSnapshots\} content=\{analytics\?\.socialContent\}/);
  assert.match(page, /: <SocialAnalytics profiles=\{analytics\?\.socialProfiles\} sources=\{analytics\?\.socialSources\} snapshots=\{analytics\?\.socialAudienceSnapshots\} content=\{analytics\?\.socialContent\}/);
  assert.doesNotMatch(page, /SocialAnalytics[^>]*audience=\{analytics\?\.monthlySocialAudience\}|SocialAnalytics[^>]*impressions=\{analytics\?\.monthlySocialImpressions\}/);
  for (const panel of ['Social growth', 'Audience & socials', 'Channel performance', 'Recent social content', 'Social activity', 'Data readiness']) assert.ok(page.includes(panel), `shared panel includes ${panel}`);
  assert.match(page, /analytics-audience-compact/);
  assert.doesNotMatch(page, /TwitterAPI\.io|TwitterAPI|OAuth/i);
});

test('Social panel maps the current X profile payload and sampled public post counters', () => {
  for (const key of ['recent_post_views', 'public_engagements', 'posts_sampled', 'likes', 'reposts', 'replies', 'quotes', 'bookmarks', 'linkary_clicks']) {
    assert.match(page, new RegExp(key));
  }
  assert.match(page, /snapshots\?: SocialAudienceSnapshot\[\]/);
  assert.match(page, /socialProfiles\?: SocialProfile\[\][\s\S]*?socialContent\?: SocialContentItem\[\]/);
  assert.match(profiles, /views: typeof post\.views === 'number'[\s\S]*?likes: typeof post\.likes === 'number'[\s\S]*?bookmarks: typeof post\.bookmarks === 'number'/);
  assert.match(page, /const xMetrics = xProfile\?\.metrics \|\| \{\}/);
  assert.match(page, /metric\('recent_post_views', xProfile\?\.impressions\)/);
  assert.match(page, /metric\('public_engagements', xProfile\?\.engagements\)/);
  assert.match(page, /metric\('linkary_clicks', xProfile\?\.clicks\)/);
  assert.match(page, /type SocialAudienceSnapshot = \{ date: string; followers: number \}/);
});

test('follower trend is interactive and truthfully draws a single snapshot from a zero tracking baseline', () => {
  assert.match(page, /function ProjectFollowerChart/);
  assert.match(page, /const baselineOnly = points\.length === 1/);
  assert.match(page, /followers: 0, x: left, y: yFor\(0\), baseline: true/);
  assert.match(page, /Current followers start from a zero tracking baseline; zero is not historical data/);
  assert.match(page, /onPointerEnter=\{\(\) => setActive\(index\)\}/);
  assert.match(page, /onFocus=\{\(\) => setActive\(index\)\}/);
  assert.match(page, /role="button" aria-label=\{point\.baseline \? 'Tracking baseline: 0 followers, not historical data'/);
  assert.match(styles, /\.analytics-social-growth-chart \.analytics-view-line/);
});

test('Project social snapshots remain profile-scoped in the existing backend contract', () => {
  assert.match(profiles, /WHERE profile_id = \? AND snapshot_date >= date\('now', '-365 day'\)/);
  assert.match(profiles, /socialAudienceSnapshots:\s*socialSnapshotRows[\s\S]*?row\.snapshot_date[\s\S]*?row\.audience/);
  assert.match(profiles, /socialProfiles[\s\S]*?metrics: xMetrics[\s\S]*?socialContent/);
  assert.match(profiles, /refreshXPublicSnapshot\(db, env, profile\)/);
});
