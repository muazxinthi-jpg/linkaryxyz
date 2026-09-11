import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Alchemy attribution uses the locked five-chain registry and fails closed by configuration', () => {
  const route = read('../src/routes/onchainAttribution.ts');
  const env = read('../src/env.ts');
  const chains = read('../src/chains.ts');

  for (const chain of ['ethereum', 'base', 'bnb', 'solana', 'robinhood']) {
    assert.match(chains, new RegExp(`key: '${chain}'`));
  }
  assert.doesNotMatch(chains, /key: 'arbitrum'/);
  assert.match(route, /betaChain\(value\)/);
  assert.match(route, /alchemy_not_configured/);
  assert.match(env, /ALCHEMY_NOTIFY_AUTH_TOKEN/);
  assert.match(env, /ALCHEMY_WEBHOOK_ID_ETHEREUM/);
  assert.match(env, /ALCHEMY_WEBHOOK_ID_BASE/);
  assert.match(env, /ALCHEMY_WEBHOOK_ID_BNB/);
  assert.match(env, /ALCHEMY_WEBHOOK_ID_SOLANA/);
  assert.match(env, /ALCHEMY_WEBHOOK_ID_ROBINHOOD/);
});

test('Alchemy webhook verification uses the raw body, chain signing key and constant-time HMAC comparison', () => {
  const route = read('../src/routes/onchainAttribution.ts');

  assert.match(route, /const rawBody = await request\.text\(\)/);
  assert.match(route, /request\.headers\.get\('x-alchemy-signature'\)/);
  assert.match(route, /crypto\.subtle\.sign\('HMAC'/);
  assert.match(route, /expectedSignature = await hmacHex\(rawBody, config\.signingKey\)/);
  assert.match(route, /constantTimeEqual\(receivedSignature, expectedSignature\)/);
  assert.match(route, /payload\.webhookId !== config\.webhookId/);
  assert.match(route, /payload\.type !== 'ADDRESS_ACTIVITY'/);
});

test('watch targets are scoped to campaign context and Alchemy address updates are idempotent provider operations', () => {
  const route = read('../src/routes/onchainAttribution.ts');
  const migration = read('../migrations/0047_alchemy_chain_attribution.sql');

  assert.match(route, /requireOperationalProjectAccess\(db, userId, campaign\.organization_id, write\)/);
  assert.match(route, /Activity does not belong to campaign/);
  assert.match(route, /Tracking link does not belong to campaign/);
  assert.match(route, /https:\/\/dashboard\.alchemy\.com\/api\/update-webhook-addresses/);
  assert.match(route, /addresses_to_add/);
  assert.match(route, /addresses_to_remove/);
  assert.match(migration, /UNIQUE\(organization_id, campaign_id, chain, address\)/);
});

test('provider events are immutable, idempotent and do not silently become conversions', () => {
  const route = read('../src/routes/onchainAttribution.ts');
  const migration = read('../migrations/0047_alchemy_chain_attribution.sql');

  assert.match(route, /providerItemKey = `\$\{providerEventId\}:\$\{index\}:\$\{target\.id\}`/);
  assert.match(route, /INSERT OR IGNORE INTO onchain_attribution_events/);
  assert.match(migration, /UNIQUE\(provider_item_key\)/);
  assert.match(migration, /review_status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration, /evidence_confidence TEXT NOT NULL DEFAULT 'verified'/);

  const webhookStart = route.indexOf('export async function receiveAlchemyAddressActivityWebhook');
  const conversionInsert = route.lastIndexOf('INSERT INTO conversion_events');
  assert.ok(webhookStart >= 0, 'Alchemy webhook handler must exist');
  assert.ok(conversionInsert >= 0, 'review path must write to the canonical conversion ledger');
  assert.ok(conversionInsert < webhookStart, 'raw provider webhook must not create conversions before operator review');
});

test('confirmed Alchemy evidence reuses the canonical conversion ledger with provider_verified confidence', () => {
  const route = read('../src/routes/onchainAttribution.ts');
  const conversionMigration = read('../migrations/0009_conversion_events.sql');

  assert.match(route, /const externalKey = `alchemy:\$\{event\.provider_item_key\}`/);
  assert.match(route, /INSERT INTO conversion_events/);
  assert.match(route, /'provider_verified', 'verified'/);
  assert.match(route, /linked_conversion_id/);
  assert.match(conversionMigration, /'provider_verified'/);
  assert.match(conversionMigration, /'verified'/);
});

test('Worker exposes authenticated review APIs separately from the unauthenticated signed provider webhook', () => {
  const worker = read('../src/worker.ts');

  assert.match(worker, /\/api\/onchain\/watch-targets/);
  assert.match(worker, /\/api\/onchain\/events/);
  assert.match(worker, /\/api\/webhooks\/alchemy/);
  assert.match(worker, /receiveAlchemyAddressActivityWebhook/);
  assert.match(worker, /reviewOnchainAttributionEvent/);
});
