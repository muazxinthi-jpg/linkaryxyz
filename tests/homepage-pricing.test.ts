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

test('homepage transformation is limited to public root html', async () => {
  const injection = await read('src/homepagePricing.ts');
  const worker = await read('src/worker.ts');
  assert.match(injection, /pathname !== '\/' && pathname !== '\/index\.html'/);
  assert.match(injection, /contentType\.includes\('text\/html'\)/);
  assert.match(worker, /enhancePublicHomepage/);
  assert.match(worker, /url\.hostname\.toLowerCase\(\) !== appHost/);
});

test('homepage pricing CSS is scoped to pricing classes', async () => {
  const css = await read('pricing-home.css');
  assert.match(css, /^\.pricing-home/);
  assert.doesNotMatch(css, /(^|[},])\s*(body|html|\.hero|\.workflow|\.features|\.faq)\s*[,{]/);
});
