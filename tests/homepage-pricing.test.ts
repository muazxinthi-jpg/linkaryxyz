import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('homepage pricing is additive and reads the live billing catalog', async () => {
  const injection = await read('src/homepagePricing.ts');
  const client = await read('pricing-home.js');
  assert.match(injection, /id=\"pricing\"/);
  assert.match(injection, /Controlled Beta/);
  assert.match(injection, /pricing-home\.css/);
  assert.match(injection, /pricing-home\.js/);
  assert.match(injection, /<section class=\"faq\" id=\"faq\">/);
  assert.match(client, /fetch\('\/api\/billing\/plans'/);
  assert.doesNotMatch(client, /personal_pro.*499/s);
  assert.doesNotMatch(client, /project_manual.*999/s);
  assert.doesNotMatch(client, /project_automate.*3399/s);
  assert.doesNotMatch(client, /project_growth.*9999/s);
});

test('homepage transformation is limited to public HTML and preserves the existing shell', async () => {
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
  assert.doesNotMatch(client, /<script/i);
});

test('public pricing renderer never hardcodes commercial plan prices', async () => {
  const client = await read('pricing-catalog.js');
  assert.doesNotMatch(client, /personal_pro.*499/s);
  assert.doesNotMatch(client, /project_manual.*999/s);
  assert.doesNotMatch(client, /project_automate.*3399/s);
  assert.doesNotMatch(client, /project_growth.*9999/s);
  assert.match(client, /Join Controlled Beta/);
});

test('homepage pricing CSS is scoped to pricing classes', async () => {
  const css = await read('pricing-home.css');
  assert.match(css, /^\.pricing-home/);
  assert.doesNotMatch(css, /(^|[},])\s*(body|html|\.hero|\.workflow|\.features|\.faq)\s*[,{]/);
});
