import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildTrackedDestination } from '../src/trackingUtm';

const creatorContext = {
  campaignName: 'EMYA TGE Growth',
  activityId: 'activity_creator_launch',
  activityTitle: 'Creator launch post',
  activityType: 'creator_content',
  assignmentKind: 'creator' as const,
  partnerHandle: '@MuazXinthi',
  partnerName: 'Muaz',
  creatorProfileId: 'profile_muaz',
  utmTerm: 'tge creators',
};

test('creator tracking appends deterministic UTMs and stable Linkary attribution parameters', () => {
  const result = buildTrackedDestination('https://example.com/signup?ref=partner', creatorContext);
  const url = new URL(result.effectiveDestinationUrl);

  assert.equal(url.searchParams.get('ref'), 'partner');
  assert.equal(url.searchParams.get('utm_source'), 'x');
  assert.equal(url.searchParams.get('utm_medium'), 'creator');
  assert.equal(url.searchParams.get('utm_campaign'), 'emya_tge_growth');
  assert.equal(url.searchParams.get('utm_content'), 'muazxinthi');
  assert.equal(url.searchParams.get('utm_term'), 'tge creators');
  assert.equal(url.searchParams.get('linkary_activity'), 'activity_creator_launch');
  assert.equal(url.searchParams.get('linkary_creator'), 'profile_muaz');
  assert.deepEqual(result.utm, {
    source: 'x',
    medium: 'creator',
    campaign: 'emya_tge_growth',
    content: 'muazxinthi',
    term: 'tge creators',
    linkaryActivity: 'activity_creator_launch',
    linkaryCreator: 'profile_muaz',
  });
});

test('Telegram Community tracking uses telegram/community provenance without a creator identity', () => {
  const result = buildTrackedDestination('https://example.com/', {
    campaignName: 'Community Push',
    activityId: 'activity_telegram_placement',
    activityTitle: 'Telegram placement',
    activityType: 'community_placement',
    assignmentKind: 'community',
    partnerHandle: '@AkariClub',
    partnerName: 'AKARI Club',
    creatorProfileId: null,
  });
  const url = new URL(result.effectiveDestinationUrl);

  assert.equal(url.searchParams.get('utm_source'), 'telegram');
  assert.equal(url.searchParams.get('utm_medium'), 'community');
  assert.equal(url.searchParams.get('utm_campaign'), 'community_push');
  assert.equal(url.searchParams.get('utm_content'), 'akariclub');
  assert.equal(url.searchParams.get('linkary_activity'), 'activity_telegram_placement');
  assert.equal(url.searchParams.get('linkary_creator'), null);
});

test('existing founder UTMs are preserved while stale Linkary-owned attribution keys are replaced', () => {
  const result = buildTrackedDestination(
    'https://example.com/?utm_source=partner&utm_medium=paid&utm_campaign=existing&utm_content=creative_a&utm_term=founder_term&linkary_activity=stale&linkary_creator=stale_creator',
    creatorContext,
  );
  const url = new URL(result.effectiveDestinationUrl);

  assert.equal(url.searchParams.get('utm_source'), 'partner');
  assert.equal(url.searchParams.get('utm_medium'), 'paid');
  assert.equal(url.searchParams.get('utm_campaign'), 'existing');
  assert.equal(url.searchParams.get('utm_content'), 'creative_a');
  assert.equal(url.searchParams.get('utm_term'), 'founder_term');
  assert.equal(url.searchParams.get('linkary_activity'), 'activity_creator_launch');
  assert.equal(url.searchParams.get('linkary_creator'), 'profile_muaz');
});

test('invalid or non-http destinations remain unchanged and do not claim UTM enrichment', () => {
  const invalid = buildTrackedDestination('not a url', creatorContext);
  assert.equal(invalid.effectiveDestinationUrl, 'not a url');
  assert.equal(invalid.utm, null);

  const mailto = buildTrackedDestination('mailto:hello@example.com', creatorContext);
  assert.equal(mailto.effectiveDestinationUrl, 'mailto:hello@example.com');
  assert.equal(mailto.utm, null);
});

test('tracking route freezes UTM context when migration 0032 is present and keeps click writes off the redirect critical path', () => {
  const source = readFileSync(new URL('../src/routes/tracking.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../migrations/0032_immutable_tracking_utm_context.sql', import.meta.url), 'utf8');

  assert.match(source, /let where = 't\.campaign_id = \?'/);
  assert.match(source, /WHERE t\.code = \?/);
  assert.match(source, /COUNT\(click\.visitor_id_hash\) AS identified_clicks/);
  assert.match(source, /COUNT\(DISTINCT click\.visitor_id_hash\) AS estimated_unique_clicks/);
  assert.match(source, /repeat_clicks/);
  assert.match(source, /effective_destination_url/);
  assert.match(source, /tracking_context_version/);
  assert.match(source, /ctx\.waitUntil\(clickWrite\)/);
  assert.match(migration, /ALTER TABLE tracked_links ADD COLUMN effective_destination_url TEXT/);
  assert.match(migration, /ALTER TABLE tracked_links ADD COLUMN linkary_activity TEXT/);
  assert.match(migration, /ALTER TABLE tracked_links ADD COLUMN linkary_creator TEXT/);
  assert.match(migration, /ALTER TABLE tracked_links ADD COLUMN tracking_context_version INTEGER/);
});
