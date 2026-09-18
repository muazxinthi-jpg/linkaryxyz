import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('public homepage leads with the approved Linkary positioning', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /Turn relationships into/);
  assert.match(homepage, /measurable/);
  assert.match(homepage, /Linkary connects creators, communities, campaigns, social signals and on-chain outcomes into one measurable growth layer\./);
  assert.match(homepage, /Create your Linkary/);
  assert.match(homepage, /Explore Ecosystem/);
  assert.doesNotMatch(homepage, /50K\+|99\.8%|142K Gateway Clicks|1,482 on-chain actions/);
});

test('public homepage keeps projects, creators and communities explicit', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /id="creators"/);
  assert.match(homepage, /Build an identity around the work you actually do\./);
  assert.match(homepage, /id="projects"/);
  assert.match(homepage, /Run growth anywhere\. Track it in Linkary\./);
  assert.match(homepage, /id="communities"/);
  assert.match(homepage, /Communities create measurable impact\./);
});

test('public homepage preserves the approved Muaz Xinthi profile example', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /data-profile-example="muazxinthi"/);
  assert.match(homepage, /https:\/\/linkary\.xyz\/muazxinthi/);
  assert.match(homepage, /Muaz Xinthi Linkary Profile - Header, Identity, Bio and CTAs/);
  assert.match(homepage, /Muaz Xinthi Linkary Profile - Featured Work and NFT Collections/);
});

test('public homepage keeps the current controlled Beta chain set', async () => {
  const homepage = await read('index.html');
  for (const chain of ['Ethereum', 'Base', 'BNB Chain', 'Solana', 'Robinhood Chain']) {
    assert.match(homepage, new RegExp(chain.replace(' ', '\\s*')));
  }
  assert.doesNotMatch(homepage, />Arbitrum</);
  assert.doesNotMatch(homepage, />Polygon</);
  assert.doesNotMatch(homepage, />Optimism</);
  assert.doesNotMatch(homepage, />Avalanche</);
});
