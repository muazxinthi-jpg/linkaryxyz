import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTrackedDestination } from '../src/trackingUtm.ts';

test('preserves customer UTMs while replacing stale Linkary-owned attribution keys', () => {
  const result = buildTrackedDestination(
    'https://example.com/register?utm_source=partner&utm_campaign=launch&linkary_activity=old-activity&linkary_creator=old-creator',
    {
      campaignName: 'EMYA Public Round',
      activityId: 'activity-123',
      activityTitle: 'Creator quote repost',
      activityType: 'social',
      assignmentKind: 'creator',
      partnerHandle: '@creatoralpha',
      partnerName: 'Creator Alpha',
      creatorProfileId: 'creator-profile-456',
      utmTerm: 'robinhood',
    },
  );

  const destination = new URL(result.effectiveDestinationUrl);

  assert.equal(destination.searchParams.get('utm_source'), 'partner');
  assert.equal(destination.searchParams.get('utm_campaign'), 'launch');
  assert.equal(destination.searchParams.get('utm_medium'), 'creator');
  assert.equal(destination.searchParams.get('utm_content'), 'creatoralpha');
  assert.equal(destination.searchParams.get('utm_term'), 'robinhood');
  assert.equal(destination.searchParams.get('linkary_activity'), 'activity-123');
  assert.equal(destination.searchParams.get('linkary_creator'), 'creator-profile-456');

  assert.deepEqual(result.utm, {
    source: 'partner',
    medium: 'creator',
    campaign: 'launch',
    content: 'creatoralpha',
    term: 'robinhood',
    linkaryActivity: 'activity-123',
    linkaryCreator: 'creator-profile-456',
  });
});

test('community tracking removes stale creator attribution and generates Telegram/community UTMs', () => {
  const result = buildTrackedDestination('https://example.com/?linkary_creator=stale-creator', {
    campaignName: 'Community Activation',
    activityId: 'activity-community-1',
    activityTitle: 'Telegram activation',
    activityType: 'social',
    assignmentKind: 'community',
    partnerHandle: '@linkarycommunity',
    partnerName: 'Linkary Community',
    creatorProfileId: null,
  });

  const destination = new URL(result.effectiveDestinationUrl);

  assert.equal(destination.searchParams.get('utm_source'), 'telegram');
  assert.equal(destination.searchParams.get('utm_medium'), 'community');
  assert.equal(destination.searchParams.get('utm_campaign'), 'community_activation');
  assert.equal(destination.searchParams.get('utm_content'), 'linkarycommunity');
  assert.equal(destination.searchParams.get('linkary_activity'), 'activity-community-1');
  assert.equal(destination.searchParams.has('linkary_creator'), false);
  assert.equal(result.utm?.linkaryCreator, null);
});

test('unassigned tracking does not leak a stale creator id', () => {
  const result = buildTrackedDestination('https://example.com/?linkary_creator=stale-creator', {
    campaignName: 'General Growth',
    activityId: 'activity-general-1',
    activityTitle: 'Landing page',
    activityType: 'website',
    assignmentKind: null,
    partnerHandle: null,
    partnerName: null,
    creatorProfileId: null,
  });

  const destination = new URL(result.effectiveDestinationUrl);

  assert.equal(destination.searchParams.get('utm_source'), 'website');
  assert.equal(destination.searchParams.get('utm_medium'), 'website');
  assert.equal(destination.searchParams.get('linkary_activity'), 'activity-general-1');
  assert.equal(destination.searchParams.has('linkary_creator'), false);
});

test('invalid or non-http destinations are returned unchanged without generated UTM metadata', () => {
  const context = {
    campaignName: 'Campaign',
    activityId: 'activity-1',
    activityTitle: 'Activity',
    activityType: 'website',
    assignmentKind: null as const,
    partnerHandle: null,
    partnerName: null,
    creatorProfileId: null,
  };

  assert.deepEqual(buildTrackedDestination('not-a-url', context), {
    effectiveDestinationUrl: 'not-a-url',
    utm: null,
  });

  assert.deepEqual(buildTrackedDestination('mailto:hello@example.com', context), {
    effectiveDestinationUrl: 'mailto:hello@example.com',
    utm: null,
  });
});
