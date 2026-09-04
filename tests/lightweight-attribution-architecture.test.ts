import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('attribution runtime schema guard is cached instead of repeating DDL per request', () => {
  const schema = read('../src/db/attributionSchema.ts');

  assert.match(schema, /let attributionSchemaReady: Promise<void> \| null = null/);
  assert.match(schema, /async function applyAttributionRuntimeSchema\(db: Db\)/);
  assert.match(schema, /if \(!attributionSchemaReady\)/);
  assert.match(schema, /attributionSchemaReady = applyAttributionRuntimeSchema\(db\)\.catch/);
  assert.match(schema, /attributionSchemaReady = null/);
});

test('core growth reads stay scoped to Project or campaign identifiers', () => {
  const campaigns = read('../src/routes/campaigns.ts');
  const activities = read('../src/routes/activities.ts');
  const tracking = read('../src/routes/tracking.ts');
  const conversions = read('../src/routes/conversions.ts');

  assert.match(campaigns, /FROM campaigns WHERE organization_id = \?/);
  assert.match(activities, /WHERE a\.campaign_id = \?/);
  assert.match(tracking, /let where = 't\.campaign_id = \?'/);
  assert.match(tracking, /WHERE code = \?/);
  assert.match(conversions, /const clauses = \['e\.campaign_id = \?'\]/);
  assert.match(conversions, /const limit = format === 'csv' \? 5000 : 500/);
});

test('formal migrations index the primary campaign evidence paths', () => {
  const campaigns = read('../migrations/0006_campaign_foundation.sql');
  const activities = read('../migrations/0007_campaign_activities.sql');
  const tracking = read('../migrations/0008_tracking_links.sql');
  const conversions = read('../migrations/0009_conversion_events.sql');

  assert.match(campaigns, /idx_campaigns_organization.*organization_id/);
  assert.match(activities, /idx_campaign_activities_campaign.*campaign_id/);
  assert.match(tracking, /idx_tracked_link_clicks_link.*tracked_link_id/);
  assert.match(conversions, /idx_conversion_events_campaign.*campaign_id/);
});

test('technical paper locks the lightweight event-driven boundary and current chain allocation', () => {
  const paper = read('../docs/LINKARY_TECHNICAL_PRODUCT_PAPER.md');

  assert.match(paper, /### 16\.1 Lightweight data-access and scaling rules/);
  assert.match(paper, /must not behave like a bot that periodically cross-checks every database row/);
  assert.match(paper, /Normal Creator\/profile usage does not scan Project campaigns/);
  assert.match(paper, /Future Telegram tracking should use shared Project-level bot\/webhook infrastructure with event-driven writes/);
  assert.match(paper, /Future Alchemy\/onchain attribution should use shared Project-level subscriptions\/webhooks or targeted reads/);
  assert.match(paper, /2\. BNB Chain/);
  assert.doesNotMatch(paper, /2\. Ethereum\n3\. Solana/);
});
