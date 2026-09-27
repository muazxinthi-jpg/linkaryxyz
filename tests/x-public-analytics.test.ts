import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeXPublicMetrics } from '../src/analytics/xPublicMetrics';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('normalizes current public X profile and sampled post metrics without inventing values', () => {
  const posts = Array.from({ length: 12 }, (_, index) => ({
    createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    viewCount: index === 0 ? undefined : index * 100,
    likeCount: 2,
    retweetCount: 1,
    replyCount: 3,
    quoteCount: 0,
    bookmarkCount: 4,
  }));
  const snapshot = summarizeXPublicMetrics({ data: { followers: 13007 } }, { tweets: posts });

  assert.ok(snapshot);
  assert.equal(snapshot.audience, 13007);
  assert.equal(snapshot.posts.length, 10);
  assert.equal(snapshot.posts[0].views, null);
  assert.equal(snapshot.impressions, 4500);
  assert.equal(snapshot.engagements, 60);
  assert.equal(snapshot.metrics.likes, 20);
  assert.equal(snapshot.metrics.reposts, 10);
  assert.equal(snapshot.metrics.replies, 30);
  assert.equal(snapshot.metrics.quotes, 0);
  assert.equal(snapshot.metrics.bookmarks, 40);
  assert.equal('recent_post_views' in snapshot.metrics, true);
});

test('does not normalize an absent or invalid public audience as zero', () => {
  assert.equal(summarizeXPublicMetrics({ data: {} }, { tweets: [] }), null);
  assert.equal(summarizeXPublicMetrics({ data: { followers: -4 } }, { tweets: [] }), null);
});

test('analytics response reads profile-scoped X snapshots and exposes social metrics to the existing UI', () => {
  const route = read('../src/routes/profiles.ts');
  const page = read('../frontend/src/AnalyticsExperience.tsx');
  const refresh = route.match(/async function refreshXPublicSnapshot[\s\S]*?\n}/)?.[0] || '';
  const identityResolver = route.match(/async function linkedXIdentityForProfile[\s\S]*?\n}/)?.[0] || '';

  assert.match(route, /WHERE profile_id = \? AND snapshot_date >= date\('now', '-365 day'\)/);
  assert.match(identityResolver, /profile\.primary_platform_identity_id/);
  assert.match(identityResolver, /FROM platform_identity_links pil/);
  assert.match(identityResolver, /JOIN platform_identities pi ON pi\.id = pil\.platform_identity_id/);
  assert.match(identityResolver, /pil\.profile_id = \?/);
  assert.match(identityResolver, /pil\.link_type IN \('owns', 'represents'\)/);
  assert.match(identityResolver, /pil\.organization_id = \?/);
  assert.match(identityResolver, /pi\.platform = 'x'/);
  assert.match(refresh, /linkedXIdentityForProfile\(db, profile\)/);
  assert.match(refresh, /hasPosts \|\| \(Number\.isFinite\(capturedAt\) && Date\.now\(\) - capturedAt < retryAfterMs\)/);
  assert.doesNotMatch(refresh, /ownership_verified_at/);
  assert.match(route, /socialProfiles,/);
  assert.match(route, /socialSources: latestX\?\.audience != null/);
  assert.match(route, /monthlySocialAudience: monthlySocialSeries/);
  assert.match(route, /socialContent,/);
  assert.match(page, /legendLabels=\{\['X followers', 'Recent post views'\]\}/);
  assert.match(page, /Public engagements/);
  assert.match(page, /X deep analytics/);
  assert.doesNotMatch(page, /TwitterAPI\.io|TwitterAPI|OAuth/i);
});

