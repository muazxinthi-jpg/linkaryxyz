import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('public homepage includes native API-backed pricing', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /href="#pricing">Pricing<\/a>/);
  assert.match(homepage, /id="pricing"/);
  assert.match(homepage, /data-linkary-component="pricing"/);
  assert.match(homepage, /data-linkary-source="\/api\/billing\/plans"/);
  assert.match(homepage, /id="linkary-pricing-grid"/);
  assert.match(homepage, /src="\/pricing-home\.js"/);
});

test('homepage pricing reads the live billing catalog and does not hardcode commercial prices', async () => {
  const client = await read('pricing-home.js');
  assert.match(client, /fetch\('\/api\/billing\/plans'/);
  assert.doesNotMatch(client, /personal_pro.*499/s);
  assert.doesNotMatch(client, /project_manual.*999/s);
  assert.doesNotMatch(client, /project_automate.*3399/s);
  assert.doesNotMatch(client, /project_growth.*9999/s);
});

test('homepage transformation remains limited to public HTML', async () => {
  const injection = await read('src/homepagePricing.ts');
  const worker = await read('src/worker.ts');
  assert.match(injection, /request\.method !== 'GET'/);
  assert.match(injection, /contentType\.includes\('text\/html'\)/);
  assert.match(injection, /pathname === '\/' \|\| pathname === '\/index\.html'/);
  assert.match(worker, /enhancePublicHomepage/);
  assert.match(worker, /url\.hostname\.toLowerCase\(\) !== appHost/);
});

test('legacy inline pricing renderer is removed before the browser parses public HTML', async () => {
  const injection = await read('src/homepagePricing.ts');
  const staticSource = await read('src/static.ts');
  const client = await read('pricing-catalog.js');

  assert.match(staticSource, /id=\"linkary-pricing-catalog\"/);
  assert.match(injection, /LEGACY_INLINE_PRICING/);
  assert.match(injection, /html\.replace\(LEGACY_INLINE_PRICING, ''\)/);
  assert.match(injection, /id=\"linkary-pricing-grid\"/);
  assert.match(injection, /pricing-catalog\.js/);
  assert.match(client, /document\.getElementById\('linkary-pricing-grid'\)/);
  assert.match(client, /fetch\('\/api\/billing\/plans'/);
});

test('approved homepage uses exactly one pricing renderer', async () => {
  const homepage = await read('index.html');
  const injection = await read('src/homepagePricing.ts');

  assert.match(homepage, /data-linkary-component=\"pricing\"/);
  assert.match(homepage, /src=\"\/pricing-home\.js\"/);
  assert.doesNotMatch(homepage, /pricing-catalog\.js/);
  assert.match(injection, /usesNativeHomepagePricing/);
  assert.match(injection, /html\.includes\('data-linkary-component=\"pricing\"'\)/);
  assert.match(injection, /html\.includes\('\/pricing-home\.js'\)/);
  assert.match(injection, /!usesNativeHomepagePricing/);
});

test('public homepage uses the real local Linkary favicon and wordmark', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /assets\/brand\/linkary-icon-black\.png/);
  assert.match(homepage, /assets\/brand\/linkary-wordmark-black\.png/);
});

test('current marketing shell pricing links normalize to the in-page pricing section', async () => {
  const injection = await read('src/homepagePricing.ts');
  assert.match(injection, /href=\(\["'\]\)\\\/pricing/);
  assert.match(injection, />\\s\*Auctions\\s\*</);
  assert.match(injection, /href="#pricing"/);
});
