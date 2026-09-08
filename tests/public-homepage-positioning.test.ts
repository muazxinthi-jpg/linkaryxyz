import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyTrackingFirstHomepageCopy } from '../src/homepagePricing';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('public homepage leads with tracking-first Linkary positioning', async () => {
  const legacyHomepage = await read('index.html');
  const homepage = applyTrackingFirstHomepageCopy(legacyHomepage);

  assert.match(homepage, /<title>Linkary — Run growth anywhere\. Track it in Linkary\.<\/title>/);
  assert.match(homepage, /Web3 growth attribution/);
  assert.match(homepage, /Run growth anywhere\.<br><em>Track it in Linkary\.<\/em>/);
  assert.match(homepage, /whether the work starts in Linkary or somewhere else/);
  assert.match(homepage, /Start tracking ↗/);

  assert.doesNotMatch(homepage, /Creator campaign intelligence/);
  assert.doesNotMatch(homepage, /Know which creators<br>actually drive/);
  assert.doesNotMatch(homepage, /Start a campaign ↗/);
});

test('public homepage makes external campaign tracking and communities explicit', async () => {
  const homepage = applyTrackingFirstHomepageCopy(await read('index.html'));

  assert.match(homepage, /External campaigns/);
  assert.match(homepage, /Creator & community identity/);
  assert.match(homepage, /Bring in work from Linkary or external campaign workflows/);
  assert.match(homepage, /Projects, creators, communities\.<br><em>One evidence graph\.<\/em>/);
  assert.match(homepage, /without forcing every campaign to run inside Linkary/);
  assert.match(homepage, /Linkary connects creators, communities, activities, and tracked events/);
});

test('built-in campaign execution remains optional rather than becoming the product prerequisite', async () => {
  const homepage = applyTrackingFirstHomepageCopy(await read('index.html'));

  assert.match(homepage, /OPTIONAL \/ LINKARY CAMPAIGN WORKSPACE/);
  assert.match(homepage, /Track an existing campaign<br>or coordinate one here\./);
  assert.match(homepage, /use the built-in workspace when you want to coordinate the brief and contributors here/);
  assert.match(homepage, /<b>New campaign<\/b>/);
  assert.doesNotMatch(homepage, /Run campaigns without<br>the spreadsheet maze\./);
});

test('tracking-first copy transformation changes copy only and keeps the existing responsive shell intact', async () => {
  const source = await read('src/homepagePricing.ts');

  assert.match(source, /applyTrackingFirstHomepageCopy/);
  assert.match(source, /updated\.split\(from\)\.join\(to\)/);
  assert.doesNotMatch(source, /style\.setProperty|classList\.|innerHTML\s*=/);
  assert.match(source, /pathname === '\/' \|\| pathname === '\/index\.html'/);
});
