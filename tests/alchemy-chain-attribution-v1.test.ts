import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Env } from '../src/env';
import { HttpError } from '../src/http';
import {
  ATTRIBUTION_CHAINS,
  alchemyWebhookConfig,
  normalizeAlchemyActivityAddresses,
  normalizeAttributionAddress,
  receiveAlchemyAddressActivityWebhook,
  requireAttributionChain,
  syncWebhookAddress,
  type AttributionChain,
} from '../src/routes/onchainAttribution';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const chainConfig = {
  ethereum: ['ethereum-id', 'ethereum-key'],
  base: ['base-id', 'base-key'],
  bnb: ['bnb-id', 'bnb-key'],
  solana: ['solana-id', 'solana-key'],
  robinhood: ['robinhood-id', 'robinhood-key'],
} as const satisfies Record<AttributionChain, readonly [string, string]>;

const env = {
  ALCHEMY_NOTIFY_AUTH_TOKEN: 'notify-token',
  ALCHEMY_WEBHOOK_ID_ETHEREUM: chainConfig.ethereum[0],
  ALCHEMY_WEBHOOK_SIGNING_KEY_ETHEREUM: chainConfig.ethereum[1],
  ALCHEMY_WEBHOOK_ID_BASE: chainConfig.base[0],
  ALCHEMY_WEBHOOK_SIGNING_KEY_BASE: chainConfig.base[1],
  ALCHEMY_WEBHOOK_ID_BNB: chainConfig.bnb[0],
  ALCHEMY_WEBHOOK_SIGNING_KEY_BNB: chainConfig.bnb[1],
  ALCHEMY_WEBHOOK_ID_SOLANA: chainConfig.solana[0],
  ALCHEMY_WEBHOOK_SIGNING_KEY_SOLANA: chainConfig.solana[1],
  ALCHEMY_WEBHOOK_ID_ROBINHOOD: chainConfig.robinhood[0],
  ALCHEMY_WEBHOOK_SIGNING_KEY_ROBINHOOD: chainConfig.robinhood[1],
} as Env;

test('Alchemy attribution uses exactly the intended five-network architecture', () => {
  assert.deepEqual(ATTRIBUTION_CHAINS, ['ethereum', 'base', 'bnb', 'solana', 'robinhood']);
  for (const chain of ATTRIBUTION_CHAINS) assert.equal(requireAttributionChain(chain), chain);
  assert.throws(() => requireAttributionChain('polygon'), (error: unknown) => error instanceof HttpError && error.code === 'unsupported_chain');
  for (const chain of ATTRIBUTION_CHAINS) {
    assert.deepEqual(alchemyWebhookConfig(env, chain), {
      webhookId: chainConfig[chain][0], signingKey: chainConfig[chain][1],
    });
  }
});

test('Solana activity aliases are deliberate and preserve base58 address casing', () => {
  const from = 'Vote111111111111111111111111111111111111111';
  const to = '11111111111111111111111111111111';
  assert.deepEqual(normalizeAlchemyActivityAddresses('solana', { source: from, destination: to }), { from, to });
  assert.deepEqual(normalizeAlchemyActivityAddresses('solana', {
    source: { address: from }, destination: { address: to }, signature: 'transaction-signature', slot: 123,
  }), { from, to });
});

test('EVM addresses normalize while Solana public keys preserve casing', () => {
  const mixedCaseEvm = '0xAbCdEf0123456789aBCdef0123456789ABCDef01';
  for (const chain of ['ethereum', 'base', 'bnb', 'robinhood'] as const) {
    assert.equal(normalizeAttributionAddress(chain, mixedCaseEvm), mixedCaseEvm.toLowerCase());
  }
  const solanaAddress = 'Vote111111111111111111111111111111111111111';
  assert.equal(normalizeAttributionAddress('solana', solanaAddress), solanaAddress);
  assert.equal(normalizeAttributionAddress('solana', solanaAddress.toLowerCase()), solanaAddress.toLowerCase());
  assert.throws(() => normalizeAttributionAddress('solana', 'VOte111111111111111111111111111111111111111'));
  assert.throws(() => normalizeAttributionAddress('solana', '0xabcdef'));
});

test('every chain verifies its own raw-body signature and webhook identity', async () => {
  for (const chain of ATTRIBUTION_CHAINS) {
    const [webhookId, signingKey] = chainConfig[chain];
    const rawBody = JSON.stringify({ webhookId, id: `evt-${chain}`, type: 'ADDRESS_ACTIVITY', event: { activity: [] } });
    const signature = createHmac('sha256', signingKey).update(rawBody).digest('hex');
    const url = `https://app.linkary.xyz/api/webhooks/alchemy/${chain}`;
    const response = await receiveAlchemyAddressActivityWebhook(new Request(url, {
      method: 'POST', body: rawBody, headers: { 'x-alchemy-signature': signature },
    }), env, chain);
    assert.equal(response.status, 200);

    const wrongIdBody = JSON.stringify({ webhookId: 'wrong-id', id: `evt-${chain}`, type: 'ADDRESS_ACTIVITY', event: { activity: [] } });
    const wrongIdSignature = createHmac('sha256', signingKey).update(wrongIdBody).digest('hex');
    await assert.rejects(receiveAlchemyAddressActivityWebhook(new Request(url, {
      method: 'POST', body: wrongIdBody, headers: { 'x-alchemy-signature': wrongIdSignature },
    }), env, chain), (error: unknown) => error instanceof HttpError && error.code === 'webhook_id_mismatch');

    const wrongKeySignature = createHmac('sha256', 'wrong-key').update(rawBody).digest('hex');
    await assert.rejects(receiveAlchemyAddressActivityWebhook(new Request(url, {
      method: 'POST', body: rawBody, headers: { 'x-alchemy-signature': wrongKeySignature },
    }), env, chain), (error: unknown) => error instanceof HttpError && error.code === 'invalid_webhook_signature');
  }
});

test('Notify sync selects each active chain webhook', async () => {
  const originalFetch = globalThis.fetch;
  const webhookIds: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { webhook_id: string };
    webhookIds.push(body.webhook_id);
    return new Response(null, { status: 200 });
  };
  try {
    for (const chain of ATTRIBUTION_CHAINS) {
      await syncWebhookAddress(env, chain, 'test-address', 'add');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(webhookIds, ATTRIBUTION_CHAINS.map((chain) => chainConfig[chain][0]));
});

test('0048 preserves legacy Polygon rows and blocks new Polygon writes', () => {
  const original = read('../migrations/0047_alchemy_chain_attribution.sql');
  const migration = read('../migrations/0048_expand_alchemy_attribution_chains.sql');
  assert.match(original, /chain IN \('base', 'polygon'\)/);
  assert.match(migration, /'ethereum', 'base', 'bnb', 'solana', 'robinhood', 'polygon'/);
  assert.match(migration, /INSERT INTO onchain_watch_targets SELECT \* FROM onchain_watch_targets_0047/);
  assert.match(migration, /INSERT INTO onchain_attribution_events SELECT \* FROM onchain_attribution_events_0047/);
  assert.match(migration, /reject_new_polygon_watch_targets/);
  assert.match(migration, /reject_new_polygon_attribution_events/);
});

test('provider events stay idempotent and require explicit review before conversion', () => {
  const route = read('../src/routes/onchainAttribution.ts');
  const migration = read('../migrations/0048_expand_alchemy_attribution_chains.sql');
  assert.match(route, /providerItemKey = `\$\{chain\}:\$\{identity\}:\$\{target\.id\}`/);
  assert.match(route, /INSERT OR IGNORE INTO onchain_attribution_events/);
  assert.match(migration, /UNIQUE\(provider_item_key\)/);
  const webhookStart = route.indexOf('export async function receiveAlchemyAddressActivityWebhook');
  const conversionInsert = route.lastIndexOf('INSERT INTO conversion_events');
  assert.ok(conversionInsert >= 0 && conversionInsert < webhookStart);
});

test('reorg handling preserves evidence and revokes only its provider conversion', () => {
  const route = read('../src/routes/onchainAttribution.ts');
  assert.match(route, /item\.removed === true \|\| item\.log\?\.removed === true/);
  assert.match(route, /SET chain_status = 'reorged', review_status = 'reorged', linked_conversion_id = NULL/);
  assert.match(route, /DELETE FROM conversion_events[\s\S]*source = 'provider_verified'/);
  assert.match(route, /if \(event\.chain_status === 'reorged'\)/);
});

test('Worker keeps review APIs separate from the signed provider webhook', () => {
  const worker = read('../src/worker.ts');
  assert.match(worker, /\/api\/onchain\/watch-targets/);
  assert.match(worker, /\/api\/onchain\/events/);
  assert.ok(worker.includes("url.pathname.match(/^\\/api\\/webhooks\\/alchemy\\/([^/]+)$/)"));
});
