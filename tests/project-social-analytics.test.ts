import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../frontend/src/AnalyticsExperience.tsx');
const profiles = read('../src/routes/profiles.ts');
const styles = read('../frontend/src/analytics.css');

test('Project Social connections renders its dedicated panels while Creator Social analytics remains unchanged', () => {
  assert.match(page, /profile\.profile_type === 'project'\s*\?\s*<ProjectSocialAnalytics/);
  assert.match(page, /:\s*<SocialAnalytics profiles=\{analytics\?\.socialProfiles\}/);
  for (const label of ['Social connections', 'X audience growth', 'Audience & socials', 'Channel performance', 'Recent public posts', 'Social activity', 'Data readiness']) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(page, /Current followers start from a zero tracking baseline; zero is not historical data/);
  assert.match(page, /not a historical count/);
  assert.doesNotMatch(page, /TwitterAPI\.io|TwitterAPI|OAuth/i);
  assert.doesNotMatch(page.match(/function ProjectSocialAnalytics[\s\S]*?\n}/)?.[0] || '', /\bAPI\b|OAuth|TwitterAPI/i);
});

test('Project social metrics use dated profile-scoped snapshots and retain real per-post counters', () => {
  assert.match(profiles, /WHERE profile_id = \? AND snapshot_date >= date\('now', '-365 day'\)/);
  assert.match(profiles, /socialAudienceSnapshots:\s*socialSnapshotRows[\s\S]*?row\.snapshot_date[\s\S]*?row\.audience/);
  for (const key of ['likes', 'reposts', 'replies', 'quotes', 'bookmarks']) {
    assert.match(profiles, new RegExp(`${key}: typeof post\\.${key} === 'number'`));
  }
  assert.match(page, /metricValue\('recent_post_views'/);
  assert.match(page, /metricValue\('public_engagements'/);
  assert.match(page, /metricValue\('bookmarks'/);
  assert.match(page, /Profile link clicks/);
  assert.match(styles, /\.analytics-project-social-pair\s*\{[^}]*display:grid/);
  assert.match(styles, /\.analytics-project-social-lower\s*\{[^}]*grid-template-columns/);
});

