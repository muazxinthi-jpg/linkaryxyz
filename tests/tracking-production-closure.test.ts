import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('tracking production path stays wired from short link to immutable destination and asynchronous click logging', () => {
  const entry = read('../src/trackingEntry.ts');
  const tracking = read('../src/routes/tracking.ts');
  const utm = read('../src/trackingUtm.ts');

  assert.match(entry, /const trackedRedirect = url\.pathname\.match\(\/\^\\\/r\\\/\(\[\^\/\]\+\)\$\//);
  assert.match(entry, /redirectTrackedLink\(request, env, decodeURIComponent\(trackedRedirect\[1\]\), ctx\)/);

  assert.match(tracking, /buildTrackedDestination\(activity\.destination_url, utmContext\(activity, utmTerm\)\)/);
  assert.match(tracking, /effective_destination_url/);
  assert.match(tracking, /tracking_context_version/);
  assert.match(tracking, /tracked_link_partner_snapshots/);
  assert.match(tracking, /logTrackedClick\(request, env, db, link\.id\)/);
  assert.match(tracking, /ctx\.waitUntil\(clickWrite\)/);
  assert.match(tracking, /Response\.redirect\(trackedDestination\.effectiveDestinationUrl, 302\)/);

  assert.match(utm, /destination\.searchParams\.set\('linkary_activity', context\.activityId\)/);
  assert.match(utm, /destination\.searchParams\.set\('linkary_creator', context\.creatorProfileId\)/);
  assert.match(utm, /setIfMissing\(destination\.searchParams, 'utm_source'/);
  assert.match(utm, /setIfMissing\(destination\.searchParams, 'utm_medium'/);
  assert.match(utm, /setIfMissing\(destination\.searchParams, 'utm_campaign'/);
  assert.match(utm, /setIfMissing\(destination\.searchParams, 'utm_content'/);
});

test('tracking UI exposes the complete operator flow for links, outcomes and reporting', () => {
  const ui = read('../frontend/src/TrackingExperience.tsx');

  assert.match(ui, /\/api\/tracked-links\?campaignId=/);
  assert.match(ui, /\/api\/campaign-outcomes\?campaignId=/);
  assert.match(ui, /\/api\/conversions\?/);
  assert.match(ui, /async function createTrackingLink\(activityId: string\)/);
  assert.match(ui, /method: 'POST'.*body: JSON\.stringify\(\{ activityId, utmTerm:/s);
  assert.match(ui, /async function recordOutcome\(event: React\.FormEvent\)/);
  assert.match(ui, /external outcome ID already exists/i);
  assert.match(ui, /summary\.tracked_clicks/);
  assert.match(ui, /summary\.conversion_rate/);
  assert.match(ui, /summary\.value_usd/);
});

test('outcomes stay idempotent and campaign reporting joins clicks, outcomes, value and spend', () => {
  const conversions = read('../src/routes/conversions.ts');
  const migration = read('../migrations/0009_conversion_events.sql');

  assert.match(conversions, /SELECT id FROM conversion_events WHERE organization_id = \? AND external_event_key = \?/);
  assert.match(conversions, /duplicate: true/);
  assert.match(migration, /UNIQUE\(organization_id, external_event_key\)/);
  assert.match(conversions, /COUNT\(\*\) FROM conversion_events WHERE campaign_id = \?/);
  assert.match(conversions, /SUM\(value_usd\) FROM conversion_events WHERE campaign_id = \?/);
  assert.match(conversions, /COUNT\(\*\) FROM tracked_link_clicks c JOIN tracked_links t ON t\.id = c\.tracked_link_id WHERE t\.campaign_id = \?/);
  assert.match(conversions, /SUM\(usd_equivalent\) FROM campaign_cost_entries WHERE campaign_id = \? AND status = 'active'/);
  assert.match(conversions, /conversion_rate: safe\.tracked_clicks > 0 \? safe\.conversions \/ safe\.tracked_clicks : 0/);
});

test('hourly production health checks both invite and tracking routes on the canonical short domain', () => {
  const workflow = read('../.github/workflows/short-link-health.yml');

  assert.match(workflow, /cron: '37 \* \* \* \*'/);
  assert.match(workflow, /https:\/\/l\.linkary\.xyz\/i\/__linkary_health_/);
  assert.match(workflow, /https:\/\/l\.linkary\.xyz\/r\/__linkary_tracking_health_/);
  assert.match(workflow, /"error":"invite_not_found"/);
  assert.match(workflow, /"error":"tracking_not_found"/);
});
