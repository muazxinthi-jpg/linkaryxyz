import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/activityMeasurement.ts', import.meta.url), 'utf8');
const env = readFileSync(new URL('../src/env.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/ActivityMeasurementPanel.tsx', import.meta.url), 'utf8');

test('X provider sync stays server-side and exact-deliverable scoped', () => {
  assert.match(env, /TWITTERAPI_IO_KEY\?: string/);
  assert.match(route, /https:\/\/api\.twitterapi\.io\/twitter\/tweets/);
  assert.match(route, /endpoint\.searchParams\.set\('tweet_ids', tweetId\)/);
  assert.match(route, /'X-API-Key': env\.TWITTERAPI_IO_KEY/);
  assert.doesNotMatch(ui, /TWITTERAPI_IO_KEY/);
});

test('X sync only accepts direct status URLs and does not scan accounts or social graphs', () => {
  assert.match(route, /\['x\.com', 'twitter\.com', 'mobile\.twitter\.com'\]/);
  assert.match(route, /\/status\\\/\(\\d\+\)/);
  assert.doesNotMatch(route, /advanced_search|last_tweets|followers|following/);
});

test('public X metrics map into the existing measurement vocabulary as provider verified', () => {
  assert.match(route, /views: providerMetric\(tweet\.viewCount\)/);
  assert.match(route, /likes: providerMetric\(tweet\.likeCount\)/);
  assert.match(route, /comments: providerMetric\(tweet\.replyCount\)/);
  assert.match(route, /reposts: providerMetric\(tweet\.retweetCount\)/);
  assert.match(route, /quotes: providerMetric\(tweet\.quoteCount\)/);
  assert.match(route, /bookmarks: providerMetric\(tweet\.bookmarkCount\)/);
  assert.match(route, /'provider_verified'/);
  assert.match(route, /ON CONFLICT\(deliverable_id, metric_key, provenance\) DO UPDATE SET/);
});

test('provider outages and missing configuration do not block evidence submission', () => {
  assert.match(route, /status: 'not_configured'/);
  assert.match(route, /status: 'failed'/);
  assert.match(route, /return json\(\{ id: deliverableId, evidenceState: 'submitted', providerSync \}/);
});

test('X metrics refresh on submission and again when Project accepts the deliverable', () => {
  const syncCalls = route.match(/syncXProviderMetrics\(/g) || [];
  assert.ok(syncCalls.length >= 3, 'expected provider sync helper plus submission and review calls');
  assert.match(route, /evidenceState === 'accepted' \? await syncXProviderMetrics/);
});
