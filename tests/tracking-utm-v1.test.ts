import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildTrackedDestination } from '../src/trackingUtm';

const creatorContext = {
  campaignName: 'EMYA TGE Growth',
  activityTitle: 'Creator launch post',
  activityType: 'creator_content',
  assignmentKind: 'creator' as const,
  partnerHandle: '@MuazXinthi',
  partnerName: 'Muaz',
};

test('creator tracking appends deterministic Linkary UTMs without removing destination query params', () => {
  const result = buildTrackedDestination('https://example.com/signup?ref=partner', creatorContext);
  const url = new URL(result.effectiveDestinationUrl);

  assert.equal(url.searchParams.get('ref'), 'partner');
  assert.equal(url.searchParams.get('utm_source'), 'x');
  assert.equal(url.searchParams.get('utm_medium'), 'creator');
  assert.equal(url.searchParams.get('utm_campaign'), 'emya_tge_growth');
  assert.equal(url.searchParams.get('utm_content'), 'muazxinthi');
  assert.deepEqual(result.utm, {
    source: 'x',
    medium: 'creator',
    campaign: 'emya_tge_growth',
    content: 'muazxinthi',
  });
});

test('Telegram Community tracking uses telegram/community provenance', () => {
  const result = buildTrackedDestination('https://example.com/', {
    campaignName: 'Community Push',
    activityTitle: 'Telegram placement',
    activityType: 'community_placement',
    assignmentKind: 'community',
    partnerHandle: '@AkariClub',
    partnerName: 'AKARI Club',
  });
  const url = new URL(result.effectiveDestinationUrl);

  assert.equal(url.searchParams.get('utm_source'), 'telegram');
  assert.equal(url.searchParams.get('utm_medium'), 'community');
  assert.equal(url.searchParams.get('utm_campaign'), 'community_push');
  assert.equal(url.searchParams.get('utm_content'), 'akariclub');
});

test('existing founder UTMs are preserved instead of silently overwritten', () => {
  const result = buildTrackedDestination(
    'https://example.com/?utm_source=partner&utm_medium=paid&utm_campaign=existing&utm_content=creative_a',
    creatorContext,
  );
  const url = new URL(result.effectiveDestinationUrl);

  assert.equal(url.searchParams.get('utm_source'), 'partner');
  assert.equal(url.searchParams.get('utm_medium'), 'paid');
  assert.equal(url.searchParams.get('utm_campaign'), 'existing');
  assert.equal(url.searchParams.get('utm_content'), 'creative_a');
});

test('invalid or non-http destinations remain unchanged and do not claim UTM enrichment', () => {
  const invalid = buildTrackedDestination('not a url', creatorContext);
  assert.equal(invalid.effectiveDestinationUrl, 'not a url');
  assert.equal(invalid.utm, null);

  const mailto = buildTrackedDestination('mailto:hello@example.com', creatorContext);
  assert.equal(mailto.effectiveDestinationUrl, 'mailto:hello@example.com');
  assert.equal(mailto.utm, null);
});

test('tracking route stays campaign/code scoped and exposes privacy-conscious unique click aggregates', () => {
  const source = readFileSync(new URL('../src/routes/tracking.ts', import.meta.url), 'utf8');

  assert.match(source, /let where = 't\.campaign_id = \?'/);
  assert.match(source, /WHERE t\.code = \?/);
  assert.match(source, /COUNT\(click\.visitor_id_hash\) AS identified_clicks/);
  assert.match(source, /COUNT\(DISTINCT click\.visitor_id_hash\) AS estimated_unique_clicks/);
  assert.match(source, /repeat_clicks/);
  assert.match(source, /buildTrackedDestination\(link\.destination_url, utmContext\(link\)\)/);
});
