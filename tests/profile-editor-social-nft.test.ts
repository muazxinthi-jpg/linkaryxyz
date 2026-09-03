import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const beta = readFileSync(new URL('../frontend/src/ProfileExperienceBeta.tsx', import.meta.url), 'utf8');
const wallets = readFileSync(new URL('../src/routes/wallets.ts', import.meta.url), 'utf8');
const enhancer = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('live Beta profile editor exposes notable social networks and custom social naming', () => {
  assert.equal(beta.includes('const SOCIAL_OPTIONS'), true);
  for (const platform of ['x', 'linkedin', 'tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'whatsapp', 'reddit', 'discord', 'github', 'farcaster', 'custom']) {
    assert.equal(beta.includes(`key: '${platform}'`), true, `missing ${platform} social option`);
  }
  assert.equal(beta.includes('Choose social network'), true);
  assert.equal(beta.includes('Name this social platform'), true);
  assert.equal(beta.includes("socialPlatform: draft.socialPlatform"), true);
});

test('live Beta profile editor exposes NFT showcase and NFT avatar selection', () => {
  assert.equal(beta.includes('value="nft_item"'), true);
  assert.equal(beta.includes('+ NFT'), true);
  assert.equal(beta.includes('Choose from wallet NFTs'), true);
  assert.equal(beta.includes('includeNfts=1'), true);
  assert.equal(beta.includes('setData({ ...data, avatarUrl: nft.imageUrl })'), true);
  assert.equal(beta.includes('Or add manually'), true);
});

test('wallet NFT discovery stays server-side and uses attached profile wallets', () => {
  assert.equal(wallets.includes('env.ALCHEMY_API_KEY'), true);
  assert.equal(wallets.includes('getNFTsForOwner'), true);
  assert.equal(wallets.includes('getAssetsByOwner'), true);
  assert.equal(wallets.includes('profile_wallet_destinations'), true);
  assert.equal(wallets.includes('coinbase_cdp'), true);
  assert.equal(wallets.includes('apiKey:'), false, 'API key must never be serialized in a response object');
});

test('Book a Call style CTAs are pinned in editor preview and restored on public profiles', () => {
  assert.equal(beta.includes('const pinnedCta'), true);
  assert.equal(beta.includes("['work_with_me', 'media_kit']"), true);
  assert.equal(enhancer.includes("['work_with_me', 'media_kit']"), true);
  assert.equal(enhancer.includes('profile-enhanced-ctas'), true);
  assert.equal(enhancer.includes('AVAILABLE FOR WORK'), true);
});

test('public profile enhancement supports WhatsApp and Farcaster without replacing Codex renderer', () => {
  assert.equal(enhancer.includes("return 'whatsapp'"), true);
  assert.equal(enhancer.includes("return 'farcaster'"), true);
  assert.equal(enhancer.includes("import { getPublishedProfile, renderPublicProfile as renderBasePublicProfile } from './profiles'"), true);
  assert.equal(worker.includes('renderPublicProfileEnhanced'), true);
  assert.equal(wrangler.includes('"main": "src/worker.ts"'), true);
});
